// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
  "utf8",
);

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("256px sidebar is a separate overflow context from the transcript", () => {
  const app = block(".app");
  const sidebar = block(".sidebar");
  const chat = block(".chat");
  const transcript = block(".transcript");
  const roster = block(".roster");

  assert.match(app, /grid-template-columns:\s*256px\s+1fr\s+320px/);
  assert.match(app, /overflow:\s*hidden/);
  assert.match(sidebar, /overflow:\s*hidden/);
  assert.match(sidebar, /min-height:\s*0/);
  assert.match(chat, /overflow:\s*hidden/);
  assert.match(chat, /min-height:\s*0/);
  assert.match(transcript, /overflow:\s*auto/);
  assert.match(roster, /overflow:\s*auto/);
  assert.notEqual(transcript, sidebar);
});

test("channel subtitle is 12px muted", () => {
  const title = block(".row-title");
  assert.match(title, /font-size:\s*12px/);
  assert.match(title, /color:\s*var\(--text-muted\)/);
});

test("jump line is 12px muted under the user bubble", () => {
  const jump = block(".jump-line");
  assert.match(jump, /font-size:\s*12px/);
  assert.match(jump, /color:\s*var\(--text-muted\)/);
});

test("tool traces are 12px muted system lines", () => {
  const trace = block(".tool-trace");
  assert.match(trace, /font-size:\s*12px/);
  assert.match(trace, /color:\s*var\(--text-muted\)/);
});

test("thinking line is 12px muted like a tool trace, with a wave and reduced-motion static text", () => {
  const thinking = block(".thinking");
  const label = block(".thinking-label");
  assert.match(thinking, /font-size:\s*12px/);
  assert.match(thinking, /color:\s*var\(--text-muted\)/);
  assert.match(label, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(label, /(?:^|[^-])color:\s*transparent\b/);
  assert.doesNotMatch(label, /-webkit-text-fill-color:\s*transparent\b/);
  assert.doesNotMatch(css, /\.typing\s*\{/);
  assert.match(css, /@keyframes\s+thinking-wave/);
  assert.match(
    css,
    /prefers-reduced-motion:\s*reduce[\s\S]*\.thinking-label \{[\s\S]*animation:\s*none/,
  );
});

test("shared project hint is 12px muted", () => {
  const hint = block(".shared-project-hint");
  assert.match(hint, /font-size:\s*12px/);
  assert.match(hint, /color:\s*var\(--text-muted\)/);
});

test("info pane is a 320px overlay on chat, not a fourth column", () => {
  const chat = block(".chat");
  const profile = block(".profile");
  assert.match(chat, /position:\s*relative/);
  assert.match(profile, /position:\s*absolute/);
  assert.match(profile, /width:\s*320px/);
});

test("computer pane is a 320px column; collapse drops it; sidebar stays 256px", () => {
  const app = block(".app");
  const collapsed = block(".app.computer-collapsed");
  const hidden = block(".app.computer-collapsed .computer");
  const computer = block(".computer");
  const sidebar = block(".sidebar");
  assert.match(app, /grid-template-columns:\s*256px\s+1fr\s+320px/);
  assert.match(collapsed, /grid-template-columns:\s*256px\s+1fr;/);
  assert.match(hidden, /display:\s*none/);
  assert.match(computer, /width:\s*320px/);
  assert.match(sidebar, /min-width:\s*256px/);
  assert.doesNotMatch(sidebar, /320px/);
});

test("computer tree and preview scroll separately from the transcript", () => {
  const transcript = block(".transcript");
  const tree = block(".computer-tree");
  const preview = block(".computer-preview");
  assert.match(transcript, /overflow:\s*auto/);
  assert.match(tree, /overflow:\s*auto/);
  assert.match(preview, /overflow:\s*auto/);
});

test("computer chrome uses muted 12px language", () => {
  const root = block(".computer-root");
  const empty = block(".computer-empty");
  assert.match(root, /font-size:\s*12px/);
  assert.match(root, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);
});

test("create menu is 160px; new channel overlay is 320px; member rows 44px", () => {
  const menu = block(".create-menu");
  const overlay = block(".modal.channel-create");
  const row = block(".member-pick-row");
  assert.match(menu, /width:\s*160px/);
  assert.match(overlay, /width:\s*320px/);
  assert.match(row, /height:\s*44px/);
});

test("agent identity type sizes and channel member rows", () => {
  const name = block(".info-name");
  const muted = block(".info-muted");
  const member = block(".info-member");
  assert.match(name, /font-size:\s*16px/);
  assert.match(muted, /font-size:\s*13px/);
  assert.match(muted, /color:\s*var\(--text-muted\)/);
  assert.match(member, /height:\s*44px/);
});

test("computer preview in the identity pane is 288x180 16:10 with 8px radius", () => {
  const header = block(".info-computer-header");
  const empty = block(".info-computer-empty");
  const frame = block(".info-computer-frame");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);
  assert.match(frame, /width:\s*288px/);
  assert.match(frame, /height:\s*180px/);
  assert.match(frame, /border-radius:\s*8px/);
  assert.match(frame, /border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(frame, /cursor:\s*pointer/);
  assert.match(frame, /pointer-events:\s*auto/);
  const img = block(".info-computer-frame img,\n.info-computer-slot");
  assert.match(img, /object-fit:\s*contain/);
  assert.match(img, /pointer-events:\s*none/);
  const open = block(".info-computer-open");
  assert.match(open, /font-size:\s*12px/);
  const bar = block(".computer-takeover-bar");
  const status = block(".computer-takeover-status");
  const done = block(".computer-takeover-done");
  const record = block(".computer-takeover-record");
  const recording = block(".computer-takeover-record.recording");
  const dot = block(".computer-takeover-dot");
  const saved = block(".computer-takeover-saved");
  const takeoverFrame = block(".computer-takeover-frame");
  assert.match(bar, /height:\s*52px/);
  assert.match(status, /font-size:\s*12px/);
  assert.match(status, /color:\s*var\(--text-muted\)/);
  assert.match(done, /height:\s*36px/);
  assert.match(record, /font-size:\s*12px/);
  assert.match(record, /color:\s*var\(--text-muted\)/);
  assert.match(recording, /color:\s*var\(--danger\)/);
  assert.match(dot, /width:\s*6px/);
  assert.match(dot, /height:\s*6px/);
  assert.match(dot, /background:\s*var\(--danger\)/);
  assert.match(saved, /font-size:\s*12px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.computer-takeover-dot \{[\s\S]*animation:\s*none/);
  assert.match(takeoverFrame, /border-radius:\s*8px/);
  assert.match(takeoverFrame, /border:\s*1px\s+solid\s+var\(--border\)/);
  const sheet = block(".modal.plugin-add-sheet");
  assert.match(sheet, /width:\s*320px/);
  const skillName = block(".computer-skill-name");
  const skillSave = block(".computer-skill-save");
  assert.match(skillName, /font-size:\s*14px/);
  assert.match(skillSave, /min-height:\s*36px/);
  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
    "utf8",
  );
  assert.match(app, /AgentComputer/);
  const pane = app.slice(
    app.indexOf("info-identity"),
    app.indexOf("<ComputerPane"),
  );
  assert.ok(pane.indexOf("AgentComputer") < pane.indexOf("info-routines"));
  assert.match(pane, /onOpen/);
  assert.match(app, /ComputerTakeover/);
  assert.match(app, /composerInert/);
});

test("routines list is 44px rows with switch on the agent read pane", () => {
  const header = block(".info-routines-header");
  const add = block(".info-routine-add");
  const row = block(".info-routine");
  const name = block(".info-routine-name");
  const meta = block(".info-routine-meta");
  const empty = block(".info-routine-empty");
  const toggle = block(".info-routine-switch");
  const paused = block(".info-routine.paused .info-routine-name");
  const kicker = block(".routine-kicker");
  const remove = block(".info-routine-remove");
  const sheet = block(".modal.routine-add-sheet");
  const addName = block(".routine-add-name");
  const primary = block(".routine-add-primary");
  const skillRow = block(".routine-skill-row");
  const skillEmpty = block(".routine-skill-empty");
  const cronHint = block(".routine-add-hint");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(add, /font-size:\s*12px/);
  assert.match(row, /height:\s*44px/);
  assert.match(name, /font-size:\s*14px/);
  assert.match(name, /font-weight:\s*500/);
  assert.match(meta, /font-size:\s*12px/);
  assert.match(meta, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);
  assert.match(toggle, /width:\s*44px/);
  assert.match(toggle, /height:\s*44px/);
  assert.match(paused, /opacity:\s*0\.5/);
  assert.match(kicker, /font-size:\s*12px/);
  assert.match(kicker, /color:\s*var\(--text-muted\)/);
  assert.match(remove, /font-size:\s*12px/);
  assert.match(remove, /color:\s*var\(--text-muted\)/);
  assert.match(sheet, /width:\s*320px/);
  assert.match(addName, /font-size:\s*14px/);
  assert.match(primary, /min-height:\s*36px/);
  assert.match(skillRow, /height:\s*44px/);
  assert.match(skillEmpty, /font-size:\s*12px/);
  assert.match(skillEmpty, /color:\s*var\(--text-muted\)/);
  assert.match(cronHint, /font-size:\s*12px/);
  assert.match(cronHint, /color:\s*var\(--text-muted\)/);

  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
    "utf8",
  );
  const infoPane = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "infoPane.ts"),
    "utf8",
  );
  assert.match(app, /EMPTY_ROUTINES/);
  assert.match(app, /role="switch"/);
  assert.match(app, /info-routines/);
  assert.match(app, /info-routine-hook-copy/);
  assert.match(app, /AgentRoutineRow/);
  assert.match(app, /Copied/);
  assert.match(app, /WEBHOOK_COPY_FEEDBACK_MS/);
  assert.match(app, /visiblePaneRoutines/);
  assert.match(app, /showsWebhookCopy/);
  assert.doesNotMatch(app, /\{routine\.webhookUrl\}/);
  assert.match(app, /profileEditing \?/);
  assert.match(app, /createRoutine/);
  assert.match(app, /deleteRoutine/);
  assert.match(app, /listSkills/);
  assert.match(app, /ADD_ROUTINE_TITLE/);
  assert.match(infoPane, /Add routine/);
  assert.match(infoPane, /Remove \$\{name\}\?/);
  assert.match(app, /info-routine-add/);
  assert.match(app, /info-routine-remove/);
  assert.match(app, /routineRemoveConfirm/);
  assert.match(app, /CRON_PLACEHOLDER/);
  assert.match(app, /CRON_HINT/);
  assert.match(app, /NO_SKILLS_YET/);
  assert.match(infoPane, /0 9 \* \* 1-5/);
  assert.match(infoPane, /Taipei\. Weekdays 9:00 is 0 9 \* \* 1-5\./);
  assert.match(app, />\s*Schedule\s*</);
  assert.match(app, />\s*Webhook\s*</);
  assert.match(app, /canSubmitRoutine/);
  assert.match(app, /routine-add-primary/);
  assert.match(app, /routine-skill-row/);
  assert.match(app, /routine-skill-empty/);
  assert.match(app, /type: "webhook"/);
  assert.doesNotMatch(app, /<select/);
  assert.doesNotMatch(app, /Teach a task/);
  assert.doesNotMatch(app, /marketplace/);
  assert.doesNotMatch(app, /editRoutine/);
  assert.doesNotMatch(css, /info-routine-new/);
  const pane = app.slice(
    app.indexOf("info-routines"),
    app.indexOf("<ComputerPane"),
  );
  assert.doesNotMatch(pane, /ConnectCard/);
  assert.doesNotMatch(pane, /plugin-connect/);
  assert.doesNotMatch(pane, />\s*Connect\s*</);
  const rowSrc = app.slice(
    app.indexOf("function AgentRoutineRow"),
    app.indexOf("export function App"),
  );
  assert.match(rowSrc, /info-routine-hook-copy/);
  assert.match(rowSrc, /info-routine-switch/);
  assert.match(rowSrc, /info-routine-remove/);
  assert.match(rowSrc, /Copied/);
  assert.ok(
    rowSrc.indexOf("info-routine-hook-copy") <
      rowSrc.indexOf("info-routine-remove"),
  );
  assert.ok(
    rowSrc.indexOf("info-routine-remove") <
      rowSrc.indexOf("info-routine-switch"),
  );
  const hookCopy = block(".info-routine-hook-copy");
  assert.match(hookCopy, /font-size:\s*12px/);
  assert.match(hookCopy, /color:\s*var\(--text-muted\)/);
  const toggleCss = block(".info-routine-switch");
  assert.doesNotMatch(toggleCss, /margin-left:\s*auto/);
});

test("skills list is 44px rows with trailing Add, Edit then Remove, New skill sheet is source textarea", () => {
  const header = block(".info-skills-header");
  const add = block(".info-skill-add");
  const row = block(".info-skill");
  const name = block(".info-skill-name");
  const edit = block(".info-skill-edit");
  const remove = block(".info-skill-remove");
  const empty = block(".info-skill-empty");
  const sheet = block(".modal.skill-edit-sheet");
  const addSheet = block(".modal.skill-add-sheet");
  const editName = block(".skill-edit-name");
  const addName = block(".skill-add-name");
  const body = block(".skill-edit-body");
  const addBody = block(".skill-add-body");
  const save = block(".skill-edit-save");
  const addSave = block(".skill-add-save");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(add, /font-size:\s*12px/);
  assert.match(add, /color:\s*var\(--accent\)/);
  assert.doesNotMatch(add, /--text-muted/);
  assert.match(row, /height:\s*44px/);
  assert.match(name, /font-size:\s*14px/);
  assert.match(edit, /font-size:\s*12px/);
  assert.match(edit, /color:\s*var\(--text-muted\)/);
  assert.match(remove, /font-size:\s*12px/);
  assert.match(remove, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);
  assert.match(sheet, /width:\s*320px/);
  assert.match(addSheet, /width:\s*320px/);
  assert.match(editName, /font-size:\s*14px/);
  assert.match(addName, /font-size:\s*14px/);
  assert.match(body, /font-size:\s*12px/);
  assert.match(body, /line-height:\s*1\.45/);
  assert.match(body, /min-height:\s*200px/);
  assert.match(body, /ui-monospace/);
  assert.match(addBody, /font-size:\s*12px/);
  assert.match(addBody, /line-height:\s*1\.45/);
  assert.match(addBody, /min-height:\s*200px/);
  assert.match(addBody, /ui-monospace/);
  assert.match(save, /min-height:\s*36px/);
  assert.match(addSave, /min-height:\s*36px/);

  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
    "utf8",
  );
  const infoPane = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "infoPane.ts"),
    "utf8",
  );
  const api = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "api.ts"),
    "utf8",
  );
  const takeover = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "ComputerTakeover.tsx"),
    "utf8",
  );
  const pane = app.slice(
    app.indexOf("info-identity"),
    app.indexOf("<ComputerPane"),
  );
  assert.ok(pane.indexOf("info-routines") < pane.indexOf("info-skills"));
  assert.match(pane, /info-skills/);
  assert.match(pane, /AgentSkillRow/);
  assert.match(pane, /NO_SKILLS_YET/);
  assert.match(pane, /info-skill-add/);
  const skillsSrc = pane.slice(pane.indexOf("info-skills"));
  assert.doesNotMatch(skillsSrc, /info-routine-add/);
  assert.match(skillsSrc, />\s*Add\s*</);
  assert.match(skillsSrc, /NO_SKILLS_YET/);
  assert.match(skillsSrc, /info-skill-add/);
  assert.match(app, /EDIT_SKILL_TITLE/);
  assert.match(app, /ADD_SKILL_TITLE/);
  assert.match(app, /skillRemoveConfirm/);
  assert.match(app, /canSubmitSkill/);
  assert.match(app, /getSkill/);
  assert.match(app, /patchSkill/);
  assert.match(app, /deleteSkill/);
  assert.match(app, /createSkill/);
  assert.match(app, /skill-edit-body/);
  assert.match(app, /skill-add-body/);
  assert.match(app, /<textarea/);
  assert.match(infoPane, /Edit skill/);
  assert.match(infoPane, /New skill/);
  assert.match(infoPane, /Remove \$\{name\}\?/);
  const editSheet = app.slice(
    app.indexOf("{skillEditOpen ?"),
    app.indexOf("{skillAddOpen ?"),
  );
  assert.match(editSheet, /<textarea/);
  assert.match(editSheet, /skill-edit-body/);
  assert.match(editSheet, /skill-edit-save/);
  assert.doesNotMatch(editSheet, /MarkdownBody/);
  assert.doesNotMatch(editSheet, /react-markdown/);
  const addSheetSrc = app.slice(
    app.indexOf("{skillAddOpen ?"),
    app.indexOf("{createChannelOpen ?"),
  );
  assert.match(addSheetSrc, /ADD_SKILL_TITLE/);
  assert.match(addSheetSrc, /<textarea/);
  assert.match(addSheetSrc, /skill-add-body/);
  assert.match(addSheetSrc, /skill-add-save/);
  assert.match(addSheetSrc, /skillAddReady/);
  assert.match(addSheetSrc, />\s*Add\s*</);
  assert.doesNotMatch(addSheetSrc, /Add skill/);
  assert.doesNotMatch(addSheetSrc, /MarkdownBody/);
  assert.doesNotMatch(addSheetSrc, /react-markdown/);
  assert.match(addSheetSrc, /setSkillAddOpen\(false\)/);
  assert.ok(
    addSheetSrc.indexOf("setSkillAddOpen(false)") <
      addSheetSrc.indexOf("saveSkillAdd"),
  );
  const saveAdd = app.slice(
    app.indexOf("async function saveSkillAdd"),
    app.indexOf("async function openSkillEdit"),
  );
  assert.match(saveAdd, /createSkill\(session, active\.id, \{/);
  assert.match(saveAdd, /name: skillAddName\.trim\(\)/);
  assert.match(saveAdd, /body: skillAddBody\.trim\(\)/);
  const skillRow = app.slice(
    app.indexOf("function AgentSkillRow"),
    app.indexOf("export function App"),
  );
  assert.match(skillRow, /info-skill-edit/);
  assert.match(skillRow, /info-skill-remove/);
  assert.ok(
    skillRow.indexOf("info-skill-edit") < skillRow.indexOf("info-skill-remove"),
  );
  assert.match(css, /info-skill-add/);
  const createFn = api.slice(
    api.indexOf("export async function createSkill"),
    api.indexOf("export async function listPlugins"),
  );
  assert.match(createFn, /body\?: string/);
  const recordSave = takeover.slice(
    takeover.indexOf("async function saveSkill"),
    takeover.indexOf("const showSaved"),
  );
  assert.match(recordSave, /createSkill\(session, agent\.id, \{ name \}\)/);
  assert.doesNotMatch(recordSave, /body:/);
});

test("composer slash skill picker reuses @ typeahead: 240px, 8px radius, 36px rows", () => {
  const list = block(".typeahead");
  const skills = block(".typeahead.skills");
  const row = block(".typeahead.skills button");
  assert.match(list, /width:\s*240px/);
  assert.match(list, /background:\s*var\(--bg-elevated\)/);
  assert.match(list, /border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(skills, /border-radius:\s*8px/);
  assert.match(row, /height:\s*36px/);
  assert.match(row, /font-size:\s*14px/);
  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
    "utf8",
  );
  assert.match(app, /typeahead skills/);
  assert.match(app, /composerSkillAgentId/);
  assert.match(app, /skillPopupOpen/);
  assert.match(app, /insertSkill/);
  assert.match(app, /listSkills\(session, skillAgentId\)/);
  const skillList = app.slice(
    app.indexOf("{skillMenuOpen ?"),
    app.indexOf("mentionOpen && mentionCandidates"),
  );
  assert.doesNotMatch(skillList, /Avatar/);
  assert.doesNotMatch(app, /computerPane\.ts/);
});
