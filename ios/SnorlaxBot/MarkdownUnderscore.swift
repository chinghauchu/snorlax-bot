// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.67: CommonMark intraword underscores in a completed assistant
/// LEFT `kind=message`.
///
/// Desktop react-markdown (micromark) and iOS full markdown
/// (cmark-gfm) already leave an intraword `_` literal.
/// `snake_case_name`, `foo_bar_baz`, and `foo__bar__baz` are not
/// emphasis. `_emphasis_` and `__strong__` at a word boundary still
/// render. `foo*bar*baz` still emphasizes, because `*` has no
/// intraword ban.
///
/// The parsers still treat a word-boundary dunder as strong
/// emphasis, so `__init__` became bold `init`. This pass stashes
/// that identifier, and the other Python data-model names, so the
/// underscores stay. A name that itself contains `_`
/// (`__init_subclass__`, `__foo_bar__`) is the same kind of
/// identifier. `__strong__` is not one of those names, so it stays
/// strong. Code, link destinations, and URLs are left alone.
/// Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownUnderscore.ts`.
enum MarkdownUnderscore {
    /// Python data-model and module names, without the surrounding
    /// underscores. `__strong__` is not in this list.
    /// The same words, in this order, live in `markdownUnderscore.ts`.
    static let wordList =
        "abs add aenter aexit aiter all anext annotations await bases bool builtins bytes cached call ceil class complex contains copy debug deepcopy del delattr delete delitem dict dir divmod doc enter eq exit file float floor floordiv format future ge get getattr getattribute getitem gt hash iadd iand ifloordiv ilshift imatmul imod imul index init instancecheck int invert ior ipow irshift isub iter itruediv ixor le len loader lshift lt main matmul missing mod module mro mul name ne neg new next or package path pos pow prepare qualname radd rand rdivmod repr reversed rfloordiv rlshift rmatmul rmod rmul ror round rpow rrshift rshift rsub rtruediv rxor set setattr setitem sizeof slots spec str sub subclasscheck subclasses truediv trunc weakref xor"

    private static let names = Set(wordList.split(separator: " ").map(String.init))

    private static let urlChars = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/?#[]@!$&'()*+,;=%._~-")

    /// Never animate, including when Reduce Motion is off.
    static func animates(reduceMotion: Bool) -> Bool {
        if reduceMotion { return false }
        return false
    }

    /// Stash `__init__`-style identifiers outside code and URLs.
    /// `completed: false` returns `text` unchanged. Intraword `_` is
    /// already literal in both parsers, so `snake_case_name` is unchanged.
    static func protect(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty || !text.contains("_") { return text }
        let chars = Array(text)
        let blocked = MarkdownEscape.opaqueSpans(in: text)
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        while index < chars.count {
            if let span = blockAt(index, blocked) {
                out.append(contentsOf: chars[index..<span.end])
                index = span.end
                continue
            }
            if let end = dunderEnd(chars, index), !skip(chars, index) {
                out.append(stash(String(chars[index..<end])))
                index = end
                continue
            }
            out.append(chars[index])
            index += 1
        }
        return out
    }

    private static func dunderEnd(_ src: [Character], _ i: Int) -> Int? {
        guard i + 1 < src.count, src[i] == "_", src[i + 1] == "_" else { return nil }
        if i + 2 < src.count, src[i + 2] == "_" { return nil }
        if isEscaped(src, i) { return nil }
        if i > 0, src[i - 1] == "_", !isEscaped(src, i - 1) { return nil }
        let open = flank(src, i, i + 2)
        if !open.open { return nil }
        guard let name = readName(src, i + 2) else { return nil }
        let closeAt = name.end
        guard closeAt + 1 < src.count, src[closeAt] == "_", src[closeAt + 1] == "_" else { return nil }
        if closeAt + 2 < src.count, src[closeAt + 2] == "_" { return nil }
        if isEscaped(src, closeAt) { return nil }
        let close = flank(src, closeAt, closeAt + 2)
        if !close.close { return nil }
        if !name.value.contains("_"), !names.contains(name.value) { return nil }
        return closeAt + 2
    }

    private static func readName(_ src: [Character], _ start: Int) -> (value: String, end: Int)? {
        guard start < src.count, isIdentStart(src[start]) else { return nil }
        var k = start + 1
        while k < src.count, isIdentPart(src[k]) { k += 1 }
        while k < src.count, src[k] == "_", k + 1 < src.count, src[k + 1] != "_", isIdentPart(src[k + 1]) {
            k += 1
            while k < src.count, isIdentPart(src[k]) { k += 1 }
        }
        return (value: String(src[start..<k]), end: k)
    }

    private static func flank(_ src: [Character], _ start: Int, _ end: Int) -> (open: Bool, close: Bool) {
        let before: Character? = start > 0 ? src[start - 1] : nil
        let after: Character? = end < src.count ? src[end] : nil
        let beforeWs = isWs(before)
        let afterWs = isWs(after)
        let beforePunct = before.map(isPunct) ?? false
        let afterPunct = after.map(isPunct) ?? false
        let left = !afterWs && (!afterPunct || beforeWs || beforePunct)
        let right = !beforeWs && (!beforePunct || afterWs || afterPunct)
        return (
            open: left && (!right || beforePunct),
            close: right && (!left || afterPunct)
        )
    }

    private static func skip(_ src: [Character], _ index: Int) -> Bool {
        inLinkDestination(src, index) || inUrlOrEmail(src, index)
    }

    private static func inUrlOrEmail(_ src: [Character], _ index: Int) -> Bool {
        var a = index
        var b = index + 1
        while a > 0, isUrlChar(src[a - 1]) { a -= 1 }
        while b < src.count, isUrlChar(src[b]) { b += 1 }
        let span = String(src[a..<b])
        if span.range(of: #"https?://"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return true
        }
        if span.range(of: #"(^|[^A-Za-z0-9])www\."#, options: [.regularExpression, .caseInsensitive]) != nil {
            return true
        }
        let email = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return span.range(of: email, options: .regularExpression) != nil
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

    private static func isEscaped(_ src: [Character], _ index: Int) -> Bool {
        var slashes = 0
        var i = index - 1
        while i >= 0, src[i] == "\\" {
            slashes += 1
            i -= 1
        }
        return slashes % 2 == 1
    }

    private static func isWs(_ ch: Character?) -> Bool {
        guard let ch else { return true }
        if ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "\u{000C}" || ch == "\u{000B}" {
            return true
        }
        return ch.unicodeScalars.allSatisfy { $0.properties.generalCategory == .spaceSeparator }
    }

    private static func isPunct(_ ch: Character) -> Bool {
        for scalar in ch.unicodeScalars {
            switch scalar.properties.generalCategory {
            case .connectorPunctuation, .dashPunctuation, .openPunctuation,
                 .closePunctuation, .initialPunctuation, .finalPunctuation,
                 .otherPunctuation, .mathSymbol, .currencySymbol,
                 .modifierSymbol, .otherSymbol:
                return true
            default:
                break
            }
        }
        return false
    }

    private static func isIdentStart(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        let value = scalar.value
        return (value >= 65 && value <= 90) || (value >= 97 && value <= 122)
    }

    private static func isIdentPart(_ ch: Character) -> Bool {
        if isIdentStart(ch) { return true }
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return scalar.value >= 48 && scalar.value <= 57
    }

    private static func isUrlChar(_ ch: Character) -> Bool {
        urlChars.contains(ch)
    }

    private static func stash(_ value: String) -> String {
        var hex = ""
        for scalar in value.unicodeScalars {
            hex += String(format: "%06X", scalar.value)
        }
        return "§§SBE\(hex)§§"
    }

    private static func blockAt(
        _ index: Int,
        _ ranges: [(start: Int, end: Int)]
    ) -> (start: Int, end: Int)? {
        for range in ranges where index >= range.start && index < range.end {
            return range
        }
        return nil
    }
}
