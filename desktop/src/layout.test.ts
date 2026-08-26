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
  assert.match(frame, /cursor:\s*default/);
  assert.match(frame, /pointer-events:\s*none/);
  const img = block(".info-computer-frame img,\n.info-computer-slot");
  assert.match(img, /object-fit:\s*contain/);
  assert.match(img, /pointer-events:\s*none/);
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
  assert.doesNotMatch(pane, />\s*Open\s*</);
});

test("routines list is 44px rows with switch on the agent read pane", () => {
  const header = block(".info-routines-header");
  const row = block(".info-routine");
  const name = block(".info-routine-name");
  const meta = block(".info-routine-meta");
  const empty = block(".info-routine-empty");
  const toggle = block(".info-routine-switch");
  const paused = block(".info-routine.paused .info-routine-name");
  const kicker = block(".routine-kicker");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
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

  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
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
  assert.doesNotMatch(app, /createRoutine/);
  assert.doesNotMatch(app, /deleteRoutine/);
  assert.doesNotMatch(app, /Teach a task/);
  assert.doesNotMatch(app, /marketplace/);
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
  assert.match(rowSrc, /Copied/);
  assert.ok(
    rowSrc.indexOf("info-routine-hook-copy") <
      rowSrc.indexOf("info-routine-switch"),
  );
  const hookCopy = block(".info-routine-hook-copy");
  assert.match(hookCopy, /font-size:\s*12px/);
  assert.match(hookCopy, /color:\s*var\(--text-muted\)/);
  const toggleCss = block(".info-routine-switch");
  assert.doesNotMatch(toggleCss, /margin-left:\s*auto/);
});
