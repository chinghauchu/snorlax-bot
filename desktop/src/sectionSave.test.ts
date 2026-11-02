// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import {
  headingSectionsByBubble,
  partitionHeadingBubble,
  splitHeadingSections,
} from "./headingSection.ts";
import { sectionClipboardText } from "./sectionCopy.ts";
import {
  SECTION_COPY_ARIA,
  SECTION_COPY_LABEL,
  SECTION_COPY_MS,
  SECTION_COPIED_ARIA,
  SECTION_COPIED_LABEL,
  sectionCopyAriaLabel,
  sectionCopyLabel,
  showSectionCopy,
} from "./sectionCopy.ts";
import {
  SECTION_SAVE_ARIA,
  SECTION_SAVE_FILENAME,
  SECTION_SAVE_LABEL,
  SECTION_SAVE_MIME,
  SECTION_SAVE_MS,
  SECTION_SAVED_ARIA,
  SECTION_SAVED_LABEL,
  sectionSaveAnimates,
  sectionSaveAriaLabel,
  sectionSaveBody,
  sectionSaveKeepsSection,
  sectionSaveLabel,
  showSectionSave,
} from "./sectionSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "sectionSave.ts"), "utf8");
const copySrc = readFileSync(join(here, "sectionCopy.ts"), "utf8");
const splitter = readFileSync(join(here, "headingSection.ts"), "utf8");
const listSave = readFileSync(join(here, "listSave.ts"), "utf8");
const quoteSave = readFileSync(join(here, "quoteSave.ts"), "utf8");
const replySave = readFileSync(join(here, "replyMarkdownSave.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "SectionSave.swift"),
  "utf8",
);
const copySwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "SectionCopy.swift"),
  "utf8",
);
const headingSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "HeadingSection.swift"),
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

const PHRASE = "v2.38 save a heading section";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function sectionSource(text: string, level: number): string {
  const found = splitHeadingSections(text, true).find((part) => part.level === level);
  assert.ok(found, `missing level ${level} in ${JSON.stringify(text)}`);
  return found?.source ?? "";
}

test("labels, timing, and no animation", () => {
  assert.equal(SECTION_SAVE_LABEL, "Save");
  assert.equal(SECTION_SAVED_LABEL, "Saved");
  assert.equal(SECTION_SAVE_ARIA, "Save section");
  assert.equal(SECTION_SAVED_ARIA, "Saved");
  assert.equal(SECTION_SAVE_MS, 1500);
  assert.equal(SECTION_SAVE_FILENAME, "section.md");
  assert.equal(SECTION_SAVE_MIME, "text/markdown;charset=utf-8");
  assert.equal(SECTION_COPY_LABEL, "Copy");
  assert.equal(SECTION_COPIED_LABEL, "Copied");
  assert.equal(SECTION_COPY_ARIA, "Copy section");
  assert.equal(SECTION_COPIED_ARIA, "Copied");
  assert.equal(SECTION_COPY_MS, 1500);
  assert.equal(sectionSaveLabel(false), "Save");
  assert.equal(sectionSaveLabel(true), "Saved");
  assert.equal(sectionSaveAriaLabel(false), "Save section");
  assert.equal(sectionSaveAriaLabel(true), "Saved");
  assert.equal(sectionCopyLabel(false), "Copy");
  assert.equal(sectionCopyLabel(true), "Copied");
  assert.equal(sectionCopyAriaLabel(false), "Copy section");
  assert.equal(sectionCopyAriaLabel(true), "Copied");
  assert.equal(showSectionSave({ completed: true, source: "# A" }), true);
  assert.equal(showSectionSave({ completed: false, source: "# A" }), false);
  assert.equal(showSectionSave({ completed: true, source: "" }), false);
  assert.equal(showSectionCopy({ completed: true, source: "## B" }), true);
  assert.equal(showSectionCopy({ completed: false, source: "## B" }), false);
  assert.equal(showSectionCopy({ completed: true, source: "" }), false);
  assert.equal(sectionSaveKeepsSection(), true);
  assert.equal(sectionSaveAnimates(false), false);
  assert.equal(sectionSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(copySrc.includes("/v1/"), false);
  assert.equal(splitter.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(copySwift.includes("/v1/"), false);
  assert.equal(headingSwift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save section"/);
  assert.match(swift, /static let filename = "section.md"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-section/);
  assert.match(swift, /completed && !source.isEmpty/);
  assert.match(copySwift, /static let copyAria = "Copy section"/);
  assert.match(copySwift, /completed && !source.isEmpty/);
  assert.match(headingSwift, /level <= 3/);
  assert.match(src, /Never animate/);
  assert.match(listSave, /LIST_SAVE_FILENAME = "list.md"/);
  assert.match(quoteSave, /QUOTE_SAVE_FILENAME = "quote.md"/);
  assert.match(replySave, /REPLY_MARKDOWN_FILENAME = "reply.md"/);
});

test("the file is the heading plus the lines under it", () => {
  assert.equal(sectionSaveBody("# A\n\nbody"), "# A\n\nbody");
  assert.equal(sectionSaveBody("# A\n\nbody"), sectionClipboardText("# A\n\nbody"));
  assert.equal(sectionSaveBody(""), "");
  assert.equal(sectionSaveBody("# A\n").endsWith("\n\n"), false);

  const nested = "# A\n\npara\n\n## B\n\nmore\n\n### C\n\ndeep";
  assert.equal(sectionSource(nested, 1), nested);
  assert.equal(sectionSource(nested, 2), "## B\n\nmore\n\n### C\n\ndeep");
  assert.equal(sectionSource(nested, 3), "### C\n\ndeep");
  assert.equal(sectionSaveBody(sectionSource(nested, 2)), sectionClipboardText(sectionSource(nested, 2)));

  const siblings = "# A\n\nbody\n\n# B\n\nnext";
  assert.equal(sectionSource(siblings, 1), "# A\n\nbody");
  const second = splitHeadingSections(siblings, true).filter((part) => part.level === 1);
  assert.equal(second.length, 2);
  assert.equal(second[1]?.source, "# B\n\nnext");
  assert.equal(second[0]?.source.endsWith("\n"), false);

  const up = "## Sub\n\ntext\n\n# Top\n\nrest";
  assert.equal(sectionSource(up, 2), "## Sub\n\ntext");
  assert.equal(sectionSource(up, 1), "# Top\n\nrest");

  const deep = "### C\n\n#### D\n\ndeep\n\n## Up\n\nmore";
  const deepSections = splitHeadingSections(deep, true);
  assert.equal(deepSections.some((part) => part.headingLine.startsWith("####")), false);
  assert.equal(sectionSource(deep, 3), "### C\n\n#### D\n\ndeep");
  assert.equal(sectionSource(deep, 2), "## Up\n\nmore");

  assert.equal(sectionSource("# Title #\n\nbody", 1), "# Title #\n\nbody");
  assert.equal(sectionSource("  ## Indented\n\nbody", 2), "  ## Indented\n\nbody");
  assert.deepEqual(splitHeadingSections("#Title\n\nnope", true), []);
  assert.deepEqual(splitHeadingSections("#### Only\n\ntext", true), []);
  assert.deepEqual(splitHeadingSections("", true), []);
  assert.deepEqual(splitHeadingSections("# A\n\nbody", false), []);

  const fenced = "```\n# not\n```\n\n# Real\n\nyes";
  const fencedSections = splitHeadingSections(fenced, true);
  assert.equal(fencedSections.length, 1);
  assert.equal(fencedSections[0]?.source, "# Real\n\nyes");
  assert.doesNotMatch(fencedSections[0]?.source ?? "", /not/);

  const listed = "- item\n\n  still\n\n# Real\n\nbody";
  const listedSections = splitHeadingSections(listed, true);
  assert.equal(listedSections.length, 1);
  assert.equal(listedSections[0]?.headingLine, "# Real");
  assert.equal(listedSections[0]?.source, "# Real\n\nbody");

  const inside = "- item\n\n  # inside\n\n# Real";
  const insideSections = splitHeadingSections(inside, true);
  assert.equal(insideSections.length, 1);
  assert.equal(insideSections[0]?.headingLine, "# Real");
  assert.equal(insideSections[0]?.source, "# Real");

  assert.deepEqual(splitHeadingSections("- [ ] open\n- [x] done", true), []);

  const quoted = "> # quoted\n>\n> body\n\n# Real\n\nyes";
  const quotedSections = splitHeadingSections(quoted, true);
  assert.equal(quotedSections.length, 1);
  assert.equal(quotedSections[0]?.source, "# Real\n\nyes");

  const setext = "# Title\n\nbody\n\nOther\n=====\n\nafter";
  const setextSections = splitHeadingSections(setext, true);
  assert.equal(setextSections.length, 1);
  assert.equal(setextSections[0]?.source, "# Title\n\nbody");
  assert.doesNotMatch(setextSections[0]?.source ?? "", /Other/);

  const lower = "# Title\n\nbody\n\nOther\n-----\n\nafter";
  assert.equal(sectionSource(lower, 1), lower.trimEnd());

  const code = "    # not\n\npara";
  assert.deepEqual(splitHeadingSections(code, true), []);
  const afterCode = "    code\n\n# Title\n\nbody";
  assert.equal(sectionSource(afterCode, 1), "# Title\n\nbody");
});

test("blank-line bubbles stay split and the heading keeps the later lines", () => {
  const doc = "# A\n\nbody\n\n## B\n\nmore";
  const bubbles = splitAssistantBubbles(doc, true);
  assert.deepEqual(bubbles, ["# A", "body", "## B", "more"]);
  const assigned = headingSectionsByBubble(doc, bubbles, true);
  assert.equal(assigned.length, 4);
  assert.equal(assigned[0]?.[0]?.source, doc);
  assert.equal(assigned[0]?.[0]?.level, 1);
  assert.deepEqual(assigned[1], []);
  assert.equal(assigned[2]?.[0]?.source, "## B\n\nmore");
  assert.equal(assigned[2]?.[0]?.level, 2);
  assert.deepEqual(assigned[3], []);
  assert.deepEqual(headingSectionsByBubble(doc, bubbles, false), [[], [], [], []]);

  const same = "# A\nbody\n\nlater";
  const sameBubbles = splitAssistantBubbles(same, true);
  assert.deepEqual(sameBubbles, ["# A\nbody", "later"]);
  const sameAssigned = headingSectionsByBubble(same, sameBubbles, true);
  assert.equal(sameAssigned[0]?.[0]?.source, "# A\nbody\n\nlater");
  const parts = partitionHeadingBubble(sameBubbles[0] ?? "", sameAssigned[0] ?? []);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "section");
  if (parts[0]?.type === "section") {
    assert.equal(parts[0].text, "# A\nbody");
    assert.equal(parts[0].section.source, "# A\nbody\n\nlater");
  }
});

test("Save sits beside Copy and does not replace it", () => {
  const button = sliceFn(body, "function SectionActions(", "function ListActions(");
  assert.match(button, /showSectionSave\(\{ completed: true, source \}\)/);
  assert.match(button, /showSectionCopy\(\{ completed: true, source \}\)/);
  assert.match(button, /sectionSaveBody\(source\)/);
  assert.match(button, /downloadSectionMarkdown\(/);
  assert.match(button, /SECTION_SAVE_FILENAME/);
  assert.match(button, /sectionSaveLabel\(saved\)/);
  assert.match(button, /aria-label=\{sectionSaveAriaLabel\(saved\)\}/);
  assert.match(button, /className=\{saved \? "md-section-save is-saved" : "md-section-save"\}/);
  assert.match(button, /className=\{copied \? "md-section-copy is-copied" : "md-section-copy"\}/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /sectionSaveKeepsSection\(\)/);
  assert.match(button, /SECTION_SAVE_MS/);
  assert.match(button, /SECTION_COPY_MS/);
  assert.match(button, /className="md-section-actions"/);
  const copyAt = button.indexOf("sectionCopyLabel");
  const saveAt = button.indexOf("sectionSaveLabel");
  assert.ok(copyAt >= 0 && copyAt < saveAt);
  const copyCall = sliceFn(button, "function onCopy", "function onSave");
  assert.match(copyCall, /sectionClipboardText\(source\)/);
  assert.doesNotMatch(copyCall, /sectionSaveBody/);
  assert.doesNotMatch(copyCall, /downloadSectionMarkdown/);
  const saveCall = sliceFn(button, "function onSave", "return (");
  assert.match(saveCall, /sectionSaveBody\(source\)/);
  assert.match(saveCall, /SECTION_SAVE_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /sectionClipboardText/);
  const save = block(".md-section-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-section-save:focus-visible"), /outline:/);
  assert.match(css, /\.md-section-frame:hover > \.md-section-actions/);
  assert.match(css, /\.md-section-frame:focus-within > \.md-section-actions/);
  assert.match(css, /\.md-section-actions:has\(\.is-saved\)/);
  assert.match(css, /\.md-section-actions:has\(\.is-copied\)/);
  const reduceAt = css.indexOf("v2.38: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for section Save");
  const reduce = css.slice(reduceAt, reduceAt + 320);
  assert.match(reduce, /\.md-section-save/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  assert.match(body, /headingSections=\{headingByBubble\[bubbleIdx\]\}|headingSections\?/);
  assert.match(app, /headingSectionsByBubble/);
  assert.match(app, /headingSections=\{headingByBubble\[bubbleIdx\]\}/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /sectionSave/);
  assert.doesNotMatch(user, /md-section-save/);
  const plain = sliceFn(app, 'className="assistant-plain"', "showAssistantCopy");
  assert.doesNotMatch(plain, /md-section-save/);
  assert.doesNotMatch(shortcuts, /Save section/);
  assert.doesNotMatch(iosShortcuts, /Save section/);
  assert.match(listSave, /LIST_SAVE_FILENAME = "list.md"/);
});

test("iOS Save writes the section lines and Copy stays", () => {
  const blockSrc = sliceFn(markdown, "struct HeadingSectionBlock", "struct MarkdownTablePieces");
  assert.match(blockSrc, /SectionSave\.showsSave\(completed: completed, source: markdown\)/);
  assert.match(blockSrc, /SectionSave\.bodyText\(markdown\)/);
  assert.match(blockSrc, /SectionSave\.label\(saved: saved\)/);
  assert.match(blockSrc, /SectionSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(blockSrc, /SectionSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(blockSrc, /SectionSave\.feedbackNanoseconds/);
  assert.match(blockSrc, /SectionSave\.filename/);
  assert.match(blockSrc, /SectionSave\.writeFile/);
  assert.match(blockSrc, /SectionSave\.keepsSection\(\)/);
  assert.match(blockSrc, /focusable\(false\)/);
  assert.match(blockSrc, /UIActivityViewController/);
  assert.match(blockSrc, /SectionCopy\.clipboardText\(markdown\)/);
  assert.match(blockSrc, /saved = false/);
  assert.doesNotMatch(blockSrc, /PHPhotoLibrary/);
  assert.doesNotMatch(blockSrc, /withAnimation/);
  const saveCall = sliceFn(blockSrc, "private func saveSection", "private struct SectionMarkdownShareSheet");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.match(chat, /headingSections:/);
  assert.match(chat, /HeadingSection.assign/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /SectionSave/);
  assert.match(headingSwift, /static func split/);
  assert.match(headingSwift, /static func assign/);
  assert.match(headingSwift, /static func partition/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 238\. v2\.38/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_section_save\.py/);
  assert.match(pkg, /sectionSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
