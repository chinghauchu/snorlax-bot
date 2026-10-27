// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.41: CommonMark hard line breaks on a completed assistant
/// LEFT `kind=message`.
///
/// A line that ends in two or more spaces, or in an unescaped
/// backslash, followed by a newline inside a paragraph renders as
/// a visible line break. The spaces and the backslash are not
/// shown. Leading spaces on the next line are ignored. The same
/// marker at the end of a paragraph or other block is not a break:
/// trailing spaces disappear, and a backslash stays visible.
///
/// A plain single newline is a soft break. It stays a newline in
/// the markdown and renders as a space, so the paragraph is one
/// wrapping block. That matches CommonMark and Grok Bot's chat:
/// blank lines already split bubbles, and the "real line breaks
/// instead of stray backslashes" fix is this hard-break rule.
///
/// Code spans, fenced code, indented code, raw HTML, math
/// (`\(` `\)` and `$$`), and pipe-table rows keep their markers.
/// Call this after math is split out and after backslash escapes,
/// so `\\` plus a newline is a literal backslash and a soft break.
/// Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source.
/// No animation. No new HTTP.
/// v1.96: spaces that are only list-marker padding are not a
/// hard break. `-   ` then an indented `foo` is a list item,
/// and the same line inside a quote stays a list. A marker
/// whose text is indented code (`1.     code  `) keeps those
/// spaces in the code. A real break (`- foo  ` then `bar`)
/// stays a break.
/// Keep in lockstep with `desktop/src/markdownHardBreak.ts`.
enum MarkdownHardBreak {
    static let token = "§§SBH§§"

    private struct Line {
        var text: String
        var start: Int
        var nl: Int
    }

    private struct ListFrame {
        var markerCol: Int
        var contentCol: Int
        var ordered: Bool
    }

    private struct Marker {
        var col: Int
        var contentCol: Int
        var ordered: Bool
        var number: Int
    }

    private struct Span {
        var start: Int
        var end: Int
    }

    /// `completed: false` returns `text` unchanged.
    static func apply(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty { return text }
        if !text.contains("\n") && !text.contains("\r") { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let next = rewrite(src)
        if next == src { return text.contains("\r") ? src : text }
        return next
    }

    /// Paint a hard-break token as a newline inside the same run.
    static func restore(_ source: AttributedString) -> AttributedString {
        let raw = String(source.characters)
        guard raw.contains(token) else { return source }
        var output = AttributedString()
        for run in source.runs {
            let slice = String(source[run.range].characters)
            if !slice.contains(token) {
                output.append(source[run.range])
                continue
            }
            let parts = slice.components(separatedBy: token)
            for (index, part) in parts.enumerated() {
                if index > 0 { output.append(styled("\n", from: source[run.range])) }
                if !part.isEmpty { output.append(styled(part, from: source[run.range])) }
            }
        }
        return output
    }

    private static func styled(_ text: String, from run: AttributedString) -> AttributedString {
        var piece = AttributedString(text)
        piece.inlinePresentationIntent = run.inlinePresentationIntent
        piece.presentationIntent = run.presentationIntent
        piece.foregroundColor = run.foregroundColor
        piece.backgroundColor = run.backgroundColor
        piece.font = run.font
        piece.uiKit.font = run.uiKit.font
        piece.link = run.link
        return piece
    }

    private static func rewrite(_ src: String) -> String {
        let lines = splitLines(src)
        if lines.count < 2 { return src }
        let blocked = blockedRanges(src)
        let maskedLines = splitLines(maskRanges(src, inlineMasks(src)))
        var breaks: [Int: Int] = [:]
        let texts = lines.map { $0.text }
        var para = false
        var quote = 0
        var stack: [ListFrame] = []
        var prevBlank = true
        var index = 0

        while index < lines.count {
            let raw = lines[index].text
            let line = maskedLines[index].text
            if isBlank(raw) {
                para = false
                quote = 0
                prevBlank = true
                index += 1
                continue
            }
            if let fence = fenceOpen(raw) {
                para = false
                quote = 0
                index = skipFence(lines, start: index, marker: fence)
                prevBlank = false
                continue
            }
            if raw.trimmingCharacters(in: .whitespaces) == "$$" {
                para = false
                quote = 0
                index += 1
                while index < lines.count && lines[index].text.trimmingCharacters(in: .whitespaces) != "$$" {
                    index += 1
                }
                if index < lines.count { index += 1 }
                prevBlank = false
                continue
            }
            // v1.87: a type 7 tag at the list or quote margin closes
            // that container and owns the following lines. An indented
            // type 7 tag stays in the open paragraph, so a hard break
            // there still fires. A type 1–6 block inside the item still
            // swallows breaks.
            let leavingList = stack.last.map { contentIndent(raw) < $0.contentCol } ?? false
            let leavingQuote = quote > 0 && quoteDepth(raw) < quote
            let htmlPara = leavingList || leavingQuote ? false : para
            if let htmlEnd = MarkdownList.htmlBlockLineEnd(texts, index: index, paragraphOpen: htmlPara) {
                if leavingList || leavingQuote {
                    stack = []
                    quote = 0
                }
                para = false
                index = htmlEnd
                prevBlank = false
                continue
            }
            if !para && stack.isEmpty && contentIndent(raw) >= 4 && prevBlank {
                para = false
                quote = 0
                index += 1
                while index < lines.count {
                    let upcoming = lines[index].text
                    if isBlank(upcoming) || contentIndent(upcoming) >= 4 {
                        index += 1
                        continue
                    }
                    break
                }
                prevBlank = false
                continue
            }
            if !para && isTableStart(lines, index: index) {
                para = false
                quote = 0
                index = skipTable(lines, index: index)
                prevBlank = false
                continue
            }

            while let top = stack.last {
                let indent = contentIndent(raw)
                if indent >= top.contentCol { break }
                if para && !interruptsParagraph(raw, para: true) && !MarkdownList.htmlBlockStarts(raw) { break }
                stack.removeLast()
            }

            let marker = parseMarker(stripQuote(line))
            let continues = continuesParagraph(line, para: para, quote: quote, stack: stack)
            if index > 0 && continues {
                arm(&breaks, lines: lines, blocked: blocked, index: index - 1, next: lines[index].text, para: para, quote: quote)
            }

            if let marker, startsListItem(marker, para: para, stack: stack) {
                if let top = stack.last, marker.col >= top.contentCol {
                    stack.append(ListFrame(markerCol: marker.col, contentCol: marker.contentCol, ordered: marker.ordered))
                } else {
                    while let frame = stack.last, marker.col <= frame.markerCol {
                        stack.removeLast()
                    }
                    stack.append(ListFrame(markerCol: marker.col, contentCol: marker.contentCol, ordered: marker.ordered))
                }
                // v1.96: padding after the marker, and indented code in
                // that text, are not paragraph lines.
                if let itemText = listItemParagraphText(line) {
                    para = remainderOpensParagraph(itemText)
                } else {
                    para = true
                }
                quote = quoteDepth(line)
            } else if isAtx(line) || isThematic(line) || isMathLine(line) {
                para = false
                quote = 0
            } else if isSetext(line) && para {
                para = false
                quote = 0
            } else {
                para = true
                let depth = quoteDepth(line)
                if depth > 0 { quote = depth }
            }
            prevBlank = false
            index += 1
        }

        if breaks.isEmpty { return src }
        var out = ""
        var skip = 0
        for lineIndex in lines.indices {
            var text = lines[lineIndex].text
            if skip > 0 {
                text = String(text.dropFirst(min(skip, text.count)))
                skip = 0
            }
            if let eat = breaks[lineIndex] {
                out += stripHardMarker(text)
                out += token
                skip = eat
            } else {
                out += text
                if lines[lineIndex].nl >= 0 { out += "\n" }
            }
        }
        return out
    }

    private static func arm(
        _ breaks: inout [Int: Int],
        lines: [Line],
        blocked: [Span],
        index: Int,
        next: String,
        para: Bool,
        quote: Int
    ) {
        if !para { return }
        let line = lines[index]
        if line.nl < 0 || inRange(line.nl, blocked) { return }
        if !hardMarker(line.text) { return }
        breaks[index] = continuationSkip(next, quote: quote)
    }

    private static func splitLines(_ src: String) -> [Line] {
        let chars = Array(src)
        var lines: [Line] = []
        var start = 0
        var index = 0
        while index <= chars.count {
            if index == chars.count || chars[index] == "\n" {
                lines.append(Line(
                    text: String(chars[start..<index]),
                    start: start,
                    nl: index == chars.count ? -1 : index
                ))
                start = index + 1
            }
            index += 1
        }
        if src.hasSuffix("\n"), !lines.isEmpty { lines.removeLast() }
        return lines
    }

    private static func hardMarker(_ line: String) -> Bool {
        trailingSlashes(line) % 2 == 1 || trailingSpaces(line) >= 2
    }

    private static func trailingSlashes(_ line: String) -> Int {
        var count = 0
        for ch in line.reversed() {
            if ch != "\\" { break }
            count += 1
        }
        return count
    }

    private static func trailingSpaces(_ line: String) -> Int {
        var count = 0
        for ch in line.reversed() {
            if ch != " " { break }
            count += 1
        }
        return count
    }

    private static func stripHardMarker(_ line: String) -> String {
        if trailingSlashes(line) % 2 == 1 { return String(line.dropLast()) }
        return String(line.dropLast(trailingSpaces(line)))
    }

    private static func continuationSkip(_ line: String, quote: Int) -> Int {
        let chars = Array(line)
        var index = 0
        if quote > 0 {
            for _ in 0..<quote {
                let prefix = quotePrefixAt(chars, from: index)
                if prefix == 0 { break }
                index += prefix
            }
        }
        while index < chars.count && (chars[index] == " " || chars[index] == "\t") { index += 1 }
        return index
    }

    private static func quotePrefixAt(_ chars: [Character], from: Int) -> Int {
        var index = from
        var spaces = 0
        while index < chars.count, spaces < 3, chars[index] == " " {
            index += 1
            spaces += 1
        }
        if index >= chars.count || chars[index] != ">" { return 0 }
        index += 1
        if index < chars.count && chars[index] == " " { index += 1 }
        return index - from
    }

    private static func quoteDepth(_ line: String) -> Int {
        let chars = Array(line)
        var index = 0
        var depth = 0
        while index < chars.count {
            let prefix = quotePrefixAt(chars, from: index)
            if prefix == 0 { break }
            depth += 1
            index += prefix
        }
        return depth
    }

    private static func continuesParagraph(
        _ line: String,
        para: Bool,
        quote: Int,
        stack: [ListFrame]
    ) -> Bool {
        if !para || isBlank(line) { return false }
        if fenceOpen(line) != nil || isAtx(line) || isMathLine(line) { return false }
        if isThematic(line) || isSetext(line) { return false }
        if MarkdownList.htmlBlockInterrupts(line) { return false }
        let depth = quoteDepth(line)
        if depth > 0 && quote == 0 { return false }
        if let marker = parseMarker(stripQuote(line)), startsListItem(marker, para: true, stack: stack) {
            return false
        }
        return true
    }

    private static func stripQuote(_ line: String) -> String {
        let chars = Array(line)
        var index = 0
        while index < chars.count {
            let prefix = quotePrefixAt(chars, from: index)
            if prefix == 0 { break }
            index += prefix
        }
        return String(chars[index...])
    }

    private static func startsListItem(_ marker: Marker, para: Bool, stack: [ListFrame]) -> Bool {
        let interrupts = !marker.ordered || marker.number == 1
        guard let top = stack.last else {
            if marker.col > 3 { return false }
            if !para { return true }
            return interrupts
        }
        if marker.col >= top.contentCol { return interrupts }
        if marker.col <= 3 && marker.col <= top.markerCol { return true }
        return false
    }

    private static func interruptsParagraph(_ line: String, para: Bool) -> Bool {
        if fenceOpen(line) != nil || isAtx(line) || isMathLine(line) { return true }
        if isThematic(line) { return true }
        if para ? MarkdownList.htmlBlockInterrupts(line) : MarkdownList.htmlBlockStarts(line) { return true }
        if quotePrefixAt(Array(line), from: 0) > 0 { return true }
        guard let marker = parseMarker(line) else { return false }
        return !marker.ordered || marker.number == 1
    }

    /// Text after a list marker's padding. A blank marker line is `""`.
    private static func listItemParagraphText(_ line: String) -> String? {
        let body = stripQuote(line)
        if isThematic(body) { return nil }
        let lead = leadingColumns(body)
        let chars = Array(body)
        if lead.index >= chars.count { return nil }
        let rest = Array(chars[lead.index...])
        var tokenCount = 0
        if rest[0] == "-" || rest[0] == "+" || rest[0] == "*" {
            tokenCount = 1
        } else {
            var digits = 0
            var cursor = 0
            while cursor < rest.count, digits < 9, isDigit(rest[cursor]) {
                digits += 1
                cursor += 1
            }
            guard digits > 0, cursor < rest.count, rest[cursor] == "." || rest[cursor] == ")" else {
                return nil
            }
            tokenCount = digits + 1
        }
        let after = lead.index + tokenCount
        if after < chars.count, chars[after] != " ", chars[after] != "\t" { return nil }
        guard let markerIndex = body.index(body.startIndex, offsetBy: after, limitedBy: body.endIndex) else {
            return nil
        }
        let padded = MarkdownList.listMarkerPadding(
            body,
            markerIndex: markerIndex,
            markerColumn: lead.columns + tokenCount
        )
        return padded.text
    }

    /// Empty padding and indented code are not paragraph text.
    private static func remainderOpensParagraph(_ text: String) -> Bool {
        if text.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        return leadingColumns(text).columns < 4
    }

    private static func parseMarker(_ line: String) -> Marker? {
        if isThematic(line) { return nil }
        let lead = leadingColumns(line)
        let chars = Array(line)
        if lead.index > chars.count { return nil }
        let rest = Array(chars[lead.index...])
        guard !rest.isEmpty else { return nil }
        var ordered = false
        var number = 1
        var token = ""
        let bullet = rest[0]
        if bullet == "-" || bullet == "+" || bullet == "*" {
            token = String(bullet)
        } else {
            var digits = ""
            var cursor = 0
            while cursor < rest.count, digits.count < 9, isDigit(rest[cursor]) {
                digits.append(rest[cursor])
                cursor += 1
            }
            guard !digits.isEmpty, cursor < rest.count, rest[cursor] == "." || rest[cursor] == ")" else {
                return nil
            }
            token = digits + String(rest[cursor])
            ordered = true
            number = Int(digits) ?? 1
        }
        var contentCol = lead.columns + token.count
        let after = lead.index + token.count
        if after >= chars.count {
            contentCol += 1
        } else if chars[after] == " " {
            contentCol += 1
        } else if chars[after] == "\t" {
            contentCol += 4 - (contentCol % 4)
        } else {
            return nil
        }
        return Marker(col: lead.columns, contentCol: contentCol, ordered: ordered, number: number)
    }

    private static func isAtx(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil
    }

    private static func isMathLine(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces) == "$$"
    }

    private static func isSetext(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}(?:=+|-+)[ \t]*$"#, options: .regularExpression) != nil
    }

    private static func isThematic(_ line: String) -> Bool {
        let chars = Array(line)
        var index = 0
        while index < chars.count, index < 3, chars[index] == " " { index += 1 }
        guard index < chars.count else { return false }
        let mark = chars[index]
        guard mark == "-" || mark == "*" || mark == "_" else { return false }
        var count = 0
        var cursor = index
        while cursor < chars.count {
            let ch = chars[cursor]
            if ch == mark {
                count += 1
            } else if ch != " " && ch != "\t" {
                return false
            }
            cursor += 1
        }
        return count >= 3
    }

    private static func isBlank(_ line: String) -> Bool {
        for ch in line where ch != " " && ch != "\t" { return false }
        return true
    }

    private static func fenceOpen(_ line: String) -> String? {
        guard let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) else {
            return nil
        }
        let body = String(line[match])
        guard let ticks = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else { return nil }
        let marker = String(body[ticks])
        let info = String(body[ticks.upperBound...])
        if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) { return nil }
        return marker
    }

    private static func skipFence(_ lines: [Line], start: Int, marker: String) -> Int {
        var index = start + 1
        while index < lines.count {
            let line = lines[index].text
            if let open = fenceOpen(line),
               open.first == marker.first,
               open.count >= marker.count,
               fenceInfo(line).trimmingCharacters(in: .whitespaces).isEmpty
            {
                return index + 1
            }
            index += 1
        }
        return index
    }

    private static func fenceInfo(_ line: String) -> String {
        guard let match = line.range(of: #"^( {0,3})([`~]{3,})(.*)$"#, options: .regularExpression) else {
            return ""
        }
        let body = String(line[match])
        guard let ticks = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else { return "" }
        return String(body[ticks.upperBound...])
    }

    private static func contentIndent(_ line: String) -> Int {
        let lead = leadingColumns(line)
        if lead.index >= Array(line).count { return 0 }
        return lead.columns
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

    private static func isDigit(_ ch: Character) -> Bool {
        ch >= "0" && ch <= "9"
    }

    private static func isTableStart(_ lines: [Line], index: Int) -> Bool {
        if index + 1 >= lines.count { return false }
        let header = lines[index].text
        let delim = lines[index + 1].text
        if !isTableRow(header) || !isDelimiterRow(delim) { return false }
        return splitPipes(header).count >= 1 && splitPipes(delim).count == splitPipes(header).count
    }

    private static func skipTable(_ lines: [Line], index: Int) -> Int {
        var cursor = index + 2
        while cursor < lines.count && isTableRow(lines[cursor].text) { cursor += 1 }
        return cursor
    }

    private static func isTableRow(_ line: String) -> Bool {
        if contentIndent(line) >= 4 { return false }
        if isBlank(line) { return false }
        return splitPipes(line).count >= 2 || line.contains("|")
    }

    private static func isDelimiterRow(_ line: String) -> Bool {
        let cells = splitPipes(line)
        if cells.isEmpty { return false }
        return cells.allSatisfy { cell in
            cell.trimmingCharacters(in: .whitespaces).range(
                of: #"^:?-+:?$"#,
                options: .regularExpression
            ) != nil
        }
    }

    private static func splitPipes(_ line: String) -> [String] {
        let chars = Array(line)
        var cells: [String] = []
        var current = ""
        var code = 0
        var index = 0
        while index < chars.count {
            let ch = chars[index]
            if code > 0 {
                if ch == "`" {
                    var count = 0
                    while index + count < chars.count && chars[index + count] == "`" { count += 1 }
                    current += String(repeating: "`", count: count)
                    index += count
                    if count == code { code = 0 }
                    continue
                }
                current.append(ch)
                index += 1
                continue
            }
            if ch == "\\" {
                current.append(ch)
                if index + 1 < chars.count { current.append(chars[index + 1]) }
                index += 2
                continue
            }
            if ch == "`" {
                var count = 0
                while index + count < chars.count && chars[index + count] == "`" { count += 1 }
                current += String(repeating: "`", count: count)
                index += count
                code = count
                continue
            }
            if ch == "|" {
                cells.append(current)
                current = ""
                index += 1
                continue
            }
            current.append(ch)
            index += 1
        }
        cells.append(current)
        return cells.enumerated().compactMap { offset, cell in
            let edge = offset == 0 || offset == cells.count - 1
            if edge && cell.trimmingCharacters(in: .whitespaces).isEmpty { return nil }
            return cell
        }
    }

    private static func blockedRanges(_ src: String) -> [Span] {
        let fences = fenceRanges(src)
        let codes = inlineCodeRanges(src, fences: fences)
        let math = mathRanges(src, skip: fences + codes)
        let indented = indentedCodeRanges(src, fences: fences)
        let html = inlineHtmlRanges(src, skip: fences + codes + math)
        return mergeRanges(fences + codes + math + indented + html)
    }

    private static func inlineMasks(_ src: String) -> [Span] {
        let fences = fenceRanges(src)
        let codes = inlineCodeRanges(src, fences: fences)
        let math = mathRanges(src, skip: fences + codes)
        let html = inlineHtmlRanges(src, skip: fences + codes + math)
        return mergeRanges(codes + math + html)
    }

    private static func maskRanges(_ src: String, _ ranges: [Span]) -> String {
        if ranges.isEmpty { return src }
        var chars = Array(src)
        for range in ranges {
            var index = range.start
            while index < range.end && index < chars.count {
                if chars[index] != "\n" { chars[index] = "x" }
                index += 1
            }
        }
        return String(chars)
    }

    private static func inRange(_ index: Int, _ ranges: [Span]) -> Bool {
        ranges.contains { index >= $0.start && index < $0.end }
    }

    private static func fenceRanges(_ src: String) -> [Span] {
        let chars = Array(src)
        var ranges: [Span] = []
        var index = 0
        var open: (marker: String, start: Int)?
        while index <= chars.count {
            let end = chars[index...].firstIndex(of: "\n") ?? chars.count
            let line = String(chars[index..<end])
            if let marker = fenceOpen(line) {
                if open == nil {
                    open = (marker, index)
                } else if let current = open,
                          marker.first == current.marker.first,
                          marker.count >= current.marker.count,
                          fenceInfo(line).trimmingCharacters(in: .whitespaces).isEmpty
                {
                    ranges.append(Span(start: current.start, end: end))
                    open = nil
                }
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if let open { ranges.append(Span(start: open.start, end: chars.count)) }
        return ranges
    }

    private static func inlineCodeRanges(_ src: String, fences: [Span]) -> [Span] {
        let chars = Array(src)
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inRange(index, fences) {
                index += 1
                continue
            }
            if chars[index] != "`" {
                index += 1
                continue
            }
            var ticks = 1
            while index + ticks < chars.count && chars[index + ticks] == "`" { ticks += 1 }
            var cursor = index + ticks
            var closed = false
            while cursor < chars.count {
                if inRange(cursor, fences) {
                    cursor += 1
                    continue
                }
                if chars[cursor] != "`" {
                    cursor += 1
                    continue
                }
                var run = 1
                while cursor + run < chars.count && chars[cursor + run] == "`" { run += 1 }
                if run == ticks {
                    ranges.append(Span(start: index, end: cursor + run))
                    index = cursor + run
                    closed = true
                    break
                }
                cursor += run
            }
            if !closed { index += ticks }
        }
        return ranges
    }

    private static func mathRanges(_ src: String, skip: [Span]) -> [Span] {
        let chars = Array(src)
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inRange(index, skip) {
                index += 1
                continue
            }
            if index + 1 < chars.count && chars[index] == "$" && chars[index + 1] == "$"
                && (index == 0 || chars[index - 1] == "\n")
            {
                if let close = indexOf(chars, "\n$$", from: index + 2) {
                    var end = close + 3
                    if end < chars.count && chars[end] == "\n" { end += 1 }
                    ranges.append(Span(start: index, end: end))
                    index = end
                    continue
                }
                ranges.append(Span(start: index, end: chars.count))
                break
            }
            if index + 1 < chars.count && chars[index] == "\\" && chars[index + 1] == "(" {
                if let close = indexOf(chars, "\\)", from: index + 2) {
                    ranges.append(Span(start: index, end: close + 2))
                    index = close + 2
                    continue
                }
                ranges.append(Span(start: index, end: chars.count))
                break
            }
            index += 1
        }
        return ranges
    }

    private static func indentedCodeRanges(_ src: String, fences: [Span]) -> [Span] {
        let chars = Array(src)
        var ranges: [Span] = []
        var inCode = false
        var codeStart = 0
        var prevBlank = true
        var index = 0
        while index <= chars.count {
            let end = chars[index...].firstIndex(of: "\n") ?? chars.count
            let inside = fences.contains { index >= $0.start && index < $0.end }
            if inside {
                if inCode {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                prevBlank = false
            } else {
                let line = String(chars[index..<end])
                let indent = contentIndent(line)
                let blank = isBlank(line)
                if inCode && !blank && indent < 4 {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                if !inCode && prevBlank && !blank && indent >= 4 {
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

    private static func inlineHtmlRanges(_ src: String, skip: [Span]) -> [Span] {
        let chars = Array(src)
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inRange(index, skip) {
                index += 1
                continue
            }
            if chars[index] != "<" {
                index += 1
                continue
            }
            if let end = readHtml(chars, index), end > index + 1 {
                ranges.append(Span(start: index, end: end))
                index = end
                continue
            }
            index += 1
        }
        return ranges
    }

    private static func readHtml(_ chars: [Character], _ start: Int) -> Int? {
        if hasPrefix(chars, "<!--", at: start) {
            guard let end = indexOf(chars, "-->", from: start + 4) else { return nil }
            return end + 3
        }
        if hasPrefix(chars, "<?", at: start) {
            guard let end = indexOf(chars, "?>", from: start + 2) else { return nil }
            return end + 2
        }
        if hasPrefix(chars, "<![CDATA[", at: start) {
            guard let end = indexOf(chars, "]]>", from: start + 9) else { return nil }
            return end + 3
        }
        if hasPrefix(chars, "<!", at: start) {
            guard let end = indexOf(chars, ">", from: start + 2) else { return nil }
            return end + 1
        }
        var cursor = start + 1
        if cursor < chars.count && chars[cursor] == "/" { cursor += 1 }
        guard cursor < chars.count, isNameStart(chars[cursor]) else { return nil }
        cursor += 1
        while cursor < chars.count && isNameChar(chars[cursor]) { cursor += 1 }
        var quote: Character = "\0"
        while cursor < chars.count {
            let ch = chars[cursor]
            if quote != "\0" {
                if ch == quote { quote = "\0" }
                cursor += 1
                continue
            }
            if ch == "\"" || ch == "'" {
                quote = ch
                cursor += 1
                continue
            }
            if ch == ">" { return cursor + 1 }
            cursor += 1
        }
        return nil
    }

    private static func hasPrefix(_ chars: [Character], _ prefix: String, at start: Int) -> Bool {
        let needle = Array(prefix)
        if start + needle.count > chars.count { return false }
        for offset in needle.indices where chars[start + offset] != needle[offset] { return false }
        return true
    }

    private static func indexOf(_ chars: [Character], _ needle: String, from start: Int) -> Int? {
        let want = Array(needle)
        if want.isEmpty || start > chars.count { return nil }
        var index = start
        while index + want.count <= chars.count {
            var same = true
            for offset in want.indices where chars[index + offset] != want[offset] {
                same = false
                break
            }
            if same { return index }
            index += 1
        }
        return nil
    }

    private static func isNameStart(_ ch: Character) -> Bool {
        (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")
    }

    private static func isNameChar(_ ch: Character) -> Bool {
        isNameStart(ch) || isDigit(ch) || ch == "-"
    }

    private static func mergeRanges(_ ranges: [Span]) -> [Span] {
        let sorted = ranges.filter { $0.end > $0.start }.sorted { lhs, rhs in
            lhs.start == rhs.start ? lhs.end < rhs.end : lhs.start < rhs.start
        }
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
