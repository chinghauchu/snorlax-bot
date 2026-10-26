// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.39: CommonMark reference-style links on a completed assistant
/// LEFT `kind=message`.
///
/// Full `[text][ref]`, collapsed `[ref][]`, and shortcut `[ref]`
/// resolve against a link reference definition anywhere in the same
/// message. Labels match case-insensitively after whitespace is
/// collapsed. Resolved links are rewritten to inline links so the
/// existing link style, long-press Open/Copy Link preview, and http(s)
/// safe-scheme rules apply. Definition lines are removed. Unresolved
/// references stay literal. `[^1]` stays a footnote. Task-list markers
/// stay markers. Fences, inline code, and math are not parsed.
/// Reference images rewrite to inline images. Streaming
/// (`completed: false`) returns the text unchanged. Copy keeps
/// markdown source. No animation. No new HTTP.
/// v1.74: a pointy destination may contain spaces and tabs, including
/// when a title follows in single quotes or parentheses. A backslash
/// escapes ASCII punctuation only. `prepareSpacedDestinations`
/// percent-encodes that destination for the markdown parser.
/// v1.76: link text follows CommonMark. Balanced brackets stay inside
/// one link. A link may not contain another link, so
/// `[foo [bar](/uri)][ref]` is the inner link plus the reference.
/// An undefined full label does not fall back to a shortcut.
/// Code spans, autolinks, and raw HTML bind tighter than brackets.
/// `noLinkOpeners` and `bracketAfter` match cmark. Streaming stays
/// plain. Copy keeps markdown source.
/// v1.81: definition edges that v1.39 still missed. A multi-line
/// label, collapsed whitespace, and first-definition-wins already
/// matched cmark-gfm. A definition still cannot interrupt an open
/// paragraph, including a lazy quote or list continuation
/// (`Foo` then `[bar]: /url`, `> foo` then `[bar]: /url`). A
/// setext underline, heading, rule, fence, or blank line closes
/// that paragraph first. Labels use the Unicode case fold, so
/// `ẞ` / `ß` / `SS` match and `ς` matches `Σ`. A label may be
/// 1000 characters, which is what cmark-gfm accepts. Streaming
/// stays plain. Copy keeps markdown source.
/// v1.91: a label matches the source text, not the parsed inlines.
/// A backslash stays in the label, so `[bar][foo\!]` does not
/// match `[foo!]` and `[foo\bar]` does not match `[foobar]`.
/// `[foo\!]` still matches `[foo\!]`, and the link text parses
/// the escape, so the visible word is `foo!`.
/// v1.92: the edges v1.81 and v1.91 still missed. A pointy
/// destination may be empty (`[foo]: <>`). A title that parses
/// on a later line but is followed by other text ends the
/// definition at the destination, and the link still keeps that
/// title. A definition that is the body of a list item or a
/// blockquote, including a destination or title on the next
/// line, applies to the whole message. A later line in that
/// item or quote that is itself a definition is taken too,
/// including a lazy continuation. The marker stays so an
/// empty item or quote does not disappear. Streaming stays
/// plain. Copy keeps markdown source.
/// Keep in lockstep with `desktop/src/markdownReferenceLink.ts`.
enum MarkdownReferenceLink {
    private struct Target {
        var dest: String
        var title: String?
    }

    private struct Span {
        var start: Int
        var end: Int
    }

    private struct StoredDef {
        var label: String
        var dest: String
        var title: String?
    }

    private struct ParsedDef {
        var label: String
        var dest: String
        var title: String?
        var start: Int
        var end: Int
        var replacement: String = ""
        /// Later definitions in the same container paragraph. First label wins.
        var also: [StoredDef] = []
    }

    private struct Cut {
        var start: Int
        var end: Int
        var text: String
    }

    private struct Bracket {
        var raw: String
        var next: Int
    }

    private struct LineSpan {
        var text: String
        var start: Int
        var end: Int
    }

    /// `completed: false`, or a message with no definition, returns `text`.
    static func resolve(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty || !text.contains("[") { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let chars = Array(src)
        let blocked = protectedRanges(chars)
        let collected = collectDefinitions(chars, blocked: blocked)
        if collected.cuts.isEmpty { return text }
        let stripped = removeRanges(chars, collected.cuts)
        let resolved = applyReferences(stripped, map: collected.map, blocked: protectedRanges(stripped))
        return String(resolved)
    }

    /// v1.74: percent-encode spaces and tabs inside pointy link and
    /// image destinations. Code, fences, indented code, and math stay
    /// literal. `completed: false` returns `text`.
    static func prepareSpacedDestinations(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty || !text.contains("<") { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let chars = Array(src)
        let blocked = prepareBlocked(chars)
        var edits: [(start: Int, end: Int, text: String)] = []
        func pushPointy(_ destAt: Int) {
            if char(chars, destAt) != "<" || rangeAt(destAt, blocked) != nil { return }
            guard let dest = readDestination(chars, destAt) else { return }
            if !dest.dest.contains(" ") && !dest.dest.contains("\t") { return }
            edits.append((destAt, dest.next, "<\(encodeDestination(dest.dest))>"))
        }
        var index = 0
        while index < chars.count {
            if let blockedAt = rangeAt(index, blocked) {
                index = blockedAt.end
                continue
            }
            let image = chars[index] == "!"
                && index + 1 < chars.count
                && chars[index + 1] == "["
                && !isEscaped(chars, index)
            if (chars[index] == "[" || image) && !isEscaped(chars, index) {
                let openBracket = image ? index + 1 : index
                if let bracket = readBracket(chars, openBracket, blocked) {
                    if let paren = skipLinkSpace(chars, bracket.next, blocked), char(chars, paren) == "(" {
                        if let destAt = skipLinkSpace(chars, paren + 1, blocked) {
                            pushPointy(destAt)
                        }
                    }
                    index = bracket.next
                    continue
                }
            }
            index += 1
        }
        for line in lineSpans(chars) {
            if rangeAt(line.start, blocked) != nil { continue }
            guard let parsed = parseDefinition(chars, lineStart: line.start, blocked: blocked) else { continue }
            if !parsed.dest.contains(" ") && !parsed.dest.contains("\t") { continue }
            let prefix = quotePrefixLength(line.text)
            var labelAt = line.start + prefix
            while char(chars, labelAt) == " " && labelAt < line.start + prefix + 4 { labelAt += 1 }
            guard let label = readBracket(chars, labelAt, blocked) else { continue }
            let colon = skipSpTab(chars, label.next)
            if char(chars, colon) != ":" { continue }
            guard let destAt = skipDestWs(chars, colon + 1, blocked) else { continue }
            pushPointy(destAt)
        }
        if edits.isEmpty { return text == src ? text : src }
        edits.sort { $0.start < $1.start }
        var out = ""
        var cursor = 0
        for edit in edits {
            if edit.start < cursor { continue }
            out += slice(chars, cursor, edit.start)
            out += edit.text
            cursor = edit.end
        }
        out += slice(chars, cursor, chars.count)
        return out
    }

    /// Spaces, tabs, backslash, and angle brackets become percent-escapes.
    static func encodeDestination(_ dest: String) -> String {
        var out = ""
        for ch in dest {
            switch ch {
            case " ": out += "%20"
            case "\t": out += "%09"
            case "\\": out += "%5C"
            case "<": out += "%3C"
            case ">": out += "%3E"
            default: out.append(ch)
            }
        }
        return out
    }

    private static let asciiPunct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")

    private static func isAsciiPunct(_ ch: Character) -> Bool {
        asciiPunct.contains(ch)
    }

    private static func collectDefinitions(
        _ chars: [Character],
        blocked: [Span]
    ) -> (map: [String: Target], cuts: [Cut]) {
        let lines = lineSpans(chars)
        let texts = lines.map(\.text)
        let tables = tableLineSet(lines)
        var map: [String: Target] = [:]
        var cuts: [Cut] = []
        var paragraph = false
        var inQuote = false
        var fence: String?
        var inMath = false
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let gate = blockGate(line.text, fence, inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                paragraph = false
                inQuote = false
                i += 1
                continue
            }
            if tables.contains(i) || lineIsFootnoteOwned(lines, i) {
                paragraph = false
                inQuote = false
                i += 1
                continue
            }
            if rangeAt(line.start, blocked) != nil {
                paragraph = true
                i += 1
                continue
            }
            if let htmlEnd = MarkdownList.htmlBlockLineEnd(texts, index: i, paragraphOpen: paragraph),
               htmlEnd > i {
                paragraph = false
                inQuote = false
                i = htmlEnd
                continue
            }
            if isEffectivelyBlank(line.text) {
                paragraph = false
                inQuote = false
                i += 1
                continue
            }
            // An open paragraph keeps a would-be definition as text.
            if paragraph && !closesOpenParagraph(line.text, inQuote: inQuote) {
                if isQuoteLine(line.text) { inQuote = true }
                i += 1
                continue
            }
            let wasParagraph = paragraph
            paragraph = false
            let quoteLine = isQuoteLine(line.text)
            let parsed = parseContainerDefinition(chars, lines, i, blocked)
                ?? parseDefinition(chars, lineStart: line.start, blocked: blocked)
            if let parsed {
                var endLine = i
                while endLine < lines.count && lines[endLine].start < parsed.end { endLine += 1 }
                var bad = false
                if i < endLine {
                    for k in i..<endLine where tables.contains(k) { bad = true }
                }
                if !bad && !overlaps(parsed.start, parsed.end, blocked) {
                    if map[parsed.label] == nil {
                        map[parsed.label] = Target(dest: parsed.dest, title: parsed.title)
                    }
                    for extra in parsed.also where map[extra.label] == nil {
                        map[extra.label] = Target(dest: extra.dest, title: extra.title)
                    }
                    cuts.append(Cut(start: parsed.start, end: parsed.end, text: parsed.replacement))
                    inQuote = quoteLine
                    i = max(endLine, i + 1)
                    continue
                }
            }
            inQuote = quoteLine
            paragraph = opensParagraph(line.text, closedParagraph: wasParagraph)
            i += 1
        }
        return (map, cuts)
    }

    /// True when this line ends an open paragraph. Continuation of a
    /// quote that is already open is not an interrupt.
    private static func closesOpenParagraph(_ line: String, inQuote: Bool) -> Bool {
        let body = inQuote && isQuoteLine(line) ? quoteBody(line) : line
        if isSetextUnderline(body) { return true }
        if MarkdownIndentedCode.isAtxHeadingLine(body) || MarkdownIndentedCode.isThematicBreakLine(body) {
            return true
        }
        if isQuoteLine(line) && !inQuote { return true }
        return listInterrupts(body)
    }

    /// A non-empty remainder starts a paragraph. A heading or rule does not.
    private static func opensParagraph(_ line: String, closedParagraph: Bool) -> Bool {
        if closedParagraph && isSetextUnderline(line) { return false }
        if MarkdownIndentedCode.isAtxHeadingLine(line) || MarkdownIndentedCode.isThematicBreakLine(line) {
            return false
        }
        if leadingIndent(line) >= 4 { return false }
        if isQuoteLine(line) {
            let rest = quoteBody(line)
            if rest.trimmingCharacters(in: .whitespaces).isEmpty { return false }
            return opensParagraph(rest, closedParagraph: false)
        }
        // A footnote definition is its own block. The next unindented
        // line is a sibling, so `[ref]:` after `[^1]: note` still matches.
        if isFootnoteDefinitionLine(line) { return false }
        return true
    }

    private static func isEffectivelyBlank(_ line: String) -> Bool {
        if isBlankLine(line) { return true }
        if !isQuoteLine(line) { return false }
        return quoteBody(line).trimmingCharacters(in: .whitespaces).isEmpty
    }

    private static func isBlankLine(_ line: String) -> Bool {
        for ch in line where ch != " " && ch != "\t" { return false }
        return true
    }

    private static func isQuoteLine(_ line: String) -> Bool {
        let chars = Array(line)
        var i = 0
        while i < chars.count, i < 3, chars[i] == " " { i += 1 }
        return i < chars.count && chars[i] == ">"
    }

    private static func quoteBody(_ line: String) -> String {
        let chars = Array(line)
        let prefix = quotePrefixLength(line)
        if prefix >= chars.count { return "" }
        return String(chars[prefix...])
    }

    /// A bullet with text, or an ordered marker whose digits are `1`
    /// with text, interrupts a paragraph. An empty marker does not.
    private static func listInterrupts(_ line: String) -> Bool {
        let chars = Array(line)
        var i = 0
        while i < chars.count, chars[i] == " ", i < 3 { i += 1 }
        if i < chars.count && chars[i] == "\t" { return false }
        let rest = String(chars[i...])
        if rest.range(of: #"^[-+*][ \t]+\S"#, options: .regularExpression) != nil { return true }
        return rest.range(of: #"^1[.)][ \t]+\S"#, options: .regularExpression) != nil
    }

    private static func leadingIndent(_ line: String) -> Int {
        var columns = 0
        for ch in line {
            if ch == " " {
                columns += 1
                continue
            }
            if ch == "\t" { return columns + 4 - (columns % 4) }
            return columns
        }
        return columns
    }

    /// `=` or `-` underline. A lone `-` is a list item, not an underline.
    private static func isSetextUnderline(_ line: String) -> Bool {
        let chars = Array(line)
        var i = 0
        while i < chars.count, i < 3, chars[i] == " " { i += 1 }
        guard i < chars.count else { return false }
        let ch = chars[i]
        guard ch == "=" || ch == "-" else { return false }
        let start = i
        while i < chars.count, chars[i] == ch { i += 1 }
        let count = i - start
        if ch == "-" && count < 2 { return false }
        var j = i
        while j < chars.count {
            let c = chars[j]
            if c != " " && c != "\t" { return false }
            j += 1
        }
        return true
    }

    private struct Container {
        var quoteDepth: Int
        var listColumn: Int?
        var keep: String
        var content: String
    }

    private struct ParaLine {
        var start: Int
        var end: Int
        var content: String
        var isLazy: Bool
    }

    /// v1.92: a definition that is the body of a blockquote or list item.
    /// Container markers are stripped the way cmark strips them before
    /// the reference scan, then the same definition scan runs. The marker
    /// is put back so an empty item or quote still renders.
    private static func parseContainerDefinition(
        _ chars: [Character],
        _ spans: [LineSpan],
        _ index: Int,
        _ blocked: [Span]
    ) -> ParsedDef? {
        guard index < spans.count else { return nil }
        let span = spans[index]
        if rangeAt(span.start, blocked) != nil { return nil }
        guard let peeled = peelContainers(span.text),
              peeled.content.range(of: #"^ {0,3}\["#, options: .regularExpression) != nil
        else { return nil }
        let openingEnd = spanEnd(span, chars.count)
        if overlaps(span.start, openingEnd, blocked) { return nil }
        var para: [ParaLine] = [
            ParaLine(start: span.start, end: openingEnd, content: peeled.content, isLazy: false)
        ]
        var k = index + 1
        while k < spans.count && para.count < 64 {
            let next = spans[k]
            if rangeAt(next.start, blocked) != nil { break }
            guard let cont = continuationOf(next.text, peeled) else { break }
            para.append(ParaLine(start: next.start, end: spanEnd(next, chars.count), content: cont.content, isLazy: cont.isLazy))
            k += 1
        }
        var norm = ""
        for n in para.indices {
            norm += para[n].content
            let line = para[n]
            let hasNl = line.end > line.start && char(chars, line.end - 1) == "\n"
            if hasNl || n < para.count - 1 { norm += "\n" }
        }
        // A container paragraph can open with several definitions.
        // cmark takes each of them, including a lazy continuation
        // that is itself a definition, and leaves only the text after
        // the last one.
        var found: [StoredDef] = []
        var pos = 0
        let normChars = Array(norm)
        while pos < normChars.count {
            guard let scanned = parseDefinition(Array(normChars[pos...]), lineStart: 0, blocked: []) else { break }
            if scanned.end <= 0 { break }
            found.append(StoredDef(label: scanned.label, dest: scanned.dest, title: scanned.title))
            pos += scanned.end
        }
        if found.isEmpty { return nil }
        let count = consumedLineCount(norm, pos)
        if count < 1 || count > para.count { return nil }
        for n in 0..<count where overlaps(para[n].start, para[n].end, blocked) { return nil }
        let edit = containerEdit(
            chars,
            spans,
            index,
            peeled,
            Array(para.prefix(count)),
            Array(para.dropFirst(count))
        )
        let first = found[0]
        return ParsedDef(
            label: first.label,
            dest: first.dest,
            title: first.title,
            start: span.start,
            end: edit.end,
            replacement: edit.replacement,
            also: Array(found.dropFirst())
        )
    }

    private static func containerEdit(
        _ chars: [Character],
        _ spans: [LineSpan],
        _ index: Int,
        _ peeled: Container,
        _ consumed: [ParaLine],
        _ rest: [ParaLine]
    ) -> (end: Int, replacement: String) {
        func finish(_ end: Int, _ body: String) -> (end: Int, replacement: String) {
            if body.isEmpty { return (end, "") }
            let nl = end > 0 && char(chars, end - 1) == "\n"
            if !nl || body.hasSuffix("\n") { return (end, body) }
            return (end, body + "\n")
        }
        guard let last = consumed.last else { return (spans[index].start, "") }
        var end = last.end
        let hasList = peeled.listColumn != nil
        if !rest.isEmpty && rest.allSatisfy(\.isLazy) {
            let body = rest.map(\.content).joined(separator: "\n")
            return finish(rest[rest.count - 1].end, peeled.keep + body)
        }
        if !rest.isEmpty {
            return finish(end, hasList ? peeled.keep : "")
        }
        if hasList, let listColumn = peeled.listColumn {
            let blankIndex = index + consumed.count
            let afterIndex = blankIndex + 1
            if blankIndex < spans.count, afterIndex < spans.count,
               isBlankLine(spans[blankIndex].text),
               leadingIndent(spans[afterIndex].text) >= listColumn,
               !siblingEndsItem(spans[afterIndex].text, listColumn) {
                end = spanEnd(spans[blankIndex], chars.count)
            }
            return finish(end, peeled.keep)
        }
        if peeled.quoteDepth > 0 && !quoteHasOther(spans, index, consumed.count, peeled.quoteDepth) {
            return finish(end, peeled.keep)
        }
        return finish(end, "")
    }

    private static func quoteHasOther(
        _ spans: [LineSpan],
        _ index: Int,
        _ consumed: Int,
        _ depth: Int
    ) -> Bool {
        if index > 0 {
            for j in stride(from: index - 1, through: 0, by: -1) {
                let text = spans[j].text
                if isBlankLine(text) { break }
                let quote = quoteDepthAndEnd(text)
                if quote.depth < depth { break }
                if !textDrop(text, quote.index).trimmingCharacters(in: .whitespaces).isEmpty { return true }
            }
        }
        var j = index + consumed
        while j < spans.count {
            let text = spans[j]
            if isBlankLine(text.text) { break }
            let quote = quoteDepthAndEnd(text.text)
            if quote.depth < depth {
                if !text.text.trimmingCharacters(in: .whitespaces).isEmpty { return true }
                break
            }
            if !textDrop(text.text, quote.index).trimmingCharacters(in: .whitespaces).isEmpty { return true }
            j += 1
        }
        return false
    }

    private static func textDrop(_ text: String, _ index: Int) -> String {
        let chars = Array(text)
        if index >= chars.count { return "" }
        return String(chars[index...])
    }

    private static func peelContainers(_ line: String) -> Container? {
        let quote = quoteDepthAndEnd(line)
        var i = quote.index
        var col = quote.column
        var listColumn: Int?
        var content = textDrop(line, i)
        let baseColumn = quote.column
        var guardCount = 0
        while guardCount < 6 {
            guardCount += 1
            var markerAt = i
            var markerCol = col
            if listColumn == nil, let skipped = markerIndent(line, i, col) {
                markerAt = skipped.i
                markerCol = skipped.col
            }
            guard let marker = listMarkerAt(line, markerAt, markerCol) else { break }
            if listColumn == nil && marker.markerColumn - baseColumn > 3 { break }
            if let listColumn, marker.markerColumn < listColumn { break }
            listColumn = marker.contentColumn
            i = marker.contentIndex
            col = marker.contentColumn
            content = marker.text
        }
        if quote.depth == 0 && listColumn == nil { return nil }
        let keep = line.hasSuffix(content) ? String(line.dropLast(content.count)) : textTake(line, i)
        return Container(quoteDepth: quote.depth, listColumn: listColumn, keep: keep, content: content)
    }

    private static func textTake(_ text: String, _ count: Int) -> String {
        let chars = Array(text)
        if count <= 0 { return "" }
        return String(chars.prefix(count))
    }

    /// Up to three spaces before a list marker. Four spaces stay text.
    private static func markerIndent(_ line: String, _ index: Int, _ column: Int) -> (i: Int, col: Int)? {
        let chars = Array(line)
        var j = index
        var c = column
        var spaces = 0
        while j < chars.count && chars[j] == " " && spaces < 3 {
            j += 1
            c += 1
            spaces += 1
        }
        if j == index || j >= chars.count { return nil }
        let ch = chars[j]
        if ch == "-" || ch == "+" || ch == "*" || (ch >= "0" && ch <= "9") { return (j, c) }
        return nil
    }

    private static func continuationOf(
        _ line: String,
        _ container: Container
    ) -> (content: String, isLazy: Bool)? {
        if isBlankLine(line) { return nil }
        let quote = quoteDepthAndEnd(line)
        if quote.depth < container.quoteDepth {
            if quote.depth == 0 && !interruptsParagraph(line) { return (line, true) }
            return nil
        }
        if quote.depth > container.quoteDepth { return nil }
        var i = quote.index
        var col = quote.column
        if container.listColumn == nil {
            let rest = textDrop(line, i)
            if rest.trimmingCharacters(in: .whitespaces).isEmpty || interruptsParagraph(rest) { return nil }
            return (rest, false)
        }
        let listColumn = container.listColumn ?? 0
        if col >= listColumn {
            let rest = textDrop(line, i)
            if col == listColumn && (rest.trimmingCharacters(in: .whitespaces).isEmpty || interruptsParagraph(rest)) {
                return nil
            }
            if col > listColumn && interruptsParagraph(rest) { return nil }
            if col == listColumn { return (rest, false) }
            return (rest, false)
        }
        let chars = Array(line)
        while col < listColumn && i < chars.count {
            let ch = chars[i]
            if ch == " " {
                i += 1
                col += 1
                continue
            }
            if ch == "\t" {
                let width = 4 - (col % 4)
                if col + width > listColumn {
                    let content = String(repeating: " ", count: col + width - listColumn) + textDrop(line, i + 1)
                    if interruptsParagraph(content) { return nil }
                    return (content, false)
                }
                col += width
                i += 1
                continue
            }
            break
        }
        if col < listColumn {
            let rest = textDrop(line, i)
            if interruptsParagraph(rest) || listMarkerAt(line, i, col) != nil { return nil }
            return (rest, true)
        }
        let content = textDrop(line, i)
        if content.trimmingCharacters(in: .whitespaces).isEmpty || interruptsParagraph(content) { return nil }
        return (content, false)
    }

    private static func interruptsParagraph(_ line: String) -> Bool {
        if isBlankLine(line) { return false }
        let lead = leadingIndent(line)
        if lead >= 4 { return false }
        let chars = Array(line)
        var i = 0
        var col = 0
        while i < chars.count && col < lead {
            let ch = chars[i]
            if ch == " " {
                i += 1
                col += 1
                continue
            }
            if ch == "\t" {
                col += 4 - (col % 4)
                i += 1
                continue
            }
            break
        }
        let rest = textDrop(line, i)
        if MarkdownIndentedCode.isAtxHeadingLine(rest) || MarkdownIndentedCode.isThematicBreakLine(rest) || isSetextUnderline(rest) {
            return true
        }
        if rest.range(of: #"^(`{3,}|~{3,})"#, options: .regularExpression) != nil {
            if rest.hasPrefix("`") {
                let marker = rest.prefix { $0 == "`" }
                let info = rest.dropFirst(marker.count)
                if info.contains("`") { return false }
            }
            return true
        }
        if MarkdownList.htmlBlockLineEnd([rest], index: 0, paragraphOpen: true) != nil { return true }
        return listMarkerAt(line, i, col) != nil
    }

    private static func siblingEndsItem(_ line: String, _ listColumn: Int) -> Bool {
        let lead = leadingIndent(line)
        if lead > 3 { return false }
        let chars = Array(line)
        var i = 0
        var col = 0
        while i < chars.count && col < lead {
            let ch = chars[i]
            if ch == " " {
                i += 1
                col += 1
                continue
            }
            if ch == "\t" {
                col += 4 - (col % 4)
                i += 1
                continue
            }
            break
        }
        guard let marker = listMarkerAt(line, i, col) else { return false }
        return marker.markerColumn < listColumn
    }

    private static func listMarkerAt(
        _ line: String,
        _ index: Int,
        _ column: Int
    ) -> (markerColumn: Int, contentColumn: Int, contentIndex: Int, text: String)? {
        let chars = Array(line)
        if index > chars.count { return nil }
        let rest = textDrop(line, index)
        if MarkdownIndentedCode.isThematicBreakLine(column == 0 ? line : rest) { return nil }
        let restChars = Array(rest)
        var token = ""
        if let first = restChars.first, first == "-" || first == "+" || first == "*" {
            token = String(first)
        } else {
            var n = 0
            while n < restChars.count && n < 9 && restChars[n] >= "0" && restChars[n] <= "9" { n += 1 }
            if n == 0 || n >= restChars.count { return nil }
            let delim = restChars[n]
            if delim != "." && delim != ")" { return nil }
            token = String(restChars[0...n])
        }
        if token.isEmpty { return nil }
        let after = index + token.count
        if after < chars.count && chars[after] != " " && chars[after] != "\t" { return nil }
        guard let markerIndex = line.index(line.startIndex, offsetBy: after, limitedBy: line.endIndex) else { return nil }
        let padded = MarkdownList.listMarkerPadding(line, markerIndex: markerIndex, markerColumn: column + token.count)
        var contentIndex = chars.count
        if !padded.text.isEmpty {
            if line.hasSuffix(padded.text) {
                contentIndex = chars.count - Array(padded.text).count
            } else {
                let trimmed = padded.text.drop { $0 == " " }
                if !trimmed.isEmpty && line.hasSuffix(trimmed) {
                    contentIndex = chars.count - Array(trimmed).count
                }
            }
        }
        return (column, padded.contentColumn, contentIndex, padded.text)
    }

    private static func quoteDepthAndEnd(_ line: String) -> (depth: Int, index: Int, column: Int) {
        let chars = Array(line)
        var i = 0
        var col = 0
        var depth = 0
        while i < chars.count {
            var spaces = 0
            var j = i
            var c = col
            while j < chars.count && chars[j] == " " && spaces < 3 {
                j += 1
                c += 1
                spaces += 1
            }
            if j >= chars.count || chars[j] != ">" { break }
            depth += 1
            j += 1
            c += 1
            if j < chars.count && chars[j] == " " {
                j += 1
                c += 1
            }
            i = j
            col = c
        }
        return (depth, i, col)
    }

    private static func consumedLineCount(_ norm: String, _ end: Int) -> Int {
        let chars = Array(norm)
        var newlines = 0
        let stop = min(end, chars.count)
        if stop > 0 {
            for i in 0..<stop where chars[i] == "\n" { newlines += 1 }
        }
        if end >= chars.count && (chars.isEmpty || chars[chars.count - 1] != "\n") { return newlines + 1 }
        return newlines
    }

    private static func spanEnd(_ span: LineSpan, _ srcLen: Int) -> Int {
        span.end < srcLen ? span.end + 1 : span.end
    }

    private static func parseDefinition(
        _ chars: [Character],
        lineStart: Int,
        blocked: [Span]
    ) -> ParsedDef? {
        let eol = lineEnd(chars, lineStart)
        let line = slice(chars, lineStart, eol)
        let prefix = quotePrefixLength(line)
        var i = lineStart + prefix
        var spaces = 0
        while char(chars, i) == " " && spaces < 4 {
            spaces += 1
            i += 1
        }
        if spaces >= 4 || char(chars, i) == "\t" { return nil }
        if char(chars, i) != "[" || isEscaped(chars, i) { return nil }
        if rangeAt(i, blocked) != nil { return nil }
        guard let bracket = readBracket(chars, i, blocked),
              validLabel(bracket.raw),
              !isFootnoteLabel(bracket.raw)
        else { return nil }
        var j = skipSpTab(chars, bracket.next)
        if char(chars, j) != ":" { return nil }
        j += 1
        guard let destAt = skipDestWs(chars, j, blocked),
              let dest = readDestination(chars, destAt)
        else { return nil }
        j = dest.next
        let beforeTitle = j
        var title: String?
        let titled = tryTitle(chars, j, blocked)
        if let titled {
            title = titled.title
            j = titled.next
        }
        var endAt = skipSpTab(chars, j)
        let atLineEnd = endAt >= chars.count || char(chars, endAt) == "\n"
        if !atLineEnd {
            // A title on the same line that does not end the line rejects
            // the whole definition. A title on a later line is kept, and
            // the definition ends at the destination.
            guard titled != nil, let opener = skipDestWs(chars, beforeTitle, blocked) else { return nil }
            if !slice(chars, beforeTitle, opener).contains("\n") { return nil }
            endAt = skipSpTab(chars, beforeTitle)
            if endAt < chars.count && char(chars, endAt) != "\n" { return nil }
        }
        let end = endAt < chars.count ? endAt + 1 : endAt
        let lineLimit = eol < chars.count ? eol + 1 : eol
        if prefix > 0 && end > lineLimit { return nil }
        return ParsedDef(
            label: normalizeLabel(bracket.raw),
            dest: dest.dest,
            title: title,
            start: lineStart,
            end: end
        )
    }

    /// v1.76: walk brackets the way cmark does. The nearest `[` is the
    /// only candidate for a `]`. A matched link (not an image) sets
    /// `noLinkOpeners`, so an outer `[` cannot contain that link.
    /// Balanced brackets that are not themselves links stay in the text.
    /// Code spans, autolinks, and raw HTML are skipped, so a `]` inside
    /// them does not close a link. `bracketAfter` blocks a shortcut when
    /// a nested bracket was seen.
    private static func applyReferences(
        _ chars: [Character],
        map: [String: Target],
        blocked: [Span]
    ) -> [Character] {
        struct Opener {
            var index: Int
            var image: Bool
            var bracketAfter: Bool
        }
        struct Edit {
            var start: Int
            var end: Int
            var text: String
        }
        var edits: [Edit] = []
        var stack: [Opener] = []
        var noLinkOpeners = false

        func sliceResolved(_ start: Int, _ end: Int) -> String {
            var out = ""
            var cursor = start
            for edit in edits {
                if edit.start < cursor || edit.end > end || edit.start >= end { continue }
                out += slice(chars, cursor, edit.start)
                out += edit.text
                cursor = edit.end
            }
            out += slice(chars, cursor, end)
            return out
        }

        func absorb(_ start: Int, _ end: Int, _ text: String) {
            edits.removeAll { $0.start >= start && $0.end <= end }
            edits.append(Edit(start: start, end: end, text: text))
        }

        func pushOpener(_ index: Int, _ image: Bool) {
            if !stack.isEmpty {
                stack[stack.count - 1].bracketAfter = true
            }
            stack.append(Opener(index: index, image: image, bracketAfter: false))
            if !image { noLinkOpeners = false }
        }

        var i = 0
        while i < chars.count {
            if let blockedAt = rangeAt(i, blocked) {
                if isBlockRange(chars, blockedAt) {
                    stack.removeAll()
                    noLinkOpeners = false
                }
                i = blockedAt.end
                continue
            }
            if char(chars, i) == "\n" && char(chars, i + 1) == "\n" {
                stack.removeAll()
                noLinkOpeners = false
                i += 2
                continue
            }
            if char(chars, i) == "\\", let next = char(chars, i + 1), isAsciiPunct(next) {
                i += 2
                continue
            }
            if char(chars, i) == "<" && !isEscaped(chars, i) {
                if let auto = autolinkEnd(chars, i) {
                    i = auto
                    continue
                }
                if let html = MarkdownHtmlLiteral.htmlTagEnd(chars, i), html > i {
                    i = html
                    continue
                }
            }
            if char(chars, i) == "!" && char(chars, i + 1) == "[" && !isEscaped(chars, i) {
                pushOpener(i + 1, true)
                i += 2
                continue
            }
            if char(chars, i) == "[" && !isEscaped(chars, i) {
                if let footnoteEnd = footnoteBracketEnd(chars, i) {
                    i = footnoteEnd
                    continue
                }
                if isTaskMarker(chars, i) {
                    i += 3
                    continue
                }
                pushOpener(i, false)
                i += 1
                continue
            }
            if char(chars, i) != "]" || isEscaped(chars, i) {
                i += 1
                continue
            }
            guard let opener = stack.popLast() else {
                i += 1
                continue
            }
            if !opener.image && noLinkOpeners {
                i += 1
                continue
            }
            guard let matched = matchCloser(
                chars,
                opener.index,
                opener.bracketAfter,
                i,
                blocked,
                map
            ) else {
                i += 1
                continue
            }
            if matched.kind == "ref", let target = matched.target {
                let text = sliceResolved(opener.index + 1, i)
                let start = opener.image ? opener.index - 1 : opener.index
                absorb(start, matched.end, emitLink(text, target, opener.image))
            }
            if !opener.image { noLinkOpeners = true }
            i = matched.end
        }

        if edits.isEmpty { return chars }
        edits.sort { lhs, rhs in
            lhs.start < rhs.start || (lhs.start == rhs.start && lhs.end < rhs.end)
        }
        var out: [Character] = []
        var cursor = 0
        for edit in edits {
            if edit.start < cursor { continue }
            if cursor < edit.start { out.append(contentsOf: chars[cursor..<edit.start]) }
            out.append(contentsOf: Array(edit.text))
            cursor = edit.end
        }
        if cursor < chars.count { out.append(contentsOf: chars[cursor...]) }
        return out
    }

    private struct CloserMatch {
        var kind: String
        var end: Int
        var target: Target?
    }

    private static func matchCloser(
        _ chars: [Character],
        _ openerIndex: Int,
        _ bracketAfter: Bool,
        _ close: Int,
        _ blocked: [Span],
        _ map: [String: Target]
    ) -> CloserMatch? {
        let after = close + 1
        if char(chars, after) == "(" {
            if let inlineEnd = matchInline(chars, after, blocked) {
                return CloserMatch(kind: "inline", end: inlineEnd, target: nil)
            }
        }
        if char(chars, after) == "[" {
            if let label = linkLabel(chars, after) {
                if label.raw.isEmpty {
                    if bracketAfter { return nil }
                    let text = slice(chars, openerIndex + 1, close)
                    guard let target = lookupLabel(map, text) else { return nil }
                    return CloserMatch(kind: "ref", end: label.next, target: target)
                }
                guard let target = lookupLabel(map, label.raw) else { return nil }
                return CloserMatch(kind: "ref", end: label.next, target: target)
            }
        }
        if bracketAfter { return nil }
        let text = slice(chars, openerIndex + 1, close)
        if !validLabel(text) || isFootnoteLabel(text) { return nil }
        guard let target = lookupLabel(map, text) else { return nil }
        return CloserMatch(kind: "ref", end: after, target: target)
    }

    /// Inline `(dest)`, including an empty `()` or `<>`.
    private static func matchInline(_ chars: [Character], _ openParen: Int, _ blocked: [Span]) -> Int? {
        if char(chars, openParen) != "(" { return nil }
        guard let destAt = skipLinkSpace(chars, openParen + 1, blocked) else { return nil }
        var afterDest: Int
        if char(chars, destAt) == ")" { return destAt + 1 }
        if char(chars, destAt) == "<" && char(chars, destAt + 1) == ">" {
            afterDest = destAt + 2
        } else {
            guard let dest = readDestination(chars, destAt) else { return nil }
            afterDest = dest.next
        }
        var cursor = afterDest
        if let titleAt = skipLinkSpace(chars, cursor, blocked),
           titleAt != cursor,
           let mark = char(chars, titleAt),
           mark == "\"" || mark == "'" || mark == "("
        {
            guard let title = MarkdownLinkTitleForm.read(chars, titleAt) else { return nil }
            cursor = title.next
        } else if let titleAt = skipLinkSpace(chars, cursor, blocked) {
            cursor = titleAt
        }
        guard let close = skipLinkSpace(chars, cursor, blocked), char(chars, close) == ")" else { return nil }
        return close + 1
    }

    /// A link label. `[]` is collapsed. Longer than 1000 fails.
    /// cmark-gfm accepts 1000 characters inside the brackets.
    private static func linkLabel(_ chars: [Character], _ open: Int) -> (raw: String, next: Int)? {
        guard char(chars, open) == "[" else { return nil }
        var i = open + 1
        var raw = ""
        while i < chars.count {
            let ch = chars[i]
            if ch == "[" || ch == "]" { break }
            if ch == "\\", i + 1 < chars.count {
                raw.append(ch)
                raw.append(chars[i + 1])
                i += 2
            } else {
                raw.append(ch)
                i += 1
            }
            if raw.count > 1000 { return nil }
        }
        guard i < chars.count, chars[i] == "]" else { return nil }
        return (raw, i + 1)
    }

    /// End index of a CommonMark autolink starting at `<`, or nil.
    private static func autolinkEnd(_ chars: [Character], _ start: Int) -> Int? {
        guard char(chars, start) == "<" else { return nil }
        var j = start + 1
        while j < chars.count {
            let ch = chars[j]
            if ch == ">" { break }
            if ch == "<" || isAutolinkStop(ch) { return nil }
            j += 1
        }
        guard j < chars.count, chars[j] == ">" else { return nil }
        let inner = slice(chars, start + 1, j)
        if inner.isEmpty { return nil }
        if !isSchemeAutolink(inner) && !WebLinks.emailAddress(inner) { return nil }
        return j + 1
    }

    private static func isAutolinkStop(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return true }
        return scalar.value <= 32 || scalar.value == 127
    }

    private static func isSchemeAutolink(_ text: String) -> Bool {
        let chars = Array(text)
        guard chars.count >= 3, isAsciiLetter(chars[0]) else { return false }
        var index = 1
        while index < chars.count && index < 32 && isSchemeChar(chars[index]) {
            index += 1
        }
        return index >= 2 && index < chars.count && chars[index] == ":"
    }

    private static func isAsciiLetter(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "A" && scalar <= "Z") || (scalar >= "a" && scalar <= "z")
    }

    private static func isSchemeChar(_ ch: Character) -> Bool {
        if isAsciiLetter(ch) { return true }
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "0" && scalar <= "9") || ch == "+" || ch == "." || ch == "-"
    }

    /// A fence, indented code, or math block. An inline code span is not one.
    private static func isBlockRange(_ chars: [Character], _ range: Span) -> Bool {
        var hasNewline = false
        var index = range.start
        while index < range.end && index < chars.count {
            if chars[index] == "\n" {
                hasNewline = true
                break
            }
            index += 1
        }
        if !hasNewline { return false }
        var line = range.start
        while line > 0 && chars[line - 1] != "\n" { line -= 1 }
        let prefix = slice(chars, line, range.start)
        return prefix.count <= 3 && prefix.allSatisfy { $0 == " " }
    }

    private static func readDestination(_ chars: [Character], _ i: Int) -> (dest: String, next: Int)? {
        if i >= chars.count { return nil }
        if char(chars, i) == "<" {
            var j = i + 1
            var out = ""
            while j < chars.count {
                let ch = chars[j]
                // v1.74: spaces and tabs stay. A backslash escapes punctuation only.
                if ch == "\n" || ch == "<" { return nil }
                if ch == "\\", j + 1 < chars.count, isAsciiPunct(chars[j + 1]) {
                    out.append(chars[j + 1])
                    j += 2
                    continue
                }
                if ch == ">" {
                    // v1.92: `<>` is an empty destination. A non-empty one is unchanged.
                    return (out, j + 1)
                }
                out.append(ch)
                j += 1
            }
            return nil
        }
        var j = i
        var out = ""
        var depth = 0
        while j < chars.count {
            let ch = chars[j]
            // v1.79: a backslash escapes ASCII punctuation only.
            if ch == "\\" {
                if j + 1 < chars.count, isAsciiPunct(chars[j + 1]) {
                    out.append(chars[j + 1])
                    j += 2
                    continue
                }
                out.append(ch)
                j += 1
                continue
            }
            if ch == " " || ch == "\t" || ch == "\n" || ch == "\r" { break }
            if ch.asciiValue.map({ $0 < 32 }) == true { break }
            if ch == "(" {
                depth += 1
                out.append(ch)
                j += 1
                continue
            }
            if ch == ")" {
                if depth == 0 { break }
                depth -= 1
                out.append(ch)
                j += 1
                continue
            }
            out.append(ch)
            j += 1
        }
        if out.isEmpty || depth != 0 { return nil }
        return (out, j)
    }

    private static func tryTitle(
        _ chars: [Character],
        _ i: Int,
        _ blocked: [Span]
    ) -> (title: String, next: Int)? {
        guard let at = skipDestWs(chars, i, blocked), at != i else { return nil }
        let opener = char(chars, at)
        if opener != "\"" && opener != "'" && opener != "(" { return nil }
        guard let read = MarkdownLinkTitleForm.read(chars, at) else { return nil }
        return (MarkdownLinkTitleForm.hint(read.raw), read.next)
    }

    private static func emitLink(_ text: String, _ target: Target, _ image: Bool) -> String {
        let dest = formatDest(target.dest)
        // An empty destination with a title needs `<>`, or the title
        // quote is read as the destination.
        let href = target.dest.isEmpty && target.title != nil ? "<>" : dest
        let body: String
        if let title = target.title {
            body = "[\(text)](\(href) \"\(MarkdownLinkTitleForm.format(title))\")"
        } else {
            body = "[\(text)](\(href))"
        }
        return image ? "!" + body : body
    }

    private static func formatDest(_ dest: String) -> String {
        let needs = dest.contains { ch in
            ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "<" || ch == ">" || ch == "(" || ch == ")"
        }
        if !needs { return dest }
        let safe = dest.replacingOccurrences(of: "<", with: "%3C").replacingOccurrences(of: ">", with: "%3E")
        return "<" + safe + ">"
    }

    /// Spaces, tabs, and at most one newline. CommonMark link spacing.
    private static func skipLinkSpace(_ chars: [Character], _ start: Int, _ blocked: [Span]) -> Int? {
        var index = start
        var newline = false
        while index < chars.count {
            if rangeAt(index, blocked) != nil { return nil }
            let ch = chars[index]
            if ch == " " || ch == "\t" {
                index += 1
                continue
            }
            if ch == "\n" && !newline {
                newline = true
                index += 1
                continue
            }
            break
        }
        return index
    }

    private static func skipDestWs(_ chars: [Character], _ i: Int, _ blocked: [Span]) -> Int? {
        var j = i
        while char(chars, j) == " " || char(chars, j) == "\t" { j += 1 }
        if char(chars, j) != "\n" { return j }
        let nextLine = j + 1
        if nextLine >= chars.count || char(chars, nextLine) == "\n" { return nil }
        if rangeAt(nextLine, blocked) != nil { return nil }
        var k = nextLine
        while char(chars, k) == " " || char(chars, k) == "\t" { k += 1 }
        if k >= chars.count || char(chars, k) == "\n" { return nil }
        return k
    }

    private static func skipSpTab(_ chars: [Character], _ i: Int) -> Int {
        var j = i
        while char(chars, j) == " " || char(chars, j) == "\t" { j += 1 }
        return j
    }

    private static func validLabel(_ raw: String) -> Bool {
        let chars = Array(raw)
        if chars.isEmpty || chars.count > 1000 { return false }
        var has = false
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            if ch == "\\" && i + 1 < chars.count {
                has = true
                i += 2
                continue
            }
            if ch == "[" || ch == "]" { return false }
            if ch != " " && ch != "\t" && ch != "\n" && ch != "\r" { has = true }
            i += 1
        }
        return has
    }

    private static func isFootnoteDefinitionLine(_ line: String) -> Bool {
        line.range(of: #"^ {0,3}\[\^[A-Za-z0-9_-]+\]:"#, options: .regularExpression) != nil
    }

    private static func isFootnoteLabel(_ raw: String) -> Bool {
        let chars = Array(raw)
        if chars.count < 2 || chars[0] != "^" { return false }
        for ch in chars.dropFirst() {
            if !isFootnoteChar(ch) { return false }
        }
        return true
    }

    private static func isFootnoteChar(_ ch: Character) -> Bool {
        guard let value = ch.asciiValue else { return false }
        return (value >= 65 && value <= 90) || (value >= 97 && value <= 122)
            || (value >= 48 && value <= 57) || ch == "_" || ch == "-"
    }

    private static func footnoteBracketEnd(_ chars: [Character], _ open: Int) -> Int? {
        if char(chars, open) != "[" || char(chars, open + 1) != "^" || isEscaped(chars, open) { return nil }
        var j = open + 2
        if !isFootnoteChar(char(chars, j) ?? " ") { return nil }
        while j < chars.count && isFootnoteChar(chars[j]) { j += 1 }
        if char(chars, j) != "]" { return nil }
        return j + 1
    }

    /// v1.91: cmark folds case and whitespace only. `foo\!` is not `foo!`.
    private static func normalizeLabel(_ raw: String) -> String {
        let folded = MarkdownCaseFold.fold(raw)
        let parts = folded.split { $0.isWhitespace }.map(String.init)
        return parts.joined(separator: " ")
    }

    private static func isTaskMarker(_ chars: [Character], _ open: Int) -> Bool {
        var lineStart = open
        while lineStart > 0 && chars[lineStart - 1] != "\n" { lineStart -= 1 }
        let prefix = slice(chars, lineStart, open)
        let rest = String(prefix.dropFirst(quotePrefixLength(prefix)))
        let restChars = Array(rest)
        var i = 0
        var spaces = 0
        while i < restChars.count && restChars[i] == " " && spaces < 4 {
            i += 1
            spaces += 1
        }
        if spaces > 3 || i >= restChars.count { return false }
        let marker = restChars[i]
        if marker != "-" && marker != "*" && marker != "+" { return false }
        i += 1
        if i >= restChars.count || (restChars[i] != " " && restChars[i] != "\t") { return false }
        while i < restChars.count && (restChars[i] == " " || restChars[i] == "\t") { i += 1 }
        if i != restChars.count { return false }
        let mark = char(chars, open + 1)
        if mark != " " && mark != "x" && mark != "X" { return false }
        if char(chars, open + 2) != "]" { return false }
        if open + 3 >= chars.count { return true }
        let after = chars[open + 3]
        return after == " " || after == "\t" || after == "\n"
    }

    private static func quotePrefixLength(_ line: String) -> Int {
        let chars = Array(line)
        var i = 0
        while i < chars.count {
            var j = i
            var spaces = 0
            while j < chars.count && chars[j] == " " && spaces < 3 {
                j += 1
                spaces += 1
            }
            if j >= chars.count || chars[j] != ">" { break }
            j += 1
            if j < chars.count && chars[j] == " " { j += 1 }
            i = j
        }
        return i
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

    private static func prepareBlocked(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        let indented = indentedCodeRanges(chars, fences)
        let skip = fences + codes + indented
        return mergeRanges(skip + mathRanges(chars, skip))
    }

    private static func indentedCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var inCode = false
        var codeStart = 0
        var prevBlank = true
        for line in lineSpans(chars) {
            let inFence = fences.contains { line.start >= $0.start && line.start < $0.end }
            if inFence {
                if inCode {
                    ranges.append(Span(start: codeStart, end: line.start))
                    inCode = false
                }
                prevBlank = false
                continue
            }
            let indent = contentIndent(line.text)
            let blank = indent == nil
            if inCode, let indent, indent < 4 {
                ranges.append(Span(start: codeStart, end: line.start))
                inCode = false
            }
            if !inCode, prevBlank, let indent, indent >= 4 {
                inCode = true
                codeStart = line.start
            }
            prevBlank = blank
        }
        if inCode { ranges.append(Span(start: codeStart, end: chars.count)) }
        return ranges
    }

    private static func contentIndent(_ line: String) -> Int? {
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

    private static func protectedRanges(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        return mergeRanges(fences + codes + mathRanges(chars, fences + codes))
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var open: (marker: String, start: Int)?
        var i = 0
        while i <= chars.count {
            let end = lineEnd(chars, i)
            let line = slice(chars, i, end)
            if let fence = fenceOpen(line) {
                if open == nil {
                    open = (fence.marker, i)
                } else if let current = open,
                          fence.marker.first == current.marker.first,
                          fence.marker.count >= current.marker.count,
                          fence.info.trimmingCharacters(in: .whitespaces).isEmpty
                {
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

    private static func fenceOpen(_ line: String) -> (marker: String, info: String)? {
        let chars = Array(line)
        var i = 0
        var spaces = 0
        while i < chars.count && chars[i] == " " && spaces < 4 {
            i += 1
            spaces += 1
        }
        if spaces > 3 || i >= chars.count { return nil }
        let mark = chars[i]
        if mark != "`" && mark != "~" { return nil }
        var count = 0
        while i < chars.count && chars[i] == mark {
            count += 1
            i += 1
        }
        if count < 3 { return nil }
        return (String(repeating: String(mark), count: count), String(chars[i...]))
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

    private static func mathRanges(_ chars: [Character], _ skip: [Span]) -> [Span] {
        var ranges: [Span] = []
        let lines = lineSpans(chars)
        var open: Int?
        for line in lines {
            if rangeAt(line.start, skip) != nil {
                open = nil
                continue
            }
            let trimmed = line.text.trimmingCharacters(in: .whitespaces)
            if trimmed == "$$" {
                if open == nil {
                    open = line.start
                } else if let start = open {
                    let end = line.end < chars.count ? line.end + 1 : line.end
                    ranges.append(Span(start: start, end: end))
                    open = nil
                }
                continue
            }
            if open == nil && trimmed.hasPrefix("$$") && trimmed.hasSuffix("$$") && trimmed.count > 4 {
                let end = line.end < chars.count ? line.end + 1 : line.end
                ranges.append(Span(start: line.start, end: end))
            }
        }
        if let start = open {
            ranges.append(Span(start: start, end: chars.count))
        }
        var i = 0
        while i < chars.count {
            if rangeAt(i, skip) != nil || rangeAt(i, ranges) != nil {
                i += 1
                continue
            }
            if char(chars, i) != "\\" || char(chars, i + 1) != "(" {
                i += 1
                continue
            }
            var j = i + 2
            var closed = -1
            while j < chars.count - 1 {
                if rangeAt(j, skip) != nil {
                    j += 1
                    continue
                }
                if chars[j] == "\\" && chars[j + 1] == ")" {
                    closed = j
                    break
                }
                j += 1
            }
            if closed >= 0 {
                ranges.append(Span(start: i, end: closed + 2))
                i = closed + 2
                continue
            }
            ranges.append(Span(start: i, end: chars.count))
            break
        }
        return ranges
    }

    private static func tableLineSet(_ lines: [LineSpan]) -> Set<Int> {
        var inTable = Set<Int>()
        var fence: String?
        var inMath = false
        var i = 0
        while i < lines.count {
            let gate = blockGate(lines[i].text, fence, inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                i += 1
                continue
            }
            let end = tableEnd(lines, i)
            if end > i {
                for k in i..<end { inTable.insert(k) }
                i = end
                continue
            }
            i += 1
        }
        return inTable
    }

    private static func tableEnd(_ lines: [LineSpan], _ start: Int) -> Int {
        MarkdownTable.lineEnd(lines.map(\.text), start: start)
    }

    private static func blockGate(
        _ line: String,
        _ fence: String?,
        _ inMath: Bool
    ) -> (fence: String?, inMath: Bool, blocked: Bool) {
        if !inMath, let match = fenceOpen(line) {
            if fence == nil { return (match.marker, inMath, true) }
            let same = match.marker.first == fence?.first
                && match.marker.count >= (fence?.count ?? 0)
                && match.info.trimmingCharacters(in: .whitespaces).isEmpty
            return (same ? nil : fence, inMath, true)
        }
        if fence != nil { return (fence, inMath, true) }
        if line.trimmingCharacters(in: .whitespaces) == "$$" { return (fence, !inMath, true) }
        if inMath { return (fence, inMath, true) }
        return (fence, inMath, false)
    }

    private static func lineIsFootnoteOwned(_ lines: [LineSpan], _ index: Int) -> Bool {
        if indentColumns(lines[index].text) < 1 { return false }
        if index == 0 { return false }
        for j in stride(from: index - 1, through: 0, by: -1) {
            let text = lines[j].text
            if text.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            if text.range(of: #"^ {0,3}\[\^[A-Za-z0-9_-]+\]:"#, options: .regularExpression) != nil {
                return true
            }
            if indentColumns(text) >= 2 { continue }
            return false
        }
        return false
    }

    private static func indentColumns(_ line: String) -> Int {
        var columns = 0
        for ch in line {
            if ch == " " { columns += 1 }
            else if ch == "\t" { columns += 4 }
            else { break }
        }
        return columns
    }

    private static func overlaps(_ start: Int, _ end: Int, _ ranges: [Span]) -> Bool {
        ranges.contains { start < $0.end && end > $0.start }
    }

    private static func rangeAt(_ index: Int, _ ranges: [Span]) -> Span? {
        ranges.first { index >= $0.start && index < $0.end }
    }

    private static func mergeRanges(_ ranges: [Span]) -> [Span] {
        let sorted = ranges.filter { $0.end > $0.start }.sorted {
            $0.start == $1.start ? $0.end < $1.end : $0.start < $1.start
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

    private static func removeRanges(_ chars: [Character], _ cuts: [Cut]) -> [Character] {
        let sorted = cuts.sorted { lhs, rhs in
            lhs.start < rhs.start || (lhs.start == rhs.start && lhs.end < rhs.end)
        }
        var out: [Character] = []
        var cursor = 0
        for cut in sorted {
            if cut.start < cursor { continue }
            if cut.start > cursor { out.append(contentsOf: chars[cursor..<cut.start]) }
            out.append(contentsOf: Array(cut.text))
            cursor = max(cursor, cut.end)
        }
        if cursor < chars.count { out.append(contentsOf: chars[cursor...]) }
        return out
    }

    private static func lineSpans(_ chars: [Character]) -> [LineSpan] {
        var spans: [LineSpan] = []
        var i = 0
        while i <= chars.count {
            let end = lineEnd(chars, i)
            spans.append(LineSpan(text: slice(chars, i, end), start: i, end: end))
            if end >= chars.count { break }
            i = end + 1
        }
        return spans
    }

    private static func lineEnd(_ chars: [Character], _ index: Int) -> Int {
        var i = index
        while i < chars.count && chars[i] != "\n" { i += 1 }
        return i
    }

    private static func char(_ chars: [Character], _ index: Int) -> Character? {
        index >= 0 && index < chars.count ? chars[index] : nil
    }

    private static func slice(_ chars: [Character], _ start: Int, _ end: Int) -> String {
        let lo = max(0, min(start, chars.count))
        let hi = max(lo, min(end, chars.count))
        if lo >= hi { return "" }
        return String(chars[lo..<hi])
    }
}
