// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.46: CommonMark link titles on a completed assistant
/// LEFT `kind=message`.
///
/// `[text](url "title")`, single quotes, and `(title)` put that
/// title on the link. Desktop shows it as the hover tooltip and
/// accessibility hint. Here the long-press preview stays the
/// destination URL. The title is that preview's accessibility
/// hint and a tooltip line above the URL.
///
/// A link with no title, or a title that is empty after whitespace
/// collapses, has no hint. Streaming (`completed: false`) does
/// nothing. Unsafe schemes are not links. Code, fences, indented
/// code, and math are not parsed. Copy keeps markdown source.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownLinkTitle.ts`.
enum MarkdownLinkTitle {
    static var previewHint: String?

    static func hint(_ title: String?, completed: Bool) -> String {
        if !completed { return "" }
        guard let title else { return "" }
        let decoded = MarkdownEscape.restoreString(MarkdownEscape.protect(title, completed: true))
        return decoded.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    static func annotate(_ text: inout AttributedString, source: String, completed: Bool) {
        if !completed || source.isEmpty { return }
        if !source.contains("[") { return }
        let entries = renderedLinks(source)
        if !entries.contains(where: { $0.title != nil }) { return }
        let runs = linkRuns(text)
        if runs.isEmpty { return }
        var entryIndex = 0
        var runIndex = 0
        while entryIndex < entries.count && runIndex < runs.count {
            let entry = entries[entryIndex]
            let run = runs[runIndex]
            if sameDestination(run.link, entry.url) && !skipBare(run, entry) {
                if let title = entry.title {
                    text[run.range].snorlaxLinkTitle = title
                }
                runIndex += 1
                let nextSame = entryIndex + 1 < entries.count
                    && sameDestination(entries[entryIndex + 1].url, entry.url)
                if !nextSame {
                    while runIndex < runs.count
                        && runs[runIndex].range.lowerBound == runs[runIndex - 1].range.upperBound
                        && sameDestination(runs[runIndex].link, entry.url)
                        && !skipBare(runs[runIndex], entry)
                    {
                        if let title = entry.title {
                            text[runs[runIndex].range].snorlaxLinkTitle = title
                        }
                        runIndex += 1
                    }
                }
                entryIndex += 1
            } else {
                runIndex += 1
            }
        }
    }

    static func hint(in textView: UITextView, at item: UITextItem) -> String? {
        guard case .link = item.content else { return nil }
        let range = item.range
        guard range.location != NSNotFound, range.location < textView.attributedText.length else { return nil }
        let raw = textView.attributedText.attribute(
            .snorlaxLinkTitle,
            at: range.location,
            effectiveRange: nil
        )
        guard let title = raw as? String, !title.isEmpty else { return nil }
        return title
    }

    static func consumePreviewHint() -> String? {
        let hint = previewHint
        previewHint = nil
        guard let hint, !hint.isEmpty else { return nil }
        return hint
    }

    private struct Span {
        var start: Int
        var end: Int
    }

    private struct Entry {
        var url: URL
        var dest: String
        var label: String
        var title: String?
    }

    private struct RunInfo {
        var range: Range<AttributedString.Index>
        var link: URL
        var text: String
    }

    private static func linkRuns(_ text: AttributedString) -> [RunInfo] {
        var runs: [RunInfo] = []
        for run in text.runs {
            guard let link = run.link else { continue }
            runs.append(RunInfo(
                range: run.range,
                link: link,
                text: String(text[run.range].characters)
            ))
        }
        return runs
    }

    private static func renderedLinks(_ source: String) -> [Entry] {
        let src = source
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let chars = Array(src)
        let blocked = blockedRanges(chars)
        var entries: [Entry] = []
        var index = 0
        while index < chars.count {
            if inSpan(index, blocked) || chars[index] != "[" || isEscaped(chars, index) {
                index += 1
                continue
            }
            if index > 0, chars[index - 1] == "!", !isEscaped(chars, index - 1) {
                index += 1
                continue
            }
            guard let parsed = parseInlineLink(chars, index, blocked) else {
                index += 1
                continue
            }
            if let url = WebLinks.url(parsed.dest) {
                entries.append(Entry(url: url, dest: parsed.dest, label: parsed.label, title: parsed.title))
            }
            index = parsed.end
        }
        return entries
    }

    private struct Parsed {
        var dest: String
        var label: String
        var title: String?
        var end: Int
    }

    private static func parseInlineLink(_ chars: [Character], _ start: Int, _ blocked: [Span]) -> Parsed? {
        guard let label = readBracket(chars, start, blocked) else { return nil }
        guard let open = skipLinkSpace(chars, label.next, blocked), char(chars, open) == "(" else { return nil }
        guard let destAt = skipLinkSpace(chars, open + 1, blocked),
              let dest = readDestination(chars, destAt, blocked) else { return nil }
        var cursor = dest.next
        var title: String?
        if let titleAt = skipLinkSpace(chars, cursor, blocked),
           let mark = char(chars, titleAt),
           mark == "\"" || mark == "'" || mark == "("
        {
            guard let read = readTitle(chars, titleAt, blocked) else { return nil }
            title = read.value
            cursor = read.next
        }
        guard let close = skipLinkSpace(chars, cursor, blocked), char(chars, close) == ")" else { return nil }
        return Parsed(
            dest: decodeInline(dest.value),
            label: decodeInline(label.raw),
            title: cleanTitle(title),
            end: close + 1
        )
    }

    private static func cleanTitle(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let cleaned = hint(decodeInline(raw), completed: true)
        return cleaned.isEmpty ? nil : cleaned
    }

    private static func decodeInline(_ value: String) -> String {
        MarkdownEscape.restoreString(MarkdownEscape.protect(value, completed: true))
    }

    private static func skipBare(_ run: RunInfo, _ entry: Entry) -> Bool {
        guard runLooksBare(run.text, run.link) else { return false }
        return !labelLooksLikeDest(entry.label, entry.dest, entry.url)
    }

    /// A rendered run whose text is the destination itself (a bare
    /// http(s) URL, a `www.` autolink, or a v1.45 GFM email) is not the
    /// labeled link that owns a title. `mailto:user@example.com` already
    /// matches the absolute string. A bare `user@example.com` does not,
    /// so it is recognized here and does not take the tooltip.
    private static func runLooksBare(_ text: String, _ link: URL) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == link.absoluteString { return true }
        if let decoded = link.absoluteString.removingPercentEncoding, trimmed == decoded { return true }
        if trimmed.hasPrefix("www.") {
            if link.absoluteString == "http://" + trimmed || link.absoluteString == "https://" + trimmed {
                return true
            }
        }
        if let address = mailtoAddress(link), sameEmail(trimmed, address) { return true }
        return false
    }

    private static func labelLooksLikeDest(_ label: String, _ dest: String, _ url: URL) -> Bool {
        let lab = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if lab == dest || lab == url.absoluteString { return true }
        if let decoded = url.absoluteString.removingPercentEncoding, lab == decoded { return true }
        if url.absoluteString == "http://" + lab || url.absoluteString == "https://" + lab { return true }
        if dest == "http://" + lab || dest == "https://" + lab { return true }
        if let address = mailtoAddress(url), sameEmail(lab, address) || sameEmail(lab, "mailto:" + address) {
            return true
        }
        if dest.lowercased().hasPrefix("mailto:") {
            let rest = String(dest.dropFirst("mailto:".count))
            if sameEmail(lab, rest) || sameEmail(lab, dest) { return true }
        }
        return false
    }

    /// Address of a `mailto:` URL, without the scheme. Nil for other links.
    private static func mailtoAddress(_ url: URL) -> String? {
        guard url.scheme?.lowercased() == "mailto" else { return nil }
        var address = url.absoluteString
        guard let colon = address.firstIndex(of: ":") else { return nil }
        address = String(address[address.index(after: colon)...])
        if address.hasPrefix("//") { address.removeFirst(2) }
        if let decoded = address.removingPercentEncoding { address = decoded }
        if let cut = address.firstIndex(where: { $0 == "?" || $0 == "#" }) {
            address = String(address[..<cut])
        }
        return address.isEmpty ? nil : address
    }

    private static func sameEmail(_ left: String, _ right: String) -> Bool {
        left.caseInsensitiveCompare(right) == .orderedSame
    }

    private static func sameDestination(_ link: URL, _ expected: URL) -> Bool {
        if link == expected { return true }
        return canon(link) == canon(expected)
    }

    private static func canon(_ url: URL) -> String {
        if WebLinks.isMailtoEmail(url) {
            var address = url.absoluteString
            if let colon = address.firstIndex(of: ":") {
                address = String(address[address.index(after: colon)...])
            }
            if let decoded = address.removingPercentEncoding { address = decoded }
            return "mailto:" + address.lowercased()
        }
        let scheme = (url.scheme ?? "").lowercased()
        let host = (url.host ?? "").lowercased()
        var path = url.path
        if path.count > 1, path.hasSuffix("/") { path.removeLast() }
        let query = url.query.map { "?\($0)" } ?? ""
        let fragment = url.fragment.map { "#\($0)" } ?? ""
        if host.isEmpty { return url.absoluteString }
        return "\(scheme)://\(host)\(path)\(query)\(fragment)"
    }

    private static func char(_ chars: [Character], _ index: Int) -> Character? {
        guard index >= 0, index < chars.count else { return nil }
        return chars[index]
    }

    private static func readBracket(
        _ chars: [Character],
        _ open: Int,
        _ blocked: [Span]
    ) -> (raw: String, next: Int)? {
        guard char(chars, open) == "[" else { return nil }
        if isEscaped(chars, open) || inSpan(open, blocked) { return nil }
        var index = open + 1
        var depth = 1
        var raw = ""
        while index < chars.count {
            if inSpan(index, blocked) { return nil }
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count {
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
        if inSpan(start, blocked) { return nil }
        if char(chars, start) == "<" {
            var index = start + 1
            var value = ""
            while index < chars.count {
                if inSpan(index, blocked) { return nil }
                let ch = chars[index]
                if ch == "\n" || ch == "<" { return nil }
                if ch == "\\", index + 1 < chars.count {
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
            if inSpan(index, blocked) { return nil }
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count {
                value.append(chars[index + 1])
                index += 2
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
        _ start: Int,
        _ blocked: [Span]
    ) -> (value: String, next: Int)? {
        guard let open = char(chars, start) else { return nil }
        let close: Character = open == "(" ? ")" : open
        if open != "\"" && open != "'" && open != "(" { return nil }
        var index = start + 1
        var value = ""
        while index < chars.count {
            if inSpan(index, blocked) { return nil }
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count {
                value.append(chars[index + 1])
                index += 2
                continue
            }
            if ch == close { return (value, index + 1) }
            value.append(ch)
            index += 1
        }
        return nil
    }

    private static func skipLinkSpace(_ chars: [Character], _ start: Int, _ blocked: [Span]) -> Int? {
        var index = start
        var newline = false
        while index < chars.count {
            if inSpan(index, blocked) { return nil }
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

    private static func blockedRanges(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        let indented = indentedCodeRanges(chars, fences)
        let math = mathRanges(chars, fences + codes + indented)
        return merge(fences + codes + indented + math)
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        var open: (marker: Character, count: Int, start: Int)?
        while index <= chars.count {
            let end = lineEnd(chars, index)
            if let fence = fenceOnLine(chars, index, end) {
                if open == nil {
                    open = (fence.marker, fence.count, index)
                } else if let opened = open,
                          fence.marker == opened.marker,
                          fence.count >= opened.count,
                          fence.infoEmpty
                {
                    ranges.append(Span(start: opened.start, end: end))
                    open = nil
                }
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if let opened = open {
            ranges.append(Span(start: opened.start, end: chars.count))
        }
        return ranges
    }

    private static func fenceOnLine(
        _ chars: [Character],
        _ start: Int,
        _ end: Int
    ) -> (marker: Character, count: Int, infoEmpty: Bool)? {
        var index = start
        var spaces = 0
        while index < end, spaces < 3, chars[index] == " " {
            index += 1
            spaces += 1
        }
        guard index < end else { return nil }
        let marker = chars[index]
        guard marker == "`" || marker == "~" else { return nil }
        var count = 0
        while index < end, chars[index] == marker {
            count += 1
            index += 1
        }
        guard count >= 3 else { return nil }
        var infoEmpty = true
        while index < end {
            if chars[index] != " " && chars[index] != "\t" {
                infoEmpty = false
                break
            }
            index += 1
        }
        return (marker, count, infoEmpty)
    }

    private static func inlineCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inSpan(index, fences) {
                index += 1
                continue
            }
            if chars[index] != "`" {
                index += 1
                continue
            }
            var count = 1
            while index + count < chars.count, chars[index + count] == "`" { count += 1 }
            var cursor = index + count
            var closed = false
            while cursor < chars.count {
                if inSpan(cursor, fences) {
                    cursor += 1
                    continue
                }
                if chars[cursor] != "`" {
                    cursor += 1
                    continue
                }
                var marks = 1
                while cursor + marks < chars.count, chars[cursor + marks] == "`" { marks += 1 }
                if marks == count {
                    ranges.append(Span(start: index, end: cursor + marks))
                    index = cursor + marks
                    closed = true
                    break
                }
                cursor += marks
            }
            if !closed { break }
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
            if inSpan(index, fences) {
                if inCode {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                prevBlank = false
            } else {
                let indent = contentIndent(chars, index, end)
                let blank = indent == nil
                if inCode, let indent, indent < 4 {
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
        if inCode {
            ranges.append(Span(start: codeStart, end: chars.count))
        }
        return ranges
    }

    private static func contentIndent(_ chars: [Character], _ start: Int, _ end: Int) -> Int? {
        var col = 0
        var index = start
        while index < end {
            let ch = chars[index]
            if ch == " " {
                col += 1
            } else if ch == "\t" {
                col += 4 - (col % 4)
            } else {
                return col
            }
            index += 1
        }
        return nil
    }

    private static func mathRanges(_ chars: [Character], _ skip: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inSpan(index, skip) {
                index += 1
                continue
            }
            if char(chars, index) == "\\", char(chars, index + 1) == "(" {
                var close = index + 2
                while close + 1 < chars.count {
                    if chars[close] == "\\", chars[close + 1] == ")" {
                        ranges.append(Span(start: index, end: close + 2))
                        index = close + 2
                        break
                    }
                    close += 1
                }
                if index != close + 2 { index += 1 }
                continue
            }
            if char(chars, index) == "$", char(chars, index + 1) == "$" {
                var close = index + 2
                while close + 1 < chars.count {
                    if chars[close] == "$", chars[close + 1] == "$" {
                        ranges.append(Span(start: index, end: close + 2))
                        index = close + 2
                        break
                    }
                    close += 1
                }
                if index != close + 2 { index += 1 }
                continue
            }
            index += 1
        }
        return ranges
    }

    private static func lineEnd(_ chars: [Character], _ start: Int) -> Int {
        var index = start
        while index < chars.count, chars[index] != "\n" { index += 1 }
        return index
    }

    private static func inSpan(_ index: Int, _ ranges: [Span]) -> Bool {
        ranges.contains { index >= $0.start && index < $0.end }
    }

    private static func merge(_ ranges: [Span]) -> [Span] {
        let sorted = ranges
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start || ($0.start == $1.start && $0.end < $1.end) }
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

struct SnorlaxLinkTitleAttribute: AttributedStringKey {
    typealias Value = String
    static let name = "snorlaxLinkTitle"
}

extension AttributeScopes {
    struct SnorlaxAttributes: AttributeScope {
        let snorlaxLinkTitle: SnorlaxLinkTitleAttribute
    }

    var snorlax: SnorlaxAttributes.Type { SnorlaxAttributes.self }
}

extension AttributeDynamicLookup {
    subscript<T: AttributedStringKey>(
        dynamicMember keyPath: KeyPath<AttributeScopes.SnorlaxAttributes, T>
    ) -> T {
        self[T.self]
    }
}

extension NSAttributedString.Key {
    static let snorlaxLinkTitle = NSAttributedString.Key("snorlaxLinkTitle")
}
