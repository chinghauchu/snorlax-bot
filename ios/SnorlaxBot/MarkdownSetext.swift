// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

/// v1.44: CommonMark setext headings on a completed assistant
/// LEFT `kind=message`.
///
/// A paragraph followed by a line of `=` is an H1. A line of `-`
/// is an H2. The heading uses the same 16pt / 14pt semibold font
/// as an ATX heading. Several lines with no blank line between
/// them are one heading; a break between those lines stays inside
/// that heading.
///
/// A `---` after a blank line stays a thematic break. A `---` that
/// is not indented into a list item stays a break after the list.
/// The same underline indented to the item's text is a heading
/// inside the item. A setext underline that would only match as a
/// lazy continuation of a quote or list stays literal text. A
/// backslash-escaped `\=` or `\-` stays literal. Fences, indented
/// code, `$$` math, HTML blocks, and pipe-table rows are not
/// headings. Underline-shaped lines inside a table cell stay
/// literal too.
///
/// Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source — this type does not write
/// the pasteboard. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownSetext.ts`.
enum MarkdownSetext {
    enum Block: Equatable {
        case markdown(String)
        case heading(level: Int, text: String)
    }

    private enum Mode {
        case none
        case quote
        case list(contentCol: Int)
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Heading body with line breaks marked for the inline renderer.
    static func headingInlineSource(_ text: String) -> String {
        text.replacingOccurrences(of: "\n", with: MarkdownHardBreak.token)
    }

    /// `completed: false` returns `text` unchanged.
    static func protectLazy(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty { return text }
        let src = normalize(text)
        let lines = splitLines(src)
        var out: [String] = []
        var mode: Mode = .none
        var para = false
        var prevBlank = true
        var index = 0
        while index < lines.count {
            let line = lines[index]
            if isBlank(line) {
                para = false
                mode = .none
                prevBlank = true
                out.append(line)
                index += 1
                continue
            }
            let skipped = skipOpaque(lines, index, allowIndent: prevBlank && !para)
            if skipped > index {
                out.append(contentsOf: lines[index..<skipped])
                para = false
                mode = .none
                prevBlank = false
                index = skipped
                continue
            }
            let raw = setextUnderline(line)
            let fits = fitsContainer(line, mode)
            if para && !isNone(mode) && (raw != nil || fits) {
                if fits {
                    para = false
                    out.append(line)
                    prevBlank = false
                    index += 1
                    continue
                }
                if let raw, isThematic(line) {
                    _ = raw
                    para = false
                    mode = .none
                    out.append(line)
                    prevBlank = false
                    index += 1
                    continue
                }
                if let raw {
                    out.append(protectUnderline(line, raw.index))
                    prevBlank = false
                    index += 1
                    continue
                }
            }
            if raw != nil && para && isNone(mode) {
                para = false
                out.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if isQuoteLine(line) {
                mode = .quote
                para = true
                out.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if let item = listItem(line), !para || item.interrupts {
                mode = .list(contentCol: item.contentCol)
                para = true
                out.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if !para { mode = .none }
            para = true
            out.append(line)
            prevBlank = false
            index += 1
        }
        let next = out.joined(separator: "\n")
        if next == src { return text.contains("\r") ? src : text }
        return next
    }

    /// `completed: false` returns the text unchanged.
    static func split(_ text: String, completed: Bool) -> [Block] {
        if text.isEmpty { return [] }
        let src = normalize(text)
        if !completed { return [.markdown(src)] }
        let lines = splitLines(src)
        var blocks: [Block] = []
        var md: [String] = []
        var para: [String] = []
        var mode: Mode = .none
        var prevBlank = true
        var index = 0

        func flushMd() {
            guard !md.isEmpty else { return }
            let chunk = md.joined(separator: "\n")
            md = []
            if !chunk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                blocks.append(.markdown(chunk))
            }
        }
        func dumpPara() {
            guard !para.isEmpty else { return }
            md.append(contentsOf: para)
            para = []
        }

        while index < lines.count {
            let line = lines[index]
            if isBlank(line) {
                dumpPara()
                md.append(line)
                mode = .none
                prevBlank = true
                index += 1
                continue
            }
            let skipped = skipOpaque(lines, index, allowIndent: prevBlank && para.isEmpty)
            if skipped > index {
                dumpPara()
                md.append(contentsOf: lines[index..<skipped])
                mode = .none
                prevBlank = false
                index = skipped
                continue
            }
            if let raw = setextUnderline(line), !para.isEmpty, isNone(mode) {
                let body = headingText(para)
                para = []
                flushMd()
                if !body.isEmpty {
                    blocks.append(.heading(level: raw.level, text: body))
                } else {
                    md.append(line)
                }
                prevBlank = false
                index += 1
                continue
            }
            if fitsContainer(line, mode) {
                dumpPara()
                md.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if let raw = setextUnderline(line), !isNone(mode), isThematic(line) {
                _ = raw
                dumpPara()
                mode = .none
                md.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if isAtx(line) || (isThematic(line) && setextUnderline(line) == nil) {
                dumpPara()
                mode = .none
                md.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if isQuoteLine(line) {
                dumpPara()
                mode = .quote
                md.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if let item = listItem(line), para.isEmpty || item.interrupts {
                dumpPara()
                mode = .list(contentCol: item.contentCol)
                md.append(line)
                prevBlank = false
                index += 1
                continue
            }
            if isNone(mode) {
                para.append(line)
            } else {
                md.append(line)
            }
            prevBlank = false
            index += 1
        }
        dumpPara()
        flushMd()
        if blocks.isEmpty { return [.markdown(src)] }
        return blocks
    }

    /// Underline-shaped lines in a table cell stay the characters.
    static func literalize(_ text: String) -> String {
        if text.isEmpty { return text }
        let src = normalize(text)
        let lines = splitLines(src)
        var changed = false
        let out = lines.map { line -> String in
            guard let raw = setextUnderline(line) else { return line }
            changed = true
            return protectUnderline(line, raw.index)
        }
        if !changed { return text.contains("\r") ? src : text }
        return out.joined(separator: "\n")
    }

    private struct Underline {
        var level: Int
        var index: Int
    }

    private struct Item {
        var contentCol: Int
        var interrupts: Bool
    }

    private static func headingText(_ lines: [String]) -> String {
        var cleaned = lines.map { $0.replacingOccurrences(of: "[ \\t]+$", with: "", options: .regularExpression) }
        if cleaned.isEmpty { return "" }
        cleaned[0] = cleaned[0].replacingOccurrences(of: "^ {1,3}", with: "", options: .regularExpression)
        return cleaned.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func protectUnderline(_ line: String, _ index: Int) -> String {
        let chars = Array(line)
        guard index >= 0, index <= chars.count else { return line }
        let head = String(chars[..<index])
        let tail = String(chars[index...])
        return head + "\\" + tail
    }

    private static func setextUnderline(_ line: String) -> Underline? {
        let chars = Array(line)
        var i = 0
        while i < chars.count, i < 3, chars[i] == " " { i += 1 }
        guard i < chars.count else { return nil }
        let ch = chars[i]
        guard ch == "=" || ch == "-" else { return nil }
        let start = i
        while i < chars.count, chars[i] == ch { i += 1 }
        let count = i - start
        if ch == "-" && count < 2 { return nil }
        var j = i
        while j < chars.count {
            let c = chars[j]
            if c != " " && c != "\t" { return nil }
            j += 1
        }
        return Underline(level: ch == "=" ? 1 : 2, index: start)
    }

    private static func fitsContainer(_ line: String, _ mode: Mode) -> Bool {
        switch mode {
        case .quote:
            return quoteRemainderIsUnderline(line)
        case .list(let contentCol):
            if leadingColumns(line) < contentCol { return false }
            return setextUnderline(dedent(line, contentCol)) != nil
        case .none:
            return false
        }
    }

    private static func quoteRemainderIsUnderline(_ line: String) -> Bool {
        let chars = Array(line)
        var i = 0
        var saw = false
        while i < chars.count {
            var s = i
            var spaces = 0
            while s < chars.count, spaces < 3, chars[s] == " " {
                s += 1
                spaces += 1
            }
            if s >= chars.count || chars[s] != ">" { break }
            saw = true
            s += 1
            if s < chars.count, chars[s] == " " { s += 1 }
            i = s
        }
        if !saw { return false }
        return setextUnderline(String(chars[i...])) != nil
    }

    private static func skipOpaque(_ lines: [String], _ index: Int, allowIndent: Bool) -> Int {
        let line = lines[index]
        if let fence = openingFence(line) { return skipFence(lines, index, fence) }
        if line.trimmingCharacters(in: .whitespaces) == "$$" { return skipMath(lines, index) }
        if allowIndent && isIndentedCodeLine(line) { return skipIndented(lines, index) }
        if allowIndent && isHtmlBlockStart(line) { return skipHtml(lines, index) }
        return index
    }

    private static func skipFence(_ lines: [String], _ index: Int, _ open: String) -> Int {
        var i = index + 1
        while i < lines.count {
            let line = lines[i]
            i += 1
            if isClosingFence(line, open) { break }
        }
        return i
    }

    private static func skipMath(_ lines: [String], _ index: Int) -> Int {
        var i = index + 1
        while i < lines.count, lines[i].trimmingCharacters(in: .whitespaces) != "$$" { i += 1 }
        if i < lines.count { i += 1 }
        return i
    }

    private static func skipIndented(_ lines: [String], _ index: Int) -> Int {
        var i = index + 1
        while i < lines.count {
            let line = lines[i]
            if isBlank(line) || isIndentedCodeLine(line) {
                i += 1
                continue
            }
            break
        }
        return i
    }

    private static func skipHtml(_ lines: [String], _ index: Int) -> Int {
        var i = index + 1
        while i < lines.count, !isBlank(lines[i]) { i += 1 }
        return i
    }

    private static func openingFence(_ line: String) -> String? {
        guard let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) else {
            return nil
        }
        let body = String(line[match])
        guard let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else { return nil }
        let marker = String(body[markerRange])
        let info = String(body[markerRange.upperBound...])
        if marker.hasPrefix("`"), info.contains("`") { return nil }
        return marker
    }

    private static func isClosingFence(_ line: String, _ open: String) -> Bool {
        guard let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) else {
            return false
        }
        let body = String(line[match])
        guard let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else { return false }
        let marker = String(body[markerRange])
        let info = String(body[markerRange.upperBound...])
        guard let first = marker.first, let openFirst = open.first, first == openFirst else { return false }
        if marker.count < open.count { return false }
        return info.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private static func isIndentedCodeLine(_ line: String) -> Bool {
        if isBlank(line) { return false }
        if line.hasPrefix("\t") { return true }
        return line.range(of: #"^ {4,}"#, options: .regularExpression) != nil
    }

    private static func isHtmlBlockStart(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}<(?:!--|\?|!\[CDATA\[|/?[A-Za-z])"#, options: .regularExpression) != nil
    }

    private static func isAtx(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil
    }

    private static func isQuoteLine(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}>"#, options: .regularExpression) != nil
    }

    private static func isThematic(_ line: String) -> Bool {
        let chars = Array(line)
        var i = 0
        while i < chars.count, i < 3, chars[i] == " " { i += 1 }
        guard i < chars.count else { return false }
        let ch = chars[i]
        guard ch == "-" || ch == "*" || ch == "_" else { return false }
        var count = 0
        var j = i
        while j < chars.count {
            let c = chars[j]
            if c == ch {
                count += 1
            } else if c != " " && c != "\t" {
                return false
            }
            j += 1
        }
        return count >= 3
    }

    private static func listItem(_ line: String) -> Item? {
        let chars = Array(line)
        var index = 0
        var columns = 0
        while index < chars.count, chars[index] == " ", columns < 3 {
            index += 1
            columns += 1
        }
        let rest = String(chars[index...])
        var token = 0
        var ordered = false
        var number = 1
        if rest.range(of: #"^[-+*](?:[ \t]|$)"#, options: .regularExpression) != nil {
            token = 1
            if rest.count > 1 {
                let second = rest[rest.index(after: rest.startIndex)]
                if second != " " && second != "\t" { return nil }
            }
        } else if let match = rest.range(of: #"^(\d{1,9})([.)])(?:[ \t]|$)"#, options: .regularExpression) {
            let marker = String(rest[match])
            let digits = marker.dropLast(marker.last == " " || marker.last == "\t" ? 2 : 1)
            token = marker.count - ((marker.last == " " || marker.last == "\t") ? 1 : 0)
            ordered = true
            number = Int(digits) ?? 1
        } else {
            return nil
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
        return Item(contentCol: columns, interrupts: !ordered || number == 1)
    }

    private static func leadingColumns(_ line: String) -> Int {
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

    private static func dedent(_ line: String, _ columns: Int) -> String {
        var col = 0
        var i = line.startIndex
        while i < line.endIndex, col < columns {
            let ch = line[i]
            if ch == " " {
                col += 1
                i = line.index(after: i)
                continue
            }
            if ch == "\t" {
                let width = 4 - (col % 4)
                if col + width > columns { break }
                col += width
                i = line.index(after: i)
                continue
            }
            break
        }
        return String(line[i...])
    }

    private static func isBlank(_ line: String) -> Bool {
        line.allSatisfy { $0 == " " || $0 == "\t" }
    }

    private static func isNone(_ mode: Mode) -> Bool {
        if case .none = mode { return true }
        return false
    }

    private static func normalize(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    }

    private static func splitLines(_ text: String) -> [String] {
        text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    }
}
