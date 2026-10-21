// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.52: CommonMark multi-backtick code spans on a completed
/// assistant LEFT `kind=message`.
///
/// A code span opens with a run of N backticks and closes at the
/// next run of exactly N. ``code with ` inside`` renders as inline
/// code: the delimiter backticks are not shown, and a backtick
/// inside the span is. A line ending inside the span becomes a
/// space and stays in that bubble. A blank line is a paragraph
/// break, so the span does not cross it. A line of three
/// or more backticks whose info string contains a backtick is not
/// a fence. An unmatched opener stays literal and scanning
/// continues after it. Real fences, indented code, and math stay
/// literal. Streaming is unchanged. Copy keeps markdown source.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownCodeSpan.ts`.
enum MarkdownCodeSpan {
    struct Span {
        var start: Int
        var end: Int
    }

    /// A backtick fence cannot contain a backtick in its info string.
    /// Tilde fences can.
    static func fenceInfoAllowsOpen(marker: String, info: String) -> Bool {
        if marker.hasPrefix("`"), info.contains("`") { return false }
        return true
    }

    /// Closed inline code spans outside real fences.
    static func spans(in text: String) -> [Span] {
        let chars = Array(text)
        return codeSpans(chars, skipping: fenceRanges(chars))
    }

    static func contains(_ offset: Int, _ spans: [Span]) -> Bool {
        spans.contains { offset >= $0.start && offset < $0.end }
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        var open: (marker: [Character], start: Int)?
        while index <= chars.count {
            var lineEnd = index
            while lineEnd < chars.count, chars[lineEnd] != "\n" { lineEnd += 1 }
            if let parsed = fenceLine(chars, index, lineEnd) {
                if let current = open {
                    let same = parsed.marker.first == current.marker.first
                        && parsed.marker.count >= current.marker.count
                        && parsed.info.allSatisfy { $0 == " " || $0 == "\t" }
                    if same {
                        ranges.append(Span(start: current.start, end: lineEnd))
                        open = nil
                    }
                } else if fenceInfoAllowsOpen(
                    marker: String(parsed.marker),
                    info: String(parsed.info)
                ) {
                    open = (parsed.marker, index)
                }
            }
            if lineEnd >= chars.count { break }
            index = lineEnd + 1
        }
        if let current = open {
            ranges.append(Span(start: current.start, end: chars.count))
        }
        return ranges
    }

    private static func fenceLine(
        _ chars: [Character],
        _ start: Int,
        _ end: Int
    ) -> (marker: [Character], info: [Character])? {
        var index = start
        var spaces = 0
        while index < end, spaces < 4, chars[index] == " " {
            spaces += 1
            index += 1
        }
        if spaces > 3 || index >= end { return nil }
        let mark = chars[index]
        guard mark == "`" || mark == "~" else { return nil }
        let markerStart = index
        while index < end, chars[index] == mark { index += 1 }
        let length = index - markerStart
        guard length >= 3 else { return nil }
        return (Array(chars[markerStart..<index]), Array(chars[index..<end]))
    }

    private static func codeSpans(_ chars: [Character], skipping fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if contains(index, fences) {
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
            var matched = false
            while cursor < chars.count {
                if contains(cursor, fences) {
                    cursor += 1
                    continue
                }
                if chars[cursor] == "\n" {
                    var look = cursor + 1
                    while look < chars.count, chars[look] == " " || chars[look] == "\t" {
                        look += 1
                    }
                    if look < chars.count, chars[look] == "\n" { break }
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
                    matched = true
                    break
                }
                cursor += marks
            }
            if !matched { index += length }
        }
        return ranges
    }
}
