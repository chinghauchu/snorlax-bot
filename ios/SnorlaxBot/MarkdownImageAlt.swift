// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.77: cmark-gfm image alt text on a completed assistant
/// LEFT `kind=message`.
///
/// An image description is parsed as inlines. The alt, the
/// accessibility label, and the fallback when the image fails are
/// that text with the markup removed. Emphasis, strong,
/// strikethrough, and code spans contribute only their text. A
/// nested link or image contributes its text, not its URL. A soft
/// break or a hard break is one space. A code span turns its line
/// endings into spaces. Backslash escapes and character references
/// decode. Inside a code span they stay literal.
///
/// `~~` is strikethrough (a run of exactly two tildes). A longer
/// run stays the characters. A single tilde is not strikethrough.
/// Streaming does not call this. Copy keeps markdown source.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownImageAlt.ts`.
enum MarkdownImageAlt {
    private static let asciiPunct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
    private static let schemePattern = "^[A-Za-z][A-Za-z0-9+.-]{1,31}:"
    private static let emailPattern =
        "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"

    private final class Token {
        enum Kind { case text, mark, delim }
        var kind: Kind
        var value: String
        var count: Int
        let orig: Int
        let canOpen: Bool
        let canClose: Bool
        let ch: Character

        init(text: String) {
            kind = .text
            value = text
            count = 0
            orig = 0
            canOpen = false
            canClose = false
            ch = " "
        }

        init(mark: String) {
            kind = .mark
            value = mark
            count = 0
            orig = 0
            canOpen = false
            canClose = false
            ch = " "
        }

        init(delim ch: Character, count: Int, canOpen: Bool, canClose: Bool) {
            kind = .delim
            value = String(ch)
            self.count = count
            orig = count
            self.canOpen = canOpen
            self.canClose = canClose
            self.ch = ch
        }
    }

    private final class Delim {
        let ch: Character
        var num: Int
        let orig: Int
        let canOpen: Bool
        let canClose: Bool
        let token: Token
        var prev: Delim?
        var next: Delim?
        init(token: Token, prev: Delim?) {
            ch = token.ch
            num = token.count
            orig = token.orig
            canOpen = token.canOpen
            canClose = token.canClose
            self.token = token
            self.prev = prev
        }
    }

    private struct Opener {
        var tokenIndex: Int
        var image: Bool
    }

    /// Plain-text alt for one image description, the characters
    /// between `[` and `]`.
    static func flatten(_ description: String) -> String {
        if description.isEmpty { return "" }
        let normalized = description
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        return render(scan(Array(normalized)))
    }

    private static func render(_ tokens: [Token]) -> String {
        applyEmphasis(tokens)
        var out = ""
        for tok in tokens {
            if tok.kind == .delim {
                if tok.count > 0 { out += String(repeating: String(tok.ch), count: tok.count) }
            } else {
                out += tok.value
            }
        }
        return out
    }

    private static func scan(_ src: [Character]) -> [Token] {
        var tokens: [Token] = []
        var stack: [Opener] = []
        var noLinkOpeners = false

        func pushText(_ value: String) {
            guard !value.isEmpty else { return }
            if let last = tokens.last, last.kind == .text {
                last.value += value
            } else {
                tokens.append(Token(text: value))
            }
        }

        func pushOpener(_ image: Bool) {
            tokens.append(Token(mark: image ? "![" : "["))
            stack.append(Opener(tokenIndex: tokens.count - 1, image: image))
            if !image { noLinkOpeners = false }
        }

        var index = 0
        while index < src.count {
            if src[index] == "`" {
                if let code = readCodeSpan(src, index) {
                    pushText(code.content)
                    index = code.next
                    continue
                }
                var run = 0
                while index + run < src.count, src[index + run] == "`" { run += 1 }
                pushText(String(repeating: "`", count: run))
                index += run
                continue
            }
            let ch = src[index]
            if ch == "\\", index + 1 < src.count {
                let next = src[index + 1]
                if next == "\n" {
                    pushText(" ")
                    index += 2
                    continue
                }
                if asciiPunct.contains(next) {
                    pushText(String(next))
                    index += 2
                    continue
                }
            }
            if ch == "<" {
                if let auto = autolinkEnd(src, index) {
                    pushText(slice(src, index + 1, auto - 1))
                    index = auto
                    continue
                }
                if let html = MarkdownHtmlLiteral.htmlTagEnd(src, index), html > index {
                    pushText(slice(src, index, html))
                    index = html
                    continue
                }
            }
            if ch == "&", let ref = MarkdownEscape.characterReference(src, index) {
                pushText(ref.value)
                index = ref.next
                continue
            }
            if ch == "\n" {
                if let last = tokens.last, last.kind == .text, hasTrailingSpaces(last.value, 2) {
                    last.value = stripTrailingSpaces(last.value)
                }
                pushText(" ")
                index += 1
                continue
            }
            if ch == "!", index + 1 < src.count, src[index + 1] == "[" {
                pushOpener(true)
                index += 2
                continue
            }
            if ch == "[" {
                pushOpener(false)
                index += 1
                continue
            }
            if ch == "]" {
                let opener = stack.popLast()
                let end = opener == nil ? nil : matchInlineEnd(src, index)
                if opener == nil || end == nil || (opener?.image == false && noLinkOpeners) {
                    pushText("]")
                    index += 1
                    continue
                }
                let label = Array(tokens[(opener!.tokenIndex + 1)...])
                tokens.removeSubrange((opener!.tokenIndex + 1)...)
                tokens[opener!.tokenIndex] = Token(text: render(label))
                if opener?.image == false { noLinkOpeners = true }
                index = end!
                continue
            }
            if ch == "*" || ch == "_" || ch == "~" {
                var run = 1
                while index + run < src.count, src[index + run] == ch { run += 1 }
                let strike = ch == "~"
                if !strike || run == 2 {
                    let flags = flanking(src, index, run, ch)
                    if flags.canOpen || flags.canClose {
                        tokens.append(Token(delim: ch, count: run, canOpen: flags.canOpen, canClose: flags.canClose))
                        index += run
                        continue
                    }
                }
                pushText(String(repeating: String(ch), count: run))
                index += run
                continue
            }
            pushText(String(ch))
            index += 1
        }
        return tokens
    }

    private static func flanking(
        _ src: [Character],
        _ index: Int,
        _ count: Int,
        _ ch: Character
    ) -> (canOpen: Bool, canClose: Bool) {
        let before: Character = index == 0 ? "\n" : src[index - 1]
        let after: Character = index + count >= src.count ? "\n" : src[index + count]
        let afterWs = isWhitespace(after)
        let beforeWs = isWhitespace(before)
        let afterPunct = isPunctuation(after)
        let beforePunct = isPunctuation(before)
        let left = !afterWs && (!afterPunct || beforeWs || beforePunct)
        let right = !beforeWs && (!beforePunct || afterWs || afterPunct)
        if ch == "_" {
            return (left && (!right || beforePunct), right && (!left || afterPunct))
        }
        return (left, right)
    }

    private static func isWhitespace(_ ch: Character) -> Bool {
        ch.unicodeScalars.allSatisfy { $0.properties.isWhitespace }
    }

    private static func isPunctuation(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first else { return false }
        switch scalar.properties.generalCategory {
        case .connectorPunctuation, .dashPunctuation, .closePunctuation, .finalPunctuation,
             .initialPunctuation, .otherPunctuation, .openPunctuation,
             .currencySymbol, .modifierSymbol, .mathSymbol, .otherSymbol:
            return true
        default:
            return false
        }
    }

    private static func applyEmphasis(_ tokens: [Token]) {
        var head: Delim?
        var tail: Delim?
        for tok in tokens where tok.kind == .delim {
            let delim = Delim(token: tok, prev: tail)
            if let tail { tail.next = delim } else { head = delim }
            tail = delim
        }
        guard head != nil else { return }
        var openersBottom = [Delim?](repeating: nil, count: 20)
        var closer: Delim? = head
        var guardCount = 0
        while let current = closer, guardCount < 10000 {
            guardCount += 1
            if !current.canClose || current.num <= 0 {
                closer = current.next
                continue
            }
            let closerCh = current.ch
            let slot = closerCh == "_"
                ? 2 + (current.canOpen ? 3 : 0) + (current.orig % 3)
                : closerCh == "*"
                    ? 8 + (current.canOpen ? 3 : 0) + (current.orig % 3)
                    : 14 + (current.canOpen ? 3 : 0) + (current.orig % 3)
            var opener = current.prev
            var openerFound = false
            let floor = openersBottom[slot]
            while let candidate = opener, candidate !== floor {
                let odd = (current.canOpen || candidate.canClose)
                    && current.orig % 3 != 0
                    && (candidate.orig + current.orig) % 3 == 0
                let strike = closerCh == "~" && (candidate.orig != current.orig || candidate.orig != 2)
                if candidate.ch == closerCh && candidate.canOpen && candidate.num > 0 && !odd && !strike {
                    openerFound = true
                    opener = candidate
                    break
                }
                opener = candidate.prev
            }
            if !openerFound || opener == nil {
                closer = current.next
                openersBottom[slot] = current.prev
                if !current.canOpen { unlink(current, head: &head, tail: &tail) }
                continue
            }
            let open = opener!
            let use = current.num >= 2 && open.num >= 2 ? 2 : 1
            open.num -= use
            current.num -= use
            open.token.count = open.num
            current.token.count = current.num
            open.next = current
            current.prev = open
            if open.num == 0 { unlink(open, head: &head, tail: &tail) }
            if current.num == 0 {
                let next = current.next
                unlink(current, head: &head, tail: &tail)
                closer = next
            }
        }
    }

    private static func unlink(_ delim: Delim, head: inout Delim?, tail: inout Delim?) {
        delim.prev?.next = delim.next
        delim.next?.prev = delim.prev
        if head === delim { head = delim.next }
        if tail === delim { tail = delim.prev }
    }

    private static func readCodeSpan(_ src: [Character], _ index: Int) -> (content: String, next: Int)? {
        guard index < src.count, src[index] == "`" else { return nil }
        var run = 0
        while index + run < src.count, src[index + run] == "`" { run += 1 }
        var cursor = index + run
        while cursor < src.count {
            if src[cursor] == "\n" {
                var look = cursor + 1
                while look < src.count, src[look] == " " || src[look] == "\t" { look += 1 }
                if look < src.count, src[look] == "\n" { return nil }
            }
            if src[cursor] != "`" {
                cursor += 1
                continue
            }
            var match = 0
            while cursor + match < src.count, src[cursor + match] == "`" { match += 1 }
            if match == run {
                var content = slice(src, index + run, cursor).replacingOccurrences(of: "\n", with: " ")
                if content.count >= 2, content.first == " ", content.last == " ", content.contains(where: { $0 != " " }) {
                    content.removeFirst()
                    content.removeLast()
                }
                return (content, cursor + match)
            }
            cursor += match
        }
        return nil
    }

    private static func autolinkEnd(_ src: [Character], _ start: Int) -> Int? {
        guard start < src.count, src[start] == "<" else { return nil }
        var cursor = start + 1
        while cursor < src.count {
            let ch = src[cursor]
            if ch == ">" { break }
            let code = ch.unicodeScalars.first?.value ?? 0
            if ch == "<" || code <= 32 || code == 127 { return nil }
            cursor += 1
        }
        guard cursor < src.count, src[cursor] == ">" else { return nil }
        let inner = slice(src, start + 1, cursor)
        if inner.isEmpty { return nil }
        if prefixMatch(schemePattern, inner) || wholeMatch(emailPattern, inner) { return cursor + 1 }
        return nil
    }

    private static func matchInlineEnd(_ src: [Character], _ close: Int) -> Int? {
        guard let open = skipLinkSpace(src, close + 1), open < src.count, src[open] == "(" else { return nil }
        guard let destAt = skipLinkSpace(src, open + 1), destAt < src.count,
              let dest = readDestination(src, destAt) else { return nil }
        var cursor = dest
        if let titleAt = skipLinkSpace(src, cursor),
           titleAt < src.count,
           src[titleAt] == "\"" || src[titleAt] == "'" || src[titleAt] == "(" {
            guard let title = readTitle(src, titleAt) else { return nil }
            cursor = title
        }
        guard let end = skipLinkSpace(src, cursor), end < src.count, src[end] == ")" else { return nil }
        return end + 1
    }

    private static func readDestination(_ src: [Character], _ start: Int) -> Int? {
        guard start < src.count else { return nil }
        if src[start] == "<" {
            var cursor = start + 1
            var value = ""
            while cursor < src.count {
                let ch = src[cursor]
                if ch == "\n" || ch == "<" { return nil }
                if ch == "\\", cursor + 1 < src.count, asciiPunct.contains(src[cursor + 1]) {
                    value.append(src[cursor + 1])
                    cursor += 2
                    continue
                }
                if ch == ">" { return value.isEmpty ? nil : cursor + 1 }
                value.append(ch)
                cursor += 1
            }
            return nil
        }
        var cursor = start
        var value = ""
        var depth = 0
        while cursor < src.count {
            let ch = src[cursor]
            if ch == "\\", cursor + 1 < src.count {
                value.append(src[cursor + 1])
                cursor += 2
                continue
            }
            if ch == " " || ch == "\t" || ch == "\n" || ch == "<" { break }
            if ch == "(" {
                depth += 1
                value.append(ch)
                cursor += 1
                continue
            }
            if ch == ")" {
                if depth == 0 { break }
                depth -= 1
                value.append(ch)
                cursor += 1
                continue
            }
            value.append(ch)
            cursor += 1
        }
        if value.isEmpty || depth != 0 { return nil }
        return cursor
    }

    private static func readTitle(_ src: [Character], _ start: Int) -> Int? {
        guard start < src.count else { return nil }
        let open = src[start]
        let close: Character = open == "(" ? ")" : open
        guard open == "\"" || open == "'" || open == "(" else { return nil }
        var cursor = start + 1
        while cursor < src.count {
            let ch = src[cursor]
            if ch == "\\", cursor + 1 < src.count {
                cursor += 2
                continue
            }
            if ch == close { return cursor + 1 }
            cursor += 1
        }
        return nil
    }

    private static func skipLinkSpace(_ src: [Character], _ start: Int) -> Int? {
        var cursor = start
        var newline = false
        while cursor < src.count {
            let ch = src[cursor]
            if ch == " " || ch == "\t" {
                cursor += 1
                continue
            }
            if ch == "\n", !newline {
                newline = true
                cursor += 1
                continue
            }
            break
        }
        return cursor
    }

    private static func slice(_ chars: [Character], _ start: Int, _ end: Int) -> String {
        guard start >= 0, end <= chars.count, start < end else { return "" }
        return String(chars[start..<end])
    }

    private static func hasTrailingSpaces(_ value: String, _ count: Int) -> Bool {
        var seen = 0
        for ch in value.reversed() {
            if ch != " " { break }
            seen += 1
        }
        return seen >= count
    }

    private static func stripTrailingSpaces(_ value: String) -> String {
        var out = value
        while out.last == " " { out.removeLast() }
        return out
    }

    private static func prefixMatch(_ pattern: String, _ text: String) -> Bool {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = re.firstMatch(in: text, range: range) else { return false }
        return match.range.location == 0
    }

    private static func wholeMatch(_ pattern: String, _ text: String) -> Bool {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        return re.firstMatch(in: text, range: range)?.range == range
    }
}
