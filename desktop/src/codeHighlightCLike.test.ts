// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  codeHighlightLanguage,
  highlightCode,
  shouldHighlightCode,
  type CodeToken,
  type CodeTokenKind,
} from "./codeHighlight.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "codeHighlight.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeHighlight.swift"),
  "utf8",
);
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
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

const PHRASE =
  "v2.09 C, C++, Java, C#, and Kotlin syntax highlighting in completed assistant code blocks";

function joinTokens(tokens: CodeToken[]): string {
  return tokens.map((token) => token.text).join("");
}

function colored(source: string, language: string): CodeToken[] {
  const tokens = highlightCode(source, language);
  assert.equal(joinTokens(tokens), source);
  return tokens.filter((token) => token.kind !== "plain");
}

function has(tokens: CodeToken[], kind: CodeTokenKind, text: string): boolean {
  return tokens.some((token) => token.kind === kind && token.text === text);
}

test("ordinary java, c, c++, c#, and kotlin fences color; unknown stays plain", () => {
  assert.equal(codeHighlightLanguage("java"), "java");
  assert.equal(codeHighlightLanguage("  Java "), "java");
  assert.equal(codeHighlightLanguage("c"), "c");
  assert.equal(codeHighlightLanguage("C++"), "c++");
  assert.equal(codeHighlightLanguage("cpp"), "cpp");
  assert.equal(codeHighlightLanguage("cc"), "cc");
  assert.equal(codeHighlightLanguage("cxx"), "cxx");
  assert.equal(codeHighlightLanguage("hpp"), "hpp");
  assert.equal(codeHighlightLanguage("c#"), "c#");
  assert.equal(codeHighlightLanguage("CS"), "cs");
  assert.equal(codeHighlightLanguage("csharp"), "csharp");
  assert.equal(codeHighlightLanguage("Kotlin"), "kotlin");
  assert.equal(codeHighlightLanguage("kt"), "kt");
  assert.equal(codeHighlightLanguage("kts"), "kts");
  assert.equal(codeHighlightLanguage("java Main.java"), "java");
  assert.equal(codeHighlightLanguage("haskell"), null);
  assert.equal(codeHighlightLanguage("ruby"), null);
  assert.equal(codeHighlightLanguage("php"), null);
  assert.equal(shouldHighlightCode({ language: "java", completed: true }), true);
  assert.equal(shouldHighlightCode({ language: "c++", completed: true }), true);
  assert.equal(shouldHighlightCode({ language: "c#", completed: true }), true);
  assert.equal(shouldHighlightCode({ language: "kotlin", completed: true }), true);
  assert.equal(shouldHighlightCode({ language: "java", completed: false }), false);
  assert.equal(shouldHighlightCode({ language: "ruby", completed: true }), false);

  const java = colored(
    'public class Hi {\n  public static void main(String[] args) {\n    System.out.println("hi"); // note\n  }\n}\n',
    "java",
  );
  assert.ok(has(java, "keyword", "public"));
  assert.ok(has(java, "keyword", "class"));
  assert.ok(has(java, "keyword", "static"));
  assert.ok(has(java, "keyword", "void"));
  assert.ok(has(java, "string", '"hi"'));
  assert.ok(has(java, "comment", "// note"));
  assert.equal(has(java, "keyword", "String"), false);
  assert.equal(has(java, "keyword", "System"), false);

  const textBlock = colored('String s = """\nhi\n""";\n', "java");
  assert.ok(has(textBlock, "string", '"""\nhi\n"""'));

  const c = colored(
    '#include <stdio.h>\nint main(void) {\n  return 0; /* done */\n}\n',
    "c",
  );
  assert.ok(has(c, "keyword", "#include"));
  assert.ok(has(c, "keyword", "int"));
  assert.ok(has(c, "keyword", "void"));
  assert.ok(has(c, "keyword", "return"));
  assert.ok(has(c, "comment", "/* done */"));
  assert.equal(has(c, "keyword", "stdio"), false);

  const indented = colored("  #define MAX 3\n", "cpp");
  assert.ok(has(indented, "keyword", "#define"));
  const mid = colored("int x = 1; #define NO\n", "c");
  assert.equal(has(mid, "keyword", "#define"), false);
  const commented = colored("// #include <stdio.h>\n", "c");
  assert.ok(has(commented, "comment", "// #include <stdio.h>"));
  assert.equal(has(commented, "keyword", "#include"), false);

  const cpp = colored("class Box {\n public:\n  bool ok = true;\n};\n", "c++");
  assert.ok(has(cpp, "keyword", "class"));
  assert.ok(has(cpp, "keyword", "public"));
  assert.ok(has(cpp, "keyword", "bool"));
  assert.ok(has(cpp, "keyword", "true"));

  const cs = colored(
    'public class Hi {\n  public string Name { get; set; } = "a";\n}\n',
    "c#",
  );
  assert.ok(has(cs, "keyword", "public"));
  assert.ok(has(cs, "keyword", "class"));
  assert.ok(has(cs, "keyword", "string"));
  assert.ok(has(cs, "string", '"a"'));
  const verbatim = colored('var s = @"a""b";\n', "cs");
  assert.ok(has(verbatim, "keyword", "var"));
  assert.ok(has(verbatim, "string", '@"a""b"'));
  const interpolated = colored('var s = $"hi {name}";\n', "csharp");
  assert.ok(has(interpolated, "string", '$"hi {name}"'));

  const kt = colored('fun main() {\n  val name = "ada"\n  println(name)\n}\n', "kotlin");
  assert.ok(has(kt, "keyword", "fun"));
  assert.ok(has(kt, "keyword", "val"));
  assert.ok(has(kt, "string", '"ada"'));
  const raw = colored('val s = """\nada\n"""\n', "kt");
  assert.ok(has(raw, "string", '"""\nada\n"""'));

  assert.deepEqual(highlightCode('public class Hi {\n}\n', ""), [
    { text: 'public class Hi {\n}\n', kind: "plain" },
  ]);
});

test("desktop and iOS share the new aliases and the fence chrome stays", () => {
  for (const alias of [
    "java",
    "c",
    "cpp",
    "c++",
    "cc",
    "cxx",
    "hpp",
    "csharp",
    "cs",
    "c#",
    "kotlin",
    "kt",
    "kts",
  ]) {
    assert.ok(src.includes(`"${alias}"`), alias);
    assert.ok(swift.includes(`"${alias}"`), alias);
  }
  for (const word of [
    "instanceof",
    "constexpr",
    "stackalloc",
    "lateinit",
    "#include",
  ]) {
    if (word.startsWith("#")) continue;
    assert.ok(src.includes(`"${word}"`), word);
    assert.ok(swift.includes(`"${word}"`), word);
  }
  assert.match(src, /private tryDirective\(\)/);
  assert.match(swift, /private func tryDirective\(\) -> Bool/);
  assert.match(body, /shouldHighlightCode\(\{ language, completed \}\)/);
  assert.match(body, /highlightCode\(source, language\)/);
  assert.match(body, /codeBlockClipboardText\(source\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/CodeHighlight.swift`/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/codeHighlight.ts`/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(swift, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
});

test("OpenAPI stays 0.18.0 and the roadmap records v2.09", () => {
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v2\.09 /);
  assert.match(spec, /## 209\. v2\.09/);
  assert.match(spec, /C, C\+\+, Java, C#, and Kotlin syntax highlighting/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_code_highlight_clike\.py/);
  assert.match(pkg, /codeHighlightCLike\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
