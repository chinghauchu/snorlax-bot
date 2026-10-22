// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.68: CommonMark Unicode symbols are punctuation for emphasis
/// on a completed assistant LEFT `kind=message`.
///
/// Desktop react-markdown (micromark) treats a BMP symbol
/// (`£` `©` `±` `™` `°` `¥` `×` `→`) as punctuation when it
/// decides whether `*` can open or close emphasis. iOS full
/// markdown (cmark-gfm) does not, so `*£*bravo`, `*±*1`,
/// `a*©*b`, and `**£**bravo` became emphasis there and stayed
/// literal asterisks on desktop.
///
/// The symbol is stashed in a `§§SBE` token. The token begins
/// and ends with `§`, which both parsers already count as
/// punctuation, so the flanking rule matches. Restore paints
/// the symbol again. `*£50*`, `(*©*)`, `**©** notice`, `*foo*`,
/// and a non-BMP emoji such as `*😀*bravo` still emphasize.
/// ASCII symbols (tilde, pipe, dollar, backtick) stay in the
/// source: both parsers already treat them as punctuation, and
/// stashing them would hide strikethrough, tables, and code
/// fences. Code, link destinations, URLs, and email addresses
/// are left alone. A symbol in a link label is still stashed.
/// Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownSymbol.ts`.
enum MarkdownSymbol {
    private static let urlChars = Set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/?#[]@!$&'()*+,;=%._~-"
    )

    /// Never animate, including when Reduce Motion is off.
    static func animates(reduceMotion: Bool) -> Bool {
        if reduceMotion { return false }
        return false
    }

    /// Stash BMP Unicode symbols outside code, link destinations,
    /// and URLs. `completed: false` returns `text`.
    static func protect(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty { return text }
        let chars = Array(text)
        if !chars.contains(where: isBmpSymbol) { return text }
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
            if isBmpSymbol(ch) && !skip(chars, index) {
                out.append(stash(ch))
            } else {
                out.append(ch)
            }
            index += 1
        }
        return out
    }

    /// Non-ASCII BMP `S` category. ASCII symbols and non-BMP emoji stay in the source.
    private static func isBmpSymbol(_ ch: Character) -> Bool {
        guard ch.unicodeScalars.count == 1, let scalar = ch.unicodeScalars.first else { return false }
        if scalar.value <= 0x7F || scalar.value > 0xFFFF { return false }
        switch scalar.properties.generalCategory {
        case .currencySymbol, .modifierSymbol, .mathSymbol, .otherSymbol:
            return true
        default:
            return false
        }
    }

    private static func stash(_ ch: Character) -> String {
        let value = ch.unicodeScalars.first?.value ?? 0
        return String(format: "§§SBE%06X§§", value)
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
        // The scheme has to sit in the run that reaches this symbol.
        // `[` `]` `(` `)` are URL characters, so a later destination
        // must not pull a link label into the URL.
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
