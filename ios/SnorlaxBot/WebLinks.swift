// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.82: bare http:// and https:// in chat message text are links.
/// v1.34: GFM www autolinks (`www.example.com`) are links too. The
/// visible text stays `www...`; the opened URL is `http://` plus that
/// text. Trailing sentence punctuation stays outside the link. Balanced
/// parentheses inside a URL stay. Inline code and fenced code stay
/// plain. javascript:, file:, and any other scheme stay plain. While a
/// bubble is still streaming, a URL that reaches the end of the buffer
/// stays plain so a half-typed address is not a link.
/// v1.45: GFM extended email autolinks on a completed assistant reply.
/// `foo@bar.baz` is a `mailto:` link whose text is the address. A
/// `mailto:` prefix stays in the text. A scheme other than mailto
/// before the address stays plain. Pass `emails: true` only for
/// that completed reply; user text and a streaming bubble do not.
/// Keep in lockstep with `desktop/src/linkify.ts`.
enum WebLinks {
    struct Piece: Equatable {
        enum Kind: Equatable {
            case text
            case link
        }

        var kind: Kind
        var value: String
    }

    private static let trailingChars = ".,;:!?)]}'\"\u{201C}\u{201D}\u{2018}\u{2019}"

    static func allows(_ url: URL) -> Bool {
        if isMailtoEmail(url) { return true }
        if isExtendedMailto(url) { return true }
        let scheme = url.scheme?.lowercased()
        guard scheme == "http" || scheme == "https" else { return false }
        guard let host = url.host, !host.isEmpty else { return false }
        return true
    }

    /// v1.43: `mailto:` plus an email address, and nothing else.
    /// A query or a fragment stays closed. http(s) rules above are unchanged.
    static func isMailtoEmail(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "mailto" else { return false }
        if url.query != nil || url.fragment != nil { return false }
        var address = url.absoluteString
        guard let colon = address.firstIndex(of: ":") else { return false }
        address = String(address[address.index(after: colon)...])
        if address.hasPrefix("//") { address.removeFirst(2) }
        if let decoded = address.removingPercentEncoding { address = decoded }
        return emailAddress(address)
    }

    /// CommonMark email autolink address. The whole string must match.
    static func emailAddress(_ address: String) -> Bool {
        guard let emailRegex else { return false }
        let range = NSRange(location: 0, length: (address as NSString).length)
        guard let match = emailRegex.firstMatch(in: address, range: range) else { return false }
        return match.range.location == 0 && match.range.length == range.length
    }

    private static let emailRegex: NSRegularExpression? = try? NSRegularExpression(
        pattern: "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
    )

    static func url(_ raw: String) -> URL? {
        if let href = emailHref(raw), let parsed = URL(string: href), allows(parsed) {
            return parsed
        }
        let candidate = raw.hasPrefix("www.") ? "http://" + raw : raw
        if let parsed = URL(string: candidate), allows(parsed) { return parsed }
        // Foundation rejects some characters that are valid in real links.
        let encoded = candidate
            .replacingOccurrences(of: "(", with: "%28")
            .replacingOccurrences(of: ")", with: "%29")
            .replacingOccurrences(of: "[", with: "%5B")
            .replacingOccurrences(of: "]", with: "%5D")
        guard encoded != candidate, let parsed = URL(string: encoded), allows(parsed) else { return nil }
        return parsed
    }

    /// Plain text. `streaming` leaves a URL that still touches the end as text.
    /// `emails` adds GFM extended email autolinks. Completed assistant
    /// markdown passes true. User text and a streaming bubble do not.
    static func split(_ text: String, streaming: Bool, emails: Bool = false) -> [Piece] {
        let http = splitHttp(text, streaming: streaming)
        var pieces: [Piece] = []
        for (index, piece) in http.enumerated() {
            if piece.kind == .link {
                pieces.append(piece)
                continue
            }
            let tail = streaming && index == http.count - 1
            let www = splitWww(piece.value, streaming: tail)
            if !emails {
                pieces.append(contentsOf: www)
                continue
            }
            for (wwwIndex, part) in www.enumerated() {
                if part.kind == .link {
                    pieces.append(part)
                    continue
                }
                let emailTail = tail && wwwIndex == www.count - 1
                pieces.append(contentsOf: splitEmails(part.value, streaming: emailTail))
            }
        }
        if pieces.isEmpty || pieces.map(\.value).joined() != text {
            return [Piece(kind: .text, value: text)]
        }
        return pieces
    }

    /// http(s) only. www autolinks are applied on the text pieces.
    private static func splitHttp(_ text: String, streaming: Bool) -> [Piece] {
        let blocked = codeRanges(in: text)
        guard let pattern = try? NSRegularExpression(
            pattern: "https?://[^\\s<>\"'`]+",
            options: [.caseInsensitive]
        ) else {
            return [Piece(kind: .text, value: text)]
        }
        let ns = text as NSString
        let matches = pattern.matches(in: text, range: NSRange(location: 0, length: ns.length))
        var pieces: [Piece] = []
        var last = text.startIndex
        for match in matches {
            guard let range = Range(match.range, in: text) else { continue }
            if blocked.contains(where: { $0.contains(range.lowerBound) }) { continue }
            if streaming && range.upperBound == text.endIndex { break }
            let raw = String(text[range])
            let trimmed = trimTrailing(raw)
            guard url(trimmed) != nil else { continue }
            if last < range.lowerBound {
                pieces.append(Piece(kind: .text, value: String(text[last..<range.lowerBound])))
            }
            pieces.append(Piece(kind: .link, value: trimmed))
            let room = text.distance(from: range.lowerBound, to: text.endIndex)
            let step = min(trimmed.count, room)
            last = text.index(range.lowerBound, offsetBy: step)
        }
        if last < text.endIndex {
            pieces.append(Piece(kind: .text, value: String(text[last...])))
        }
        if pieces.isEmpty || pieces.map(\.value).joined() != text {
            return [Piece(kind: .text, value: text)]
        }
        return pieces
    }

    static func attributed(_ text: String, streaming: Bool) -> AttributedString {
        var output = AttributedString()
        for piece in split(text, streaming: streaming) {
            if piece.kind == .link, let link = url(piece.value) {
                var chunk = AttributedString(piece.value)
                chunk.link = link
                chunk.foregroundColor = .accentColor
                output.append(chunk)
            } else {
                output.append(AttributedString(piece.value))
            }
        }
        if output.characters.isEmpty {
            return AttributedString(text)
        }
        return output
    }

    /// Add bare links on markdown runs that are not already links or code.
    static func applyingLinks(_ source: AttributedString, streaming: Bool) -> AttributedString {
        var result = source
        for run in source.runs {
            if shouldSkip(run) { continue }
            let raw = String(source[run.range].characters)
            let pieces = split(raw, streaming: streaming, emails: !streaming)
            guard pieces.map(\.value).joined() == raw else { continue }
            guard pieces.contains(where: { $0.kind == .link }) else { continue }
            var cursor = run.range.lowerBound
            for piece in pieces {
                let end = source.characters.index(cursor, offsetBy: piece.value.count)
                if piece.kind == .link, let link = url(piece.value) {
                    result[cursor..<end].link = link
                    result[cursor..<end].foregroundColor = .accentColor
                }
                cursor = end
            }
        }
        return result
    }

    private static func shouldSkip(_ run: AttributedString.Runs.Element) -> Bool {
        if run.link != nil { return true }
        if let intent = run.inlinePresentationIntent, intent.contains(.code) { return true }
        if let presentation = run.presentationIntent {
            for component in presentation.components {
                if case .codeBlock = component.kind { return true }
            }
        }
        return false
    }

    private static func trimTrailing(_ url: String) -> String {
        let lower = url.lowercased()
        let minCount = lower.hasPrefix("https://") ? 8 : (lower.hasPrefix("http://") ? 7 : url.count)
        var end = url.endIndex
        while url.distance(from: url.startIndex, to: end) > minCount {
            let prev = url.index(before: end)
            let ch = url[prev]
            guard trailingChars.contains(ch) else { break }
            if ch == ")" || ch == "]" || ch == "}" {
                let head = url[..<end]
                let open: Character = ch == ")" ? "(" : (ch == "]" ? "[" : "{")
                let opens = head.filter { $0 == open }.count
                let closes = head.filter { $0 == ch }.count
                if opens >= closes { break }
            }
            end = prev
        }
        return String(url[..<end])
    }

    private struct WwwHit {
        var start: Int
        var end: Int
        var value: String
    }

    /// GFM extended www autolink. Visible text has no scheme.
    private static func splitWww(_ text: String, streaming: Bool) -> [Piece] {
        let chars = Array(text)
        let blocked = codeRanges(in: text).map { range -> Range<Int> in
            let lo = text.distance(from: text.startIndex, to: range.lowerBound)
            let hi = text.distance(from: text.startIndex, to: range.upperBound)
            return lo..<hi
        }
        var pieces: [Piece] = []
        var last = 0
        var cursor = 0
        while cursor < chars.count {
            guard let hit = nextWww(chars, cursor, blocked, streaming) else { break }
            if hit.start > last {
                pieces.append(Piece(kind: .text, value: String(chars[last..<hit.start])))
            }
            pieces.append(Piece(kind: .link, value: hit.value))
            last = hit.end
            cursor = hit.end
        }
        if last < chars.count {
            pieces.append(Piece(kind: .text, value: String(chars[last...])))
        }
        if pieces.isEmpty || pieces.map(\.value).joined() != text {
            return [Piece(kind: .text, value: text)]
        }
        return pieces
    }

    private static func nextWww(
        _ chars: [Character],
        _ from: Int,
        _ blocked: [Range<Int>],
        _ streaming: Bool
    ) -> WwwHit? {
        var i = from
        while i < chars.count {
            guard let idx = indexOfWww(chars, i) else { return nil }
            if blocked.contains(where: { $0.contains(idx) }) || !wwwBoundary(chars, idx) {
                i = idx + 1
                continue
            }
            guard let domainEnd = checkDomain(chars, idx) else {
                i = idx + 4
                continue
            }
            var rawEnd = domainEnd
            while rawEnd < chars.count && !isWwwSpace(chars[rawEnd]) && chars[rawEnd] != "<" {
                rawEnd += 1
            }
            if streaming && rawEnd == chars.count { return nil }
            let end = autolinkDelim(chars, idx, rawEnd)
            if end <= idx + 4 {
                i = idx + 4
                continue
            }
            let value = String(chars[idx..<end])
            if url(value) == nil {
                i = idx + 4
                continue
            }
            return WwwHit(start: idx, end: end, value: value)
        }
        return nil
    }

    private static func indexOfWww(_ chars: [Character], _ from: Int) -> Int? {
        guard from >= 0, chars.count - from >= 4 else { return nil }
        var i = from
        while i <= chars.count - 4 {
            if chars[i] == "w" && chars[i + 1] == "w" && chars[i + 2] == "w" && chars[i + 3] == "." {
                return i
            }
            i += 1
        }
        return nil
    }

    /// Start of text, whitespace, or GFM delimiters `*_~(` .
    private static func wwwBoundary(_ chars: [Character], _ index: Int) -> Bool {
        if index == 0 { return true }
        let prev = chars[index - 1]
        if prev == "*" || prev == "_" || prev == "~" || prev == "(" { return true }
        return isWwwSpace(prev)
    }

    private static func isWwwSpace(_ ch: Character) -> Bool {
        ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "\u{000C}" || ch == "\u{000B}"
    }

    /// cmark-gfm `check_domain`. Returns where the domain scan stopped.
    private static func checkDomain(_ chars: [Character], _ start: Int) -> Int? {
        let size = chars.count - start
        if size < 4 { return nil }
        var np = 0
        var uscore1 = 0
        var uscore2 = 0
        var i = 1
        while i < size - 1 {
            if chars[start + i] == "\\" && i < size - 2 {
                i += 1
            }
            let c = chars[start + i]
            if c == "_" {
                uscore2 += 1
            } else if c == "." {
                uscore1 = uscore2
                uscore2 = 0
                np += 1
            } else if !isHostChar(c) && c != "-" {
                break
            }
            i += 1
        }
        if (uscore1 > 0 || uscore2 > 0) && np <= 10 { return nil }
        if np == 0 { return nil }
        return start + i
    }

    private static func isHostChar(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        let v = scalar.value
        return (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122)
    }

    /// GFM extended-autolink path trim: trailing punct, unmatched `)`, entities.
    private static func autolinkDelim(_ chars: [Character], _ start: Int, _ linkEnd: Int) -> Int {
        var end = linkEnd
        var opening = 0
        var closing = 0
        var i = start
        while i < end {
            let c = chars[i]
            if c == "(" { opening += 1 }
            else if c == ")" { closing += 1 }
            i += 1
        }
        let trail: Set<Character> = ["?", "!", ".", ",", ":", "*", "_", "~", "'", "\""]
        while end > start {
            let c = chars[end - 1]
            if c == ")" {
                if closing <= opening { return end }
                closing -= 1
                end -= 1
                continue
            }
            if trail.contains(c) {
                end -= 1
                continue
            }
            if c == ";" {
                var k = end - 2
                while k > start && isAlnum(chars[k]) {
                    k -= 1
                }
                if k >= start && k < end - 2 && chars[k] == "&" {
                    end = k
                } else {
                    end -= 1
                }
                continue
            }
            return end
        }
        return end
    }

    private static func isAlnum(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        let v = scalar.value
        return (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122)
    }

    private static func codeRanges(in text: String) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        var index = text.startIndex
        while index < text.endIndex {
            if isLineStart(text, index) {
                if let fence = readOpeningFence(text, index) {
                    let end = findClosingFence(text, fence.contentStart, fence.marker) ?? text.endIndex
                    ranges.append(index..<end)
                    index = end
                    continue
                }
            }
            if text[index] == "`" {
                var run = 0
                var cursor = index
                while cursor < text.endIndex && text[cursor] == "`" {
                    run += 1
                    cursor = text.index(after: cursor)
                }
                if let close = findInlineClose(text, cursor, run) {
                    ranges.append(index..<close)
                    index = close
                    continue
                }
                index = cursor
                continue
            }
            index = text.index(after: index)
        }
        return ranges
    }

    private static func isLineStart(_ text: String, _ index: String.Index) -> Bool {
        index == text.startIndex || text[text.index(before: index)] == "\n"
    }

    private static func readOpeningFence(
        _ text: String,
        _ lineStart: String.Index
    ) -> (contentStart: String.Index, marker: String)? {
        var index = lineStart
        var spaces = 0
        while index < text.endIndex && text[index] == " " {
            spaces += 1
            if spaces > 3 { return nil }
            index = text.index(after: index)
        }
        guard index < text.endIndex else { return nil }
        let ch = text[index]
        guard ch == "`" || ch == "~" else { return nil }
        var len = 0
        var cursor = index
        while cursor < text.endIndex && text[cursor] == ch {
            len += 1
            cursor = text.index(after: cursor)
        }
        guard len >= 3 else { return nil }
        let marker = String(repeating: String(ch), count: len)
        let lineEnd = text[cursor...].firstIndex(of: "\n")
        let infoEnd = lineEnd ?? text.endIndex
        let info = stripCr(String(text[cursor..<infoEnd]))
        if ch == "`" && info.contains("`") { return nil }
        let contentStart = lineEnd.map { text.index(after: $0) } ?? text.endIndex
        return (contentStart, marker)
    }

    private static func findClosingFence(
        _ text: String,
        _ from: String.Index,
        _ marker: String
    ) -> String.Index? {
        var index = from
        while index <= text.endIndex {
            let lineEnd = text[index...].firstIndex(of: "\n") ?? text.endIndex
            if isClosingFenceLine(String(text[index..<lineEnd]), marker) {
                return lineEnd == text.endIndex ? text.endIndex : text.index(after: lineEnd)
            }
            if lineEnd == text.endIndex { return nil }
            index = text.index(after: lineEnd)
        }
        return nil
    }

    private static func isClosingFenceLine(_ line: String, _ marker: String) -> Bool {
        let body = stripCr(line)
        var spaces = 0
        var index = body.startIndex
        while index < body.endIndex && body[index] == " " {
            spaces += 1
            if spaces > 3 { return false }
            index = body.index(after: index)
        }
        guard body[index...].hasPrefix(marker) else { return false }
        var cursor = body.index(index, offsetBy: marker.count)
        let ch = marker.first!
        while cursor < body.endIndex && body[cursor] == ch {
            cursor = body.index(after: cursor)
        }
        while cursor < body.endIndex {
            if body[cursor] != " " && body[cursor] != "\t" { return false }
            cursor = body.index(after: cursor)
        }
        return true
    }

    private static func findInlineClose(_ text: String, _ from: String.Index, _ run: Int) -> String.Index? {
        var index = from
        while index < text.endIndex {
            if text[index] != "`" {
                index = text.index(after: index)
                continue
            }
            var len = 0
            var cursor = index
            while cursor < text.endIndex && text[cursor] == "`" {
                len += 1
                cursor = text.index(after: cursor)
            }
            if len == run { return cursor }
            index = cursor
        }
        return nil
    }

    private static func stripCr(_ line: String) -> String {
        line.hasSuffix("\r") ? String(line.dropLast()) : line
    }

    /// `mailto:` plus a GFM extended email, with no query and no fragment.
    private static func isExtendedMailto(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "mailto" else { return false }
        if url.query != nil || url.fragment != nil { return false }
        var address = url.absoluteString
        guard let colon = address.firstIndex(of: ":") else { return false }
        address = String(address[address.index(after: colon)...])
        if address.hasPrefix("//") { address.removeFirst(2) }
        if let decoded = address.removingPercentEncoding { address = decoded }
        return isExtendedEmail(address)
    }

    /// GFM extended email. The whole string must match.
    static func isExtendedEmail(_ address: String) -> Bool {
        guard let at = address.firstIndex(of: "@"), at > address.startIndex else { return false }
        let local = address[..<at]
        let domainStart = address.index(after: at)
        guard domainStart < address.endIndex else { return false }
        let domain = address[domainStart...]
        if domain.contains("@") { return false }
        return isEmailLocal(String(local)) && isEmailDomain(String(domain))
    }

    /// `mailto:` plus the address, or nil when `visible` is not an extended email.
    static func emailHref(_ visible: String) -> String? {
        guard let address = emailAddressOf(visible) else { return nil }
        return "mailto:" + address
    }

    private static func emailAddressOf(_ visible: String) -> String? {
        var address = visible
        if visible.count >= 7, visible.prefix(7).lowercased() == "mailto:" {
            address = String(visible.dropFirst(7))
        }
        guard isExtendedEmail(address) else { return nil }
        return address
    }

    private static func isEmailLocal(_ local: String) -> Bool {
        guard !local.isEmpty else { return false }
        return local.allSatisfy { isEmailLocalChar($0) }
    }

    private static func isEmailDomain(_ domain: String) -> Bool {
        guard !domain.isEmpty, !domain.hasSuffix("-"), !domain.hasSuffix("_") else { return false }
        let labels = domain.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count >= 2 else { return false }
        return labels.allSatisfy { label in
            !label.isEmpty && label.allSatisfy { isEmailDomainChar($0) }
        }
    }

    private static func isEmailLocalChar(_ ch: Character) -> Bool {
        isAlnum(ch) || ch == "." || ch == "-" || ch == "_" || ch == "+"
    }

    private static func isEmailDomainChar(_ ch: Character) -> Bool {
        isAlnum(ch) || ch == "-" || ch == "_"
    }

    private struct EmailHit {
        var start: Int
        var end: Int
        var value: String
    }

    /// GFM extended email autolink. Code, fences, and indented code stay plain.
    private static func splitEmails(_ text: String, streaming: Bool) -> [Piece] {
        let chars = Array(text)
        let blocked = emailBlocked(text)
        var pieces: [Piece] = []
        var last = 0
        var cursor = 0
        while cursor < chars.count {
            guard let hit = nextEmail(chars, cursor, blocked, streaming) else { break }
            if hit.start > last {
                pieces.append(Piece(kind: .text, value: String(chars[last..<hit.start])))
            }
            pieces.append(Piece(kind: .link, value: hit.value))
            last = hit.end
            cursor = hit.end
        }
        if last < chars.count {
            pieces.append(Piece(kind: .text, value: String(chars[last...])))
        }
        if pieces.isEmpty || pieces.map(\.value).joined() != text {
            return [Piece(kind: .text, value: text)]
        }
        return pieces
    }

    private static func nextEmail(
        _ chars: [Character],
        _ from: Int,
        _ blocked: [Range<Int>],
        _ streaming: Bool
    ) -> EmailHit? {
        var i = from
        while i < chars.count {
            guard let at = indexOfAt(chars, i) else { return nil }
            if blocked.contains(where: { $0.contains(at) }) {
                i = at + 1
                continue
            }
            var local = at
            while local > 0 && isEmailLocalChar(chars[local - 1]) && !blocked.contains(where: { $0.contains(local - 1) }) {
                local -= 1
            }
            if local == at {
                i = at + 1
                continue
            }
            guard let domainEnd = readEmailDomain(chars, at + 1, blocked) else {
                i = at + 1
                continue
            }
            let address = String(chars[local..<domainEnd])
            if !isExtendedEmail(address) {
                i = at + 1
                continue
            }
            if streaming && domainEnd == chars.count { return nil }
            let visible = mailtoPrefixStart(chars, local, blocked)
            if visible == local && local > 0 && chars[local - 1] == ":" {
                i = at + 1
                continue
            }
            return EmailHit(start: visible, end: domainEnd, value: String(chars[visible..<domainEnd]))
        }
        return nil
    }

    private static func indexOfAt(_ chars: [Character], _ from: Int) -> Int? {
        var i = from
        while i < chars.count {
            if chars[i] == "@" { return i }
            i += 1
        }
        return nil
    }

    private static func readEmailDomain(
        _ chars: [Character],
        _ start: Int,
        _ blocked: [Range<Int>]
    ) -> Int? {
        var j = start
        var labels = 0
        var dots = 0
        if j >= chars.count || blocked.contains(where: { $0.contains(j) }) || !isEmailDomainChar(chars[j]) {
            return nil
        }
        while j < chars.count && !blocked.contains(where: { $0.contains(j) }) {
            if isEmailDomainChar(chars[j]) {
                if labels == dots { labels += 1 }
                j += 1
                continue
            }
            if chars[j] == ".",
               j + 1 < chars.count,
               !blocked.contains(where: { $0.contains(j + 1) }),
               isEmailDomainChar(chars[j + 1])
            {
                dots += 1
                j += 1
                continue
            }
            break
        }
        if dots < 1 || labels < 2 { return nil }
        return j
    }

    private static func mailtoPrefixStart(
        _ chars: [Character],
        _ localStart: Int,
        _ blocked: [Range<Int>]
    ) -> Int {
        guard localStart >= 7 else { return localStart }
        let prefixStart = localStart - 7
        let prefix = String(chars[prefixStart..<localStart])
        guard prefix.lowercased() == "mailto:" else { return localStart }
        if blocked.contains(where: { $0.contains(prefixStart) }) { return localStart }
        if prefixStart > 0 && isAlnum(chars[prefixStart - 1]) { return localStart }
        return prefixStart
    }

    private static func emailBlocked(_ text: String) -> [Range<Int>] {
        let fences = codeRanges(in: text).map { range -> Range<Int> in
            let lo = text.distance(from: text.startIndex, to: range.lowerBound)
            let hi = text.distance(from: text.startIndex, to: range.upperBound)
            return lo..<hi
        }
        return fences + indentedEmailRanges(text, fences)
    }

    private static func indentedEmailRanges(_ text: String, _ fences: [Range<Int>]) -> [Range<Int>] {
        let chars = Array(text)
        var ranges: [Range<Int>] = []
        var inCode = false
        var codeStart = 0
        var prevBlank = true
        var index = 0
        while index <= chars.count {
            let end = chars[index...].firstIndex(of: "\n") ?? chars.count
            let inside = fences.contains { index >= $0.lowerBound && index < $0.upperBound }
            if inside {
                if inCode {
                    ranges.append(codeStart..<index)
                    inCode = false
                }
                prevBlank = false
            } else {
                let line = String(chars[index..<end])
                let indent = emailIndent(line)
                let blank = line.trimmingCharacters(in: .whitespaces).isEmpty
                if inCode && !blank && indent < 4 {
                    ranges.append(codeStart..<index)
                    inCode = false
                }
                if !inCode && prevBlank && !blank && indent >= 4 {
                    inCode = true
                    codeStart = index
                }
                prevBlank = blank
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if inCode { ranges.append(codeStart..<chars.count) }
        return ranges
    }

    private static func emailIndent(_ line: String) -> Int {
        var columns = 0
        for ch in line {
            if ch == " " {
                columns += 1
            } else if ch == "\t" {
                columns += 4 - (columns % 4)
            } else {
                break
            }
        }
        return columns
    }
}
