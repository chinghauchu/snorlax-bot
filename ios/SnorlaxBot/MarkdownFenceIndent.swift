// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.53: CommonMark indented fences on a completed assistant
/// LEFT `kind=message`.
///
/// A code fence indented by 1–3 spaces drops that many columns from
/// every content line. A line indented less than that drops all of
/// its indent. A tab advances to the next column of 4, and a tab
/// that would pass the indent becomes the leftover spaces. The
/// closing fence line is not part of the code. Tilde fences follow
/// the same rule. A fence at column 0 is unchanged. Four or more
/// spaces is indented code, not a fence. Streaming stays plain.
/// Copy on the message keeps markdown source. Copy on the code
/// block copies this dedented body. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownFenceIndent.ts`.
enum MarkdownFenceIndent {
    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Spaces between the start of the line and a fence marker.
    /// The marker scan already capped this at three.
    static func indent(before marker: Substring.Index, in text: Substring) -> Int {
        var count = 0
        var cursor = marker
        while cursor > text.startIndex && count < 3 {
            let prev = text.index(before: cursor)
            if text[prev] == "\n" { break }
            if text[prev] != " " { break }
            count += 1
            cursor = prev
        }
        return count
    }

    /// The fence's own indent is not part of the preceding paragraph.
    static func withoutOpeningIndent(_ before: String, columns: Int) -> String {
        if columns <= 0 || before.isEmpty { return before }
        var end = before.endIndex
        var left = columns
        while left > 0, end > before.startIndex {
            let prev = before.index(before: end)
            if before[prev] != " " { break }
            end = prev
            left -= 1
        }
        return String(before[..<end])
    }

    /// Index of the first character on the line that contains `index`.
    static func lineStart(in text: Substring, at index: Substring.Index) -> Substring.Index {
        var cursor = index
        while cursor > text.startIndex {
            let prev = text.index(before: cursor)
            if text[prev] == "\n" { return cursor }
            cursor = prev
        }
        return text.startIndex
    }

    /// Dedent every line. `columns` <= 0 returns `text`.
    static func dedent(_ text: String, columns: Int) -> String {
        if columns <= 0 || text.isEmpty { return text }
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        return lines.map { dedentLine($0, columns: columns) }.joined(separator: "\n")
    }

    /// Drop up to `columns` of leading indent. A partial tab is the
    /// spaces that still sit past the indent.
    static func dedentLine(_ line: String, columns: Int) -> String {
        if columns <= 0 || line.isEmpty { return line }
        var col = 0
        var index = line.startIndex
        while index < line.endIndex && col < columns {
            let ch = line[index]
            if ch == " " {
                col += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                let next = col + (4 - (col % 4))
                index = line.index(after: index)
                if next > columns {
                    return String(repeating: " ", count: next - columns) + line[index...]
                }
                col = next
                continue
            }
            break
        }
        return String(line[index...])
    }

    /// v1.89: cmark-gfm fence_offset when a quote or list marker has
    /// already consumed part of a tab. The offset is a count of
    /// whitespace bytes, and each byte is one column. A tab that is
    /// only partly consumed stays one byte, so the leftover columns
    /// become spaces in the code. A space-only indent is unchanged
    /// (`dedentLine`). `markers` is true for a block quote, whose
    /// prefix includes `>` before the content column.
    struct TabFenceOpen: Equatable {
        var marker: String
        var info: String
        var offset: Int
    }

    static func tabFenceOpen(
        _ line: String,
        contentColumn: Int,
        markers: Bool = false
    ) -> TabFenceOpen? {
        let start = cursorAt(line, contentColumn: contentColumn, markers: markers)
        let found = firstNonspace(line, start)
        if found.indent > 3 || found.index >= line.endIndex { return nil }
        let ch = line[found.index]
        if ch != "`" && ch != "~" { return nil }
        var n = 0
        var i = found.index
        while i < line.endIndex, line[i] == ch {
            n += 1
            i = line.index(after: i)
        }
        if n < 3 { return nil }
        let info = String(line[i...])
        let marker = String(repeating: String(ch), count: n)
        if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) { return nil }
        if !String(line[start.index..<found.index]).contains("\t") { return nil }
        return TabFenceOpen(marker: marker, info: info, offset: found.bytes)
    }

    /// Code text of one fence line. A partial tab becomes leftover spaces.
    static func tabFenceCodeLine(
        _ line: String,
        contentColumn: Int,
        fenceOffset: Int,
        markers: Bool = false
    ) -> String {
        var cur = cursorAt(line, contentColumn: contentColumn, markers: markers)
        var left = fenceOffset
        while left > 0 {
            guard let ch = peek(line, cur), ch == " " || ch == "\t" else { break }
            advanceColumns(line, &cur, count: 1)
            left -= 1
        }
        if cur.partial > 0 {
            let rest = line.index(after: cur.index)
            return String(repeating: " ", count: cur.partial) + String(line[rest...])
        }
        return String(line[cur.index...])
    }

    /// Closing fence measured from the same content column as the opener.
    static func tabFenceCloses(
        _ line: String,
        contentColumn: Int,
        marker: String,
        markers: Bool = false
    ) -> Bool {
        let start = cursorAt(line, contentColumn: contentColumn, markers: markers)
        let found = firstNonspace(line, start)
        if found.indent > 3 || found.index >= line.endIndex { return false }
        guard let ch = marker.first, line[found.index] == ch else { return false }
        var n = 0
        var i = found.index
        while i < line.endIndex, line[i] == ch {
            n += 1
            i = line.index(after: i)
        }
        if n < marker.count { return false }
        let tail = String(line[i...])
        return tail.allSatisfy { $0 == " " || $0 == "\t" }
    }

    private struct TabCursor {
        var index: String.Index
        var column: Int
        var partial: Int
    }

    private static func cursorAt(_ line: String, contentColumn: Int, markers: Bool) -> TabCursor {
        var cur = TabCursor(index: line.startIndex, column: 0, partial: 0)
        if contentColumn <= 0 { return cur }
        if markers {
            advanceColumns(line, &cur, count: contentColumn)
            return cur
        }
        while cur.column < contentColumn {
            guard let ch = peek(line, cur), ch == " " || ch == "\t" else { break }
            advanceColumns(line, &cur, count: 1)
        }
        return cur
    }

    private static func advanceColumns(_ line: String, _ cur: inout TabCursor, count: Int) {
        var left = count
        while left > 0 {
            if cur.partial > 0 {
                let step = min(left, cur.partial)
                cur.partial -= step
                cur.column += step
                left -= step
                if cur.partial == 0 { cur.index = line.index(after: cur.index) }
                continue
            }
            if cur.index >= line.endIndex { return }
            let ch = line[cur.index]
            if ch == "\t" {
                let width = 4 - (cur.column % 4)
                let step = min(left, width)
                cur.column += step
                left -= step
                if step < width {
                    cur.partial = width - step
                } else {
                    cur.index = line.index(after: cur.index)
                }
                continue
            }
            cur.index = line.index(after: cur.index)
            cur.column += 1
            left -= 1
        }
    }

    private static func peek(_ line: String, _ cur: TabCursor) -> Character? {
        if cur.partial > 0 { return "\t" }
        if cur.index >= line.endIndex { return nil }
        return line[cur.index]
    }

    private static func firstNonspace(
        _ line: String,
        _ start: TabCursor
    ) -> (index: String.Index, bytes: Int, indent: Int) {
        var index = start.index
        var column = start.column
        var partial = start.partial
        var bytes = 0
        while index < line.endIndex {
            if partial > 0 {
                column += partial
                partial = 0
                index = line.index(after: index)
                bytes += 1
                continue
            }
            let ch = line[index]
            if ch == " " {
                column += 1
                index = line.index(after: index)
                bytes += 1
                continue
            }
            if ch == "\t" {
                column += 4 - (column % 4)
                index = line.index(after: index)
                bytes += 1
                continue
            }
            break
        }
        return (index, bytes, column - start.column)
    }
}
