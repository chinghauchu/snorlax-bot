// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
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

const PHRASE =
  "v1.92 cmark-gfm link reference definitions in completed assistant replies";

function resolved(text: string): string {
  return resolveReferenceLinks(text, true);
}

test("an empty pointy destination is a definition", () => {
  assert.equal(resolved("[foo]: <>\n\n[foo]\n"), "\n[foo]()\n");
  assert.equal(resolved('[foo]: <> "t"\n\n[foo]\n'), '\n[foo](<> "t")\n');
  assert.equal(resolved("[foo]: <>\n"), "");
  assert.equal(resolved("[foo]: <>"), "");
  const spaces = resolved("[foo]: <bar baz>\n\n[foo]\n");
  assert.equal(spaces.includes("[foo](<bar baz>)"), true);
});

test("a title on the next line with trailing text still counts", () => {
  assert.equal(
    resolved('[foo]: /url\n"title" ok\n\n[foo]\n'),
    '"title" ok\n\n[foo](/url "title")\n',
  );
  assert.equal(
    resolved("[foo]: /url\n(title) ok\n\n[foo]\n"),
    "(title) ok\n\n[foo](/url \"title\")\n",
  );
  assert.equal(
    resolved('[foo]: /url "title" ok\n\n[foo]\n'),
    '[foo]: /url "title" ok\n\n[foo]\n',
  );
  assert.equal(
    resolved('[foo]: /url\n"title\n\n[foo]\n'),
    '"title\n\n[foo](/url)\n',
  );
  assert.equal(
    resolved('> [foo]: /url\n> "title" ok\n\n[foo]\n'),
    '> "title" ok\n\n[foo](/url "title")\n',
  );
});

test("a definition inside a list or quote applies to the whole message", () => {
  assert.equal(resolved("- [foo]: /url\n\n[foo]\n"), "- \n\n[foo](/url)\n");
  assert.equal(resolved("- [foo]:\n  /url\n\n[foo]\n"), "- \n\n[foo](/url)\n");
  assert.equal(
    resolved('- [foo]: /url\n  "title"\n\n[foo]\n'),
    '- \n\n[foo](/url "title")\n',
  );
  assert.equal(
    resolved('- [foo]: /url\n"title" ok\n\n[foo]\n'),
    '- "title" ok\n\n[foo](/url "title")\n',
  );
  assert.equal(resolved("- [foo]: /url\nbar\n\n[foo]\n"), "- bar\n\n[foo](/url)\n");
  assert.equal(resolved("- [foo]: /url\n  bar\n\n[foo]\n"), "- \n  bar\n\n[foo](/url)\n");
  assert.equal(resolved("2. [foo]: /url\n\n[foo]\n"), "2. \n\n[foo](/url)\n");
  assert.equal(resolved("1) [foo]: /url\n\n[foo]\n"), "1) \n\n[foo](/url)\n");
  assert.equal(resolved("- - [foo]: /url\n\n[foo]\n"), "- - \n\n[foo](/url)\n");
  assert.equal(resolved("-\t[foo]: /url\n\n[foo]\n"), "-\t\n\n[foo](/url)\n");
  assert.equal(resolved("> [foo]: /url\n\n[foo]\n"), "> \n\n[foo](/url)\n");
  assert.equal(resolved("> [foo]:\n> /url\n\n[foo]\n"), "> \n\n[foo](/url)\n");
  assert.equal(resolved("> [foo]:\n/url\n\n[foo]\n"), "> \n\n[foo](/url)\n");
  assert.equal(resolved("> [foo]: /url\nbar\n\n[foo]\n"), "> bar\n\n[foo](/url)\n");
  assert.equal(resolved("> - [foo]: /url\n\n[foo]\n"), "> - \n\n[foo](/url)\n");
  assert.equal(resolved("> > [foo]: /url\n\n[foo]\n"), "> > \n\n[foo](/url)\n");
  assert.equal(
    resolved("- [foo]: /a\n[bar]: /b\n\n[foo] [bar]\n"),
    "- \n\n[foo](/a) [bar](/b)\n",
  );
  assert.equal(resolved("- [foo]: /a\n[foo]: /b\n\n[foo]\n"), "- \n\n[foo](/a)\n");
  assert.equal(resolved("> [foo]: /a\n[bar]: /b\n\n[bar]\n"), "> \n\n[bar](/b)\n");
  assert.equal(
    resolved("- [foo]: /url\n\n![foo]\n"),
    "- \n\n![foo](/url)\n",
  );
  const seen = [
    "> See [foo].",
    ">",
    "> [foo]: /url",
  ].join("\n");
  const seenOut = resolved(seen);
  assert.match(seenOut, /> See \[foo\]\(\/url\)\./);
  assert.equal(seenOut.includes("[foo]:"), false);
});

test("edges that already matched stay in place", () => {
  assert.equal(resolved("- foo\n  [bar]: /url\n\n[bar]\n"), "- foo\n  [bar]: /url\n\n[bar]\n");
  assert.equal(resolved("Foo\n[bar]: /url\n\n[bar]\n"), "Foo\n[bar]: /url\n\n[bar]\n");
  assert.equal(resolved("Foo\n---\n[bar]: /url\n\n[bar]\n"), "Foo\n---\n\n[bar](/url)\n");
  assert.equal(resolved("[ẞ]: /url\n\n[SS]\n"), "\n[SS](/url)\n");
  assert.equal(resolved("[foo\\!]: /url\n\n[foo\\!]\n"), "\n[foo\\!](/url)\n");
  assert.equal(resolved("[foo\\!]: /url\n\n[foo!]\n").includes("[foo!](/url)"), false);
  const ok = "a".repeat(1000);
  assert.equal(resolved(`[${ok}]: /url\n\n[${ok}]\n`).includes(`[${ok}](/url)`), true);
  const over = "b".repeat(1001);
  assert.equal(resolved(`[${over}]: /url\n\n[${over}]\n`).includes(`](/url)`), false);
  assert.equal(resolved("    [foo]: /url\n\n[foo]\n"), "    [foo]: /url\n\n[foo]\n");
  assert.equal(resolved("- [ ] [foo]: /url\n\n[foo]\n"), "- [ ] [foo]: /url\n\n[foo]\n");
  const live = "- [foo]: /url\n\n[foo]\n";
  assert.equal(resolveReferenceLinks(live, false), live);
});

test("docs, CI, and OpenAPI stay on this cut", () => {
  assert.match(src, /v1\.92/);
  assert.match(src, /parseContainerDefinition/);
  assert.match(src, /StoredDef/);
  assert.match(src, /beforeTitle/);
  assert.match(swift, /v1\.92/);
  assert.match(swift, /parseContainerDefinition/);
  assert.match(swift, /StoredDef/);
  assert.match(swift, /beforeTitle/);
  assert.match(swift, /MarkdownList\.listMarkerPadding/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.92 /);
  assert.match(spec, /## 192\. v1\.92/);
  assert.match(spec, /link reference definitions/i);
  assert.match(ci, /test_ios_markdown_reference_def\.py/);
  assert.match(pkg, /markdownReferenceDef\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(src.includes("computerPane"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.equal(swift.includes("/v1/"), false);
});
