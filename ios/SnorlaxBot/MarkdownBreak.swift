// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.33: thematic breaks on completed assistant LEFT `kind=message`.
/// Own-line `---`, `***`, and `___` (spaces allowed between the marks)
/// become a thin muted rule. A solid dash underline that continues a
/// setext heading stays in the markdown so that heading still renders.
/// Fences and `$$` stay intact. Streaming (`completed: false`) returns
/// the text unchanged. Copy controls keep markdown source — this type
/// only splits text for display and does not write the pasteboard.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownBreak.ts`.
enum MarkdownBreak {
    enum Block: Equatable {
        case markdown(String)
        case rule
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
        var fence: String?
        var inMath = false
        var setextOpen = false
        var inList = false
        var listContentCol = 0

        func pushMarkdown(_ end: Int) {
            guard end > mdStart else { return }
            let chunk = lines[mdStart..<end].joined(separator: "\n")
            if !chunk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                blocks.append(.markdown(chunk))
            }
        }

        var index = 0
        while index < lines.count {
            let line = lines[index]
            let gate = blockGate(line, fence: fence, inMath: inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                setextOpen = false
                inList = false
                listContentCol = 0
                index += 1
                continue
            }
            if let marker = thematicBreakMarker(line) {
                let indent = leadingSpaceColumns(line)
                // A solid dash underline indented into the open list item
                // is a setext heading inside that item, not a rule.
                let insideList = inList
                    && marker == "-"
                    && isSolidRun(line, marker: "-")
                    && listContentCol > 0
                    && indent >= listContentCol
                let setext = marker == "-" && isSolidRun(line, marker: "-") && setextOpen && !inList
                if !setext && !insideList {
                    pushMarkdown(index)
                    blocks.append(.rule)
                    mdStart = index + 1
                    setextOpen = false
                    inList = false
                    listContentCol = 0
                    index += 1
                    continue
                }
            }
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                setextOpen = false
                inList = false
                listContentCol = 0
                index += 1
                continue
            }
            if isListItemLine(line) {
                inList = true
                listContentCol = listItemContentColumn(line)
                setextOpen = false
                index += 1
                continue
            }
            if inList {
                setextOpen = false
                index += 1
                continue
            }
            setextOpen = isSetextContentLine(line)
            index += 1
        }
        pushMarkdown(lines.count)
        if blocks.isEmpty { return [.markdown(src)] }
        return blocks
    }

    /// A CommonMark thematic break, or nil when the line is not one.
    static func thematicBreakMarker(_ line: String) -> Character? {
        let chars = Array(line)
        var i = 0
        while i < chars.count, i < 3, chars[i] == " " { i += 1 }
        guard i < chars.count else { return nil }
        let ch = chars[i]
        guard ch == "-" || ch == "*" || ch == "_" else { return nil }
        var count = 0
        var j = i
        while j < chars.count {
            let c = chars[j]
            if c == ch {
                count += 1
            } else if c == " " || c == "\t" {
                j += 1
                continue
            } else {
                return nil
            }
            j += 1
        }
        guard count >= 3 else { return nil }
        return ch
    }

    private static func isSetextContentLine(_ line: String) -> Bool {
        if line.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        if isIndentedCode(line) { return false }
        if isSolidRun(line, marker: "-") || isSolidRun(line, marker: "=") { return false }
        if thematicBreakMarker(line) != nil { return false }
        let body = stripIndent(line)
        if body.hasPrefix(">") { return false }
        if body.hasPrefix("#") { return false }
        if body.range(of: #"^(`{3,}|~{3,})"#, options: .regularExpression) != nil { return false }
        if isListItemLine(line) { return false }
        return true
    }

    private static func isListItemLine(_ line: String) -> Bool {
        listItemContentColumn(line) > 0
    }

    /// Columns before the list item's text. 0 when the line is not an item.
    private static func listItemContentColumn(_ line: String) -> Int {
        let chars = Array(line)
        var index = 0
        var columns = 0
        while index < chars.count, chars[index] == " ", columns < 3 {
            index += 1
            columns += 1
        }
        let rest = String(chars[index...])
        var token = 0
        if rest.range(of: #"^[-+*][ \t]"#, options: .regularExpression) != nil {
            token = 1
        } else if let match = rest.range(of: #"^\d{1,9}[.)][ \t]"#, options: .regularExpression) {
            let marker = String(rest[match])
            token = marker.count - 1
        } else {
            return 0
        }
        columns += token
        let sepIndex = rest.index(rest.startIndex, offsetBy: token, limitedBy: rest.endIndex) ?? rest.endIndex
        if sepIndex < rest.endIndex {
            let sep = rest[sepIndex]
            if sep == " " {
                columns += 1
            } else if sep == "\t" {
                columns += 4 - (columns % 4)
            } else {
                columns += 1
            }
        } else {
            columns += 1
        }
        return columns
    }

    private static func leadingSpaceColumns(_ line: String) -> Int {
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

    private static func isIndentedCode(_ line: String) -> Bool {
        if line.hasPrefix("\t") { return true }
        return line.range(of: #"^ {4,}"#, options: .regularExpression) != nil
    }

    private static func stripIndent(_ line: String) -> String {
        var i = line.startIndex
        var spaces = 0
        while i < line.endIndex, spaces < 3, line[i] == " " {
            i = line.index(after: i)
            spaces += 1
        }
        return String(line[i...])
    }

    /// Solid `-` or `=` run: a setext underline, not a spaced rule.
    private static func isSolidRun(_ line: String, marker: Character) -> Bool {
        let chars = Array(line)
        var i = 0
        while i < chars.count, i < 3, chars[i] == " " { i += 1 }
        guard i < chars.count, chars[i] == marker else { return false }
        var saw = false
        var j = i
        while j < chars.count {
            let c = chars[j]
            if c == marker {
                saw = true
                j += 1
                continue
            }
            if c == " " || c == "\t" {
                var k = j
                while k < chars.count {
                    let tail = chars[k]
                    if tail != " " && tail != "\t" { return false }
                    k += 1
                }
                return saw
            }
            return false
        }
        return saw
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
            if fence == nil {
                if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) {
                    return (nil, inMath, false)
                }
                return (marker, inMath, true)
            }
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
