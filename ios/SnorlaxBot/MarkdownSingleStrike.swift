// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.50: GFM single-tilde strikethrough on a completed assistant
/// LEFT `kind=message`.
///
/// v1.33 already strikes `~~text~~` through the full markdown
/// parser. This cut is the other GFM form: `~text~`. A completed
/// reply rewrites that pair to `~~text~~` so the parser paints it
/// struck through and hides the tildes. `~~text~~` is left alone.
/// A run of three or more tildes is not a single-tilde pair.
///
/// The text inside cannot start or end with whitespace, and the
/// pair cannot cross a newline or a hard-break placeholder. An
/// unclosed tilde stays literal. A tilde in a URL or a link
/// destination stays literal. Fences, inline code, indented code,
/// and math stay literal. A backslash-escaped tilde is not a
/// delimiter. Streaming (`completed: false`) returns the text
/// unchanged. Copy keeps markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownSingleStrike.ts`.
enum MarkdownSingleStrike {
    private static let breakToken = Array("§§SBH§§")

    /// `completed: false` returns `text`.
    static func promote(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty || !text.contains("~") { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let chars = Array(src)
        let blocked = protectedRanges(chars)
        var out: [Character] = []
        var i = 0
        while i < chars.count {
            if let span = rangeAt(i, blocked) {
                out.append(contentsOf: chars[i..<span.end])
                i = span.end
                continue
            }
            if !isSingleOpener(chars, i) {
                out.append(chars[i])
                i += 1
                continue
            }
            let close = findCloser(chars, i + 1, blocked)
            if close < 0 {
                out.append(chars[i])
                i += 1
                continue
            }
            out.append("~")
            out.append("~")
            out.append(contentsOf: chars[(i + 1)..<close])
            out.append("~")
            out.append("~")
            i = close + 1
        }
        return String(out)
    }

    private static func isSingleOpener(_ chars: [Character], _ i: Int) -> Bool {
        if chars[i] != "~" || isEscaped(chars, i) { return false }
        if (i > 0 && chars[i - 1] == "~") || (i + 1 < chars.count && chars[i + 1] == "~") {
            return false
        }
        if i + 1 >= chars.count || isWs(chars[i + 1]) { return false }
        if tildeInUrl(chars, i) || inLinkDestination(chars, i) { return false }
        return true
    }

    /// Index of the closing single tilde, or -1.
    private static func findCloser(
        _ chars: [Character],
        _ from: Int,
        _ blocked: [Span]
    ) -> Int {
        var j = from
        while j < chars.count {
            if let span = rangeAt(j, blocked) {
                j = span.end
                continue
            }
            if chars[j] == "\n" || startsWith(chars, j, breakToken) { return -1 }
            if chars[j] == "~" {
                let prevTilde = j > 0 && chars[j - 1] == "~"
                let nextTilde = j + 1 < chars.count && chars[j + 1] == "~"
                if isEscaped(chars, j) || prevTilde || nextTilde { return -1 }
                if j > 0 && isWs(chars[j - 1]) { return -1 }
                if tildeInUrl(chars, j) || inLinkDestination(chars, j) { return -1 }
                return j
            }
            j += 1
        }
        return -1
    }

    private static func tildeInUrl(_ chars: [Character], _ index: Int) -> Bool {
        var j = index - 1
        while j >= 0 && isUrlChar(chars[j]) { j -= 1 }
        let prefix = String(chars[(j + 1)..<index])
        if prefix.range(of: "https://", options: [.caseInsensitive]) != nil { return true }
        if prefix.range(of: "http://", options: [.caseInsensitive]) != nil { return true }
        return prefix.range(of: "www.", options: [.caseInsensitive]) != nil
    }

    private static func inLinkDestination(_ chars: [Character], _ index: Int) -> Bool {
        var depth = 0
        var j = index - 1
        while j >= 0 {
            if chars[j] == "\n" || startsWith(chars, j, breakToken) { return false }
            if chars[j] == ")" {
                depth += 1
                j -= 1
                continue
            }
            if chars[j] != "(" {
                j -= 1
                continue
            }
            if depth > 0 {
                depth -= 1
                j -= 1
                continue
            }
            var k = j - 1
            while k >= 0 && (chars[k] == " " || chars[k] == "\t") { k -= 1 }
            return k >= 0 && chars[k] == "]"
        }
        return false
    }

    private static func isUrlChar(_ ch: Character) -> Bool {
        if "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".contains(ch) {
            return true
        }
        return ":/?#[]@!$&'()*+,;=%._~-".contains(ch)
    }

    private static func isWs(_ ch: Character) -> Bool {
        ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "\u{000C}"
    }

    private static func isEscaped(_ chars: [Character], _ index: Int) -> Bool {
        var slashes = 0
        var i = index - 1
        while i >= 0 && chars[i] == "\\" {
            slashes += 1
            i -= 1
        }
        return slashes % 2 == 1
    }

    private static func startsWith(_ chars: [Character], _ index: Int, _ needle: [Character]) -> Bool {
        if index < 0 || index + needle.count > chars.count { return false }
        for offset in 0..<needle.count where chars[index + offset] != needle[offset] {
            return false
        }
        return true
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
        return mergeRanges(skip + mathRanges(chars, skip))
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var open: (marker: [Character], start: Int)?
        var i = 0
        while i <= chars.count {
            let end = lineEnd(chars, i)
            let line = Array(chars[i..<end])
            if let marker = fenceMarker(line) {
                if open == nil {
                    open = (marker, i)
                } else if let current = open,
                          marker.first == current.marker.first,
                          marker.count >= current.marker.count,
                          fenceInfoEmpty(line, marker.count) {
                    ranges.append(Span(start: current.start, end: end))
                    open = nil
                }
            }
            if end >= chars.count { break }
            i = end + 1
        }
        if let current = open {
            ranges.append(Span(start: current.start, end: chars.count))
        }
        return ranges
    }

    /// Opening or closing fence marker on a line, without the info string.
    private static func fenceMarker(_ line: [Character]) -> [Character]? {
        var i = 0
        var spaces = 0
        while i < line.count && line[i] == " " && spaces < 3 {
            i += 1
            spaces += 1
        }
        guard i < line.count, line[i] == "`" || line[i] == "~" else { return nil }
        let tick = line[i]
        var n = 0
        while i < line.count && line[i] == tick {
            n += 1
            i += 1
        }
        if n < 3 { return nil }
        return Array(repeating: tick, count: n)
    }

    private static func fenceInfoEmpty(_ line: [Character], _ markerCount: Int) -> Bool {
        var i = 0
        var spaces = 0
        while i < line.count && line[i] == " " && spaces < 3 {
            i += 1
            spaces += 1
        }
        i += markerCount
        while i < line.count {
            if line[i] != " " && line[i] != "\t" { return false }
            i += 1
        }
        return true
    }

    private static func inlineCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var i = 0
        while i < chars.count {
            if rangeAt(i, fences) != nil {
                i += 1
                continue
            }
            if chars[i] != "`" {
                i += 1
                continue
            }
            var n = 1
            while i + n < chars.count && chars[i + n] == "`" { n += 1 }
            var j = i + n
            var closed = false
            while j < chars.count {
                if rangeAt(j, fences) != nil {
                    j += 1
                    continue
                }
                if chars[j] != "`" {
                    j += 1
                    continue
                }
                var m = 1
                while j + m < chars.count && chars[j + m] == "`" { m += 1 }
                if m == n {
                    ranges.append(Span(start: i, end: j + m))
                    i = j + m
                    closed = true
                    break
                }
                j += m
            }
            if !closed { i += n }
        }
        return ranges
    }

    private static func indentedCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var inCode = false
        var codeStart = 0
        var prevBlank = true
        var i = 0
        while i <= chars.count {
            let end = lineEnd(chars, i)
            let inFence = rangeAt(i, fences) != nil
            if inFence {
                if inCode {
                    ranges.append(Span(start: codeStart, end: i))
                    inCode = false
                }
                prevBlank = false
            } else {
                let indent = contentIndent(Array(chars[i..<end]))
                let blank = indent == nil
                if inCode && !blank && (indent ?? 0) < 4 {
                    ranges.append(Span(start: codeStart, end: i))
                    inCode = false
                }
                if !inCode && prevBlank, let indent, indent >= 4 {
                    inCode = true
                    codeStart = i
                }
                prevBlank = blank
            }
            if end >= chars.count { break }
            i = end + 1
        }
        if inCode { ranges.append(Span(start: codeStart, end: chars.count)) }
        return ranges
    }

    private static func contentIndent(_ line: [Character]) -> Int? {
        var col = 0
        for ch in line {
            if ch == " " {
                col += 1
                continue
            }
            if ch == "\t" {
                col += 4 - (col % 4)
                continue
            }
            return col
        }
        return nil
    }

    private static func mathRanges(_ chars: [Character], _ skip: [Span]) -> [Span] {
        var ranges: [Span] = []
        let token = Array("§§SBM")
        var i = 0
        while i < chars.count {
            if startsWith(chars, i, token),
               i + token.count < chars.count,
               chars[i + token.count] == "I" || chars[i + token.count] == "B" {
                var j = i + token.count + 1
                while j < chars.count && chars[j].isNumber { j += 1 }
                if j + 1 < chars.count && chars[j] == "§" && chars[j + 1] == "§" {
                    ranges.append(Span(start: i, end: j + 2))
                    i = j + 2
                    continue
                }
            }
            i += 1
        }
        i = 0
        while i < chars.count {
            if rangeAt(i, skip) != nil || rangeAt(i, ranges) != nil {
                i += 1
                continue
            }
            let dollar = startsWith(chars, i, Array("$$"))
            let inline = startsWith(chars, i, Array("\\("))
            if !dollar && !inline {
                i += 1
                continue
            }
            let marker = dollar ? Array("$$") : Array("\\)")
            var j = i + 2
            var close = -1
            while j < chars.count {
                if rangeAt(j, skip) != nil {
                    j += 1
                    continue
                }
                if startsWith(chars, j, marker) {
                    close = j
                    break
                }
                j += 1
            }
            if close >= 0 {
                ranges.append(Span(start: i, end: close + marker.count))
                i = close + marker.count
                continue
            }
            ranges.append(Span(start: i, end: chars.count))
            break
        }
        return ranges
    }

    private static func lineEnd(_ chars: [Character], _ index: Int) -> Int {
        var i = index
        while i < chars.count && chars[i] != "\n" { i += 1 }
        return i
    }

    private static func rangeAt(_ index: Int, _ ranges: [Span]) -> Span? {
        for range in ranges where index >= range.start && index < range.end {
            return range
        }
        return nil
    }

    private static func mergeRanges(_ ranges: [Span]) -> [Span] {
        let sorted = ranges
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start || ($0.start == $1.start && $0.end < $1.end) }
        var out: [Span] = []
        for range in sorted {
            if let last = out.indices.last, range.start <= out[last].end {
                out[last].end = max(out[last].end, range.end)
            } else {
                out.append(range)
            }
        }
        return out
    }
}
