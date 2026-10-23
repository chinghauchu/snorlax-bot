// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.78: CommonMark link-title forms on a completed assistant
/// LEFT `kind=message`.
///
/// v1.46 already showed a title as the tooltip. Checked again on
/// main at v1.77: one-line `"title"`, `'title'`, and `(title)` are
/// there. A title that spans a line break, a blank line, an
/// unescaped parenthesis, a missing space before the title, and a
/// backslash before a non-punctuation character did not match
/// cmark-gfm. This scanner does.
///
/// The tooltip collapses whitespace. Streaming does not rewrite
/// titles. Copy keeps markdown source. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownLinkTitleForm.ts`.
enum MarkdownLinkTitleForm {
    private static let asciiPunct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")

    struct Scan {
        var raw: String
        var next: Int
    }

    /// cmark-gfm link title at `index` (the opening delimiter).
    static func read(
        _ chars: [Character],
        _ index: Int,
        blocked: ((Int) -> Bool)? = nil
    ) -> Scan? {
        guard index < chars.count else { return nil }
        let open = chars[index]
        if open != "\"" && open != "'" && open != "(" { return nil }
        let close: Character = open == "(" ? ")" : open
        var cursor = index + 1
        var raw = ""
        while cursor < chars.count {
            if blocked?(cursor) == true { return nil }
            let ch = chars[cursor]
            if ch == "\0" { return nil }
            if ch == "\\", cursor + 1 < chars.count {
                let next = chars[cursor + 1]
                if next != "\0", asciiPunct.contains(next) {
                    if blocked?(cursor + 1) == true { return nil }
                    raw.append(ch)
                    raw.append(next)
                    cursor += 2
                    continue
                }
            }
            if open == "(", ch == "(" { return nil }
            if ch == close {
                if hasBlankLine(raw) { return nil }
                return Scan(raw: raw, next: cursor + 1)
            }
            raw.append(ch)
            cursor += 1
        }
        return nil
    }

    /// Entities first, then backslash escapes. Same order as cmark.
    static func decode(_ raw: String) -> String {
        let chars = Array(raw)
        var entities = ""
        var index = 0
        while index < chars.count {
            if chars[index] == "&", let ref = MarkdownEscape.characterReference(chars, index) {
                entities += ref.value
                index = ref.next
                continue
            }
            entities.append(chars[index])
            index += 1
        }
        let decoded = Array(entities)
        var out = ""
        var cursor = 0
        while cursor < decoded.count {
            let ch = decoded[cursor]
            if ch == "\\", cursor + 1 < decoded.count, asciiPunct.contains(decoded[cursor + 1]) {
                out.append(decoded[cursor + 1])
                cursor += 2
                continue
            }
            out.append(ch)
            cursor += 1
        }
        return out
    }

    static func collapse(_ value: String) -> String {
        value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    static func hint(_ raw: String) -> String {
        collapse(decode(raw))
    }

    /// Escape a decoded title so a later parse restores the same characters.
    static func format(_ title: String) -> String {
        var out = ""
        for ch in title {
            if ch == "\\" {
                out += "\\\\"
            } else if ch == "\"" {
                out += "\\\""
            } else if ch == "&" {
                out += "&#38;"
            } else {
                out.append(ch)
            }
        }
        return out
    }

    static func normalized(_ raw: String) -> String {
        "\"" + format(hint(raw)) + "\""
    }

    private static func hasBlankLine(_ raw: String) -> Bool {
        let norm = raw
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let chars = Array(norm)
        var index = 0
        while index < chars.count {
            if chars[index] == "\n" {
                var cursor = index + 1
                while cursor < chars.count, chars[cursor] == " " || chars[cursor] == "\t" {
                    cursor += 1
                }
                if cursor < chars.count, chars[cursor] == "\n" { return true }
            }
            index += 1
        }
        return false
    }
}
