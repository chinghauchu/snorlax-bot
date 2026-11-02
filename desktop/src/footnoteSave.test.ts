// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { codeBlockSaveFilename } from "./codeBlockSave.ts";
import {
  FOOTNOTE_COPY_ARIA,
  FOOTNOTE_COPY_LABEL,
  FOOTNOTE_COPY_MS,
  FOOTNOTE_COPIED_ARIA,
  FOOTNOTE_COPIED_LABEL,
  footnoteClipboardText,
  footnoteCopyAriaLabel,
  footnoteCopyLabel,
  showFootnoteCopy,
} from "./footnoteCopy.ts";
import {
  FOOTNOTE_SAVE_ARIA,
  FOOTNOTE_SAVE_FILENAME,
  FOOTNOTE_SAVE_LABEL,
  FOOTNOTE_SAVE_MIME,
  FOOTNOTE_SAVE_MS,
  FOOTNOTE_SAVED_ARIA,
  FOOTNOTE_SAVED_LABEL,
  footnoteSaveAnimates,
  footnoteSaveAriaLabel,
  footnoteSaveBody,
  footnoteSaveKeepsList,
  footnoteSaveLabel,
  showFootnoteSave,
} from "./footnoteSave.ts";
import { extractFootnotes } from "./markdownFootnote.ts";
import { MESSAGE_LINKS_FILENAME } from "./messageLinks.ts";
import { LIST_SAVE_FILENAME } from "./listSave.ts";
import { MATH_BLOCK_SAVE_FILENAME } from "./mathBlockSave.ts";
import { QUOTE_SAVE_FILENAME } from "./quoteSave.ts";
import { REPLY_MARKDOWN_FILENAME } from "./replyMarkdownSave.ts";
import { SECTION_SAVE_FILENAME } from "./sectionSave.ts";
import { TASK_SAVE_FILENAME } from "./taskSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "footnoteSave.ts"), "utf8");
const copySrc = readFileSync(join(here, "footnoteCopy.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "FootnoteSave.swift"),
  "utf8",
);
const copySwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "FootnoteCopy.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const footnotesSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownFootnote.swift"),
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
const codeSave = readFileSync(join(here, "codeBlockSave.ts"), "utf8");

const PHRASE = "v2.41 copy and save footnotes";

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

test("labels, timing, and no animation", () => {
  assert.equal(FOOTNOTE_SAVE_LABEL, "Save");
  assert.equal(FOOTNOTE_SAVED_LABEL, "Saved");
  assert.equal(FOOTNOTE_SAVE_ARIA, "Save footnotes");
  assert.equal(FOOTNOTE_SAVED_ARIA, "Saved");
  assert.equal(FOOTNOTE_SAVE_MS, 1500);
  assert.equal(FOOTNOTE_SAVE_FILENAME, "notes.md");
  assert.equal(FOOTNOTE_SAVE_MIME, "text/markdown;charset=utf-8");
  assert.equal(FOOTNOTE_COPY_LABEL, "Copy");
  assert.equal(FOOTNOTE_COPIED_LABEL, "Copied");
  assert.equal(FOOTNOTE_COPY_ARIA, "Copy footnotes");
  assert.equal(FOOTNOTE_COPIED_ARIA, "Copied");
  assert.equal(FOOTNOTE_COPY_MS, 1500);
  assert.equal(footnoteSaveLabel(false), "Save");
  assert.equal(footnoteSaveLabel(true), "Saved");
  assert.equal(footnoteSaveAriaLabel(false), "Save footnotes");
  assert.equal(footnoteSaveAriaLabel(true), "Saved");
  assert.equal(footnoteCopyLabel(false), "Copy");
  assert.equal(footnoteCopyLabel(true), "Copied");
  assert.equal(footnoteCopyAriaLabel(false), "Copy footnotes");
  assert.equal(footnoteCopyAriaLabel(true), "Copied");
  const sample = [{ label: "1", number: 1, text: "note" }];
  assert.equal(showFootnoteSave({ completed: true, notes: sample }), true);
  assert.equal(showFootnoteSave({ completed: false, notes: sample }), false);
  assert.equal(showFootnoteSave({ completed: true, notes: [] }), false);
  assert.equal(showFootnoteCopy({ completed: true, notes: sample }), true);
  assert.equal(showFootnoteCopy({ completed: false, notes: sample }), false);
  assert.equal(showFootnoteCopy({ completed: true, notes: [] }), false);
  assert.equal(footnoteSaveKeepsList(), true);
  assert.equal(footnoteSaveAnimates(false), false);
  assert.equal(footnoteSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(copySrc.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(copySwift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save footnotes"/);
  assert.match(swift, /static let filename = "notes.md"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-footnote/);
  assert.match(swift, /completed && !markdown\(notes\)\.isEmpty/);
  assert.match(copySwift, /static let copyAria = "Copy footnotes"/);
  assert.match(copySwift, /UIPasteboard/);
  assert.match(copySwift, /FootnoteSave\.markdown/);
  assert.match(src, /Never animate/);
  assert.match(codeSave, /snippet\.py/);
  assert.equal(MESSAGE_LINKS_FILENAME, "links.md");
  assert.equal(LIST_SAVE_FILENAME, "list.md");
  assert.equal(QUOTE_SAVE_FILENAME, "quote.md");
  assert.equal(TASK_SAVE_FILENAME, "tasks.md");
  assert.equal(SECTION_SAVE_FILENAME, "section.md");
  assert.equal(MATH_BLOCK_SAVE_FILENAME, "math.tex");
  assert.equal(REPLY_MARKDOWN_FILENAME, "reply.md");
});

test("the file is the rendered definitions, not the painted numbers", () => {
  assert.equal(footnoteSaveBody([]), "");
  assert.equal(footnoteSaveBody([{ label: "1", number: 1, text: "note" }]), "[^1]: note");
  assert.equal(
    footnoteClipboardText([{ label: "1", number: 1, text: "note" }]),
    footnoteSaveBody([{ label: "1", number: 1, text: "note" }]),
  );
  assert.equal(footnoteSaveBody([{ label: "x", number: 1, text: "" }]), "[^x]:");
  assert.equal(
    footnoteSaveBody([{ label: "1", number: 1, text: "alpha\nbeta" }]),
    "[^1]: alpha\n    beta",
  );
  assert.equal(
    footnoteSaveBody([{ label: "1", number: 1, text: "alpha\r\n\r\nbeta" }]),
    "[^1]: alpha\n\n    beta",
  );
  assert.equal(footnoteSaveBody([{ label: "1", number: 1, text: "note" }]).endsWith("\n"), false);
  assert.equal(
    footnoteSaveBody([{ label: "a", number: 1, text: "see §§SBFN9§§" }]),
    "[^a]: see §§SBFN9§§",
  );

  const ordered = extractFootnotes(
    "See [^b] and [^a].\n\n[^a]: Alpha mentions [^b].\n[^b]: Beta.",
    true,
  );
  assert.equal(
    footnoteSaveBody(ordered.notes),
    "[^b]: Beta.\n[^a]: Alpha mentions [^b].",
  );
  assert.doesNotMatch(footnoteSaveBody(ordered.notes), /^1\./m);
  assert.doesNotMatch(footnoteSaveBody(ordered.notes), /Footnotes/);

  const wrapped = extractFootnotes(
    "Go[^note].\n\n[^note]: alpha\n  beta\n\nNext paragraph.",
    true,
  );
  assert.equal(footnoteSaveBody(wrapped.notes), "[^note]: alpha\n    beta");
  assert.doesNotMatch(footnoteSaveBody(wrapped.notes), /Next paragraph/);

  const loose = extractFootnotes("A[^1].\n\n[^1]: alpha\n\n  beta\n\nAfter.", true);
  assert.equal(footnoteSaveBody(loose.notes), "[^1]: alpha\n\n    beta");

  const duplicate = extractFootnotes("See[^1].\n\n[^1]: first\n\n[^1]: second", true);
  assert.equal(footnoteSaveBody(duplicate.notes), "[^1]: first");
  assert.equal(duplicate.text.includes("[^1]: second"), true);

  const orphan = extractFootnotes("Hello.\n\n[^4]: nobody", true);
  assert.equal(footnoteSaveBody(orphan.notes), "");
  assert.equal(showFootnoteSave({ completed: true, notes: orphan.notes }), false);

  const fence = extractFootnotes("```\n[^1]\n[^1]: inside\n```\n\nSee[^1].\n\n[^1]: outside", true);
  assert.equal(footnoteSaveBody(fence.notes), "[^1]: outside");
  const onlyFence = extractFootnotes("```\n[^1]\n```\n\n[^1]: hidden", true);
  assert.equal(footnoteSaveBody(onlyFence.notes), "");
  const math = extractFootnotes("$$\n[^1]\n$$\n\n[^1]: no", true);
  assert.equal(footnoteSaveBody(math.notes), "");
  const span = extractFootnotes("Use `[^1]` here[^1].\n\n[^1]: note", true);
  assert.equal(footnoteSaveBody(span.notes), "[^1]: note");

  const live = "See[^1].\n\n[^1]: note";
  assert.equal(extractFootnotes(live, false).notes.length, 0);
  assert.equal(
    showFootnoteCopy({
      completed: false,
      notes: [{ label: "1", number: 1, text: "note" }],
    }),
    false,
  );
});

test("code-block Save and message links were already shipped", () => {
  assert.equal(codeBlockSaveFilename("python"), "snippet.py");
  assert.equal(codeBlockSaveFilename("typescript"), "snippet.ts");
  assert.equal(codeBlockSaveFilename("bash"), "snippet.sh");
  assert.equal(codeBlockSaveFilename("nope"), "snippet.txt");
  assert.equal(MESSAGE_LINKS_FILENAME, "links.md");
  assert.notEqual(FOOTNOTE_SAVE_FILENAME, "snippet.py");
  assert.notEqual(FOOTNOTE_SAVE_FILENAME, "links.md");
});

test("Save sits beside Copy and does not replace it", () => {
  const button = sliceFn(body, "function FootnoteActions(", "function mentionifyString(");
  assert.match(button, /showFootnoteSave\(\{ completed, notes \}\)/);
  assert.match(button, /showFootnoteCopy\(\{ completed, notes \}\)/);
  assert.match(button, /downloadFootnoteMarkdown\(/);
  assert.match(button, /FOOTNOTE_SAVE_FILENAME/);
  assert.match(button, /footnoteSaveLabel\(saved\)/);
  assert.match(button, /aria-label=\{footnoteSaveAriaLabel\(saved\)\}/);
  assert.match(button, /className=\{saved \? "md-fn-save is-saved" : "md-fn-save"\}/);
  assert.match(button, /className=\{copied \? "md-fn-copy is-copied" : "md-fn-copy"\}/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /footnoteSaveKeepsList\(\)/);
  assert.match(button, /FOOTNOTE_SAVE_MS/);
  assert.match(button, /FOOTNOTE_COPY_MS/);
  assert.match(button, /className="md-fn-actions"/);
  assert.match(button, /className="md-footnotes"/);
  assert.match(button, /className="md-fn-frame"/);
  const copyAt = button.indexOf("footnoteCopyLabel");
  const saveAt = button.indexOf("footnoteSaveLabel");
  assert.ok(copyAt >= 0 && copyAt < saveAt);
  const copyCall = sliceFn(button, "function onCopy", "function onSave");
  assert.match(copyCall, /footnoteClipboardText\(notes\)/);
  assert.doesNotMatch(copyCall, /downloadFootnoteMarkdown/);
  const saveCall = sliceFn(button, "function onSave", "if (!showCopy && !showSave)");
  assert.match(saveCall, /downloadFootnoteMarkdown\(notes, FOOTNOTE_SAVE_FILENAME\)/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /footnoteClipboardText/);
  const save = block(".md-fn-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-fn-save:focus-visible"), /outline:/);
  assert.match(css, /\.md-fn-frame:hover > \.md-fn-actions/);
  assert.match(css, /\.md-fn-frame:focus-within > \.md-fn-actions/);
  assert.match(css, /\.md-fn-actions:has\(\.is-saved\)/);
  assert.match(css, /\.md-fn-actions:has\(\.is-copied\)/);
  const reduceAt = css.indexOf("v2.41: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for footnote Save");
  const reduce = css.slice(reduceAt, reduceAt + 360);
  assert.match(reduce, /\.md-fn-save/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /footnoteSave/);
  assert.doesNotMatch(user, /md-fn-save/);
  const plain = sliceFn(app, 'className="assistant-plain"', "showAssistantCopy");
  assert.doesNotMatch(plain, /md-fn-save/);
  assert.doesNotMatch(shortcuts, /Save footnotes/);
  assert.doesNotMatch(iosShortcuts, /Save footnotes/);
  assert.doesNotMatch(shortcuts, /Copy footnotes/);
  const tasks = sliceFn(body, "function TaskActions(", "function CollapsibleList(");
  assert.doesNotMatch(tasks, /footnoteSave/);
  assert.doesNotMatch(tasks, /md-fn-save/);
});

test("iOS Save writes the definitions and Copy stays", () => {
  const list = sliceFn(
    footnotesSwift,
    "struct MarkdownFootnoteList",
    "struct MarkdownFootnotePopover",
  );
  assert.match(list, /FootnoteSave\.showsSave\(completed: completed, notes: notes\)/);
  assert.match(list, /FootnoteSave\.label\(saved: saved\)/);
  assert.match(list, /FootnoteSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(list, /FootnoteSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(list, /FootnoteSave\.feedbackNanoseconds/);
  assert.match(list, /FootnoteSave\.filename/);
  assert.match(list, /FootnoteSave\.writeFile/);
  assert.match(list, /FootnoteSave\.keepsList\(\)/);
  assert.match(list, /focusable\(false\)/);
  assert.match(list, /UIActivityViewController/);
  assert.match(list, /FootnoteCopy\.clipboardText\(notes\)/);
  assert.match(list, /FootnoteCopy\.writeClipboard/);
  assert.match(list, /saved = false/);
  assert.doesNotMatch(list, /PHPhotoLibrary/);
  assert.doesNotMatch(list, /withAnimation/);
  assert.doesNotMatch(list, /UIPasteboard/);
  assert.doesNotMatch(list, /ListSave/);
  assert.doesNotMatch(list, /TaskSave/);
  const saveCall = sliceFn(list, "private func saveNotes", "private struct FootnoteMarkdownShareSheet");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.match(markdown, /MarkdownFootnoteList\(/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /FootnoteSave/);
  assert.doesNotMatch(footnotesSwift, /UIPasteboard/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 241\. v2\.41/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_footnote_save\.py/);
  assert.match(pkg, /footnoteSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
