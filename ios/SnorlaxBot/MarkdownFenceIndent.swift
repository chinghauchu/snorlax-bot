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
}
