// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.82: bare http:// and https:// in chat message text are links.
/// Trailing sentence punctuation stays outside the link. Inline code and
/// fenced code stay plain. javascript:, file:, and any other scheme stay
/// plain. While a bubble is still streaming, a URL that reaches the end
/// of the buffer stays plain so a half-typed address is not a link.
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
        let scheme = url.scheme?.lowercased()
        guard scheme == "http" || scheme == "https" else { return false }
        guard let host = url.host, !host.isEmpty else { return false }
        return true
    }

    static func url(_ raw: String) -> URL? {
        if let parsed = URL(string: raw), allows(parsed) { return parsed }
        // Foundation rejects some characters that are valid in real links.
        let encoded = raw
            .replacingOccurrences(of: "(", with: "%28")
            .replacingOccurrences(of: ")", with: "%29")
            .replacingOccurrences(of: "[", with: "%5B")
            .replacingOccurrences(of: "]", with: "%5D")
        guard encoded != raw, let parsed = URL(string: encoded), allows(parsed) else { return nil }
        return parsed
    }

    /// Plain text. `streaming` leaves a URL that still touches the end as text.
    static func split(_ text: String, streaming: Bool) -> [Piece] {
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
            let pieces = split(raw, streaming: streaming)
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
}
