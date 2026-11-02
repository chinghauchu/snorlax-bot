// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v2.38: a finished assistant heading section.
/// A section is one ATX heading of level 1–3 (`#`, `##`, or `###`)
/// plus the lines under it until the next heading of the same or
/// higher level. A later `#` / `##` / `###`, and a setext heading of
/// the same or higher level, closes it. `####` and deeper stay inside
/// the section and do not gain their own control. The saved text is
/// those source lines, not the display text.
/// Fences, `$$` blocks, HTML blocks, lists, and block quotes keep
/// their own lines, so a `#` inside one is not a section. Streaming
/// has no sections. Keep in lockstep with `desktop/src/headingSection.ts`.
enum HeadingSection {
    struct Section: Equatable {
        var level: Int
        var headingLine: String
        var source: String
        var offset: Int
    }

    enum Piece: Equatable {
        case text(String)
        case section(text: String, owned: Section)
    }

    static func split(_ text: String, completed: Bool) -> [Section] {
        if text.isEmpty || !completed { return [] }
        let src = normalize(text)
        let lines = src.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let boundaries = collectBoundaries(lines)
        var sections: [Section] = []
        for boundary in boundaries where boundary.chrome && boundary.level >= 1 && boundary.level <= 3 {
            var end = lines.count
            for later in boundaries where later.index > boundary.index && later.level <= boundary.level {
                end = later.index
                break
            }
            var slice = Array(lines[boundary.index..<end])
            while let last = slice.last, isBlank(last) { slice.removeLast() }
            if slice.isEmpty { continue }
            let headingLine = lines[boundary.index]
            sections.append(Section(
                level: boundary.level,
                headingLine: headingLine,
                source: slice.joined(separator: "\n"),
                offset: lineOffset(lines, boundary.index)
            ))
        }
        return sections
    }

    /// Sections whose heading line sits in each bubble. A heading
    /// bubble keeps the whole section, including lines that render
    /// in later bubbles. Streaming returns an empty list per bubble.
    static func assign(document: String, bubbles: [String], completed: Bool) -> [[Section]] {
        if !completed { return bubbles.map { _ in [] } }
        let src = normalize(document)
        let sections = split(src, completed: true)
        let spans = bubbleSpans(src, bubbles)
        return spans.map { span in
            guard span.start >= 0 else { return [] }
            return sections.filter { $0.offset >= span.start && $0.offset < span.end }
        }
    }

    /// Split one bubble around the heading lines it owns.
    static func partition(_ bubble: String, sections: [Section], completed: Bool) -> [Piece] {
        if bubble.isEmpty { return [] }
        if !completed || sections.isEmpty { return [.text(bubble)] }
        let normalized = normalize(bubble)
        let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var pieces: [Piece] = []
        var buf: [String] = []
        var next = 0
        func flushText() {
            if buf.isEmpty { return }
            let text = buf.joined(separator: "\n")
            buf = []
            if !text.isEmpty { pieces.append(.text(text)) }
        }
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if next < sections.count, line == sections[next].headingLine {
                flushText()
                let owned = sections[next]
                let start = i
                next += 1
                i += 1
                while i < lines.count {
                    if next < sections.count, lines[i] == sections[next].headingLine { break }
                    i += 1
                }
                pieces.append(.section(text: lines[start..<i].joined(separator: "\n"), owned: owned))
                continue
            }
            buf.append(line)
            i += 1
        }
        flushText()
        return pieces.isEmpty ? [.text(bubble)] : pieces
    }

    static func hasSection(_ bubble: String, sections: [Section], completed: Bool) -> Bool {
        partition(bubble, sections: sections, completed: completed).contains { piece in
            if case .section = piece { return true }
            return false
        }
    }

    private struct Boundary {
        var index: Int
        var level: Int
        var chrome: Bool
    }

    private static func collectBoundaries(_ lines: [String]) -> [Boundary] {
        var boundaries: [Boundary] = []
        var i = 0
        var fence: String?
        var inMath = false
        var paragraph = false
        var paragraphStart: Int?
        func closeParagraph() {
            paragraph = false
            paragraphStart = nil
        }
        while i < lines.count {
            let line = lines[i]
            if inMath {
                if line.trimmingCharacters(in: .whitespaces) == "$$" { inMath = false }
                closeParagraph()
                i += 1
                continue
            }
            if let open = fence {
                if isClosingFence(line, open: open) { fence = nil }
                closeParagraph()
                i += 1
                continue
            }
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                inMath = true
                closeParagraph()
                i += 1
                continue
            }
            if let opened = openingFence(line) {
                fence = opened
                closeParagraph()
                i += 1
                continue
            }
            if let htmlEnd = MarkdownList.htmlBlockLineEnd(lines, index: i, paragraphOpen: paragraph),
               htmlEnd > i {
                closeParagraph()
                i = htmlEnd
                continue
            }
            if let listEnd = MarkdownList.listEnd(lines, start: i), listEnd > i {
                closeParagraph()
                i = listEnd
                continue
            }
            if isQuoteLine(line) {
                closeParagraph()
                i = skipQuote(lines, start: i)
                continue
            }
            if let level = atxHeadingLevel(line) {
                if level <= 3 { boundaries.append(Boundary(index: i, level: level, chrome: true)) }
                closeParagraph()
                i += 1
                continue
            }
            if isBlank(line) {
                closeParagraph()
                i += 1
                continue
            }
            if paragraph {
                if let underline = setextUnderline(line), let start = paragraphStart {
                    boundaries.append(Boundary(index: start, level: underline, chrome: false))
                    closeParagraph()
                    i += 1
                    continue
                }
                if MarkdownIndentedCode.isThematicBreakLine(line) {
                    closeParagraph()
                    i += 1
                    continue
                }
                i += 1
                continue
            }
            if MarkdownIndentedCode.isThematicBreakLine(line) || isIndentedCodeLine(line) {
                closeParagraph()
                i += 1
                continue
            }
            paragraph = true
            paragraphStart = i
            i += 1
        }
        return boundaries
    }

    private static func skipQuote(_ lines: [String], start: Int) -> Int {
        var i = start + 1
        while i < lines.count {
            let line = lines[i]
            if isQuoteLine(line) {
                i += 1
                continue
            }
            if isBlank(line)
                || atxHeadingLevel(line) != nil
                || openingFence(line) != nil
                || line.trimmingCharacters(in: .whitespaces) == "$$"
                || MarkdownList.htmlBlockStarts(line)
                || MarkdownIndentedCode.isThematicBreakLine(line)
                || MarkdownList.listEnd(lines, start: i) != nil {
                break
            }
            i += 1
        }
        return i
    }

    private static func bubbleSpans(_ src: String, _ bubbles: [String]) -> [(start: Int, end: Int)] {
        var cursor = src.startIndex
        var spans: [(start: Int, end: Int)] = []
        for bubble in bubbles {
            let needle = normalize(bubble)
            if needle.isEmpty {
                spans.append((start: -1, end: -1))
                continue
            }
            let range = src.range(of: needle, range: cursor..<src.endIndex)
            guard let range else {
                spans.append((start: -1, end: -1))
                continue
            }
            let start = src.distance(from: src.startIndex, to: range.lowerBound)
            let end = src.distance(from: src.startIndex, to: range.upperBound)
            cursor = range.upperBound
            spans.append((start: start, end: end))
        }
        return spans
    }

    private static func lineOffset(_ lines: [String], _ index: Int) -> Int {
        var offset = 0
        var i = 0
        while i < index && i < lines.count {
            offset += lines[i].count + 1
            i += 1
        }
        return offset
    }

    private static func normalize(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    }

    private static func isBlank(_ line: String) -> Bool {
        MarkdownIndentedCode.isBlank(line)
    }

    private static func isIndentedCodeLine(_ line: String) -> Bool {
        guard let columns = MarkdownIndentedCode.contentColumns(line) else { return false }
        return columns >= 4
    }

    /// ATX level 1–6, or nil.
    static func atxHeadingLevel(_ line: String) -> Int? {
        var columns = 0
        var index = line.startIndex
        while index < line.endIndex {
            let ch = line[index]
            if ch == " " {
                columns += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                columns += 4 - (columns % 4)
                index = line.index(after: index)
                continue
            }
            break
        }
        if columns > 3 { return nil }
        var hashes = 0
        while index < line.endIndex, line[index] == "#", hashes < 7 {
            hashes += 1
            index = line.index(after: index)
        }
        if hashes < 1 || hashes > 6 { return nil }
        if index < line.endIndex {
            let ch = line[index]
            if ch != " " && ch != "\t" { return nil }
        }
        return hashes
    }

    private static func isQuoteLine(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}>"#, options: .regularExpression) != nil
    }

    private static func setextUnderline(_ line: String) -> Int? {
        var i = line.startIndex
        var spaces = 0
        while i < line.endIndex, spaces < 3, line[i] == " " {
            spaces += 1
            i = line.index(after: i)
        }
        guard i < line.endIndex else { return nil }
        let ch = line[i]
        if ch != "=" && ch != "-" { return nil }
        var count = 0
        while i < line.endIndex, line[i] == ch {
            count += 1
            i = line.index(after: i)
        }
        if ch == "-" && count < 2 { return nil }
        while i < line.endIndex {
            let c = line[i]
            if c != " " && c != "\t" { return nil }
            i = line.index(after: i)
        }
        return ch == "=" ? 1 : 2
    }

    private static func openingFence(_ line: String) -> String? {
        guard let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) else {
            return nil
        }
        let matched = String(line[match])
        guard let markerRange = matched.range(of: #"[`~]{3,}"#, options: .regularExpression) else { return nil }
        let marker = String(matched[markerRange])
        let info = String(matched[markerRange.upperBound...])
        if marker.hasPrefix("`"), info.contains("`") { return nil }
        return marker
    }

    private static func isClosingFence(_ line: String, open: String) -> Bool {
        guard let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) else {
            return false
        }
        let matched = String(line[match])
        guard let markerRange = matched.range(of: #"[`~]{3,}"#, options: .regularExpression) else { return false }
        let marker = String(matched[markerRange])
        let info = String(matched[markerRange.upperBound...])
        guard let first = marker.first, let openFirst = open.first else { return false }
        if first != openFirst { return false }
        if marker.count < open.count { return false }
        return info.trimmingCharacters(in: .whitespaces).isEmpty
    }
}
