// SPDX-License-Identifier: Apache-2.0

/**
 * v1.37: syntax highlighting inside completed assistant code fences.
 * A recognized language info string colors keywords, strings, comments,
 * and numbers. Unlabeled fences and unknown languages stay plain.
 * The tokenizer is local. It does not fetch, and it does not add HTTP.
 * Streaming stays plain (`completed: false`). Copy still uses the raw
 * source. Mermaid and TeX math are not languages here.
 * v2.09: C, C++, Java, C#, and Kotlin were still monochrome. A
 * completed fence tagged with those info strings now colors
 * keywords, strings, comments, and numbers the same way. A C or
 * C++ hash directive at the start of a line is a keyword. Java
 * and Kotlin text blocks, and a C# verbatim string, stay strings.
 * Unknown languages stay plain.
 * Keep in lockstep with `ios/SnorlaxBot/CodeHighlight.swift`.
 */

export type CodeTokenKind = "plain" | "keyword" | "string" | "comment" | "number";

export type CodeToken = {
  text: string;
  kind: CodeTokenKind;
};

type Family =
  | "python"
  | "javascript"
  | "typescript"
  | "json"
  | "bash"
  | "swift"
  | "go"
  | "rust"
  | "yaml"
  | "html"
  | "css"
  | "sql"
  | "diff"
  | "c"
  | "cpp"
  | "java"
  | "csharp"
  | "kotlin";

type LangInfo = { family: Family; jsx: boolean };

const ALIASES: Record<string, LangInfo> = {
  python: { family: "python", jsx: false },
  py: { family: "python", jsx: false },
  javascript: { family: "javascript", jsx: true },
  js: { family: "javascript", jsx: true },
  jsx: { family: "javascript", jsx: true },
  typescript: { family: "typescript", jsx: true },
  ts: { family: "typescript", jsx: true },
  tsx: { family: "typescript", jsx: true },
  json: { family: "json", jsx: false },
  bash: { family: "bash", jsx: false },
  sh: { family: "bash", jsx: false },
  shell: { family: "bash", jsx: false },
  zsh: { family: "bash", jsx: false },
  swift: { family: "swift", jsx: false },
  go: { family: "go", jsx: false },
  golang: { family: "go", jsx: false },
  rust: { family: "rust", jsx: false },
  rs: { family: "rust", jsx: false },
  yaml: { family: "yaml", jsx: false },
  yml: { family: "yaml", jsx: false },
  html: { family: "html", jsx: false },
  htm: { family: "html", jsx: false },
  css: { family: "css", jsx: false },
  sql: { family: "sql", jsx: false },
  diff: { family: "diff", jsx: false },
  "c": { family: "c", jsx: false },
  "cpp": { family: "cpp", jsx: false },
  "c++": { family: "cpp", jsx: false },
  "cc": { family: "cpp", jsx: false },
  "cxx": { family: "cpp", jsx: false },
  "hpp": { family: "cpp", jsx: false },
  "java": { family: "java", jsx: false },
  "csharp": { family: "csharp", jsx: false },
  "cs": { family: "csharp", jsx: false },
  "c#": { family: "csharp", jsx: false },
  "kotlin": { family: "kotlin", jsx: false },
  "kt": { family: "kotlin", jsx: false },
  "kts": { family: "kotlin", jsx: false },
};

const PYTHON_KEYWORDS = [
  "False", "None", "True", "and", "as", "assert", "async", "await",
  "break", "class", "continue", "def", "del", "elif", "else", "except",
  "finally", "for", "from", "global", "if", "import", "in", "is",
  "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
  "while", "with", "yield",
];

const JS_KEYWORDS = [
  "async", "await", "break", "case", "catch", "class", "const",
  "continue", "debugger", "default", "delete", "do", "else", "export",
  "extends", "false", "finally", "for", "function", "if", "import",
  "in", "instanceof", "let", "new", "null", "of", "return", "static",
  "super", "switch", "this", "throw", "true", "try", "typeof",
  "undefined", "var", "void", "while", "yield",
];

const TS_KEYWORDS = [
  ...JS_KEYWORDS,
  "abstract", "any", "as", "boolean", "declare", "enum", "implements",
  "infer", "interface", "keyof", "namespace", "never", "number",
  "private", "protected", "public", "readonly", "string", "symbol",
  "type", "unknown",
];

const BASH_KEYWORDS = [
  "alias", "break", "case", "continue", "coproc", "declare", "do",
  "done", "echo", "elif", "else", "esac", "exit", "export", "fi",
  "for", "function", "if", "in", "local", "readonly", "return",
  "select", "set", "shift", "source", "then", "time", "trap",
  "typeset", "unset", "until", "while",
];

const SWIFT_KEYWORDS = [
  "Self", "Any", "as", "associatedtype", "async", "await", "break",
  "case", "catch", "class", "continue", "default", "defer", "deinit",
  "do", "else", "enum", "extension", "fallthrough", "false", "for",
  "func", "guard", "if", "import", "in", "init", "inout", "internal",
  "let", "nil", "operator", "private", "protocol", "public", "repeat",
  "return", "self", "some", "static", "struct", "subscript", "super",
  "switch", "throw", "throws", "true", "try", "typealias", "var",
  "where", "while",
];

const GO_KEYWORDS = [
  "break", "case", "chan", "const", "continue", "default", "defer",
  "else", "fallthrough", "false", "for", "func", "go", "goto", "if",
  "import", "interface", "map", "nil", "package", "range", "return",
  "select", "struct", "switch", "true", "type", "var",
];

const RUST_KEYWORDS = [
  "Self", "as", "async", "await", "break", "const", "continue", "crate",
  "dyn", "else", "enum", "extern", "false", "fn", "for", "if", "impl",
  "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
  "return", "self", "static", "struct", "super", "trait", "true",
  "type", "unsafe", "use", "where", "while",
];

const JSON_KEYWORDS = ["true", "false", "null"];

const YAML_KEYWORDS = ["true", "false", "null", "yes", "no", "on", "off"];

const CSS_KEYWORDS = [
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
];

const C_KEYWORDS = [
  "auto", "bool", "break", "case", "char", "const", "continue", "default",
  "do", "double", "else", "enum", "extern", "false", "float", "for", "goto",
  "if", "inline", "int", "long", "register", "return", "short", "signed",
  "sizeof", "static", "struct", "switch", "true", "typedef", "union",
  "unsigned", "void", "volatile", "while",
];

const CPP_KEYWORDS = [
  ...C_KEYWORDS,
  "and", "and_eq", "bitand", "bitor", "catch", "class", "compl",
  "constexpr", "const_cast", "decltype", "delete", "dynamic_cast",
  "explicit", "export", "friend", "mutable", "namespace", "new",
  "noexcept", "not", "not_eq", "nullptr", "operator", "or", "or_eq",
  "private", "protected", "public", "reinterpret_cast", "static_assert",
  "static_cast", "template", "this", "thread_local", "throw", "try",
  "typeid", "typename", "using", "virtual", "wchar_t", "xor", "xor_eq",
];

const JAVA_KEYWORDS = [
  "abstract", "assert", "boolean", "break", "byte", "case", "catch",
  "char", "class", "const", "continue", "default", "do", "double", "else",
  "enum", "extends", "false", "final", "finally", "float", "for", "goto",
  "if", "implements", "import", "instanceof", "int", "interface", "long",
  "native", "new", "null", "package", "private", "protected", "public",
  "return", "short", "static", "strictfp", "super", "switch",
  "synchronized", "this", "throw", "throws", "transient", "true", "try",
  "void", "volatile", "while",
];

const CSHARP_KEYWORDS = [
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
];

const KOTLIN_KEYWORDS = [
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
];

const SQL_KEYWORDS = [
  "all", "alter", "and", "as", "avg", "between", "by", "case", "count",
  "create", "delete", "distinct", "drop", "else", "end", "exists",
  "false", "foreign", "from", "full", "group", "having", "in", "index",
  "inner", "insert", "into", "is", "join", "key", "left", "like",
  "limit", "max", "min", "not", "null", "offset", "on", "or", "order",
  "outer", "primary", "recursive", "references", "right", "select",
  "set", "sum", "table", "then", "true", "union", "update", "values",
  "view", "when", "where", "with",
];

const CSS_UNITS = [
  "dvh", "svh", "lvh", "vmax", "vmin", "rem", "px", "em", "vh", "vw",
  "ch", "ex", "pt", "pc", "in", "cm", "mm", "ms", "deg", "fr", "lh", "s",
];

const KEYWORDS: Record<Family, readonly string[]> = {
  python: PYTHON_KEYWORDS,
  javascript: JS_KEYWORDS,
  typescript: TS_KEYWORDS,
  json: JSON_KEYWORDS,
  bash: BASH_KEYWORDS,
  swift: SWIFT_KEYWORDS,
  go: GO_KEYWORDS,
  rust: RUST_KEYWORDS,
  yaml: YAML_KEYWORDS,
  html: [],
  css: CSS_KEYWORDS,
  sql: SQL_KEYWORDS,
  diff: [],
  c: C_KEYWORDS,
  cpp: CPP_KEYWORDS,
  java: JAVA_KEYWORDS,
  csharp: CSHARP_KEYWORDS,
  kotlin: KOTLIN_KEYWORDS,
};

function resolveLanguage(language: string): LangInfo | null {
  const token = language.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!token) return null;
  return ALIASES[token] ?? null;
}

/** First info-string token, lowercased, when it names a known language. */
export function codeHighlightLanguage(language: string): string | null {
  const token = language.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!token || !ALIASES[token]) return null;
  return token;
}

export function shouldHighlightCode(opts: {
  language: string;
  completed: boolean;
}): boolean {
  return opts.completed && codeHighlightLanguage(opts.language) != null;
}

export function codeHighlightClass(kind: CodeTokenKind): string {
  if (kind === "plain") return "";
  return `md-tok md-tok-${kind}`;
}

/** Colors swap with the theme. The spans themselves never animate. */
export function codeHighlightAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export function highlightCode(source: string, language: string): CodeToken[] {
  const info = resolveLanguage(language);
  if (!info) return source ? [{ text: source, kind: "plain" }] : [];
  if (!source) return [];
  if (info.family === "diff") return highlightDiff(source);
  const hl = new Scanner(source, info);
  if (info.family === "html") hl.scanHtml();
  else hl.scanCode();
  return hl.spans;
}

function highlightDiff(source: string): CodeToken[] {
  const spans: CodeToken[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const text = line + (index < lines.length - 1 ? "\n" : "");
    pushSpan(spans, diffKind(line), text);
  }
  return spans;
}

function diffKind(line: string): CodeTokenKind {
  if (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("---") ||
    line.startsWith("+++") ||
    line.startsWith("@@")
  ) {
    return "comment";
  }
  if (line.startsWith("+")) return "string";
  if (line.startsWith("-")) return "keyword";
  return "plain";
}

function pushSpan(spans: CodeToken[], kind: CodeTokenKind, text: string): void {
  if (!text) return;
  const last = spans[spans.length - 1];
  if (last && last.kind === kind) last.text += text;
  else spans.push({ text, kind });
}

class Scanner {
  readonly src: string;
  readonly n: number;
  readonly family: Family;
  readonly jsx: boolean;
  readonly keywords: ReadonlySet<string>;
  readonly fold: boolean;
  i = 0;
  spans: CodeToken[] = [];

  constructor(src: string, info: LangInfo) {
    this.src = src;
    this.n = src.length;
    this.family = info.family;
    this.jsx = info.jsx;
    this.fold = info.family === "sql" || info.family === "yaml";
    this.keywords = new Set(KEYWORDS[info.family]);
  }

  scanCode(): void {
    while (this.i < this.n) {
      if (this.tryJsxTag()) continue;
      if (this.tryComment()) continue;
      if (this.tryString()) continue;
      if (this.tryDirective()) continue;
      if (this.tryCssColor()) continue;
      if (this.tryNumber()) continue;
      if (this.tryAtKeyword()) continue;
      if (this.tryYamlNull()) continue;
      if (this.tryIdent()) continue;
      this.push("plain", this.ch());
      this.i += 1;
    }
  }

  scanHtml(): void {
    while (this.i < this.n) {
      if (this.starts("<!--")) {
        this.htmlComment();
        continue;
      }
      if (this.htmlTagStart()) {
        this.scanHtmlTag();
        continue;
      }
      if (this.tryNumber()) continue;
      this.push("plain", this.ch());
      this.i += 1;
    }
  }

  private ch(): string {
    return this.src[this.i] ?? "";
  }

  private at(index: number): string {
    return this.src[index] ?? "";
  }

  private starts(text: string): boolean {
    return this.src.startsWith(text, this.i);
  }

  private push(kind: CodeTokenKind, text: string): void {
    pushSpan(this.spans, kind, text);
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isHex(c: string): boolean {
    return this.isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
  }

  private isLetter(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
  }

  private isSpace(c: string): boolean {
    return c === " " || c === "\t" || c === "\n" || c === "\r";
  }

  private dollarIdent(): boolean {
    return this.family === "javascript" || this.family === "typescript";
  }

  private isIdentStart(c: string): boolean {
    if (this.isLetter(c) || c === "_") return true;
    if (c === "$" && this.dollarIdent()) return true;
    if (c === "-" && this.family === "css") return true;
    return false;
  }

  private isIdentChar(c: string): boolean {
    if (this.isIdentStart(c) || this.isDigit(c)) return true;
    return false;
  }

  private tryComment(): boolean {
    const family = this.family;
    if (family === "python") {
      if (this.ch() === "#") {
        this.lineComment();
        return true;
      }
      return false;
    }
    if (family === "bash" || family === "yaml") {
      if (this.ch() === "#" && this.hashOk()) {
        this.lineComment();
        return true;
      }
      return false;
    }
    if (family === "sql") {
      if (this.starts("--")) {
        this.lineComment();
        return true;
      }
      if (this.starts("/*")) {
        this.blockComment();
        return true;
      }
      return false;
    }
    if (family === "json" || family === "html" || family === "diff") return false;
    if (this.starts("//")) {
      this.lineComment();
      return true;
    }
    if (this.starts("/*")) {
      this.blockComment();
      return true;
    }
    return false;
  }

  private hashOk(): boolean {
    if (this.i === 0) return true;
    return this.isSpace(this.at(this.i - 1));
  }

  private lineComment(): void {
    const start = this.i;
    while (this.i < this.n && this.ch() !== "\n" && this.ch() !== "\r") this.i += 1;
    this.push("comment", this.src.slice(start, this.i));
  }

  private blockComment(): void {
    const start = this.i;
    this.i += 2;
    while (this.i < this.n && !this.starts("*/")) this.i += 1;
    if (this.starts("*/")) this.i += 2;
    this.push("comment", this.src.slice(start, this.i));
  }

  private tryString(): boolean {
    switch (this.family) {
      case "python":
        return this.tryPythonString();
      case "javascript":
      case "typescript":
        return this.tryJsString();
      case "json":
        return this.tryQuoteString('"', false);
      case "bash":
        return this.tryBashString();
      case "swift":
        return this.trySwiftString();
      case "go":
        return this.tryGoString();
      case "rust":
        return this.tryRustString();
      case "yaml":
        return this.tryYamlString();
      case "css":
        return this.tryQuoteString(this.ch() === "'" || this.ch() === '"' ? this.ch() : "", false);
      case "sql":
        return this.trySqlString();
      case "c":
      case "cpp":
      case "java":
      case "kotlin":
        return this.tryCLikeString();
      case "csharp":
        return this.tryCSharpString();
      default:
        return false;
    }
  }

  /**
   * A C or C++ preprocessor line. Only a hash that opens the line
   * (spaces and tabs allowed) is a directive. `#include` inside a
   * string or a comment never reaches this.
   */
  private tryDirective(): boolean {
    if (this.family !== "c" && this.family !== "cpp") return false;
    if (this.ch() !== "#") return false;
    let k = this.i - 1;
    while (k >= 0 && (this.at(k) === " " || this.at(k) === "\t")) k -= 1;
    if (k >= 0 && this.at(k) !== "\n" && this.at(k) !== "\r") return false;
    const start = this.i;
    this.i += 1;
    while (this.isLetter(this.ch()) || this.ch() === "_") this.i += 1;
    if (this.i === start + 1) {
      this.i = start;
      return false;
    }
    this.push("keyword", this.src.slice(start, this.i));
    return true;
  }

  /** Quotes, plus Java and Kotlin text blocks. */
  private tryCLikeString(): boolean {
    const quote = this.ch();
    if (quote !== '"' && quote !== "'") return false;
    if (
      quote === '"' &&
      (this.family === "java" || this.family === "kotlin") &&
      this.starts('"""')
    ) {
      this.consumeQuoted('"', true, false, this.i);
      return true;
    }
    this.consumeQuoted(quote, false, false, this.i);
    return true;
  }

  /** Ordinary quotes, plus `@"..."`, `$"..."`, and `$@""` / `@$""`. */
  private tryCSharpString(): boolean {
    if (
      (this.ch() === "@" && this.at(this.i + 1) === '"') ||
      (this.ch() === "$" && this.at(this.i + 1) === '"') ||
      (this.ch() === "@" && this.at(this.i + 1) === "$" && this.at(this.i + 2) === '"') ||
      (this.ch() === "$" && this.at(this.i + 1) === "@" && this.at(this.i + 2) === '"')
    ) {
      const verbatim =
        (this.ch() === "@" && this.at(this.i + 1) === '"') ||
        (this.ch() === "@" && this.at(this.i + 1) === "$") ||
        (this.ch() === "$" && this.at(this.i + 1) === "@");
      if (verbatim) {
        this.consumeVerbatim();
        return true;
      }
      const start = this.i;
      this.i += 1;
      this.consumeQuoted('"', false, false, start);
      return true;
    }
    return this.tryCLikeString();
  }

  /** C# verbatim string. A doubled quote is one quote, not the end. */
  private consumeVerbatim(): void {
    const start = this.i;
    while (this.i < this.n && this.ch() !== '"') this.i += 1;
    if (this.ch() === '"') this.i += 1;
    while (this.i < this.n) {
      if (this.ch() === '"') {
        if (this.at(this.i + 1) === '"') {
          this.i += 2;
          continue;
        }
        this.i += 1;
        break;
      }
      this.i += 1;
    }
    this.push("string", this.src.slice(start, this.i));
  }

  private tryQuoteString(quote: string, raw: boolean): boolean {
    if (!quote || this.ch() !== quote) return false;
    this.consumeQuoted(quote, false, raw, this.i);
    return true;
  }

  private tryPythonString(): boolean {
    const start = this.i;
    let j = start;
    let prefix = "";
    while (j < this.n && prefix.length < 2 && "rRuUbBfF".includes(this.at(j))) {
      prefix += this.at(j);
      j += 1;
    }
    const quote = this.at(j);
    if (quote !== "'" && quote !== '"') return false;
    this.i = j;
    const triple = this.starts(quote + quote + quote);
    this.consumeQuoted(quote, triple, /[rR]/.test(prefix), start);
    return true;
  }

  private tryJsString(): boolean {
    const quote = this.ch();
    if (quote !== "'" && quote !== '"' && quote !== "`") return false;
    this.consumeQuoted(quote, false, false, this.i);
    return true;
  }

  private tryBashString(): boolean {
    if (this.starts("$'") || this.starts('$"')) {
      const quote = this.at(this.i + 1);
      this.i += 1;
      this.consumeQuoted(quote, false, false, this.i - 1);
      return true;
    }
    if (this.ch() === "'") {
      this.consumeQuoted("'", false, true, this.i);
      return true;
    }
    if (this.ch() === '"') {
      this.consumeQuoted('"', false, false, this.i);
      return true;
    }
    return false;
  }

  private trySwiftString(): boolean {
    if (this.trySwiftRaw()) return true;
    if (this.ch() !== '"') return false;
    const triple = this.starts('"""');
    this.consumeQuoted('"', triple, false, this.i);
    return true;
  }

  private trySwiftRaw(): boolean {
    if (this.ch() !== "#") return false;
    let hashes = 0;
    let j = this.i;
    while (this.at(j) === "#") {
      hashes += 1;
      j += 1;
    }
    if (this.at(j) !== '"') return false;
    const start = this.i;
    const triple = this.src.startsWith('"""', j);
    this.i = j + (triple ? 3 : 1);
    const closer = (triple ? '"""' : '"') + "#".repeat(hashes);
    while (this.i < this.n && !this.starts(closer)) {
      if (this.ch() === "\\" && this.at(this.i + 1) === "#") {
        this.i += 2;
        continue;
      }
      this.i += 1;
    }
    if (this.starts(closer)) this.i += closer.length;
    this.push("string", this.src.slice(start, this.i));
    return true;
  }

  private tryGoString(): boolean {
    if (this.ch() === "`") {
      const start = this.i;
      this.i += 1;
      while (this.i < this.n && this.ch() !== "`") this.i += 1;
      if (this.ch() === "`") this.i += 1;
      this.push("string", this.src.slice(start, this.i));
      return true;
    }
    if (this.ch() === '"' || this.ch() === "'") {
      this.consumeQuoted(this.ch(), false, false, this.i);
      return true;
    }
    return false;
  }

  private tryRustString(): boolean {
    if (this.tryRustRaw()) return true;
    if (this.tryRustChar()) return true;
    if (this.ch() !== '"') return false;
    this.consumeQuoted('"', false, false, this.i);
    return true;
  }

  private tryRustRaw(): boolean {
    if (this.ch() !== "r") return false;
    let hashes = 0;
    let j = this.i + 1;
    while (this.at(j) === "#") {
      hashes += 1;
      j += 1;
    }
    if (this.at(j) !== '"') return false;
    const start = this.i;
    this.i = j + 1;
    const closer = '"' + "#".repeat(hashes);
    while (this.i < this.n && !this.starts(closer)) this.i += 1;
    if (this.starts(closer)) this.i += closer.length;
    this.push("string", this.src.slice(start, this.i));
    return true;
  }

  private tryRustChar(): boolean {
    if (this.ch() !== "'") return false;
    if (this.at(this.i + 1) === "\\") {
      let j = this.i + 2;
      if (this.at(this.i + 2) === "u" && this.at(this.i + 3) === "{") {
        j = this.i + 4;
        while (j < this.n && this.at(j) !== "}") j += 1;
        if (this.at(j) === "}") j += 1;
      } else {
        j = this.i + 3;
      }
      if (this.at(j) === "'") {
        this.push("string", this.src.slice(this.i, j + 1));
        this.i = j + 1;
        return true;
      }
      return false;
    }
    if (this.at(this.i + 1) !== "" && this.at(this.i + 1) !== "'" && this.at(this.i + 2) === "'") {
      this.push("string", this.src.slice(this.i, this.i + 3));
      this.i += 3;
      return true;
    }
    return false;
  }

  private tryYamlString(): boolean {
    if (this.ch() === "'") {
      this.consumeDoubled("'", this.i);
      return true;
    }
    if (this.ch() === '"') {
      this.consumeQuoted('"', false, false, this.i);
      return true;
    }
    return false;
  }

  private trySqlString(): boolean {
    if (this.ch() === "'") {
      this.consumeDoubled("'", this.i);
      return true;
    }
    if (this.ch() === '"') {
      this.consumeQuoted('"', false, false, this.i);
      return true;
    }
    return false;
  }

  private consumeQuoted(quote: string, triple: boolean, raw: boolean, start: number): void {
    if (triple) this.i += 3;
    else this.i += 1;
    const closer = triple ? quote + quote + quote : quote;
    while (this.i < this.n) {
      if (!raw && this.ch() === "\\") {
        this.i += this.i + 1 < this.n ? 2 : 1;
        continue;
      }
      if (this.starts(closer)) {
        this.i += closer.length;
        break;
      }
      this.i += 1;
    }
    this.push("string", this.src.slice(start, this.i));
  }

  private consumeDoubled(quote: string, start: number): void {
    this.i = start + 1;
    while (this.i < this.n) {
      if (this.ch() === quote) {
        if (this.at(this.i + 1) === quote) {
          this.i += 2;
          continue;
        }
        this.i += 1;
        break;
      }
      this.i += 1;
    }
    this.push("string", this.src.slice(start, this.i));
  }

  private tryCssColor(): boolean {
    if (this.family !== "css" || this.ch() !== "#") return false;
    let j = this.i + 1;
    let hex = 0;
    while (this.isHex(this.at(j))) {
      hex += 1;
      j += 1;
    }
    if (hex !== 3 && hex !== 4 && hex !== 6 && hex !== 8) return false;
    if (this.isIdentChar(this.at(j))) return false;
    this.push("number", this.src.slice(this.i, j));
    this.i = j;
    return true;
  }

  private tryNumber(): boolean {
    const prev = this.i > 0 ? this.at(this.i - 1) : "";
    if (prev === "$" || (prev !== "" && this.isIdentChar(prev))) return false;
    const c = this.ch();
    if (c === "0" && (this.at(this.i + 1) === "x" || this.at(this.i + 1) === "X") && this.isHex(this.at(this.i + 2))) {
      let j = this.i + 2;
      while (this.isHex(this.at(j))) j += 1;
      this.finishNumber(j);
      return true;
    }
    let j = this.i;
    if (c === "." && this.isDigit(this.at(this.i + 1))) j = this.i + 1;
    else if (this.isDigit(c)) j = this.i;
    else return false;
    while (this.isDigit(this.at(j))) j += 1;
    if (this.at(j) === "." && this.isDigit(this.at(j + 1))) {
      j += 1;
      while (this.isDigit(this.at(j))) j += 1;
    } else if (
      this.isDigit(c) &&
      this.at(j) === "." &&
      !this.isDigit(this.at(j + 1)) &&
      !this.isIdentStart(this.at(j + 1))
    ) {
      j += 1;
    }
    if (this.at(j) === "e" || this.at(j) === "E") {
      let k = j + 1;
      if (this.at(k) === "+" || this.at(k) === "-") k += 1;
      if (this.isDigit(this.at(k))) {
        while (this.isDigit(this.at(k))) k += 1;
        j = k;
      }
    }
    this.finishNumber(j);
    return true;
  }

  private finishNumber(j: number): void {
    if (this.family === "css") {
      if (this.at(j) === "%") j += 1;
      else {
        const rest = this.src.slice(j, j + 4).toLowerCase();
        for (const unit of CSS_UNITS) {
          if (rest.startsWith(unit) && !this.isIdentChar(this.at(j + unit.length))) {
            j += unit.length;
            break;
          }
        }
      }
    }
    this.push("number", this.src.slice(this.i, j));
    this.i = j;
  }

  private tryAtKeyword(): boolean {
    if (this.family !== "css" || this.ch() !== "@") return false;
    if (!this.isLetter(this.at(this.i + 1))) return false;
    const start = this.i;
    this.i += 1;
    while (this.isLetter(this.ch()) || this.ch() === "-") this.i += 1;
    this.push("keyword", this.src.slice(start, this.i));
    return true;
  }

  private tryYamlNull(): boolean {
    if (this.family !== "yaml" || this.ch() !== "~") return false;
    const prev = this.i > 0 ? this.at(this.i - 1) : "";
    const next = this.at(this.i + 1);
    const boundary = (c: string) => c === "" || this.isSpace(c) || c === ":" || c === "," || c === "[" || c === "]";
    if (!boundary(prev) || !boundary(next)) return false;
    this.push("keyword", "~");
    this.i += 1;
    return true;
  }

  private tryIdent(): boolean {
    if (!this.isIdentStart(this.ch())) return false;
    if (this.ch() === "-" && !this.isIdentChar(this.at(this.i + 1))) return false;
    const start = this.i;
    this.i += 1;
    while (this.isIdentChar(this.ch())) this.i += 1;
    const word = this.src.slice(start, this.i);
    if (word === "-" || word === "--") {
      this.i = start;
      return false;
    }
    const key = this.fold ? word.toLowerCase() : word;
    this.push(this.keywords.has(key) ? "keyword" : "plain", word);
    return true;
  }

  private jsxTagStart(): boolean {
    if (!this.jsx || this.ch() !== "<") return false;
    const next = this.at(this.i + 1);
    if (next !== "/" && !this.isLetter(next)) return false;
    if (this.i > 0 && /[A-Za-z0-9_$]/.test(this.at(this.i - 1))) return false;
    return true;
  }

  private tryJsxTag(): boolean {
    if (!this.jsxTagStart()) return false;
    this.push("plain", "<");
    this.i += 1;
    if (this.ch() === "/") {
      this.push("plain", "/");
      this.i += 1;
    }
    this.pushTagName();
    while (this.i < this.n) {
      const c = this.ch();
      if (c === ">") {
        this.push("plain", ">");
        this.i += 1;
        break;
      }
      if (c === "/" && this.at(this.i + 1) === ">") {
        this.push("plain", "/>");
        this.i += 2;
        break;
      }
      if (c === "'" || c === '"') {
        this.consumeQuoted(c, false, false, this.i);
        continue;
      }
      if (c === "{") {
        this.scanBraces();
        continue;
      }
      this.push("plain", c);
      this.i += 1;
    }
    return true;
  }

  private pushTagName(): void {
    if (!this.isLetter(this.ch())) return;
    const start = this.i;
    while (/[A-Za-z0-9_.:-]/.test(this.ch())) this.i += 1;
    this.push("keyword", this.src.slice(start, this.i));
  }

  private scanBraces(): void {
    this.push("plain", "{");
    this.i += 1;
    let depth = 1;
    while (this.i < this.n && depth > 0) {
      if (this.tryJsxTag()) continue;
      if (this.ch() === "{") {
        this.push("plain", "{");
        this.i += 1;
        depth += 1;
        continue;
      }
      if (this.ch() === "}") {
        depth -= 1;
        this.push("plain", "}");
        this.i += 1;
        if (depth === 0) return;
        continue;
      }
      if (this.tryComment()) continue;
      if (this.tryString()) continue;
      if (this.tryNumber()) continue;
      if (this.tryIdent()) continue;
      this.push("plain", this.ch());
      this.i += 1;
    }
  }

  private htmlTagStart(): boolean {
    if (this.ch() !== "<") return false;
    const next = this.at(this.i + 1);
    return this.isLetter(next) || next === "/" || next === "!";
  }

  private scanHtmlTag(): void {
    this.push("plain", "<");
    this.i += 1;
    if (this.ch() === "/") {
      this.push("plain", "/");
      this.i += 1;
    }
    if (this.ch() === "!") {
      this.push("plain", "!");
      this.i += 1;
    }
    this.pushTagName();
    while (this.i < this.n) {
      const c = this.ch();
      if (c === ">") {
        this.push("plain", ">");
        this.i += 1;
        return;
      }
      if (c === "/" && this.at(this.i + 1) === ">") {
        this.push("plain", "/>");
        this.i += 2;
        return;
      }
      if (c === "'" || c === '"') {
        this.consumeQuoted(c, false, false, this.i);
        continue;
      }
      if (this.tryNumber()) continue;
      this.push("plain", c);
      this.i += 1;
    }
  }

  private htmlComment(): void {
    const start = this.i;
    this.i += 4;
    while (this.i < this.n && !this.starts("-->")) this.i += 1;
    if (this.starts("-->")) this.i += 3;
    this.push("comment", this.src.slice(start, this.i));
  }
}
