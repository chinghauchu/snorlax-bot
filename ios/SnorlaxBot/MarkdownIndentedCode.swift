// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

/// v1.48: CommonMark indented code blocks on a completed assistant
/// LEFT `kind=message`.
///
/// A run of lines indented four or more columns (spaces, or a tab)
/// renders as a code block when it is not a paragraph continuation
/// and not list-item content. There is no info string, so the block
/// is monochrome. Blank lines inside the run stay. Trailing blank
/// lines do not. v1.95: an interior blank keeps columns past the
/// fourth, spaces or a tab stop, the same way cmark-gfm does.
/// An indented line cannot interrupt a paragraph.
/// Fences and `$$` stay markdown. `MarkdownList.split` runs first,
/// so a loose list continuation is already list-item text and is
/// not a code block here. Streaming (`completed: false`) returns
/// the text unchanged. Copy controls keep markdown source — this
/// type only splits text for display and does not write the pasteboard.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownIndentedCode.ts`.
enum MarkdownIndentedCode {
    enum Block: Equatable {
        case markdown(String)
        case code(String)
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// `completed: false` returns the text unchanged.
    static func split(_ text: String, completed: Bool) -> [Block] {
        if text.isEmpty { return [] }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        if !completed { return [.markdown(src)] }

        let lines = src.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var blocks: [Block] = []
        var md: [String] = []
        var fence: String?
        var inMath = false
        var paragraph = false
        var index = 0

        func flushMarkdown() {
            guard !md.isEmpty else { return }
            let chunk = md.joined(separator: "\n")
            md.removeAll()
            if !chunk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                blocks.append(.markdown(chunk))
            }
        }

        while index < lines.count {
            let line = lines[index]
            let gate = blockGate(line, fence: fence, inMath: inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                md.append(line)
                paragraph = false
                index += 1
                continue
            }
            if isBlank(line) {
                md.append(line)
                paragraph = false
                index += 1
                continue
            }
            let indent = contentColumns(line)
            if !paragraph, let indent, indent >= 4 {
                flushMarkdown()
                var collected: [String] = []
                while index < lines.count {
                    let current = lines[index]
                    if isBlank(current) {
                        var look = index
                        while look < lines.count, isBlank(lines[look]) { look += 1 }
                        let nextIndent = look < lines.count ? contentColumns(lines[look]) : nil
                        if let nextIndent, nextIndent >= 4 {
                            // v1.95: a blank line is still a code line.
                            // Columns past the fourth stay; four or
                            // fewer become empty.
                            while index < look {
                                collected.append(dedentCodeLine(lines[index]))
                                index += 1
                            }
                            continue
                        }
                        break
                    }
                    guard let columns = contentColumns(current), columns >= 4 else { break }
                    collected.append(dedentCodeLine(current))
                    index += 1
                }
                while collected.last == "" { collected.removeLast() }
                if !collected.isEmpty {
                    blocks.append(.code(collected.joined(separator: "\n")))
                }
                paragraph = false
                continue
            }
            md.append(line)
            paragraph = !isAtxHeadingLine(line) && !isThematicBreakLine(line)
            index += 1
        }
        flushMarkdown()
        if blocks.isEmpty { return [.markdown(src)] }
        return blocks
    }

    /// True when completed markdown contains a top-level indented code block.
    static func containsIndentedCode(_ text: String) -> Bool {
        split(text, completed: true).contains { block in
            if case .code = block { return true }
            return false
        }
    }

    /// Column of the first non-space, or nil when the line is blank.
    static func contentColumns(_ line: String) -> Int? {
        var columns = 0
        for ch in line {
            if ch == " " {
                columns += 1
                continue
            }
            if ch == "\t" {
                columns += 4 - (columns % 4)
                continue
            }
            return columns
        }
        return nil
    }

    static func isBlank(_ line: String) -> Bool {
        contentColumns(line) == nil
    }

    /// ATX heading in the first three columns. Not an indented code line.
    static func isAtxHeadingLine(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        let chars = Array(line)
        var i = lead.index
        var hashes = 0
        while i < chars.count, chars[i] == "#", hashes < 7 {
            hashes += 1
            i += 1
        }
        if hashes < 1 || hashes > 6 { return false }
        if i >= chars.count { return true }
        return chars[i] == " " || chars[i] == "\t"
    }

    /// Thematic break in the first three columns. Not an indented code line.
    static func isThematicBreakLine(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        let chars = Array(line)
        guard lead.index < chars.count else { return false }
        let mark = chars[lead.index]
        if mark != "-" && mark != "*" && mark != "_" { return false }
        var count = 0
        var i = lead.index
        while i < chars.count {
            let ch = chars[i]
            if ch == mark {
                count += 1
                i += 1
                continue
            }
            if ch == " " || ch == "\t" {
                i += 1
                continue
            }
            return false
        }
        return count >= 3
    }

    /// Drop one indent level (four columns) from a code line.
    /// A blank line keeps whatever columns remain past the fourth.
    static func dedentCodeLine(_ line: String) -> String {
        var columns = 0
        var index = line.startIndex
        while index < line.endIndex, columns < 4 {
            let ch = line[index]
            if ch == " " {
                columns += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                let next = columns + (4 - (columns % 4))
                index = line.index(after: index)
                if next > 4 {
                    return String(repeating: " ", count: next - 4) + String(line[index...])
                }
                columns = next
                continue
            }
            break
        }
        return String(line[index...])
    }

    private static func leadingColumns(_ line: String) -> (columns: Int, index: Int) {
        var columns = 0
        var index = 0
        for ch in line {
            if ch == " " {
                columns += 1
                index += 1
                continue
            }
            if ch == "\t" {
                columns += 4 - (columns % 4)
                index += 1
                continue
            }
            break
        }
        return (columns, index)
    }

    private static func blockGate(
        _ line: String,
        fence: String?,
        inMath: Bool
    ) -> (fence: String?, inMath: Bool, blocked: Bool) {
        if let open = fence {
            if let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) {
                let body = String(line[match])
                if let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) {
                    let marker = String(body[markerRange])
                    let info = String(body[markerRange.upperBound...])
                    if marker.first == open.first,
                       marker.count >= open.count,
                       info.trimmingCharacters(in: .whitespaces).isEmpty
                    {
                        return (nil, inMath, true)
                    }
                }
            }
            return (open, inMath, true)
        }
        if inMath {
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                return (nil, false, true)
            }
            return (nil, true, true)
        }
        if let columns = contentColumns(line), columns >= 4 {
            return (nil, false, false)
        }
        if let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) {
            let body = String(line[match])
            if let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) {
                let marker = String(body[markerRange])
                let info = String(body[markerRange.upperBound...])
                if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) {
                    return (nil, false, false)
                }
                return (marker, false, true)
            }
            return (nil, false, true)
        }
        if line.trimmingCharacters(in: .whitespaces) == "$$" {
            return (nil, true, true)
        }
        return (nil, false, false)
    }
}
