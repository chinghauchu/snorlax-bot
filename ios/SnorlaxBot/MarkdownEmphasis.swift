// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.94: cmark-gfm emphasis delimiter runs on a completed
/// assistant LEFT `kind=message`.
///
/// Checked spec section 6.4 (6.2 in newer numbering) on main
/// first, against cmark-gfm 0.29.0.gfm.13. The rule of 3,
/// punctuation flanking, intraword `*` versus `_`, and the
/// process-emphasis order already match. v1.67 and v1.68 stand.
///
/// micromark and Unicode White_Space count U+000B, U+0085,
/// U+2028, U+2029, and U+FEFF as space. cmark-gfm does not.
/// `*\u{000B}a\u{000B}*` is emphasis there. The character is
/// stashed in a token whose ends are U+E000, which neither
/// parser counts as whitespace or punctuation, so flanking
/// matches. Restore paints the character. A real cmark space
/// stays whitespace.
///
/// cmark-gfm HTML emits one `<strong>` for strong nested in
/// strong. iOS full markdown paints `.stronglyEmphasized` as
/// one run, so `****foo****` and `foo******bar*********baz`
/// are already one strong. Desktop flattens the tags in
/// `remarkHardBreaks`. This scanner does not rewrite those runs.
///
/// The image-alt scanner uses `isCmarkSpace` for the same
/// flanking decision.
///
/// Code, link destinations, and URLs are left alone.
/// Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownEmphasis.ts`.
enum MarkdownEmphasis {
    /// cmark-gfm 0.29.0.gfm.13 Unicode whitespace.
    /// The same values live in `markdownEmphasis.ts`.
    static let cmarkSpaces: [UInt32] = [
        0x0009, 0x000A, 0x000C, 0x000D, 0x0020, 0x00A0, 0x1680,
        0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
        0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000,
    ]

    /// Whitespace other parsers count that cmark-gfm does not.
    /// The same values, in this order, live in `markdownEmphasis.ts`.
    static let nonCmarkSpaces: [UInt32] = [0x000B, 0x0085, 0x2028, 0x2029, 0xFEFF]

    private static let cmarkSpaceSet = Set(cmarkSpaces)
    private static let nonCmarkSpaceSet = Set(nonCmarkSpaces)
    private static let urlChars = Set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/?#[]@!$&'()*+,;=%._~-"
    )

    /// Never animate, including when Reduce Motion is off.
    static func animates(reduceMotion: Bool) -> Bool {
        if reduceMotion { return false }
        return false
    }

    /// True when `ch` is whitespace for cmark-gfm flanking.
    static func isCmarkSpace(_ ch: Character) -> Bool {
        guard ch.unicodeScalars.count == 1, let scalar = ch.unicodeScalars.first else { return false }
        return cmarkSpaceSet.contains(scalar.value)
    }

    /// Stash whitespace cmark-gfm does not count.
    /// `completed: false` returns `text`.
    static func protect(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty { return text }
        let chars = Array(text)
        if !chars.contains(where: isNonCmarkSpace) { return text }
        let blocked = MarkdownEscape.opaqueSpans(in: text)
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        while index < chars.count {
            if let span = blocked.first(where: { index >= $0.start && index < $0.end }) {
                out.append(contentsOf: chars[index..<span.end])
                index = span.end
                continue
            }
            let ch = chars[index]
            if isNonCmarkSpace(ch), !skip(chars, index) {
                out.append(stash(ch))
            } else {
                out.append(ch)
            }
            index += 1
        }
        return out
    }

    /// Marker. U+E000 is neither cmark whitespace nor punctuation.
    static let mark = "\u{E000}SBW"

    static func restoreString(_ text: String) -> String {
        guard text.contains(mark) else { return text }
        guard let re = try? NSRegularExpression(
            pattern: "\u{E000}SBW([0-9A-F]{6})\u{E000}"
        ) else { return text }
        let ns = text as NSString
        let matches = re.matches(in: text, range: NSRange(location: 0, length: ns.length))
        if matches.isEmpty { return text }
        var out = ""
        var cursor = 0
        for match in matches {
            let range = match.range
            if range.location > cursor {
                out += ns.substring(with: NSRange(location: cursor, length: range.location - cursor))
            }
            let hex = ns.substring(with: match.range(at: 1))
            if let value = UInt32(hex, radix: 16), value <= 0x10FFFF {
                out.append(String(UnicodeScalar(value) ?? "\u{FFFD}"))
            } else {
                out += ns.substring(with: range)
            }
            cursor = range.location + range.length
        }
        if cursor < ns.length { out += ns.substring(from: cursor) }
        return out
    }

    private static func isNonCmarkSpace(_ ch: Character) -> Bool {
        guard ch.unicodeScalars.count == 1, let scalar = ch.unicodeScalars.first else { return false }
        return nonCmarkSpaceSet.contains(scalar.value)
    }

    private static func stash(_ ch: Character) -> String {
        let value = ch.unicodeScalars.first?.value ?? 0
        return String(format: "\u{E000}SBW%06X\u{E000}", value)
    }

    private static func skip(_ src: [Character], _ index: Int) -> Bool {
        inLinkDestination(src, index) || inUrlOrEmail(src, index)
    }

    private static func inUrlOrEmail(_ src: [Character], _ index: Int) -> Bool {
        var a = index
        var b = index + 1
        while a > 0, isUrlChar(src[a - 1]) { a -= 1 }
        while b < src.count, isUrlChar(src[b]) { b += 1 }
        let left = String(src[a..<index])
        let right = String(src[(index + 1)..<b])
        if left.range(of: #"https?://"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return true
        }
        if left.range(of: #"(^|[^A-Za-z0-9])www\."#, options: [.regularExpression, .caseInsensitive]) != nil
            || left.range(of: #"^www\."#, options: [.regularExpression, .caseInsensitive]) != nil {
            return true
        }
        let email = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return (left + "a" + right).range(of: email, options: .regularExpression) != nil
    }

    private static func inLinkDestination(_ src: [Character], _ index: Int) -> Bool {
        var depth = 0
        var j = index - 1
        while j >= 0 {
            let ch = src[j]
            if ch == "\n" || ch == "\r" { return false }
            if ch == ")" {
                depth += 1
                j -= 1
                continue
            }
            if ch != "(" {
                j -= 1
                continue
            }
            if depth > 0 {
                depth -= 1
                j -= 1
                continue
            }
            var k = j - 1
            while k >= 0, src[k] == " " || src[k] == "\t" { k -= 1 }
            return k >= 0 && src[k] == "]"
        }
        return false
    }

    private static func isUrlChar(_ ch: Character) -> Bool {
        urlChars.contains(ch)
    }
}
