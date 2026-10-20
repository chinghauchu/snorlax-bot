// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.43: CommonMark angle-bracket autolinks on a completed assistant
/// LEFT `kind=message`.
///
/// `<https://example.com/path>` is a link whose text is the URL.
/// `<user@example.com>` is a `mailto:` link whose text is the address.
/// The long-press Open/Copy Link preview and the http(s) rules are the
/// ones already used for other links. A `mailto:` link is opened only
/// when the destination is `mailto:` plus that email and nothing else.
///
/// An absolute URI with any other scheme stays the literal characters,
/// brackets included. So does `<not a link>`, a space inside the
/// brackets, and a backslash-escaped `\<`.
///
/// Code spans, fenced code, indented code, and math stay literal.
/// A code span in a table cell stays literal too. Streaming
/// (`completed: false`) returns the text unchanged. Copy controls
/// keep markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownAutolink.ts`.
enum MarkdownAutolink {
    /// Replace unsafe absolute-URI autolinks with a literal token.
    /// http(s) autolinks and email autolinks are left for the markdown
    /// parser. `completed: false` returns `text` unchanged.
    static func prepare(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty || !text.contains("<") { return text }
        let chars = Array(text)
        let blocked = protectedRanges(chars)
        var out = ""
        var index = 0
        var block = 0
        while index < chars.count {
            if block < blocked.count, index >= blocked[block].start, index < blocked[block].end {
                out += string(chars, index, blocked[block].end)
                index = blocked[block].end
                block += 1
                continue
            }
            while block < blocked.count, blocked[block].end <= index { block += 1 }
            if chars[index] == "<", !isEscaped(chars, index), let end = unsafeAutolinkEnd(chars, index) {
                out += stash(string(chars, index, end))
                index = end
                continue
            }
            out.append(chars[index])
            index += 1
        }
        return out
    }

    /// Same `§§SBE` token `MarkdownEscape` paints back to the characters.
    private static func stash(_ value: String) -> String {
        var hex = ""
        for scalar in value.unicodeScalars {
            hex += String(format: "%06X", scalar.value)
        }
        return "§§SBE\(hex)§§"
    }

    /// End index past `>` when `<...>` is an absolute URI the safe-scheme
    /// rules reject. Email and http(s) autolinks return nil.
    private static func unsafeAutolinkEnd(_ chars: [Character], _ start: Int) -> Int? {
        guard let close = readClose(chars, start) else { return nil }
        let inner = string(chars, start + 1, close)
        if inner.isEmpty || WebLinks.emailAddress(inner) { return nil }
        if !isAbsoluteURI(inner) { return nil }
        if safeWeb(inner) { return nil }
        return close + 1
    }

    private static func readClose(_ chars: [Character], _ start: Int) -> Int? {
        var index = start + 1
        while index < chars.count {
            let ch = chars[index]
            if ch == ">" { return index }
            if ch == "<" || isStop(ch) { return nil }
            index += 1
        }
        return nil
    }

    private static func isStop(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        let code = scalar.value
        return code <= 32 || code == 127
    }

    /// Scheme is 2–32 characters, then a colon.
    private static func isAbsoluteURI(_ text: String) -> Bool {
        let chars = Array(text)
        guard chars.count >= 3, isAlpha(chars[0]) else { return false }
        var index = 1
        while index < chars.count && index < 32 && isScheme(chars[index]) {
            index += 1
        }
        guard index >= 2, index < chars.count, chars[index] == ":" else { return false }
        return true
    }

    /// http(s) with a host. Mirrors `isSafeWebUrl` closely enough that a
    /// normal autolink is left for the parser on both platforms.
    private static func safeWeb(_ uri: String) -> Bool {
        guard let colon = uri.firstIndex(of: ":") else { return false }
        let scheme = uri[..<colon].lowercased()
        guard scheme == "http" || scheme == "https" else { return false }
        var rest = uri[uri.index(after: colon)...]
        if rest.hasPrefix("//") { rest = rest.dropFirst(2) }
        while rest.hasPrefix("/") { rest = rest.dropFirst() }
        if rest.isEmpty { return false }
        let hostPort = rest.prefix { $0 != "/" && $0 != "?" && $0 != "#" }
        if hostPort.isEmpty { return false }
        let hostOnly = hostPort.split(separator: "@").last ?? hostPort
        if hostOnly.hasPrefix("[") {
            guard hostOnly.contains("]") else { return false }
            return true
        }
        if let port = hostOnly.lastIndex(of: ":") {
            return !hostOnly[..<port].isEmpty
        }
        return true
    }

    private static func isAlpha(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "A" && scalar <= "Z") || (scalar >= "a" && scalar <= "z")
    }

    private static func isScheme(_ ch: Character) -> Bool {
        if isAlpha(ch) { return true }
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "0" && scalar <= "9") || ch == "+" || ch == "." || ch == "-"
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

    private static func string(_ chars: [Character], _ start: Int, _ end: Int) -> String {
        guard start >= 0, end >= start, end <= chars.count else { return "" }
        return String(chars[start..<end])
    }

    private struct Span {
        var start: Int
        var end: Int
    }

    private static func protectedRanges(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        let indented = indentedCodeRanges(chars, fences)
        let skip = fences + codes + indented
        return merge(skip + mathRanges(chars, skip))
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
                } else if let current = open,
                          fence.marker == current.marker,
                          fence.count >= current.count,
                          fence.infoEmpty
                {
                    ranges.append(Span(start: current.start, end: end))
                    open = nil
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

    private static func fenceOnLine(
        _ chars: [Character],
        _ start: Int,
        _ end: Int
    ) -> (marker: Character, count: Int, infoEmpty: Bool)? {
        var index = start
        var spaces = 0
        while index < end, chars[index] == " ", spaces < 3 {
            spaces += 1
            index += 1
        }
        guard index < end, chars[index] == "`" || chars[index] == "~" else { return nil }
        let marker = chars[index]
        var count = 0
        while index < end, chars[index] == marker {
            count += 1
            index += 1
        }
        guard count >= 3 else { return nil }
        let info = string(chars, index, end).trimmingCharacters(in: .whitespaces)
        return (marker, count, info.isEmpty)
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
            var count = 0
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
                var marks = 0
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
            let inFence = fences.contains { index >= $0.start && index < $0.end }
            if inFence {
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
        if inCode { ranges.append(Span(start: codeStart, end: chars.count)) }
        return ranges
    }

    private static func contentIndent(_ chars: [Character], _ start: Int, _ end: Int) -> Int? {
        var col = 0
        var index = start
        while index < end {
            if chars[index] == " " {
                col += 1
                index += 1
                continue
            }
            if chars[index] == "\t" {
                col += 4 - (col % 4)
                index += 1
                continue
            }
            return col
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
            if index + 1 < chars.count, chars[index] == "\\", chars[index + 1] == "(" {
                if let close = findPair(chars, index + 2, "\\", ")") {
                    ranges.append(Span(start: index, end: close + 2))
                    index = close + 2
                    continue
                }
            }
            if index + 1 < chars.count, chars[index] == "$", chars[index + 1] == "$" {
                if let close = findDollars(chars, index + 2) {
                    ranges.append(Span(start: index, end: close + 2))
                    index = close + 2
                    continue
                }
            }
            index += 1
        }
        return ranges
    }

    private static func findPair(_ chars: [Character], _ start: Int, _ first: Character, _ second: Character) -> Int? {
        var index = start
        while index + 1 < chars.count {
            if chars[index] == first, chars[index + 1] == second { return index }
            index += 1
        }
        return nil
    }

    private static func findDollars(_ chars: [Character], _ start: Int) -> Int? {
        var index = start
        while index + 1 < chars.count {
            if chars[index] == "$", chars[index + 1] == "$" { return index }
            index += 1
        }
        return nil
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
