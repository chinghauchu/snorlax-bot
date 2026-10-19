// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.32: GFM blockquotes and task lists on completed assistant
/// LEFT `kind=message`. A quote line (`>` / nested `>>`) renders
/// with a muted left rule and indent. `- [ ]` / `- [x]` render as
/// read-only checkbox glyphs; checked items are muted. Streaming
/// stays the markdown string. Copy controls keep the message
/// markdown source — this type only splits text for display and
/// does not write the pasteboard. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownQuoteTask.ts`.
enum MarkdownQuoteTask {
    /// Empty ballot box. Not a control.
    static let uncheckedGlyph = "☐"
    /// Ballot box with check. Not a control.
    static let checkedGlyph = "☑"
    static let uncheckedLabel = "Unchecked"
    static let checkedLabel = "Checked"

    struct TaskItem: Equatable {
        var checked: Bool
        /// Text after the marker. Markers themselves are not included.
        var text: String
    }

    enum Block: Equatable {
        case markdown(String)
        case quote(String)
        case tasks([TaskItem])
    }

    static func glyph(checked: Bool) -> String {
        checked ? checkedGlyph : uncheckedGlyph
    }

    static func glyphLabel(checked: Bool) -> String {
        checked ? checkedLabel : uncheckedLabel
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
        var mdStart = 0
        var index = 0
        var fence: String?
        var inMath = false

        func pushMarkdown(_ end: Int) {
            guard end > mdStart else { return }
            let chunk = lines[mdStart..<end].joined(separator: "\n")
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
                index += 1
                continue
            }
            if stripQuoteMarker(line) != nil {
                let start = index
                var inner: [String] = []
                while index < lines.count, let stripped = stripQuoteMarker(lines[index]) {
                    inner.append(stripped)
                    index += 1
                }
                pushMarkdown(start)
                blocks.append(.quote(inner.joined(separator: "\n")))
                mdStart = index
                continue
            }
            if parseTaskLine(line) != nil {
                let start = index
                var items: [TaskItem] = []
                while index < lines.count, let task = parseTaskLine(lines[index]) {
                    items.append(task)
                    index += 1
                }
                pushMarkdown(start)
                blocks.append(.tasks(items))
                mdStart = index
                continue
            }
            index += 1
        }
        pushMarkdown(lines.count)
        if blocks.isEmpty { return [.markdown(src)] }
        return blocks
    }

    /// One CommonMark quote marker, or nil when the line is not a quote.
    static func stripQuoteMarker(_ line: String) -> String? {
        var i = line.startIndex
        var spaces = 0
        while i < line.endIndex, spaces < 3, line[i] == " " {
            i = line.index(after: i)
            spaces += 1
        }
        guard i < line.endIndex, line[i] == ">" else { return nil }
        i = line.index(after: i)
        if i < line.endIndex, line[i] == " " {
            i = line.index(after: i)
        }
        return String(line[i...])
    }

    /// A GFM task item. `- [x]done` (no space after the marker) is nil.
    static func parseTaskLine(_ line: String) -> TaskItem? {
        var i = line.startIndex
        var spaces = 0
        while i < line.endIndex, spaces < 3, line[i] == " " {
            i = line.index(after: i)
            spaces += 1
        }
        guard i < line.endIndex else { return nil }
        let marker = line[i]
        guard marker == "-" || marker == "*" || marker == "+" else { return nil }
        i = line.index(after: i)
        guard i < line.endIndex, line[i] == " " || line[i] == "\t" else { return nil }
        while i < line.endIndex, line[i] == " " || line[i] == "\t" {
            i = line.index(after: i)
        }
        guard i < line.endIndex, line[i] == "[" else { return nil }
        i = line.index(after: i)
        guard i < line.endIndex else { return nil }
        let mark = line[i]
        guard mark == " " || mark == "x" || mark == "X" else { return nil }
        i = line.index(after: i)
        guard i < line.endIndex, line[i] == "]" else { return nil }
        i = line.index(after: i)
        if i >= line.endIndex {
            return TaskItem(checked: mark != " ", text: "")
        }
        guard line[i] == " " || line[i] == "\t" else { return nil }
        while i < line.endIndex, line[i] == " " || line[i] == "\t" {
            i = line.index(after: i)
        }
        return TaskItem(checked: mark != " ", text: String(line[i...]))
    }

    private static func blockGate(
        _ line: String,
        fence: String?,
        inMath: Bool
    ) -> (fence: String?, inMath: Bool, blocked: Bool) {
        if !inMath, let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) {
            let body = String(line[match])
            guard let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else {
                return (fence, inMath, true)
            }
            let marker = String(body[markerRange])
            let info = String(body[markerRange.upperBound...])
            if fence == nil { return (marker, inMath, true) }
            if let open = fence,
               marker.first == open.first,
               marker.count >= open.count,
               info.trimmingCharacters(in: .whitespaces).isEmpty
            {
                return (nil, inMath, true)
            }
            return (fence, inMath, true)
        }
        if fence != nil { return (fence, inMath, true) }
        if line.trimmingCharacters(in: .whitespaces) == "$$" {
            return (fence, !inMath, true)
        }
        if inMath { return (fence, inMath, true) }
        return (fence, inMath, false)
    }
}
