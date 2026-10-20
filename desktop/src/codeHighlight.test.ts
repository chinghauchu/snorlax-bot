// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  codeHighlightAnimates,
  codeHighlightClass,
  codeHighlightLanguage,
  highlightCode,
  shouldHighlightCode,
  type CodeToken,
  type CodeTokenKind,
} from "./codeHighlight.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "codeHighlight.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeHighlight.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE = "v1.37 syntax highlighting in completed assistant code blocks";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function joinTokens(tokens: CodeToken[]): string {
  return tokens.map((token) => token.text).join("");
}

function colored(source: string, language: string): CodeToken[] {
  const tokens = highlightCode(source, language);
  assert.equal(joinTokens(tokens), source);
  return tokens.filter((token) => token.kind !== "plain");
}

function has(
  tokens: CodeToken[],
  kind: CodeTokenKind,
  text: string,
): boolean {
  return tokens.some((token) => token.kind === kind && token.text === text);
}

test("recognized languages color tokens; unknown and unlabeled stay plain", () => {
  assert.equal(codeHighlightLanguage("python"), "python");
  assert.equal(codeHighlightLanguage("  Python "), "python");
  assert.equal(codeHighlightLanguage("py"), "py");
  assert.equal(codeHighlightLanguage("TSX"), "tsx");
  assert.equal(codeHighlightLanguage("yml"), "yml");
  assert.equal(codeHighlightLanguage("rs"), "rs");
  assert.equal(codeHighlightLanguage(""), null);
  assert.equal(codeHighlightLanguage("   "), null);
  assert.equal(codeHighlightLanguage("mermaid"), null);
  assert.equal(codeHighlightLanguage("haskell"), null);
  assert.equal(codeHighlightLanguage("tex"), null);
  assert.equal(shouldHighlightCode({ language: "python", completed: true }), true);
  assert.equal(shouldHighlightCode({ language: "Python", completed: true }), true);
  assert.equal(shouldHighlightCode({ language: "python", completed: false }), false);
  assert.equal(shouldHighlightCode({ language: "", completed: true }), false);
  assert.equal(shouldHighlightCode({ language: "mermaid", completed: true }), false);
  assert.equal(shouldHighlightCode({ language: "brainfuck", completed: true }), false);
  assert.deepEqual(highlightCode("let x = 1", ""), [
    { text: "let x = 1", kind: "plain" },
  ]);
  assert.deepEqual(highlightCode("graph TD", "mermaid"), [
    { text: "graph TD", kind: "plain" },
  ]);
  assert.deepEqual(highlightCode("", "python"), []);
  assert.equal(codeHighlightAnimates(false), false);
  assert.equal(codeHighlightAnimates(true), false);
  assert.equal(codeHighlightClass("plain"), "");
  assert.equal(codeHighlightClass("keyword"), "md-tok md-tok-keyword");
  assert.equal(codeHighlightClass("string"), "md-tok md-tok-string");
  assert.equal(codeHighlightClass("comment"), "md-tok md-tok-comment");
  assert.equal(codeHighlightClass("number"), "md-tok md-tok-number");
});

test("python, js, ts, and tsx color keywords, strings, comments, and numbers", () => {
  const py = colored('def greet(name):\n    return "hi"  # note\nx = 42\n', "python");
  assert.ok(has(py, "keyword", "def"));
  assert.ok(has(py, "keyword", "return"));
  assert.ok(has(py, "string", '"hi"'));
  assert.ok(has(py, "comment", "# note"));
  assert.ok(has(py, "number", "42"));
  assert.equal(has(py, "keyword", "greet"), false);
  assert.ok(has(colored('r"raw\\""', "py"), "string", 'r"raw\\""'));
  assert.ok(has(colored('"""doc"""', "python"), "string", '"""doc"""'));

  const js = colored(
    "const n = 1;\nlet s = `hi`;\n// tail\nreturn n;",
    "js",
  );
  assert.ok(has(js, "keyword", "const"));
  assert.ok(has(js, "keyword", "let"));
  assert.ok(has(js, "keyword", "return"));
  assert.ok(has(js, "number", "1"));
  assert.ok(has(js, "string", "`hi`"));
  assert.ok(has(js, "comment", "// tail"));
  assert.equal(has(js, "keyword", "returnValue"), false);
  const block = colored("/* block */\nfunction f() {}", "javascript");
  assert.ok(has(block, "comment", "/* block */"));
  assert.ok(has(block, "keyword", "function"));

  const ts = colored("type Id = string;\nconst n: number = 0xFF;", "ts");
  assert.ok(has(ts, "keyword", "type"));
  assert.ok(has(ts, "keyword", "string"));
  assert.ok(has(ts, "keyword", "const"));
  assert.ok(has(ts, "keyword", "number"));
  assert.ok(has(ts, "number", "0xFF"));
  assert.equal(has(colored("Array<string>", "ts"), "keyword", "Array"), false);

  const tsx = colored('return <div className="x">{n}</div>', "tsx");
  assert.ok(has(tsx, "keyword", "return"));
  assert.ok(has(tsx, "keyword", "div"));
  assert.ok(has(tsx, "string", '"x"'));
  const generic = colored("const box = Array<string>;", "tsx");
  assert.equal(has(generic, "keyword", "Array"), false);
  assert.ok(has(generic, "keyword", "string"));
});

test("json, bash, swift, go, rust, and yaml stay inside their grammars", () => {
  const json = colored('{ "ok": true, "n": 1.5 }\n// not', "json");
  assert.ok(has(json, "string", '"ok"'));
  assert.ok(has(json, "keyword", "true"));
  assert.ok(has(json, "number", "1.5"));
  assert.equal(json.some((token) => token.kind === "comment"), false);

  const bash = colored('if true; then echo "hi" # note\nfi\necho $#', "sh");
  assert.ok(has(bash, "keyword", "if"));
  assert.ok(has(bash, "keyword", "then"));
  assert.ok(has(bash, "keyword", "echo"));
  assert.ok(has(bash, "keyword", "fi"));
  assert.ok(has(bash, "string", '"hi"'));
  assert.ok(has(bash, "comment", "# note"));
  assert.equal(bash.some((token) => token.kind === "comment" && token.text.includes("$#")), false);

  const swift = colored('func greet() -> String {\n  return "hi" // note\n}', "swift");
  assert.ok(has(swift, "keyword", "func"));
  assert.ok(has(swift, "keyword", "return"));
  assert.ok(has(swift, "string", '"hi"'));
  assert.ok(has(swift, "comment", "// note"));

  const go = colored('package main\nfunc main() {\n  s := "hi"\n}\n', "go");
  assert.ok(has(go, "keyword", "package"));
  assert.ok(has(go, "keyword", "func"));
  assert.ok(has(go, "string", '"hi"'));

  const rust = colored('fn main() {\n  let n = 1; // note\n  let s = "hi";\n}\n', "rust");
  assert.ok(has(rust, "keyword", "fn"));
  assert.ok(has(rust, "keyword", "let"));
  assert.ok(has(rust, "number", "1"));
  assert.ok(has(rust, "comment", "// note"));
  assert.ok(has(rust, "string", '"hi"'));
  assert.ok(has(colored("r#\"raw\"#", "rs"), "string", 'r#"raw"#'));

  const yaml = colored("ok: true\nname: \"ada\"\n# tail\ncount: 3\n", "yaml");
  assert.ok(has(yaml, "keyword", "true"));
  assert.ok(has(yaml, "string", '"ada"'));
  assert.ok(has(yaml, "comment", "# tail"));
  assert.ok(has(yaml, "number", "3"));
  assert.ok(has(colored("flag: YES\n", "yml"), "keyword", "YES"));
});

test("html, css, sql, and diff color the tokens those fences use", () => {
  const html = colored('<p class="hi">n 2</p>\n<!-- note -->\n', "html");
  assert.ok(has(html, "keyword", "p"));
  assert.ok(has(html, "string", '"hi"'));
  assert.ok(has(html, "number", "2"));
  assert.ok(has(html, "comment", "<!-- note -->"));

  const css = colored("/* note */\n.a { color: #336699; margin: 12px; }\n", "css");
  assert.ok(has(css, "comment", "/* note */"));
  assert.ok(has(css, "keyword", "color"));
  assert.ok(has(css, "keyword", "margin"));
  assert.ok(has(css, "number", "#336699"));
  assert.ok(has(css, "number", "12px"));
  assert.ok(has(colored("@media (min-width: 1em) {}", "css"), "keyword", "@media"));

  const sql = colored("SELECT name FROM t WHERE n = 3; -- tail\n", "sql");
  assert.ok(has(sql, "keyword", "SELECT"));
  assert.ok(has(sql, "keyword", "FROM"));
  assert.ok(has(sql, "keyword", "WHERE"));
  assert.ok(has(sql, "number", "3"));
  assert.ok(has(sql, "comment", "-- tail"));

  const diffSource = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n same\n";
  const diff = colored(diffSource, "diff");
  const diffAll = highlightCode(diffSource, "diff");
  assert.ok(diff.some((token) => token.kind === "comment" && token.text.includes("diff ")));
  assert.ok(diff.some((token) => token.kind === "comment" && token.text.includes("---")));
  assert.ok(diff.some((token) => token.kind === "comment" && token.text.includes("+++")));
  assert.ok(diff.some((token) => token.kind === "comment" && token.text.includes("@@")));
  assert.ok(diff.some((token) => token.kind === "keyword" && token.text.startsWith("-old")));
  assert.ok(diff.some((token) => token.kind === "string" && token.text.startsWith("+new")));
  assert.ok(diffAll.some((token) => token.kind === "plain" && token.text.includes("same")));
});

test("completed fences wire colors; copy, wrap, and the label stay", () => {
  const chrome = body.slice(body.indexOf("function FenceChrome("), body.indexOf("function FenceBar("));
  const painted = body.slice(
    body.indexOf("function HighlightedCode("),
    body.indexOf("function fenceFromChildren"),
  );
  assert.match(chrome, /<HighlightedCode/);
  assert.match(chrome, /codeBlockWrapClass\(wrapOn\)/);
  assert.match(painted, /shouldHighlightCode\(\{ language, completed \}\)/);
  assert.match(painted, /highlightCode\(source, language\)/);
  assert.match(painted, /codeHighlightClass\(span\.kind\)/);
  assert.match(painted, /FindText/);
  const bar = body.slice(body.indexOf("function FenceBar("), body.indexOf("function HighlightedCode("));
  assert.match(bar, /className="md-fence-lang"/);
  assert.match(bar, /codeBlockClipboardText\(source\)/);
  assert.match(bar, /showCodeBlockWrap\(completed\)/);
  assert.match(bar, /showCodeBlockCopy\(completed\)/);
  assert.match(body, /className="md-fence-lang"\{language\}>|className="md-fence-lang">\{language\}/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /http:\/\//);
  assert.doesNotMatch(src, /https:\/\//);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/CodeHighlight.swift`/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/codeHighlight.ts`/);
  assert.match(swift, /static func shouldHighlight\(language: String, completed: Bool\) -> Bool/);
  assert.match(swift, /static func paint\(_ source: String, language: String, completed: Bool\) -> AttributedString/);
  assert.match(swift, /uiKit\.foregroundColor/);
  assert.match(swift, /#9aa8e8/);
  assert.match(swift, /#3d4f99/);
  assert.match(swift, /#8fbf9a/);
  assert.match(swift, /#2f6b45/);
  assert.match(markdown, /CodeHighlight\.paint\(source, language: language, completed: completed\)/);
  assert.match(markdown, /FenceSource\(source: source, wrapped: wrapped, language: language, completed: completed\)/);
  assert.match(markdown, /FenceSource\(source: source, wrapped: wrapped\)/);
  assert.match(markdown, /ChatFind\.paint/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(shortcuts, /syntax highlighting/);
  for (const word of ["def", "return", "select", "func", "package"]) {
    assert.ok(swift.includes(`"${word}"`), word);
  }
  assert.match(block(".md-fence-body .md-tok-keyword"), /color:\s*var\(--tok-keyword\)/);
  assert.match(block(".md-fence-body .md-tok-string"), /color:\s*var\(--tok-string\)/);
  assert.match(block(".md-fence-body .md-tok-comment"), /color:\s*var\(--tok-comment\)/);
  assert.match(block(".md-fence-body .md-tok-number"), /color:\s*var\(--tok-number\)/);
  assert.match(css, /--tok-keyword: #9aa8e8/);
  assert.match(css, /--tok-keyword: #3d4f99/);
  assert.match(css, /--tok-string: #8fbf9a/);
  assert.match(css, /--tok-string: #2f6b45/);
  assert.match(css, /--tok-comment: #8b8d94/);
  assert.match(css, /--tok-comment: #6b6d75/);
  assert.match(css, /--tok-number: #c4a574/);
  assert.match(css, /--tok-number: #8a5a22/);
  const fence = block(".md-fence-body");
  assert.match(fence, /overflow-x:\s*auto/);
  assert.match(fence, /white-space:\s*pre/);
});

test("OpenAPI stays 0.18.0 and the spec records highlighting", () => {
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.37 /);
  assert.match(spec, /## 137\. v1\.37/);
  assert.match(spec, /syntax highlighting in completed assistant code blocks/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_code_highlight\.py/);
  assert.match(pkg, /codeHighlight\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.doesNotMatch(body, /computerPane\.ts/);
});
