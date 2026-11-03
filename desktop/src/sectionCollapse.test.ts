// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitHeadingSections } from "./headingSection.ts";
import { sectionClipboardText } from "./sectionCopy.ts";
import { sectionSaveBody } from "./sectionSave.ts";
import {
  SECTION_COLLAPSE_LINES,
  SECTION_SHOW_LESS,
  SECTION_SHOW_LESS_ARIA,
  SECTION_SHOW_MORE,
  SECTION_SHOW_MORE_ARIA,
  lastPaintedBubble,
  planSectionCollapse,
  sectionBodyLineCount,
  sectionCollapseAnimates,
  sectionCollapseAria,
  sectionCollapseLabel,
  sectionFindBubble,
  sectionFindKeepsOpen,
  sectionOverflows,
  sectionTail,
  sectionVisibleText,
} from "./sectionCollapse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "sectionCollapse.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "SectionCollapse.swift"),
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
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.43 collapse long heading sections";

function prose(count: number): string {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`).join("\n");
}

function block(selector: string): string {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing ${selector}`);
  const start = css.indexOf("{", at);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test(
  "v2.43 collapse long heading sections (a completed assistant # / ## / ### whose body is longer than 14 lines shows the heading and a muted 12px/12pt Show more; click or tap expands that section and the control becomes Show less; lines under the heading hide, including lines in later blank-line bubbles, until the next heading of the same or higher level; 14 body lines stay open; a heading with no body stays open; each section collapses on its own; the choice is not saved; streaming stays plain text; Copy and Save still use the full section; the Footnotes list stays on the last painted bubble; an active find hit in the body keeps that section open, and a hit on the heading line does not; the accessible name is Show more section, or Show less section when open; the visible label stays Show more / Show less; the control does not move composer focus; Reduce Motion adds no animation; no new shortcut; no new HTTP)",
  () => {
    assert.equal(SECTION_COLLAPSE_LINES, 14);
    assert.equal(SECTION_SHOW_MORE, "Show more");
    assert.equal(SECTION_SHOW_LESS, "Show less");
    assert.equal(SECTION_SHOW_MORE_ARIA, "Show more section");
    assert.equal(SECTION_SHOW_LESS_ARIA, "Show less section");
    assert.equal(sectionOverflows(14), false);
    assert.equal(sectionOverflows(15), true);
    assert.equal(sectionCollapseLabel(false), "Show more");
    assert.equal(sectionCollapseLabel(true), "Show less");
    assert.equal(sectionCollapseAria(false), "Show more section");
    assert.equal(sectionCollapseAria(true), "Show less section");
    assert.equal(sectionCollapseAnimates(false), false);
    assert.equal(sectionCollapseAnimates(true), false);
    assert.equal(sectionFindBubble("m", "m:2", ":"), 2);
    assert.equal(sectionFindBubble("m", "m#2", "#"), 2);
    assert.equal(sectionFindBubble("m", "m:2", "#"), null);
    assert.equal(sectionFindBubble("m", "other:0", ":"), null);
    assert.equal(sectionFindBubble("m", "m:", ":"), null);
    assert.equal(sectionVisibleText("# Intro\np1", "# Intro", true), "# Intro");
    assert.equal(sectionVisibleText("# Intro\np1", "# Intro", false), "# Intro\np1");
    assert.equal(sectionTail("# Intro\np1\np2", "# Intro"), "p1\np2");
    assert.equal(sectionTail("# Intro", "# Intro"), "");

    const shortDoc = `# Intro\n${prose(14)}`;
    const short = [shortDoc];
    const shortPlan = planSectionCollapse({
      documentText: shortDoc,
      bubbles: short,
      completed: true,
      expanded: new Set(),
      activeBubble: null,
      activeStart: null,
    });
    assert.equal(shortPlan.collapsed.size, 0);
    assert.equal(shortPlan.toggles.size, 0);
    assert.equal(shortPlan.hidden.size, 0);
    assert.equal(sectionBodyLineCount(shortDoc, "# Intro"), 14);

    const longDoc = `# Intro\n\n${prose(15).split("\n").join("\n\n")}\n\n# Next\n\nkept`;
    const longBubbles = ["# Intro", ...prose(15).split("\n"), "# Next", "kept"];
    const longPlan = planSectionCollapse({
      documentText: longDoc,
      bubbles: longBubbles,
      completed: true,
      expanded: new Set(),
      activeBubble: null,
      activeStart: null,
    });
    const intro = splitHeadingSections(longDoc, true)[0];
    assert.ok(intro);
    assert.equal(sectionBodyLineCount(intro.source, intro.headingLine) > 14, true);
    assert.equal(longPlan.collapsed.has(intro.offset), true);
    assert.equal(longPlan.toggles.has(intro.offset), true);
    assert.equal(longPlan.hidden.has(0), false);
    assert.equal(longBubbles[0], "# Intro");
    const keptAt = longBubbles.indexOf("kept");
    const nextAt = longBubbles.indexOf("# Next");
    assert.equal(longPlan.hidden.has(keptAt), false);
    assert.equal(longPlan.hidden.has(nextAt), false);
    assert.equal(longPlan.hidden.has(1), true);
    assert.equal(longPlan.hidden.has(15), true);
    assert.equal(lastPaintedBubble(longBubbles.length, longPlan.hidden), keptAt);

    const opened = planSectionCollapse({
      documentText: longDoc,
      bubbles: longBubbles,
      completed: true,
      expanded: new Set([intro.offset]),
      activeBubble: null,
      activeStart: null,
    });
    assert.equal(opened.collapsed.has(intro.offset), false);
    assert.equal(opened.toggles.has(intro.offset), true);
    assert.equal(opened.hidden.size, 0);
    assert.equal(sectionCollapseLabel(true), "Show less");

    const headingHit = planSectionCollapse({
      documentText: longDoc,
      bubbles: longBubbles,
      completed: true,
      expanded: new Set(),
      activeBubble: 0,
      activeStart: 2,
    });
    assert.equal(headingHit.collapsed.has(intro.offset), true);

    const bodyAt = longBubbles[1]?.length
      ? longDoc.indexOf(longBubbles[1] ?? "")
      : -1;
    const bodyBubble = 1;
    const spanStart = longDoc.indexOf(longBubbles[bodyBubble] ?? "");
    assert.ok(spanStart > intro.headingLine.length);
    const kept = planSectionCollapse({
      documentText: longDoc,
      bubbles: longBubbles,
      completed: true,
      expanded: new Set(),
      activeBubble: bodyBubble,
      activeStart: 0,
    });
    assert.equal(kept.collapsed.has(intro.offset), false);
    assert.equal(kept.toggles.has(intro.offset), false);
    assert.equal(kept.hidden.size, 0);
    assert.ok(bodyAt >= 0);

    const live = planSectionCollapse({
      documentText: longDoc,
      bubbles: [longDoc],
      completed: false,
      expanded: new Set(),
      activeBubble: null,
      activeStart: null,
    });
    assert.equal(live.collapsed.size, 0);
    assert.equal(live.hidden.size, 0);

    const bare = planSectionCollapse({
      documentText: "# Intro",
      bubbles: ["# Intro"],
      completed: true,
      expanded: new Set(),
      activeBubble: null,
      activeStart: null,
    });
    assert.equal(bare.toggles.size, 0);

    const fence = "```\n# not a heading\n" + prose(20) + "\n```";
    const fencePlan = planSectionCollapse({
      documentText: fence,
      bubbles: [fence],
      completed: true,
      expanded: new Set(),
      activeBubble: null,
      activeStart: null,
    });
    assert.equal(fencePlan.toggles.size, 0);

    const saved = sectionSaveBody(intro.source);
    const copied = sectionClipboardText(intro.source);
    assert.match(saved, /p15/);
    assert.match(copied, /p15/);
    assert.match(saved, /^# Intro/);
    assert.equal(sectionVisibleText(longBubbles[0] ?? "", "# Intro", true), "# Intro");

    const sections = splitHeadingSections(longDoc, true);
    assert.equal(
      sectionFindKeepsOpen({
        section: intro,
        bubbles: longBubbles,
        spans: [{ start: 0, end: intro.headingLine.length }],
        activeBubble: 0,
        activeStart: 1,
      }),
      false,
    );
    assert.equal(sections.length >= 2, true);

    assert.match(src, /No new HTTP/);
    assert.match(src, /No animation/);
    assert.match(src, /not saved/);
    assert.doesNotMatch(src, /\/v1\//);
    assert.doesNotMatch(src, /fetch\(/);
    assert.doesNotMatch(src, /localStorage/);
    assert.doesNotMatch(src, /computerPane\.ts/);
    assert.match(swift, /static let showMore = "Show more"/);
    assert.match(swift, /static let showLess = "Show less"/);
    assert.match(swift, /static let showMoreAria = "Show more section"/);
    assert.match(swift, /static let showLessAria = "Show less section"/);
    assert.match(swift, /static let bodyLines = 14/);
    assert.match(swift, /static func findKeepsOpen\(/);
    assert.match(swift, /return nil/);
    assert.doesNotMatch(swift, /\/v1\//);
    assert.doesNotMatch(swift, /UserDefaults/);
    assert.doesNotMatch(swift, /computerPane\.ts/);
  },
);

test("desktop and iOS fold each long heading and still copy and save it all", () => {
    const frame = body.slice(body.indexOf("sectionCollapse?.hiddenPieces.has(offset)"));
    assert.match(frame, /sectionCollapse\?\.hiddenPieces\.has\(offset\)/);
  assert.match(frame, /className="md-section-more"/);
  assert.match(frame, /aria-expanded=\{opened\}/);
  assert.match(frame, /aria-label=\{sectionCollapseAria\(opened\)\}/);
  assert.match(frame, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(frame, /sectionCollapseLabel\(opened\)/);
  assert.match(frame, /SectionActions source=\{piece\.section\.source\}/);
  assert.match(frame, /sectionTail\(piece\.text, piece\.section\.headingLine\)/);
  assert.match(body, /function SectionCollapseProvider/);
  assert.match(body, /planSectionCollapse\(/);
  assert.match(body, /setExpanded\(new Set\(\)\)/);
  assert.doesNotMatch(body, /localStorage/);
  const keep = body.slice(body.indexOf("function keepCodeBlockFocus("));
  assert.match(keep, /preventDefault\(\)/);
  assert.match(app, /SectionCollapseProvider/);
  assert.match(app, /sectionFindBubble\(/);
  assert.match(app, /plan\.hidden\.has\(bubbleIdx\)/);
  assert.match(app, /lastPaintedBubble\(/);
  assert.match(app, /footnotes=\{bubbleIdx===painted\?footnoted\.notes:\[\]\}/);

  const button = block(".md-section-more");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /font-weight:\s*500/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(button, /animation:\s*none/);
  const reduceAt = css.indexOf(".md-section-more {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for section collapse");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 80,
  );
  assert.match(reduce, /\.md-section-more/);
  assert.match(reduce, /animation:\s*none/);

  assert.match(markdown, /SectionCollapse.pieceHidden\(/);
  assert.match(markdown, /SectionCollapse.label\(expanded: expanded\)/);
  assert.match(markdown, /SectionCollapse.accessibilityLabel\(expanded: expanded\)/);
  assert.match(markdown, /SectionCollapse.visibleText\(/);
  assert.match(markdown, /SectionCollapse.tail\(/);
  assert.match(markdown, /focusable\(false\)/);
  assert.match(markdown, /SectionCopy.clipboardText\(markdown\)/);
  assert.match(markdown, /SectionSave.bodyText\(markdown\)/);
  assert.match(chat, /SectionCollapse.plan\(/);
  assert.match(chat, /expandedSections/);
  assert.match(chat, /sectionPlan\.hidden\.contains\(offset\)/);
  assert.match(chat, /footnoteBubble/);
  assert.match(chat, /separator: "#"/);
  assert.doesNotMatch(chat, /UserDefaults/);
  assert.doesNotMatch(shortcuts, /Show more section/);
  assert.doesNotMatch(iosShortcuts, /Show more section/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 243\. v2\.43/);
  assert.match(ci, /test_ios_section_collapse\.py/);
  assert.match(pkg, /src\/sectionCollapse\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
