// SPDX-License-Identifier: Apache-2.0
import UIKit

/// v1.37: syntax highlighting inside completed assistant code fences.
/// A recognized language info string colors keywords, strings, comments,
/// and numbers. Unlabeled fences and unknown languages stay plain.
/// The tokenizer is local. It does not fetch, and it does not add HTTP.
/// Streaming stays plain (`completed: false`). Copy still uses the raw
/// source. Mermaid and TeX math are not languages here.
/// v2.09: C, C++, Java, C#, and Kotlin were still monochrome. A
/// completed fence tagged with those info strings now colors
/// keywords, strings, comments, and numbers the same way. A C or
/// C++ hash directive at the start of a line is a keyword. Java
/// and Kotlin text blocks, and a C# verbatim string, stay strings.
/// Unknown languages stay plain.
/// Keep in lockstep with `desktop/src/codeHighlight.ts`.
enum CodeHighlight {
    enum Kind: Equatable {
        case plain, keyword, string, comment, number
    }

    struct Span: Equatable {
        var text: String
        var kind: Kind
    }

    static func shouldHighlight(language: String, completed: Bool) -> Bool {
        completed && info(for: language) != nil
    }

    /// Colors swap with the appearance. The spans themselves never animate.
    static func animates(reduceMotion: Bool) -> Bool {
        if reduceMotion { return false }
        return false
    }

    static func paint(_ source: String, language: String, completed: Bool) -> AttributedString {
        guard shouldHighlight(language: language, completed: completed) else {
            return AttributedString(source)
        }
        var result = AttributedString()
        for span in highlight(source, language: language) {
            var piece = AttributedString(span.text)
            if let color = uiColor(span.kind), !span.text.isEmpty {
                piece.uiKit.foregroundColor = color
                let ns = NSMutableAttributedString(string: span.text)
                let range = NSRange(location: 0, length: ns.length)
                if range.length > 0 {
                    ns.addAttribute(.foregroundColor, value: color, range: range)
                    piece = AttributedString(ns)
                    piece.uiKit.foregroundColor = color
                }
            }
            result.append(piece)
        }
        return result
    }

    static func highlight(_ source: String, language: String) -> [Span] {
        guard let lang = info(for: language) else {
            return source.isEmpty ? [] : [Span(text: source, kind: .plain)]
        }
        if source.isEmpty { return [] }
        if lang.family == .diff { return highlightDiff(source) }
        let scanner = Scanner(source: source, info: lang)
        if lang.family == .html {
            scanner.scanHtml()
        } else {
            scanner.scanCode()
        }
        return scanner.spans
    }

    /// Dark fence: keyword #9aa8e8, string #8fbf9a, comment #8b8d94, number #c4a574.
    /// Light fence: keyword #3d4f99, string #2f6b45, comment #6b6d75, number #8a5a22.
    static func uiColor(_ kind: Kind) -> UIColor? {
        switch kind {
        case .plain:
            return nil
        case .keyword:
            return dynamic(dark: (154, 168, 232), light: (61, 79, 153))
        case .string:
            return dynamic(dark: (143, 191, 154), light: (47, 107, 69))
        case .comment:
            return dynamic(dark: (139, 141, 148), light: (107, 109, 117))
        case .number:
            return dynamic(dark: (196, 165, 116), light: (138, 90, 34))
        }
    }

    private static func dynamic(dark: (Int, Int, Int), light: (Int, Int, Int)) -> UIColor {
        UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat(rgb.0) / 255,
                green: CGFloat(rgb.1) / 255,
                blue: CGFloat(rgb.2) / 255,
                alpha: 1
            )
        }
    }

    private static func info(for language: String) -> LangInfo? {
        let trimmed = language.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.split(whereSeparator: \.isWhitespace).first else { return nil }
        return aliases[String(first).lowercased()]
    }

    private static func highlightDiff(_ source: String) -> [Span] {
        var spans: [Span] = []
        let lines = source.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        for (index, line) in lines.enumerated() {
            let text = line + (index < lines.count - 1 ? "\n" : "")
            push(&spans, diffKind(line), text)
        }
        return spans
    }

    private static func diffKind(_ line: String) -> Kind {
        if line.hasPrefix("diff ") || line.hasPrefix("index ") || line.hasPrefix("---")
            || line.hasPrefix("+++") || line.hasPrefix("@@")
        {
            return .comment
        }
        if line.hasPrefix("+") { return .string }
        if line.hasPrefix("-") { return .keyword }
        return .plain
    }

    private static func push(_ spans: inout [Span], _ kind: Kind, _ text: String) {
        guard !text.isEmpty else { return }
        if var last = spans.last, last.kind == kind {
            last.text += text
            spans[spans.count - 1] = last
        } else {
            spans.append(Span(text: text, kind: kind))
        }
    }
}

private struct LangInfo {
    var family: CodeFamily
    var jsx: Bool
}

private enum CodeFamily {
    case python, javascript, typescript, json, bash, swiftLang, go, rust, yaml, html, css, sql, diff
    case c, cpp, java, csharp, kotlin
}

private let aliases: [String: LangInfo] = [
    "python": LangInfo(family: .python, jsx: false),
    "py": LangInfo(family: .python, jsx: false),
    "javascript": LangInfo(family: .javascript, jsx: true),
    "js": LangInfo(family: .javascript, jsx: true),
    "jsx": LangInfo(family: .javascript, jsx: true),
    "typescript": LangInfo(family: .typescript, jsx: true),
    "ts": LangInfo(family: .typescript, jsx: true),
    "tsx": LangInfo(family: .typescript, jsx: true),
    "json": LangInfo(family: .json, jsx: false),
    "bash": LangInfo(family: .bash, jsx: false),
    "sh": LangInfo(family: .bash, jsx: false),
    "shell": LangInfo(family: .bash, jsx: false),
    "zsh": LangInfo(family: .bash, jsx: false),
    "swift": LangInfo(family: .swiftLang, jsx: false),
    "go": LangInfo(family: .go, jsx: false),
    "golang": LangInfo(family: .go, jsx: false),
    "rust": LangInfo(family: .rust, jsx: false),
    "rs": LangInfo(family: .rust, jsx: false),
    "yaml": LangInfo(family: .yaml, jsx: false),
    "yml": LangInfo(family: .yaml, jsx: false),
    "html": LangInfo(family: .html, jsx: false),
    "htm": LangInfo(family: .html, jsx: false),
    "css": LangInfo(family: .css, jsx: false),
    "sql": LangInfo(family: .sql, jsx: false),
    "diff": LangInfo(family: .diff, jsx: false),
    "c": LangInfo(family: .c, jsx: false),
    "cpp": LangInfo(family: .cpp, jsx: false),
    "c++": LangInfo(family: .cpp, jsx: false),
    "cc": LangInfo(family: .cpp, jsx: false),
    "cxx": LangInfo(family: .cpp, jsx: false),
    "hpp": LangInfo(family: .cpp, jsx: false),
    "java": LangInfo(family: .java, jsx: false),
    "csharp": LangInfo(family: .csharp, jsx: false),
    "cs": LangInfo(family: .csharp, jsx: false),
    "c#": LangInfo(family: .csharp, jsx: false),
    "kotlin": LangInfo(family: .kotlin, jsx: false),
    "kt": LangInfo(family: .kotlin, jsx: false),
    "kts": LangInfo(family: .kotlin, jsx: false),
]

private let pythonKeywords = [
    "False", "None", "True", "and", "as", "assert", "async", "await",
    "break", "class", "continue", "def", "del", "elif", "else", "except",
    "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
    "while", "with", "yield",
]

private let jsKeywords = [
    "async", "await", "break", "case", "catch", "class", "const",
    "continue", "debugger", "default", "delete", "do", "else", "export",
    "extends", "false", "finally", "for", "function", "if", "import",
    "in", "instanceof", "let", "new", "null", "of", "return", "static",
    "super", "switch", "this", "throw", "true", "try", "typeof",
    "undefined", "var", "void", "while", "yield",
]

private let tsKeywords = jsKeywords + [
    "abstract", "any", "as", "boolean", "declare", "enum", "implements",
    "infer", "interface", "keyof", "namespace", "never", "number",
    "private", "protected", "public", "readonly", "string", "symbol",
    "type", "unknown",
]

private let bashKeywords = [
    "alias", "break", "case", "continue", "coproc", "declare", "do",
    "done", "echo", "elif", "else", "esac", "exit", "export", "fi",
    "for", "function", "if", "in", "local", "readonly", "return",
    "select", "set", "shift", "source", "then", "time", "trap",
    "typeset", "unset", "until", "while",
]

private let swiftKeywords = [
    "Self", "Any", "as", "associatedtype", "async", "await", "break",
    "case", "catch", "class", "continue", "default", "defer", "deinit",
    "do", "else", "enum", "extension", "fallthrough", "false", "for",
    "func", "guard", "if", "import", "in", "init", "inout", "internal",
    "let", "nil", "operator", "private", "protocol", "public", "repeat",
    "return", "self", "some", "static", "struct", "subscript", "super",
    "switch", "throw", "throws", "true", "try", "typealias", "var",
    "where", "while",
]

private let goKeywords = [
    "break", "case", "chan", "const", "continue", "default", "defer",
    "else", "fallthrough", "false", "for", "func", "go", "goto", "if",
    "import", "interface", "map", "nil", "package", "range", "return",
    "select", "struct", "switch", "true", "type", "var",
]

private let rustKeywords = [
    "Self", "as", "async", "await", "break", "const", "continue", "crate",
    "dyn", "else", "enum", "extern", "false", "fn", "for", "if", "impl",
    "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
    "return", "self", "static", "struct", "super", "trait", "true",
    "type", "unsafe", "use", "where", "while",
]

private let jsonKeywords = ["true", "false", "null"]

private let yamlKeywords = ["true", "false", "null", "yes", "no", "on", "off"]

private let cssKeywords = [
    "absolute", "align-items", "auto", "background", "background-color",
    "block", "bold", "border", "border-radius", "bottom", "box-sizing",
    "center", "color", "column", "content", "cursor", "display", "fixed",
    "flex", "flex-direction", "float", "font", "font-family", "font-size",
    "font-weight", "gap", "grid", "height", "hidden", "important",
    "inherit", "initial", "justify-content", "left", "line-height",
    "margin", "max-width", "min-width", "monospace", "none", "normal",
    "nowrap", "opacity", "overflow", "padding", "pointer", "position",
    "relative", "right", "row", "solid", "sticky", "text-align", "top",
    "transform", "transition", "transparent", "unset", "visible", "width",
    "wrap", "z-index",
]

private let cKeywords = [
    "auto", "bool", "break", "case", "char", "const", "continue", "default",
    "do", "double", "else", "enum", "extern", "false", "float", "for", "goto",
    "if", "inline", "int", "long", "register", "return", "short", "signed",
    "sizeof", "static", "struct", "switch", "true", "typedef", "union",
    "unsigned", "void", "volatile", "while",
]

private let cppExtraKeywords = [
    "and", "and_eq", "bitand", "bitor", "catch", "class", "compl",
    "constexpr", "const_cast", "decltype", "delete", "dynamic_cast",
    "explicit", "export", "friend", "mutable", "namespace", "new",
    "noexcept", "not", "not_eq", "nullptr", "operator", "or", "or_eq",
    "private", "protected", "public", "reinterpret_cast", "static_assert",
    "static_cast", "template", "this", "thread_local", "throw", "try",
    "typeid", "typename", "using", "virtual", "wchar_t", "xor", "xor_eq",
]

private let javaKeywords = [
    "abstract", "assert", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "default", "do", "double", "else",
    "enum", "extends", "false", "final", "finally", "float", "for", "goto",
    "if", "implements", "import", "instanceof", "int", "interface", "long",
    "native", "new", "null", "package", "private", "protected", "public",
    "return", "short", "static", "strictfp", "super", "switch",
    "synchronized", "this", "throw", "throws", "transient", "true", "try",
    "void", "volatile", "while",
]

private let csharpKeywords = [
    "abstract", "as", "async", "await", "base", "bool", "break", "byte",
    "case", "catch", "char", "checked", "class", "const", "continue",
    "decimal", "default", "delegate", "do", "double", "else", "enum",
    "event", "explicit", "extern", "false", "finally", "fixed", "float",
    "for", "foreach", "goto", "if", "implicit", "in", "int", "interface",
    "internal", "is", "lock", "long", "namespace", "new", "null", "object",
    "operator", "out", "override", "params", "private", "protected",
    "public", "readonly", "ref", "return", "sbyte", "sealed", "short",
    "sizeof", "stackalloc", "static", "string", "struct", "switch", "this",
    "throw", "true", "try", "typeof", "uint", "ulong", "unchecked",
    "unsafe", "ushort", "using", "var", "virtual", "void", "volatile",
    "while",
]

private let kotlinKeywords = [
    "abstract", "actual", "annotation", "as", "break", "by", "catch",
    "class", "companion", "const", "constructor", "continue", "crossinline",
    "data", "delegate", "do", "dynamic", "else", "enum", "expect",
    "external", "false", "field", "file", "final", "finally", "for", "fun",
    "get", "if", "import", "in", "infix", "init", "inline", "inner",
    "interface", "internal", "is", "lateinit", "noinline", "null", "object",
    "open", "operator", "out", "override", "package", "param", "private",
    "property", "protected", "public", "receiver", "reified", "return",
    "sealed", "set", "setparam", "super", "suspend", "tailrec", "this",
    "throw", "true", "try", "typealias", "val", "var", "vararg", "when",
    "where", "while",
]

private let sqlKeywords = [
    "all", "alter", "and", "as", "avg", "between", "by", "case", "count",
    "create", "delete", "distinct", "drop", "else", "end", "exists",
    "false", "foreign", "from", "full", "group", "having", "in", "index",
    "inner", "insert", "into", "is", "join", "key", "left", "like",
    "limit", "max", "min", "not", "null", "offset", "on", "or", "order",
    "outer", "primary", "recursive", "references", "right", "select",
    "set", "sum", "table", "then", "true", "union", "update", "values",
    "view", "when", "where", "with",
]

private let cssUnits = [
    "dvh", "svh", "lvh", "vmax", "vmin", "rem", "px", "em", "vh", "vw",
    "ch", "ex", "pt", "pc", "in", "cm", "mm", "ms", "deg", "fr", "lh", "s",
]

private let prefixLetters: Set<Character> = ["r", "R", "u", "U", "b", "B", "f", "F"]

private func keywordList(_ family: CodeFamily) -> [String] {
    switch family {
    case .python: return pythonKeywords
    case .javascript: return jsKeywords
    case .typescript: return tsKeywords
    case .json: return jsonKeywords
    case .bash: return bashKeywords
    case .swiftLang: return swiftKeywords
    case .go: return goKeywords
    case .rust: return rustKeywords
    case .yaml: return yamlKeywords
    case .html, .diff: return []
    case .css: return cssKeywords
    case .sql: return sqlKeywords
    case .c: return cKeywords
    case .cpp: return cKeywords + cppExtraKeywords
    case .java: return javaKeywords
    case .csharp: return csharpKeywords
    case .kotlin: return kotlinKeywords
    }
}

private final class Scanner {
    let chars: [Character]
    let n: Int
    let family: CodeFamily
    let jsx: Bool
    let keywords: Set<String>
    let fold: Bool
    var i = 0
    var spans: [CodeHighlight.Span] = []

    init(source: String, info: LangInfo) {
        chars = Array(source)
        n = chars.count
        family = info.family
        jsx = info.jsx
        fold = info.family == .sql || info.family == .yaml
        keywords = Set(keywordList(info.family))
    }

    func scanCode() {
        while i < n {
            if tryJsxTag() { continue }
            if tryComment() { continue }
            if tryString() { continue }
            if tryDirective() { continue }
            if tryCssColor() { continue }
            if tryNumber() { continue }
            if tryAtKeyword() { continue }
            if tryYamlNull() { continue }
            if tryIdent() { continue }
            push(.plain, String(ch()))
            i += 1
        }
    }

    func scanHtml() {
        while i < n {
            if starts("<!--") {
                htmlComment()
                continue
            }
            if htmlTagStart() {
                scanHtmlTag()
                continue
            }
            if tryNumber() { continue }
            push(.plain, String(ch()))
            i += 1
        }
    }

    private func ch() -> Character {
        i < n ? chars[i] : "\0"
    }

    private func at(_ index: Int) -> Character {
        index >= 0 && index < n ? chars[index] : "\0"
    }

    private func starts(_ text: String) -> Bool {
        let extra = Array(text)
        if i + extra.count > n { return false }
        for (offset, character) in extra.enumerated() where chars[i + offset] != character {
            return false
        }
        return true
    }

    private func slice(_ start: Int, _ end: Int) -> String {
        let lo = max(0, min(start, n))
        let hi = max(lo, min(end, n))
        return String(chars[lo..<hi])
    }

    private func push(_ kind: CodeHighlight.Kind, _ text: String) {
        guard !text.isEmpty else { return }
        if var last = spans.last, last.kind == kind {
            last.text += text
            spans[spans.count - 1] = last
        } else {
            spans.append(CodeHighlight.Span(text: text, kind: kind))
        }
    }

    private func isDigit(_ c: Character) -> Bool {
        guard let value = c.asciiValue else { return false }
        return value >= 48 && value <= 57
    }

    private func isHex(_ c: Character) -> Bool {
        if isDigit(c) { return true }
        guard let value = c.asciiValue else { return false }
        return (value >= 65 && value <= 70) || (value >= 97 && value <= 102)
    }

    private func isLetter(_ c: Character) -> Bool {
        guard let value = c.asciiValue else { return false }
        return (value >= 65 && value <= 90) || (value >= 97 && value <= 122)
    }

    private func isSpace(_ c: Character) -> Bool {
        c == " " || c == "\t" || c == "\n" || c == "\r"
    }

    private func dollarIdent() -> Bool {
        family == .javascript || family == .typescript
    }

    private func isIdentStart(_ c: Character) -> Bool {
        if isLetter(c) || c == "_" { return true }
        if c == "$" && dollarIdent() { return true }
        if c == "-" && family == .css { return true }
        return false
    }

    private func isIdentChar(_ c: Character) -> Bool {
        isIdentStart(c) || isDigit(c)
    }

    private func isTagChar(_ c: Character) -> Bool {
        isLetter(c) || isDigit(c) || c == "_" || c == "." || c == ":" || c == "-"
    }

    private func tryComment() -> Bool {
        switch family {
        case .python:
            if ch() == "#" {
                lineComment()
                return true
            }
            return false
        case .bash, .yaml:
            if ch() == "#" && hashOk() {
                lineComment()
                return true
            }
            return false
        case .sql:
            if starts("--") {
                lineComment()
                return true
            }
            if starts("/*") {
                blockComment()
                return true
            }
            return false
        case .json, .html, .diff:
            return false
        case .javascript, .typescript, .swiftLang, .go, .rust, .css, .c, .cpp, .java, .csharp, .kotlin:
            if starts("//") {
                lineComment()
                return true
            }
            if starts("/*") {
                blockComment()
                return true
            }
            return false
        }
    }

    private func hashOk() -> Bool {
        if i == 0 { return true }
        return isSpace(at(i - 1))
    }

    private func lineComment() {
        let start = i
        while i < n && ch() != "\n" && ch() != "\r" { i += 1 }
        push(.comment, slice(start, i))
    }

    private func blockComment() {
        let start = i
        i += 2
        while i < n && !starts("*/") { i += 1 }
        if starts("*/") { i += 2 }
        push(.comment, slice(start, i))
    }

    private func tryString() -> Bool {
        switch family {
        case .python:
            return tryPythonString()
        case .javascript, .typescript:
            return tryJsString()
        case .json:
            return tryQuoteString("\"")
        case .bash:
            return tryBashString()
        case .swiftLang:
            return trySwiftString()
        case .go:
            return tryGoString()
        case .rust:
            return tryRustString()
        case .yaml:
            return tryYamlString()
        case .css:
            if ch() == "'" || ch() == "\"" { return tryQuoteString(ch()) }
            return false
        case .sql:
            return trySqlString()
        case .c, .cpp, .java, .kotlin:
            return tryCLikeString()
        case .csharp:
            return tryCSharpString()
        case .html, .diff:
            return false
        }
    }

    /// A C or C++ preprocessor line. Only a hash that opens the line
    /// (spaces and tabs allowed) is a directive.
    private func tryDirective() -> Bool {
        guard family == .c || family == .cpp else { return false }
        guard ch() == "#" else { return false }
        var k = i - 1
        while k >= 0 && (at(k) == " " || at(k) == "\t") { k -= 1 }
        if k >= 0 && at(k) != "\n" && at(k) != "\r" { return false }
        let start = i
        i += 1
        while isLetter(ch()) || ch() == "_" { i += 1 }
        if i == start + 1 {
            i = start
            return false
        }
        push(.keyword, slice(start, i))
        return true
    }

    /// Quotes, plus Java and Kotlin text blocks.
    private func tryCLikeString() -> Bool {
        let quote = ch()
        guard quote == "\"" || quote == "'" else { return false }
        if quote == "\"" && (family == .java || family == .kotlin) && starts("\"\"\"") {
            consumeQuoted("\"", triple: true, raw: false, start: i)
            return true
        }
        consumeQuoted(quote, triple: false, raw: false, start: i)
        return true
    }

    /// Ordinary quotes, plus `@"..."`, `$"..."`, and `$@""` / `@$""`.
    private func tryCSharpString() -> Bool {
        let atQuote = ch() == "@" && at(i + 1) == "\""
        let dollarQuote = ch() == "$" && at(i + 1) == "\""
        let atDollar = ch() == "@" && at(i + 1) == "$" && at(i + 2) == "\""
        let dollarAt = ch() == "$" && at(i + 1) == "@" && at(i + 2) == "\""
        if atQuote || dollarQuote || atDollar || dollarAt {
            let verbatim = atQuote || atDollar || dollarAt
            if verbatim {
                consumeVerbatim()
                return true
            }
            let start = i
            i += 1
            consumeQuoted("\"", triple: false, raw: false, start: start)
            return true
        }
        return tryCLikeString()
    }

    /// C# verbatim string. A doubled quote is one quote, not the end.
    private func consumeVerbatim() {
        let start = i
        while i < n && ch() != "\"" { i += 1 }
        if ch() == "\"" { i += 1 }
        while i < n {
            if ch() == "\"" {
                if at(i + 1) == "\"" {
                    i += 2
                    continue
                }
                i += 1
                break
            }
            i += 1
        }
        push(.string, slice(start, i))
    }

    private func tryQuoteString(_ quote: Character) -> Bool {
        guard ch() == quote else { return false }
        consumeQuoted(quote, triple: false, raw: false, start: i)
        return true
    }

    private func tryPythonString() -> Bool {
        let start = i
        var j = start
        var prefix = ""
        while j < n && prefix.count < 2 && prefixLetters.contains(at(j)) {
            prefix.append(at(j))
            j += 1
        }
        let quote = at(j)
        if quote != "'" && quote != "\"" { return false }
        i = j
        let triple = starts(String(repeating: String(quote), count: 3))
        let raw = prefix.contains("r") || prefix.contains("R")
        consumeQuoted(quote, triple: triple, raw: raw, start: start)
        return true
    }

    private func tryJsString() -> Bool {
        let quote = ch()
        if quote != "'" && quote != "\"" && quote != "`" { return false }
        consumeQuoted(quote, triple: false, raw: false, start: i)
        return true
    }

    private func tryBashString() -> Bool {
        if starts("$'") || starts("$\"") {
            let quote = at(i + 1)
            i += 1
            consumeQuoted(quote, triple: false, raw: false, start: i - 1)
            return true
        }
        if ch() == "'" {
            consumeQuoted("'", triple: false, raw: true, start: i)
            return true
        }
        if ch() == "\"" {
            consumeQuoted("\"", triple: false, raw: false, start: i)
            return true
        }
        return false
    }

    private func trySwiftString() -> Bool {
        if trySwiftRaw() { return true }
        if ch() != "\"" { return false }
        let triple = starts("\"\"\"")
        consumeQuoted("\"", triple: triple, raw: false, start: i)
        return true
    }

    private func trySwiftRaw() -> Bool {
        if ch() != "#" { return false }
        var hashes = 0
        var j = i
        while at(j) == "#" {
            hashes += 1
            j += 1
        }
        if at(j) != "\"" { return false }
        let start = i
        let triple = starts(at: j, "\"\"\"")
        i = j + (triple ? 3 : 1)
        let closer = (triple ? "\"\"\"" : "\"") + String(repeating: "#", count: hashes)
        while i < n && !starts(closer) {
            if ch() == "\\" && at(i + 1) == "#" {
                i += 2
                continue
            }
            i += 1
        }
        if starts(closer) { i += closer.count }
        push(.string, slice(start, i))
        return true
    }

    private func tryGoString() -> Bool {
        if ch() == "`" {
            let start = i
            i += 1
            while i < n && ch() != "`" { i += 1 }
            if ch() == "`" { i += 1 }
            push(.string, slice(start, i))
            return true
        }
        if ch() == "\"" || ch() == "'" {
            consumeQuoted(ch(), triple: false, raw: false, start: i)
            return true
        }
        return false
    }

    private func tryRustString() -> Bool {
        if tryRustRaw() { return true }
        if tryRustChar() { return true }
        if ch() != "\"" { return false }
        consumeQuoted("\"", triple: false, raw: false, start: i)
        return true
    }

    private func tryRustRaw() -> Bool {
        if ch() != "r" { return false }
        var hashes = 0
        var j = i + 1
        while at(j) == "#" {
            hashes += 1
            j += 1
        }
        if at(j) != "\"" { return false }
        let start = i
        i = j + 1
        let closer = "\"" + String(repeating: "#", count: hashes)
        while i < n && !starts(closer) { i += 1 }
        if starts(closer) { i += closer.count }
        push(.string, slice(start, i))
        return true
    }

    private func tryRustChar() -> Bool {
        if ch() != "'" { return false }
        if at(i + 1) == "\\" {
            var j = i + 2
            if at(i + 2) == "u" && at(i + 3) == "{" {
                j = i + 4
                while j < n && at(j) != "}" { j += 1 }
                if at(j) == "}" { j += 1 }
            } else {
                j = i + 3
            }
            if at(j) == "'" {
                push(.string, slice(i, j + 1))
                i = j + 1
                return true
            }
            return false
        }
        if at(i + 1) != "\0" && at(i + 1) != "'" && at(i + 2) == "'" {
            push(.string, slice(i, i + 3))
            i += 3
            return true
        }
        return false
    }

    private func tryYamlString() -> Bool {
        if ch() == "'" {
            consumeDoubled("'", start: i)
            return true
        }
        if ch() == "\"" {
            consumeQuoted("\"", triple: false, raw: false, start: i)
            return true
        }
        return false
    }

    private func trySqlString() -> Bool {
        if ch() == "'" {
            consumeDoubled("'", start: i)
            return true
        }
        if ch() == "\"" {
            consumeQuoted("\"", triple: false, raw: false, start: i)
            return true
        }
        return false
    }

    private func consumeQuoted(_ quote: Character, triple: Bool, raw: Bool, start: Int) {
        i += triple ? 3 : 1
        let closer = triple ? String(repeating: String(quote), count: 3) : String(quote)
        while i < n {
            if !raw && ch() == "\\" {
                i += i + 1 < n ? 2 : 1
                continue
            }
            if starts(closer) {
                i += closer.count
                break
            }
            i += 1
        }
        push(.string, slice(start, i))
    }

    private func consumeDoubled(_ quote: Character, start: Int) {
        i = start + 1
        while i < n {
            if ch() == quote {
                if at(i + 1) == quote {
                    i += 2
                    continue
                }
                i += 1
                break
            }
            i += 1
        }
        push(.string, slice(start, i))
    }

    private func tryCssColor() -> Bool {
        if family != .css || ch() != "#" { return false }
        var j = i + 1
        var hex = 0
        while isHex(at(j)) {
            hex += 1
            j += 1
        }
        if hex != 3 && hex != 4 && hex != 6 && hex != 8 { return false }
        if isIdentChar(at(j)) { return false }
        push(.number, slice(i, j))
        i = j
        return true
    }

    private func tryNumber() -> Bool {
        let prev: Character = i > 0 ? at(i - 1) : "\0"
        if prev == "$" || (prev != "\0" && isIdentChar(prev)) { return false }
        let c = ch()
        if c == "0" && (at(i + 1) == "x" || at(i + 1) == "X") && isHex(at(i + 2)) {
            var j = i + 2
            while isHex(at(j)) { j += 1 }
            finishNumber(j)
            return true
        }
        var j = i
        if c == "." && isDigit(at(i + 1)) {
            j = i + 1
        } else if isDigit(c) {
            j = i
        } else {
            return false
        }
        while isDigit(at(j)) { j += 1 }
        if at(j) == "." && isDigit(at(j + 1)) {
            j += 1
            while isDigit(at(j)) { j += 1 }
        } else if isDigit(c) && at(j) == "." && !isDigit(at(j + 1)) && !isIdentStart(at(j + 1)) {
            j += 1
        }
        if at(j) == "e" || at(j) == "E" {
            var k = j + 1
            if at(k) == "+" || at(k) == "-" { k += 1 }
            if isDigit(at(k)) {
                while isDigit(at(k)) { k += 1 }
                j = k
            }
        }
        finishNumber(j)
        return true
    }

    private func finishNumber(_ end: Int) {
        var j = end
        if family == .css {
            if at(j) == "%" {
                j += 1
            } else {
                let rest = slice(j, min(j + 4, n)).lowercased()
                for unit in cssUnits where rest.hasPrefix(unit) && !isIdentChar(at(j + unit.count)) {
                    j += unit.count
                    break
                }
            }
        }
        push(.number, slice(i, j))
        i = j
    }

    private func tryAtKeyword() -> Bool {
        if family != .css || ch() != "@" { return false }
        if !isLetter(at(i + 1)) { return false }
        let start = i
        i += 1
        while isLetter(ch()) || ch() == "-" { i += 1 }
        push(.keyword, slice(start, i))
        return true
    }

    private func tryYamlNull() -> Bool {
        if family != .yaml || ch() != "~" { return false }
        let prev: Character = i > 0 ? at(i - 1) : "\0"
        let next = at(i + 1)
        func boundary(_ c: Character) -> Bool {
            c == "\0" || isSpace(c) || c == ":" || c == "," || c == "[" || c == "]"
        }
        if !boundary(prev) || !boundary(next) { return false }
        push(.keyword, "~")
        i += 1
        return true
    }

    private func tryIdent() -> Bool {
        if !isIdentStart(ch()) { return false }
        if ch() == "-" && !isIdentChar(at(i + 1)) { return false }
        let start = i
        i += 1
        while isIdentChar(ch()) { i += 1 }
        let word = slice(start, i)
        if word == "-" || word == "--" {
            i = start
            return false
        }
        let key = fold ? word.lowercased() : word
        push(keywords.contains(key) ? .keyword : .plain, word)
        return true
    }

    private func jsxTagStart() -> Bool {
        if !jsx || ch() != "<" { return false }
        let next = at(i + 1)
        if next != "/" && !isLetter(next) { return false }
        if i > 0 && isJsIdent(at(i - 1)) { return false }
        return true
    }

    private func isJsIdent(_ c: Character) -> Bool {
        isLetter(c) || isDigit(c) || c == "_" || c == "$"
    }

    private func tryJsxTag() -> Bool {
        if !jsxTagStart() { return false }
        push(.plain, "<")
        i += 1
        if ch() == "/" {
            push(.plain, "/")
            i += 1
        }
        pushTagName()
        while i < n {
            let c = ch()
            if c == ">" {
                push(.plain, ">")
                i += 1
                break
            }
            if c == "/" && at(i + 1) == ">" {
                push(.plain, "/>")
                i += 2
                break
            }
            if c == "'" || c == "\"" {
                consumeQuoted(c, triple: false, raw: false, start: i)
                continue
            }
            if c == "{" {
                scanBraces()
                continue
            }
            push(.plain, String(c))
            i += 1
        }
        return true
    }

    private func pushTagName() {
        if !isLetter(ch()) { return }
        let start = i
        while isTagChar(ch()) { i += 1 }
        push(.keyword, slice(start, i))
    }

    private func scanBraces() {
        push(.plain, "{")
        i += 1
        var depth = 1
        while i < n && depth > 0 {
            if tryJsxTag() { continue }
            if ch() == "{" {
                push(.plain, "{")
                i += 1
                depth += 1
                continue
            }
            if ch() == "}" {
                depth -= 1
                push(.plain, "}")
                i += 1
                if depth == 0 { return }
                continue
            }
            if tryComment() { continue }
            if tryString() { continue }
            if tryNumber() { continue }
            if tryIdent() { continue }
            push(.plain, String(ch()))
            i += 1
        }
    }

    private func htmlTagStart() -> Bool {
        if ch() != "<" { return false }
        let next = at(i + 1)
        return isLetter(next) || next == "/" || next == "!"
    }

    private func scanHtmlTag() {
        push(.plain, "<")
        i += 1
        if ch() == "/" {
            push(.plain, "/")
            i += 1
        }
        if ch() == "!" {
            push(.plain, "!")
            i += 1
        }
        pushTagName()
        while i < n {
            let c = ch()
            if c == ">" {
                push(.plain, ">")
                i += 1
                return
            }
            if c == "/" && at(i + 1) == ">" {
                push(.plain, "/>")
                i += 2
                return
            }
            if c == "'" || c == "\"" {
                consumeQuoted(c, triple: false, raw: false, start: i)
                continue
            }
            if tryNumber() { continue }
            push(.plain, String(c))
            i += 1
        }
    }

    private func htmlComment() {
        let start = i
        i += 4
        while i < n && !starts("-->") { i += 1 }
        if starts("-->") { i += 3 }
        push(.comment, slice(start, i))
    }

    private func starts(at index: Int, _ text: String) -> Bool {
        let extra = Array(text)
        if index + extra.count > n { return false }
        for (offset, character) in extra.enumerated() where chars[index + offset] != character {
            return false
        }
        return true
    }
}
