// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.42: CommonMark inline images on a completed assistant
/// LEFT `kind=message`.
///
/// `![alt](url)` and `![alt](url "title")` render as an image when
/// the URL is http(s) or an existing local attachment path
/// (`/v1/attachments/{id}`, `/v1/images/{id}`). Reference images
/// are already rewritten to that inline form by v1.39.
/// v1.77: the alt is the cmark-gfm plain-text flattening of the
/// description. `prepareAlts` stashes that string so a later pass
/// cannot treat it as syntax. The accessibility label and the
/// failure fallback use it. The title is the tooltip.
/// While the bytes load, the bubble shows a muted placeholder.
/// If they fail, the alt text (or the URL when the alt is empty)
/// shows as muted link-like text. A tap opens the v0.79 lightbox,
/// except when the image is the entire content of a link: that
/// tap opens the link destination.
///
/// javascript:, data:, file:, and any other scheme stay the
/// literal characters. Code spans, fenced code, indented code,
/// and math stay literal. A code span inside a table cell stays
/// literal. Streaming (`completed: false`) returns the text
/// unchanged. Copy keeps markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownImage.ts`.
enum MarkdownImage {
    struct Inline: Equatable {
        var alt: String
        var url: String
        var title: String?
        /// http(s) destination when this image is the whole link.
        var link: String?
    }

    enum Piece: Equatable {
        case text(String)
        case image(Inline)
    }

    enum Kind: Equatable {
        case remote
        case attachment
        case literal
    }

    private struct Span {
        var start: Int
        var end: Int
    }

    private struct Hit {
        var start: Int
        var end: Int
        var alt: String
        var url: String
        var title: String?
        var kind: Kind
    }

    private struct LinkSpan {
        var start: Int
        var end: Int
        var labelStart: Int
        var labelEnd: Int
        var href: String
    }

    private static let asciiPunct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
    private static let attachmentPrefixes = ["/v1/attachments/", "/v1/images/"]

    static func sourceKind(_ raw: String) -> Kind {
        let url = MarkdownReferenceLink.encodeDestination(
            raw.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        if url.isEmpty { return .literal }
        let lower = url.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            guard let parsed = URL(string: url),
                  let scheme = parsed.scheme?.lowercased(),
                  scheme == "http" || scheme == "https",
                  let host = parsed.host, !host.isEmpty
            else { return .literal }
            return .remote
        }
        let path = url.split(whereSeparator: { $0 == "?" || $0 == "#" }).first.map(String.init) ?? url
        if isAttachmentPath(path) { return .attachment }
        return .literal
    }

    static func fallback(alt: String, url: String) -> String {
        let label = alt.trimmingCharacters(in: .whitespacesAndNewlines)
        return label.isEmpty ? url : label
    }

    /// Rewrite loadable images so the alt is one stash token of the
    /// flattened description. Literal schemes stay the original
    /// characters. `completed: false` returns `text` unchanged.
    static func prepareAlts(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty || !text.contains("![") { return text }
        let chars = Array(text)
        let hits = findInlineImages(chars)
        if hits.isEmpty { return text }
        var out = ""
        var cursor = 0
        for hit in hits {
            let altStart = hit.start + 2
            let altEnd = altStart + hit.alt.count
            if altStart < cursor || altEnd > chars.count { continue }
            out += string(chars, cursor, altStart)
            if hit.kind == .literal {
                out += string(chars, altStart, altEnd)
            } else {
                let flat = MarkdownImageAlt.flatten(hit.alt)
                out += flat.isEmpty ? "" : MarkdownEscape.stash(flat)
            }
            cursor = altEnd
        }
        out += string(chars, cursor, chars.count)
        return out
    }

    /// `completed: false` returns the text unchanged.
    static func split(_ text: String, completed: Bool = true) -> [Piece] {
        if !completed || text.isEmpty { return [.text(text)] }
        if !text.contains("![") { return [.text(text)] }
        let chars = Array(text)
        let hits = findInlineImages(chars)
        if hits.isEmpty { return [.text(text)] }
        let blocked = blockedRanges(chars)
        let links = findLinks(chars, blocked)
        var pieces: [Piece] = []
        var cursor = 0
        for hit in hits {
            if hit.kind == .literal { continue }
            let wrap = imageLink(chars, hit, links)
            if wrap?.kind == "mixed" { continue }
            let from = wrap?.start ?? hit.start
            let to = wrap?.end ?? hit.end
            if from < cursor { continue }
            pushText(&pieces, maskLiteral(chars, cursor, from, hits))
            pieces.append(.image(Inline(
                alt: decodeInline(hit.alt),
                url: hit.url,
                title: hit.title.flatMap { raw in
                    let tip = MarkdownLinkTitleForm.hint(raw)
                    return tip.isEmpty ? nil : tip
                },
                link: (wrap?.href.isEmpty == false) ? wrap?.href : nil
            )))
            cursor = to
        }
        pushText(&pieces, maskLiteral(chars, cursor, chars.count, hits))
        if pieces.isEmpty { return [.text(text)] }
        return pieces
    }

    private static func isAttachmentPath(_ path: String) -> Bool {
        guard let prefix = attachmentPrefixes.first(where: { path.hasPrefix($0) }) else { return false }
        let rest = path.dropFirst(prefix.count)
        if rest.isEmpty || rest.contains("/") || rest.contains("..") { return false }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~-")
        return rest.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    private static func pushText(_ pieces: inout [Piece], _ value: String) {
        guard !value.isEmpty else { return }
        if case .text(let existing) = pieces.last {
            pieces[pieces.count - 1] = .text(existing + value)
        } else {
            pieces.append(.text(value))
        }
    }

    private static func maskLiteral(_ chars: [Character], _ from: Int, _ to: Int, _ hits: [Hit]) -> String {
        guard from < to else { return "" }
        var out = ""
        var cursor = from
        for hit in hits where hit.kind == .literal {
            if hit.start < cursor || hit.end > to || hit.start < from { continue }
            out += string(chars, cursor, hit.start)
            out += escapePunctuation(string(chars, hit.start, hit.end))
            cursor = hit.end
        }
        out += string(chars, cursor, to)
        return out
    }

    private static func imageLink(
        _ chars: [Character],
        _ hit: Hit,
        _ links: [LinkSpan]
    ) -> (kind: String, start: Int, end: Int, href: String)? {
        for link in links {
            if hit.start < link.labelStart || hit.end > link.labelEnd { continue }
            let rest = string(chars, link.labelStart, hit.start) + string(chars, hit.end, link.labelEnd)
            if !rest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return (kind: "mixed", start: link.start, end: link.end, href: link.href)
            }
            let opened = MarkdownReferenceLink.encodeDestination(link.href)
            let href = sourceKind(opened) == .remote ? opened : ""
            return (kind: "sole", start: link.start, end: link.end, href: href)
        }
        return nil
    }

    private static func findInlineImages(_ chars: [Character]) -> [Hit] {
        let blocked = blockedRanges(chars)
        var hits: [Hit] = []
        var index = 0
        while index < chars.count {
            if inRange(index, blocked) || !hasPrefix(chars, "![", at: index) || isEscaped(chars, index) {
                index += 1
                continue
            }
            guard let image = parseInlineImage(chars, index, blocked) else {
                index += 1
                continue
            }
            hits.append(image)
            index = image.end
        }
        return hits
    }

    private static func parseInlineImage(_ chars: [Character], _ bang: Int, _ blocked: [Span]) -> Hit? {
        guard let alt = readBracket(chars, bang + 1, blocked) else { return nil }
        guard let open = skipLinkSpace(chars, alt.next, blocked), chars[open] == "(" else { return nil }
        guard let destAt = skipLinkSpace(chars, open + 1, blocked),
              let dest = readDestination(chars, destAt, blocked) else { return nil }
        var cursor = dest.next
        var title: String?
        if let titleAt = skipLinkSpace(chars, cursor, blocked),
           titleAt != cursor,
           chars[titleAt] == "\"" || chars[titleAt] == "'" || chars[titleAt] == "(" {
            guard let read = readTitle(chars, titleAt) else { return nil }
            title = read.value
            cursor = read.next
        }
        guard let close = skipLinkSpace(chars, cursor, blocked), chars[close] == ")" else { return nil }
        let decoded = decodeInline(dest.value)
        let opened = MarkdownReferenceLink.encodeDestination(decoded)
        let kind = sourceKind(opened)
        return Hit(
            start: bang,
            end: close + 1,
            alt: alt.raw,
            url: kind == .remote ? opened : decoded,
            title: title,
            kind: kind
        )
    }

    private static func findLinks(_ chars: [Character], _ blocked: [Span]) -> [LinkSpan] {
        var links: [LinkSpan] = []
        var index = 0
        while index < chars.count {
            if inRange(index, blocked) || chars[index] != "[" || isEscaped(chars, index) {
                index += 1
                continue
            }
            if index > 0, chars[index - 1] == "!", !isEscaped(chars, index - 1) {
                index += 1
                continue
            }
            guard let label = readBracket(chars, index, blocked) else {
                index += 1
                continue
            }
            guard let open = skipLinkSpace(chars, label.next, blocked), chars[open] == "(" else {
                index += 1
                continue
            }
            guard let destAt = skipLinkSpace(chars, open + 1, blocked),
                  let dest = readDestination(chars, destAt, blocked) else {
                index += 1
                continue
            }
            var cursor = dest.next
            if let titleAt = skipLinkSpace(chars, cursor, blocked),
               titleAt != cursor,
               chars[titleAt] == "\"" || chars[titleAt] == "'" || chars[titleAt] == "(" {
                guard let title = readTitle(chars, titleAt) else {
                    index += 1
                    continue
                }
                cursor = title.next
            }
            guard let close = skipLinkSpace(chars, cursor, blocked), chars[close] == ")" else {
                index += 1
                continue
            }
            links.append(LinkSpan(
                start: index,
                end: close + 1,
                labelStart: index + 1,
                labelEnd: label.next - 1,
                href: decodeInline(dest.value)
            ))
            index = close + 1
        }
        return links
    }

    private static func readBracket(
        _ chars: [Character],
        _ open: Int,
        _ blocked: [Span]
    ) -> (raw: String, next: Int)? {
        guard open < chars.count, chars[open] == "[", !isEscaped(chars, open), !inRange(open, blocked) else {
            return nil
        }
        var index = open + 1
        var depth = 1
        var raw = ""
        while index < chars.count {
            if inRange(index, blocked) { return nil }
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count {
                raw.append(ch)
                raw.append(chars[index + 1])
                index += 2
                continue
            }
            if ch == "[" {
                depth += 1
                raw.append(ch)
                index += 1
                continue
            }
            if ch == "]" {
                depth -= 1
                if depth == 0 { return (raw, index + 1) }
                raw.append(ch)
                index += 1
                continue
            }
            if ch == "\n", index + 1 < chars.count, chars[index + 1] == "\n" { return nil }
            raw.append(ch)
            index += 1
        }
        return nil
    }

    private static func readDestination(
        _ chars: [Character],
        _ start: Int,
        _ blocked: [Span]
    ) -> (value: String, next: Int)? {
        guard start < chars.count, !inRange(start, blocked) else { return nil }
        if chars[start] == "<" {
            var index = start + 1
            var value = ""
            while index < chars.count {
                if inRange(index, blocked) { return nil }
                let ch = chars[index]
                if ch == "\n" || ch == "<" { return nil }
                // v1.74: spaces stay. A backslash escapes ASCII punctuation only.
                if ch == "\\", index + 1 < chars.count, asciiPunct.contains(chars[index + 1]) {
                    value.append(chars[index + 1])
                    index += 2
                    continue
                }
                if ch == ">" { return value.isEmpty ? nil : (value, index + 1) }
                value.append(ch)
                index += 1
            }
            return nil
        }
        var index = start
        var value = ""
        var depth = 0
        while index < chars.count {
            if inRange(index, blocked) { return nil }
            let ch = chars[index]
            // v1.79: a backslash escapes ASCII punctuation only.
            if ch == "\\", index + 1 < chars.count, asciiPunct.contains(chars[index + 1]) {
                value.append(chars[index + 1])
                index += 2
                continue
            }
            if ch == "\\" {
                value.append(ch)
                index += 1
                continue
            }
            if ch == " " || ch == "\t" || ch == "\n" || ch == "<" { break }
            if ch == "(" {
                depth += 1
                value.append(ch)
                index += 1
                continue
            }
            if ch == ")" {
                if depth == 0 { break }
                depth -= 1
                value.append(ch)
                index += 1
                continue
            }
            value.append(ch)
            index += 1
        }
        if value.isEmpty || depth != 0 { return nil }
        return (value, index)
    }

    private static func readTitle(
        _ chars: [Character],
        _ start: Int
    ) -> (value: String, next: Int)? {
        // A title is a string. `\(` is an escaped parenthesis, not math.
        guard let read = MarkdownLinkTitleForm.read(chars, start) else { return nil }
        return (read.raw, read.next)
    }

    private static func skipLinkSpace(_ chars: [Character], _ start: Int, _ blocked: [Span]) -> Int? {
        var index = start
        var newline = false
        while index < chars.count {
            if inRange(index, blocked) { return nil }
            let ch = chars[index]
            if ch == " " || ch == "\t" {
                index += 1
                continue
            }
            if ch == "\n", !newline {
                newline = true
                index += 1
                continue
            }
            break
        }
        return index
    }

    private static func isEscaped(_ chars: [Character], _ index: Int) -> Bool {
        var count = 0
        var cursor = index - 1
        while cursor >= 0, chars[cursor] == "\\" {
            count += 1
            cursor -= 1
        }
        return count % 2 == 1
    }

    private static func escapePunctuation(_ raw: String) -> String {
        var out = ""
        for ch in raw {
            if asciiPunct.contains(ch) {
                out.append("\\")
            }
            out.append(ch)
        }
        return out
    }

    private static func decodeInline(_ value: String) -> String {
        MarkdownEscape.restoreString(MarkdownEscape.protect(value, completed: true))
    }

    private static func hasPrefix(_ chars: [Character], _ prefix: String, at index: Int) -> Bool {
        let needle = Array(prefix)
        guard index + needle.count <= chars.count else { return false }
        for offset in needle.indices where chars[index + offset] != needle[offset] {
            return false
        }
        return true
    }

    private static func string(_ chars: [Character], _ start: Int, _ end: Int) -> String {
        guard start >= 0, end <= chars.count, start < end else { return "" }
        return String(chars[start..<end])
    }

    private static func inRange(_ index: Int, _ ranges: [Span]) -> Bool {
        ranges.contains { index >= $0.start && index < $0.end }
    }

    private static func blockedRanges(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        let indented = indentedCodeRanges(chars, fences)
        let math = mathRanges(chars, fences + codes + indented)
        return mergeRanges(fences + codes + indented + math)
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        var open: (marker: Character, length: Int, start: Int)?
        while index <= chars.count {
            let end = lineEnd(chars, index)
            let line = Array(chars[index..<end])
            if let marker = fenceMarker(line) {
                if let current = open {
                    if marker.char == current.marker, marker.length >= current.length, marker.infoEmpty {
                        ranges.append(Span(start: current.start, end: end))
                        open = nil
                    }
                } else {
                    open = (marker.char, marker.length, index)
                }
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if let current = open {
            ranges.append(Span(start: current.start, end: chars.count))
        }
        return ranges
    }

    private static func fenceMarker(_ line: [Character]) -> (char: Character, length: Int, infoEmpty: Bool)? {
        var index = 0
        var spaces = 0
        while index < line.count, line[index] == " ", spaces < 4 {
            spaces += 1
            index += 1
        }
        if spaces > 3 || index >= line.count { return nil }
        let marker = line[index]
        guard marker == "`" || marker == "~" else { return nil }
        var length = 0
        while index < line.count, line[index] == marker {
            length += 1
            index += 1
        }
        guard length >= 3 else { return nil }
        let rawInfo = index < line.count ? String(line[index...]) : ""
        if marker == "`", rawInfo.contains("`") { return nil }
        let info = rawInfo.trimmingCharacters(in: .whitespaces)
        return (marker, length, info.isEmpty)
    }

    private static func inlineCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inRange(index, fences) {
                index += 1
                continue
            }
            if chars[index] != "`" {
                index += 1
                continue
            }
            var length = 1
            while index + length < chars.count, chars[index + length] == "`" { length += 1 }
            var cursor = index + length
            var closed = false
            while cursor < chars.count {
                if inRange(cursor, fences) {
                    cursor += 1
                    continue
                }
                if chars[cursor] != "`" {
                    cursor += 1
                    continue
                }
                var marks = 1
                while cursor + marks < chars.count, chars[cursor + marks] == "`" { marks += 1 }
                if marks == length {
                    ranges.append(Span(start: index, end: cursor + marks))
                    index = cursor + marks
                    closed = true
                    break
                }
                cursor += marks
            }
            if !closed { index += length }
        }
        return ranges
    }

    private static func indentedCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var inCode = false
        var codeStart = 0
        var prevBlank = true
        var index = 0
        while index <= chars.count {
            let end = lineEnd(chars, index)
            let inFence = fences.contains { index >= $0.start && index < $0.end }
            if inFence {
                if inCode {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                prevBlank = false
            } else {
                let indent = contentIndent(Array(chars[index..<end]))
                let blank = indent == nil
                if inCode, !blank, let indent, indent < 4 {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                if !inCode, prevBlank, let indent, indent >= 4 {
                    inCode = true
                    codeStart = index
                }
                prevBlank = blank
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if inCode { ranges.append(Span(start: codeStart, end: chars.count)) }
        return ranges
    }

    private static func contentIndent(_ line: [Character]) -> Int? {
        var column = 0
        for ch in line {
            if ch == " " {
                column += 1
                continue
            }
            if ch == "\t" {
                column += 4 - (column % 4)
                continue
            }
            return column
        }
        return nil
    }

    private static func mathRanges(_ chars: [Character], _ skip: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inRange(index, skip) {
                index += 1
                continue
            }
            if hasPrefix(chars, "\\(", at: index) {
                if let close = indexOf(chars, "\\)", from: index + 2, skip: skip) {
                    ranges.append(Span(start: index, end: close + 2))
                    index = close + 2
                    continue
                }
            }
            if hasPrefix(chars, "$$", at: index) {
                if let close = indexOf(chars, "$$", from: index + 2, skip: skip) {
                    ranges.append(Span(start: index, end: close + 2))
                    index = close + 2
                    continue
                }
            }
            index += 1
        }
        return ranges
    }

    private static func indexOf(_ chars: [Character], _ needle: String, from: Int, skip: [Span]) -> Int? {
        var index = from
        while index < chars.count {
            if inRange(index, skip) {
                index += 1
                continue
            }
            if hasPrefix(chars, needle, at: index) { return index }
            index += 1
        }
        return nil
    }

    private static func lineEnd(_ chars: [Character], _ index: Int) -> Int {
        var cursor = index
        while cursor < chars.count, chars[cursor] != "\n" { cursor += 1 }
        return cursor
    }

    private static func mergeRanges(_ ranges: [Span]) -> [Span] {
        let sorted = ranges.filter { $0.end > $0.start }.sorted { lhs, rhs in
            lhs.start == rhs.start ? lhs.end < rhs.end : lhs.start < rhs.start
        }
        var out: [Span] = []
        for range in sorted {
            if var last = out.last, range.start <= last.end {
                last.end = max(last.end, range.end)
                out[out.count - 1] = last
            } else {
                out.append(range)
            }
        }
        return out
    }
}

private struct MarkdownImageOpenKey: EnvironmentKey {
    static let defaultValue: (ImageLightbox.Target) -> Void = { _ in }
}

extension EnvironmentValues {
    var markdownImageOpen: (ImageLightbox.Target) -> Void {
        get { self[MarkdownImageOpenKey.self] }
        set { self[MarkdownImageOpenKey.self] = newValue }
    }
}

/// Inline image sized to the bubble. A muted placeholder shows
/// while loading. Failure is muted, underlined alt or URL text.
/// No animation.
struct MarkdownInlineImage: View {
    let image: MarkdownImage.Inline
    var compact = false
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.markdownImageOpen) private var openMarkdownImage
    @State private var phase: Phase = .loading
    @State private var uiImage: UIImage?

    private enum Phase {
        case loading
        case ready
        case failed
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(uiColor: .tertiarySystemFill))
                    .frame(width: compact ? 120 : 160, height: compact ? 72 : 90)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("Loading image")
            case .failed:
                fallback
            case .ready:
                if let uiImage {
                    Button(action: activate) {
                        fitted(uiImage)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label)
                }
            }
        }
        .markdownImageTitle(image.title)
        .task(id: image.url) { await load() }
    }

    private var label: String {
        let trimmed = image.alt.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? ImageLightbox.label : trimmed
    }

    @ViewBuilder
    private var fallback: some View {
        let text = Text(MarkdownImage.fallback(alt: image.alt, url: image.url))
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
            .underline()
            .multilineTextAlignment(.leading)
        if let link = image.link, let url = WebLinks.url(link), WebLinks.allows(url) {
            Button {
                openURL(url)
            } label: {
                text
            }
            .buttonStyle(.plain)
        } else {
            text
        }
    }

    private func fitted(_ uiImage: UIImage) -> some View {
        let cap = compact ? min(uiImage.size.width, 220) : uiImage.size.width
        return Image(uiImage: uiImage)
            .resizable()
            .scaledToFit()
            .frame(maxWidth: max(cap, 1))
            .frame(maxWidth: .infinity, alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityHidden(true)
    }

    private func activate() {
        if let link = image.link, let url = WebLinks.url(link), WebLinks.allows(url) {
            openURL(url)
            return
        }
        openMarkdownImage(
            ImageLightbox.Target(
                id: "md:" + image.url,
                url: image.url,
                name: label,
                local: uiImage?.pngData()
            )
        )
    }

    private func load() async {
        switch MarkdownImage.sourceKind(image.url) {
        case .literal:
            phase = .failed
        case .attachment:
            await loadAttachment()
        case .remote:
            await loadRemote()
        }
    }

    private func loadAttachment() async {
        guard let client = model.client, let url = client.resolve(image.url) else {
            phase = .failed
            return
        }
        do {
            let data = try await client.data(from: url)
            guard let picture = UIImage(data: data) else {
                phase = .failed
                return
            }
            uiImage = picture
            phase = .ready
        } catch {
            if !Task.isCancelled { phase = .failed }
        }
    }

    private func loadRemote() async {
        guard let url = URL(string: image.url) else {
            phase = .failed
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let picture = UIImage(data: data) else {
                phase = .failed
                return
            }
            uiImage = picture
            phase = .ready
        } catch {
            if !Task.isCancelled { phase = .failed }
        }
    }
}

private extension View {
    @ViewBuilder
    func markdownImageTitle(_ title: String?) -> some View {
        let tip = title?.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ") ?? ""
        if !tip.isEmpty {
            self.help(tip)
        } else {
            self
        }
    }
}
