// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitHeadingSections } from "./headingSection.ts";
import {
  CONTENTS_GO_TO_EMPTY,
  CONTENTS_INDENT_PX,
  CONTENTS_LABEL,
  CONTENTS_MIN_HEADINGS,
  contentsAnchor,
  contentsAnchorForWrap,
  contentsAncestorsToOpen,
  contentsAnimates,
  contentsBubbleFor,
  contentsGoToLabel,
  contentsIndentPx,
  contentsScrollOptions,
  contentsSelector,
  contentsShows,
  headingTitle,
  replyContentsEntries,
} from "./replyContents.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "replyContents.ts"), "utf8");
const view = readFileSync(join(here, "replyContentsList.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const longMessage = readFileSync(join(here, "LongMessageBody.tsx"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ReplyContents.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const iosLong = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "LongMessage.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.44 contents outline on a long reply";

function block(selector: string): string {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing ${selector}`);
  const start = css.indexOf("{", at);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test(
  "v2.44 contents outline on a long reply (a finished assistant reply with 3 or more # / ## / ### headings shows a muted 12px/12pt Contents list above the first bubble; each row is that heading; click or tap scrolls the heading into the middle of the transcript; a heading inside a folded ancestor opens that ancestor first and does not open the heading's own body; a heading inside a clamped bubble opens that bubble without the Show more animation; 2 headings stay plain; #### and setext stay out; a heading inside a fence, list, quote, or math block stays out; streaming stays plain text; a user message stays plain; the choice is not saved; Copy still copies the reply; the control does not move composer focus; Reduce Motion adds no animation; no new shortcut; no new HTTP)",
  () => {
    assert.equal(CONTENTS_LABEL, "Contents");
    assert.equal(CONTENTS_MIN_HEADINGS, 3);
    assert.equal(CONTENTS_INDENT_PX, 12);
    assert.equal(CONTENTS_GO_TO_EMPTY, "Go to heading");
    assert.equal(contentsShows(2), false);
    assert.equal(contentsShows(3), true);
    assert.equal(contentsIndentPx(1), 0);
    assert.equal(contentsIndentPx(2), 12);
    assert.equal(contentsIndentPx(3), 24);
    assert.equal(headingTitle("## Title"), "Title");
    assert.equal(headingTitle("## Title ##"), "Title");
    assert.equal(headingTitle("###  Spaced  "), "Spaced");
    assert.equal(headingTitle("   # Indented"), "Indented");
    assert.equal(headingTitle("## **bold** bit"), "**bold** bit");
    assert.equal(headingTitle("## foo ## bar"), "foo ## bar");
    assert.equal(contentsGoToLabel("Setup"), "Go to Setup");
    assert.equal(contentsGoToLabel("   "), "Go to heading");
    assert.equal(contentsAnchor("msg_ab", 12), "contents:msg_ab:12");
    assert.equal(contentsAnchorForWrap("msg_ab:1", 12), "contents:msg_ab:12");
    assert.equal(contentsAnchorForWrap("msg_ab:1\u0000section0", 12), null);
    assert.equal(contentsAnchorForWrap("msg_ab", 12), null);
    assert.equal(contentsAnimates(false), false);
    assert.equal(contentsAnimates(true), false);
    assert.deepEqual(contentsScrollOptions(false), {
      block: "center",
      behavior: "auto",
    });
    assert.deepEqual(contentsScrollOptions(true), {
      block: "center",
      behavior: "auto",
    });
    assert.match(contentsSelector("contents:msg_ab:4"), /data-contents-anchor=/);

    const two = "# One\n\n## Two\n";
    assert.deepEqual(replyContentsEntries(two, true), []);
    assert.deepEqual(replyContentsEntries("# One\n\n## Two\n\n### Three\n", false), []);
    const three = replyContentsEntries("# One\n\n## Two\n\n### Three\n", true);
    assert.deepEqual(
      three.map((entry) => entry.title),
      ["One", "Two", "Three"],
    );
    assert.deepEqual(
      three.map((entry) => entry.level),
      [1, 2, 3],
    );

    const deep = replyContentsEntries(
      "# One\n\n## Two\n\n#### Deep\n\n### Three\n",
      true,
    );
    assert.deepEqual(
      deep.map((entry) => entry.title),
      ["One", "Two", "Three"],
    );

    const setext = replyContentsEntries(
      "Title\n=====\n\n## Two\n\n### Three\n",
      true,
    );
    assert.deepEqual(setext, []);

    const fenced = replyContentsEntries(
      "# One\n\n## Two\n\n```\n# Hidden\n```\n\n### Three\n",
      true,
    );
    assert.deepEqual(
      fenced.map((entry) => entry.title),
      ["One", "Two", "Three"],
    );

    const listed = replyContentsEntries(
      "# One\n\n- # not a heading\n\n## Two\n\n### Three\n",
      true,
    );
    assert.deepEqual(
      listed.map((entry) => entry.title),
      ["One", "Two", "Three"],
    );

    const quoted = replyContentsEntries(
      "# One\n\n> # quoted\n\n## Two\n\n### Three\n",
      true,
    );
    assert.deepEqual(
      quoted.map((entry) => entry.title),
      ["One", "Two", "Three"],
    );

    const math = replyContentsEntries(
      "# One\n\n$$\n# not\n$$\n\n## Two\n\n### Three\n",
      true,
    );
    assert.deepEqual(
      math.map((entry) => entry.title),
      ["One", "Two", "Three"],
    );

    const doc = "# Parent\npara\n\n## Child\n\n### Third\n";
    const sections = splitHeadingSections(doc, true);
    assert.equal(sections.length, 3);
    const parent = sections[0]!;
    const child = sections[1]!;
    const third = sections[2]!;
    assert.deepEqual(
      contentsAncestorsToOpen(doc, child.offset, new Set([parent.offset])),
      [parent.offset],
    );
    assert.deepEqual(
      contentsAncestorsToOpen(
        doc,
        third.offset,
        new Set([parent.offset, child.offset]),
      ),
      [parent.offset, child.offset],
    );
    assert.deepEqual(
      contentsAncestorsToOpen(doc, parent.offset, new Set([parent.offset])),
      [],
    );
    assert.deepEqual(
      contentsAncestorsToOpen(doc, child.offset, new Set()),
      [],
    );
    const bubbles = doc.split(/\n\n/);
    const byBubble = bubbles.map((bubble) =>
      sections.filter((section) => bubble.startsWith(section.headingLine)),
    );
    assert.equal(contentsBubbleFor(byBubble, child.offset), 1);
    assert.equal(contentsBubbleFor(byBubble, 999), null);

    assert.doesNotMatch(src, /localStorage/);
    assert.doesNotMatch(src, /\/v1\//);
    assert.doesNotMatch(src, /computerPane\.ts/);
    assert.match(src, /No new HTTP/);
    assert.match(src, /not saved/);
    assert.match(swift, /static let label = "Contents"/);
    assert.match(swift, /static let minimum = 3/);
    assert.match(swift, /static let goToEmpty = "Go to heading"/);
    assert.match(swift, /static let scrollAnchor = UnitPoint.center/);
    assert.match(swift, /static func entries\(/);
    assert.match(swift, /static func ancestorsToOpen\(/);
    assert.match(swift, /return nil/);
    assert.match(swift, /No new HTTP/);
    assert.match(swift, /not saved/);
    assert.doesNotMatch(swift, /\/v1\//);
    assert.doesNotMatch(swift, /UserDefaults/);
    assert.doesNotMatch(swift, /computerPane\.ts/);
  },
);

test("desktop and iOS show Contents and scroll to the heading", () => {
  assert.match(view, /aria-label=\{CONTENTS_LABEL\}/);
  assert.match(view, /aria-label=\{contentsGoToLabel\(entry\.title\)\}/);
  assert.match(view, /className="reply-contents-jump"/);
  assert.match(view, /onMouseDown=\{keepComposerFocus\}/);
  assert.match(view, /preventDefault\(\)/);
  assert.match(view, /scrollContentsHeading\(/);
  assert.match(src, /behavior: "auto"/);
  assert.match(body, /data-contents-anchor=\{contentsAnchor\}/);
  assert.match(body, /className="reply-contents-anchor"/);
  assert.match(body, /revealContents\(bubble: number \| null\)/);
  assert.match(body, /setContentsJump\(null\)/);
  assert.doesNotMatch(body, /localStorage/);
  assert.match(app, /ReplyContentsList/);
  assert.match(app, /open=\{view\.open\}/);
  assert.match(app, /reveal=\{view\.revealContents\}/);
  assert.match(view, /replyContentsEntries\(/);
  assert.match(view, /contentsAncestorsToOpen\(/);
  assert.match(view, /contentsBubbleFor\(/);
  assert.match(app, /contentsOpenToken=/);
  assert.match(longMessage, /contentsOpenToken/);
  assert.match(longMessage, /data-contents-open=/);
  assert.match(longMessage, /className="long-message"/);
  assert.match(longMessage, /setInstantContentsOpen\(true\)/);

  const label = block(".reply-contents-label");
  assert.match(label, /font-size:\s*12px/);
  assert.match(label, /font-weight:\s*500/);
  assert.match(label, /color:\s*var\(--text-muted\)/);
  const row = block(".reply-contents-jump");
  assert.match(row, /font-size:\s*13px/);
  assert.match(row, /transition:\s*none/);
  assert.match(row, /animation:\s*none/);
  const opened = block('.long-message[data-contents-open="true"]');
  assert.match(opened, /transition:\s*none/);
  const reduceAt = css.indexOf(".reply-contents,\n  .reply-contents-jump,");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for Contents");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 220,
  );
  assert.match(reduce, /\.reply-contents/);
  assert.match(reduce, /animation:\s*none/);

  assert.match(markdown, /contentsMessageId/);
  assert.match(markdown, /ReplyContents.anchor\(/);
  assert.match(markdown, /\.id\(contentsAnchor\)/);
  assert.match(chat, /ReplyContentsList/);
  assert.match(chat, /ReplyContents.entries\(/);
  assert.match(chat, /jumpToContents\(/);
  assert.match(chat, /ReplyContents.ancestorsToOpen\(/);
  assert.match(chat, /contentsOpenToken/);
  assert.match(chat, /replyContentsScroll.scroll\(/);
  assert.match(chat, /ReplyContents.scrollAnchor/);
  assert.match(chat, /contentsOpenBubble = nil/);
  assert.match(chat, /focusable\(false\)/);
  assert.match(iosLong, /contentsOpenToken/);
  assert.match(iosLong, /disablesAnimations = true/);
  assert.doesNotMatch(chat, /UserDefaults/);
  assert.doesNotMatch(shortcuts, /Go to heading/);
  assert.doesNotMatch(iosShortcuts, /Go to heading/);
  assert.doesNotMatch(shortcuts, /Contents/);
  assert.doesNotMatch(iosShortcuts, /Contents/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 244\. v2\.44/);
  assert.match(ci, /test_ios_reply_contents\.py/);
  assert.match(pkg, /src\/replyContents\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
