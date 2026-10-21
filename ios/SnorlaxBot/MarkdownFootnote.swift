// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.38: GFM footnotes on a completed assistant LEFT `kind=message`.
///
/// A reference `[^1]` (or `[^note]`) becomes a superscript marker.
/// The matching definition `[^1]: note text` leaves the body and is
/// listed, muted and numbered, at the end of the message. Numbering
/// follows the first reference. Unmatched references and definitions
/// stay plain text. Fences, inline code, and math stay literal.
/// Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source — this type does not write the
/// pasteboard. Tapping a marker presents the note. http(s) links still
/// open through the existing link path. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownFootnote.ts`.
enum MarkdownFootnote {
    static let title = "Footnotes"
    static let showLabel = "Show footnote"

    struct Note: Identifiable, Equatable, Hashable {
        var label: String
        var number: Int
        var text: String
        var id: Int { number }
    }

    struct Prepared: Equatable {
        var text: String
        var notes: [Note]
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    static func refLabel(_ number: Int) -> String { "Footnote \(number)" }

    static func backLabel(_ number: Int) -> String { "Back to reference \(number)" }

    static func token(_ number: Int) -> String { "§§SBFN\(number)§§" }

    /// Visible note text. Tokens become their numbers.
    static func plain(_ text: String) -> String {
        text.replacingOccurrences(
            of: #"§§SBFN(\d+)§§"#,
            with: "$1",
            options: .regularExpression
        )
    }

    static func isMarker(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "snorlax-fn"
    }

    static func number(in url: URL) -> Int? {
        guard isMarker(url), let host = url.host, let number = Int(host), number > 0 else {
            return nil
        }
        return number
    }

    static func note(for url: URL, in notes: [Note]) -> Note? {
        guard let number = number(in: url) else { return nil }
        return notes.first { $0.number == number }
    }

    static func superscript(_ number: Int) -> String {
        let digits = Array("⁰¹²³⁴⁵⁶⁷⁸⁹")
        var out = ""
        for ch in String(number) {
            guard let value = ch.wholeNumberValue, digits.indices.contains(value) else { continue }
            out.append(digits[value])
        }
        return out.isEmpty ? String(number) : out
    }

    /// `completed: false`, or no matched pair, returns `text` unchanged.
    static func extract(_ text: String, completed: Bool) -> Prepared {
        if !completed { return Prepared(text: text, notes: []) }
        if text.isEmpty { return Prepared(text: text, notes: []) }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let blocked = protectedRanges(src)
        let defs = collectDefs(src, blocked: blocked)
        if defs.isEmpty { return Prepared(text: text, notes: []) }
        let refs = collectRefs(src, blocked: blocked, defs: defs)
        let used = usedLabels(refs, defs: defs)
        if used.isEmpty { return Prepared(text: text, notes: []) }

        var numberByLabel: [String: Int] = [:]
        var notes: [Note] = []
        for ref in refs where qualifies(ref, used: used) {
            if numberByLabel[ref.label] != nil { continue }
            guard let def = defs.first(where: { $0.label == ref.label }) else { continue }
            let number = numberByLabel.count + 1
            numberByLabel[ref.label] = number
            notes.append(Note(label: ref.label, number: number, text: def.raw))
        }
        for index in notes.indices {
            guard let def = defs.first(where: { $0.label == notes[index].label }) else { continue }
            notes[index].text = rewriteRefs(def.raw, numberByLabel: numberByLabel, used: used)
        }
        let cuts = defs.filter { used.contains($0.label) }.map { $0.start..<$0.end }
        let body = rewriteRefs(removeRanges(src, cuts), numberByLabel: numberByLabel, used: used)
        return Prepared(text: body, notes: notes)
    }

    /// Replace `§§SBFN1§§` in the text-view string. NS ranges stay valid
    /// when replacements run from the end, so heading fonts already
    /// applied on this string keep their place. The link scheme is
    /// `snorlax-fn`, which the bubble opens as a note instead of a browser.
    static func applyMarkers(_ ns: NSMutableAttributedString, baseSize: CGFloat) {
        let raw = ns.string as NSString
        guard ns.string.contains("§§SBFN"),
              let regex = try? NSRegularExpression(pattern: #"§§SBFN(\d+)§§"#)
        else { return }
        let matches = regex.matches(in: ns.string, range: NSRange(location: 0, length: raw.length))
        for match in matches.reversed() {
            guard let number = Int(raw.substring(with: match.range(at: 1))),
                  number > 0,
                  let url = URL(string: "snorlax-fn://\(number)")
            else { continue }
            let marker = superscript(number)
            let replacement = NSMutableAttributedString(string: marker)
            let full = NSRange(location: 0, length: (marker as NSString).length)
            replacement.addAttributes(
                [
                    .font: UIFont.systemFont(ofSize: baseSize),
                    .link: url,
                    .foregroundColor: UIColor.tintColor,
                ],
                range: full
            )
            ns.replaceCharacters(in: match.range, with: replacement)
        }
    }

    /// Same replacement on an attributed string before it becomes a text view.
    static func applyMarkers(_ parsed: inout AttributedString, baseSize: CGFloat) {
        let raw = String(parsed.characters)
        guard raw.contains("§§SBFN"),
              let regex = try? NSRegularExpression(pattern: #"§§SBFN(\d+)§§"#)
        else { return }
        let ns = raw as NSString
        let matches = regex.matches(in: raw, range: NSRange(location: 0, length: ns.length))
        if matches.isEmpty { return }
        var result = AttributedString()
        var cursor = raw.startIndex
        for match in matches {
            guard let range = Range(match.range, in: raw),
                  let number = Int(ns.substring(with: match.range(at: 1))),
                  number > 0,
                  let url = URL(string: "snorlax-fn://\(number)")
            else { return }
            if range.lowerBound > cursor {
                guard let start = AttributedString.Index(cursor, within: parsed),
                      let end = AttributedString.Index(range.lowerBound, within: parsed)
                else { return }
                result.append(parsed[start..<end])
            }
            var marker = AttributedString(superscript(number))
            marker.link = url
            marker.foregroundColor = .accentColor
            marker.uiKit.foregroundColor = UIColor.tintColor
            marker.uiKit.font = UIFont.systemFont(ofSize: baseSize)
            result.append(marker)
            cursor = range.upperBound
        }
        if cursor < raw.endIndex {
            guard let start = AttributedString.Index(cursor, within: parsed),
                  let end = AttributedString.Index(raw.endIndex, within: parsed)
            else { return }
            result.append(parsed[start..<end])
        }
        parsed = result
    }

    private struct Def {
        var label: String
        var raw: String
        var start: String.Index
        var end: String.Index
    }

    private struct Ref {
        var label: String
        var start: String.Index
        var inDef: String?
    }

    private static func usedLabels(_ refs: [Ref], defs: [Def]) -> Set<String> {
        let known = Set(defs.map(\.label))
        var used = Set<String>()
        var changed = true
        while changed {
            changed = false
            for ref in refs {
                if !known.contains(ref.label) || used.contains(ref.label) { continue }
                if let container = ref.inDef, !used.contains(container) { continue }
                used.insert(ref.label)
                changed = true
            }
        }
        return used
    }

    private static func qualifies(_ ref: Ref, used: Set<String>) -> Bool {
        guard used.contains(ref.label) else { return false }
        if let container = ref.inDef, !used.contains(container) { return false }
        return true
    }

    private static func collectDefs(_ src: String, blocked: [Range<String.Index>]) -> [Def] {
        let lines = lineSpans(src)
        var defs: [Def] = []
        var seen = Set<String>()
        var index = 0
        while index < lines.count {
            let line = lines[index]
            if contains(line.start, blocked) {
                index += 1
                continue
            }
            guard let match = definition(line.text) else {
                index += 1
                continue
            }
            let markerAt = src.index(line.start, offsetBy: match.indent, limitedBy: src.endIndex) ?? line.start
            if contains(markerAt, blocked) {
                index += 1
                continue
            }
            var cursor = index + 1
            var body = [match.rest]
            while cursor < lines.count {
                let next = lines[cursor]
                if contains(next.start, blocked) { break }
                if definition(next.text) != nil && indentColumns(next.text) <= 3 { break }
                if next.text.trimmingCharacters(in: .whitespaces).isEmpty {
                    var look = cursor + 1
                    while look < lines.count && lines[look].text.trimmingCharacters(in: .whitespaces).isEmpty {
                        look += 1
                    }
                    if look >= lines.count { break }
                    let upcoming = lines[look]
                    if contains(upcoming.start, blocked) { break }
                    if definition(upcoming.text) != nil && indentColumns(upcoming.text) <= 3 { break }
                    if indentColumns(upcoming.text) >= 2 {
                        body.append(next.text)
                        cursor += 1
                        continue
                    }
                    break
                }
                if indentColumns(next.text) >= 2 {
                    body.append(next.text)
                    cursor += 1
                    continue
                }
                break
            }
            let last = lines[cursor - 1]
            let end = last.end < src.endIndex ? src.index(after: last.end) : last.end
            if !seen.contains(match.label) {
                seen.insert(match.label)
                defs.append(Def(
                    label: match.label,
                    raw: noteText(body),
                    start: line.start,
                    end: end
                ))
            }
            index = cursor
        }
        return defs
    }

    private static func collectRefs(
        _ src: String,
        blocked: [Range<String.Index>],
        defs: [Def]
    ) -> [Ref] {
        guard let regex = try? NSRegularExpression(pattern: #"\[\^([A-Za-z0-9_-]+)\]"#) else {
            return []
        }
        let ns = src as NSString
        var refs: [Ref] = []
        for match in regex.matches(in: src, range: NSRange(location: 0, length: ns.length)) {
            guard let range = Range(match.range, in: src),
                  let labelRange = Range(match.range(at: 1), in: src)
            else { continue }
            if isEscaped(src, range.lowerBound) { continue }
            if contains(range.lowerBound, blocked) { continue }
            if range.upperBound < src.endIndex && src[range.upperBound] == ":" { continue }
            let label = String(src[labelRange])
            let container = defs.first { range.lowerBound >= $0.start && range.lowerBound < $0.end }
            refs.append(Ref(label: label, start: range.lowerBound, inDef: container?.label))
        }
        return refs
    }

    private static func rewriteRefs(
        _ text: String,
        numberByLabel: [String: Int],
        used: Set<String>
    ) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"\[\^([A-Za-z0-9_-]+)\]"#) else {
            return text
        }
        let blocked = protectedRanges(text)
        let ns = text as NSString
        var replacements: [(Range<String.Index>, String)] = []
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let range = Range(match.range, in: text),
                  let labelRange = Range(match.range(at: 1), in: text)
            else { continue }
            if isEscaped(text, range.lowerBound) { continue }
            if contains(range.lowerBound, blocked) { continue }
            if range.upperBound < text.endIndex && text[range.upperBound] == ":" { continue }
            let label = String(text[labelRange])
            guard used.contains(label), let number = numberByLabel[label] else { continue }
            replacements.append((range, token(number)))
        }
        var out = ""
        var cursor = text.startIndex
        for item in replacements.sorted(by: { $0.0.lowerBound < $1.0.lowerBound }) {
            if item.0.lowerBound < cursor { continue }
            out += text[cursor..<item.0.lowerBound]
            out += item.1
            cursor = item.0.upperBound
        }
        out += text[cursor...]
        return out
    }

    private struct DefMatch {
        var indent: Int
        var label: String
        var rest: String
    }

    private static func definition(_ line: String) -> DefMatch? {
        guard let regex = try? NSRegularExpression(
            pattern: #"^( {0,3})\[\^([A-Za-z0-9_-]+)\]:[ \t]*(.*)$"#
        ) else { return nil }
        let ns = line as NSString
        guard let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)),
              let indentRange = Range(match.range(at: 1), in: line),
              let labelRange = Range(match.range(at: 2), in: line),
              let restRange = Range(match.range(at: 3), in: line)
        else { return nil }
        return DefMatch(
            indent: line[indentRange].count,
            label: String(line[labelRange]),
            rest: String(line[restRange])
        )
    }

    private static func noteText(_ lines: [String]) -> String {
        var out: [String] = []
        for (index, line) in lines.enumerated() {
            if index == 0 {
                out.append(line.replacingOccurrences(of: #"[ \t]+$"#, with: "", options: .regularExpression))
            } else if line.trimmingCharacters(in: .whitespaces).isEmpty {
                out.append("")
            } else {
                let trimmed = dedent(line).replacingOccurrences(
                    of: #"[ \t]+$"#,
                    with: "",
                    options: .regularExpression
                )
                out.append(trimmed)
            }
        }
        while let first = out.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
            out.removeFirst()
        }
        while let last = out.last, last.trimmingCharacters(in: .whitespaces).isEmpty {
            out.removeLast()
        }
        return out.joined(separator: "\n")
    }

    private static func dedent(_ line: String) -> String {
        if line.first == "\t" { return String(line.dropFirst()) }
        var index = line.startIndex
        var count = 0
        while count < 4 && index < line.endIndex && line[index] == " " {
            count += 1
            index = line.index(after: index)
        }
        return String(line[index...])
    }

    private static func removeRanges(_ src: String, _ cuts: [Range<String.Index>]) -> String {
        let sorted = cuts.sorted { $0.lowerBound < $1.lowerBound }
        var out = ""
        var cursor = src.startIndex
        for cut in sorted {
            if cut.lowerBound < cursor { continue }
            out += src[cursor..<cut.lowerBound]
            cursor = cut.upperBound
        }
        out += src[cursor...]
        return out
    }

    private struct LineSpan {
        var text: String
        var start: String.Index
        var end: String.Index
    }

    private static func lineSpans(_ src: String) -> [LineSpan] {
        var spans: [LineSpan] = []
        var index = src.startIndex
        while index <= src.endIndex {
            let newline = src[index...].firstIndex(of: "\n") ?? src.endIndex
            spans.append(LineSpan(text: String(src[index..<newline]), start: index, end: newline))
            if newline == src.endIndex { break }
            index = src.index(after: newline)
        }
        return spans
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

    private static func isEscaped(_ text: String, _ index: String.Index) -> Bool {
        var slashes = 0
        var cursor = index
        while cursor > text.startIndex {
            let prev = text.index(before: cursor)
            if text[prev] != "\\" { break }
            slashes += 1
            cursor = prev
        }
        return slashes % 2 == 1
    }

    private static func contains(_ index: String.Index, _ ranges: [Range<String.Index>]) -> Bool {
        ranges.contains { $0.contains(index) }
    }

    private static func protectedRanges(_ src: String) -> [Range<String.Index>] {
        let fences = fenceRanges(src)
        let codes = inlineCodeRanges(src, skipping: fences)
        let skip = fences + codes
        return skip + mathRanges(src, skipping: skip)
    }

    private static func fenceRanges(_ src: String) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        var open: (marker: String, start: String.Index)?
        var index = src.startIndex
        while index <= src.endIndex {
            let newline = src[index...].firstIndex(of: "\n") ?? src.endIndex
            let line = String(src[index..<newline])
            if let fence = fenceOpen(line) {
                if open == nil {
                    open = (fence.marker, index)
                } else if let current = open,
                          fence.marker.first == current.marker.first,
                          fence.marker.count >= current.marker.count,
                          fence.info.trimmingCharacters(in: .whitespaces).isEmpty
                {
                    ranges.append(current.start..<newline)
                    open = nil
                }
            }
            if newline == src.endIndex { break }
            index = src.index(after: newline)
        }
        if let current = open {
            ranges.append(current.start..<src.endIndex)
        }
        return ranges
    }

    private static func fenceOpen(_ line: String) -> (marker: String, info: String)? {
        var spaces = 0
        var index = line.startIndex
        while index < line.endIndex && line[index] == " " && spaces < 4 {
            spaces += 1
            index = line.index(after: index)
        }
        if spaces > 3 { return nil }
        guard index < line.endIndex else { return nil }
        let mark = line[index]
        guard mark == "`" || mark == "~" else { return nil }
        var count = 0
        var cursor = index
        while cursor < line.endIndex && line[cursor] == mark {
            count += 1
            cursor = line.index(after: cursor)
        }
        guard count >= 3 else { return nil }
        let marker = String(repeating: String(mark), count: count)
        return (marker, String(line[cursor...]))
    }

    private static func inlineCodeRanges(
        _ src: String,
        skipping fences: [Range<String.Index>]
    ) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        var index = src.startIndex
        while index < src.endIndex {
            if contains(index, fences) {
                index = src.index(after: index)
                continue
            }
            if src[index] != "`" {
                index = src.index(after: index)
                continue
            }
            var run = 0
            var cursor = index
            while cursor < src.endIndex && src[cursor] == "`" {
                run += 1
                cursor = src.index(after: cursor)
            }
            var closer = cursor
            var found = false
            while closer < src.endIndex {
                if contains(closer, fences) {
                    closer = src.index(after: closer)
                    continue
                }
                if src[closer] != "`" {
                    closer = src.index(after: closer)
                    continue
                }
                var length = 0
                var end = closer
                while end < src.endIndex && src[end] == "`" {
                    length += 1
                    end = src.index(after: end)
                }
                if length == run {
                    ranges.append(index..<end)
                    index = end
                    found = true
                    break
                }
                closer = end
            }
            if !found { index = cursor }
        }
        return ranges
    }

    private static func mathRanges(
        _ src: String,
        skipping skip: [Range<String.Index>]
    ) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        let lines = lineSpans(src)
        var open: String.Index?
        for line in lines {
            if contains(line.start, skip) {
                open = nil
                continue
            }
            let trimmed = line.text.trimmingCharacters(in: .whitespaces)
            if trimmed == "$$" {
                if let start = open {
                    let end = line.end < src.endIndex ? src.index(after: line.end) : line.end
                    ranges.append(start..<end)
                    open = nil
                } else {
                    open = line.start
                }
                continue
            }
            if open == nil && trimmed.hasPrefix("$$") && trimmed.hasSuffix("$$") && trimmed.count > 4 {
                let end = line.end < src.endIndex ? src.index(after: line.end) : line.end
                ranges.append(line.start..<end)
            }
        }
        if let start = open {
            ranges.append(start..<src.endIndex)
        }
        var index = src.startIndex
        while index < src.endIndex {
            if contains(index, skip) || contains(index, ranges) {
                index = src.index(after: index)
                continue
            }
            let next = src.index(after: index)
            if src[index] != "\\" || next >= src.endIndex || src[next] != "(" {
                index = src.index(after: index)
                continue
            }
            var cursor = src.index(after: next)
            var closed: String.Index?
            while cursor < src.endIndex {
                if contains(cursor, skip) {
                    cursor = src.index(after: cursor)
                    continue
                }
                let after = src.index(after: cursor)
                if src[cursor] == "\\" && after < src.endIndex && src[after] == ")" {
                    closed = after
                    break
                }
                cursor = src.index(after: cursor)
            }
            if let closed {
                let end = src.index(after: closed)
                ranges.append(index..<end)
                index = end
            } else {
                ranges.append(index..<src.endIndex)
                break
            }
        }
        return ranges
    }
}

private struct MarkdownFootnotesKey: EnvironmentKey {
    static let defaultValue: [MarkdownFootnote.Note] = []
}

extension EnvironmentValues {
    /// Notes for the message currently being drawn. Empty while streaming.
    var markdownFootnotes: [MarkdownFootnote.Note] {
        get { self[MarkdownFootnotesKey.self] }
        set { self[MarkdownFootnotesKey.self] = newValue }
    }
}

/// Muted numbered list at the end of a completed assistant message.
struct MarkdownFootnoteList: View {
    let notes: [MarkdownFootnote.Note]
    var names: [String]
    var completed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(MarkdownFootnote.title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
            ForEach(notes) { note in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(note.number).")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    AssistantMarkdown(
                        text: note.text.isEmpty ? " " : note.text,
                        names: names,
                        completed: completed
                    )
                    .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(MarkdownFootnote.refLabel(note.number)). \(MarkdownFootnote.plain(note.text))")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(MarkdownFootnote.animation(reduceMotion: reduceMotion), value: notes)
    }
}

/// Tap a marker to read its note. http(s) links do not come through here.
struct MarkdownFootnotePopover: View {
    let note: MarkdownFootnote.Note
    var names: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(MarkdownFootnote.refLabel(note.number))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            AssistantMarkdown(
                text: note.text.isEmpty ? " " : note.text,
                names: names,
                completed: true
            )
        }
        .padding(16)
        .frame(minWidth: 220, maxWidth: 320, alignment: .leading)
    }
}
