// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COMPUTER_LABEL,
  COMPUTER_POLL_MS,
  COMPUTER_PREVIEW_HEIGHT,
  COMPUTER_PREVIEW_WIDTH,
  NO_COMPUTER_YET,
  computerImageUrl,
  showsComputerFrame,
} from "./computerPreview.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("hasSandbox false shows No computer yet with no frame", () => {
  assert.equal(NO_COMPUTER_YET, "No computer yet.");
  assert.equal(COMPUTER_LABEL, "Computer");
  assert.equal(showsComputerFrame({ hasSandbox: false }), false);
  assert.equal(showsComputerFrame({ hasSandbox: false, width: 1280, height: 800 }), false);
  assert.equal(computerImageUrl({ hasSandbox: false, imageUrl: "/x" }), "");
  assert.equal(showsComputerFrame(null), false);
  assert.equal(showsComputerFrame(undefined), false);
});

test("hasSandbox true shows the last screenshot url", () => {
  assert.equal(
    showsComputerFrame({
      hasSandbox: true,
      width: 1280,
      height: 800,
      imageUrl: "/v1/agents/snorlax-bot/computer/screenshot",
    }),
    true,
  );
  assert.equal(
    computerImageUrl({
      hasSandbox: true,
      imageUrl: "/v1/agents/snorlax-bot/computer/screenshot",
    }),
    "/v1/agents/snorlax-bot/computer/screenshot",
  );
});

test("preview chrome is 288x180 16:10; poll only while open", () => {
  assert.equal(COMPUTER_PREVIEW_WIDTH, 288);
  assert.equal(COMPUTER_PREVIEW_HEIGHT, 180);
  assert.equal(COMPUTER_PREVIEW_WIDTH / COMPUTER_PREVIEW_HEIGHT, 16 / 10);
  assert.equal(COMPUTER_POLL_MS, 1500);
  assert.ok(COMPUTER_POLL_MS >= 1000 && COMPUTER_POLL_MS <= 2000);
});

test("desktop identity pane paints Computer above Routines with Open when hasSandbox", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const css = readFileSync(join(here, "styles.css"), "utf8");
  const preview = readFileSync(join(here, "AgentComputer.tsx"), "utf8");
  const takeover = readFileSync(join(here, "ComputerTakeover.tsx"), "utf8");
  const api = readFileSync(join(here, "api.ts"), "utf8");
  const pane = app.slice(
    app.indexOf("info-identity"),
    app.indexOf("<ComputerPane"),
  );
  assert.match(pane, /AgentComputer/);
  assert.ok(pane.indexOf("AgentComputer") < pane.indexOf("info-routines"));
  assert.ok(pane.indexOf("info-routines") < pane.indexOf("info-skills"));
  assert.ok(pane.indexOf("info-skills") < pane.indexOf("info-memory"));
  assert.match(pane, /onOpen/);
  assert.match(preview, /OPEN_LABEL/);
  assert.match(preview, /onClick/);
  assert.match(preview, /NO_COMPUTER_YET/);
  assert.doesNotMatch(preview, /computer\/click/);
  assert.match(preview, /COMPUTER_POLL_MS/);
  assert.match(preview, /Authorization/);
  assert.match(preview, /Bearer/);
  assert.match(takeover, /DRIVING_LABEL/);
  assert.match(takeover, /DONE_LABEL/);
  assert.match(takeover, /RECORD_LABEL/);
  assert.match(takeover, /STOP_LABEL/);
  assert.match(takeover, /SAVE_AS_SKILL_TITLE/);
  assert.match(takeover, /SAVE_LABEL/);
  assert.match(takeover, /SAVED_LABEL/);
  assert.match(takeover, /CANCEL_LABEL/);
  assert.match(takeover, /doneDisabled/);
  assert.match(takeover, /escapeAction/);
  assert.match(takeover, /startComputerRecord/);
  assert.match(takeover, /stopComputerRecord/);
  assert.match(takeover, /createSkill/);
  assert.match(takeover, /computer-takeover-dot/);
  assert.match(takeover, /disabled=\{doneDisabled\(recording\)\}/);
  assert.match(takeover, /Escape/);
  assert.match(app, /ComputerTakeover/);
  assert.match(app, /composerInert/);
  assert.match(app, /readOnly=\{takeoverOpen\}/);
  assert.doesNotMatch(preview, /RECORD_LABEL/);
  assert.doesNotMatch(preview, /Save as skill/);
  assert.match(api, /\/v1\/agents\/\$\{encodeURIComponent\(agentId\)\}\/computer/);
  assert.match(api, /computer\/session/);
  assert.match(api, /computer\/pointer/);
  assert.match(api, /computer\/key/);
  assert.match(api, /computer\/record/);
  assert.match(api, /\/skills/);
  assert.doesNotMatch(api, /computer\/click/);
  assert.doesNotMatch(api, /computer\/scroll/);
  assert.match(css, /\.info-computer-frame \{/);
  assert.match(css, /width:\s*288px/);
  assert.match(css, /height:\s*180px/);
  assert.match(css, /border-radius:\s*8px/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /cursor:\s*pointer/);
  assert.match(css, /\.computer-takeover \{/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("iOS agent sheet matches: 16:10, 8pt, 12pt Open when hasSandbox, tap POSTs session", () => {
  const sheet = readFileSync(
    join(here, "../../ios/SnorlaxBot/ProfileSheet.swift"),
    "utf8",
  );
  const chrome = readFileSync(
    join(here, "../../ios/SnorlaxBot/ComputerSession.swift"),
    "utf8",
  );
  const takeover = readFileSync(
    join(here, "../../ios/SnorlaxBot/ComputerTakeover.swift"),
    "utf8",
  );
  assert.match(chrome, /No computer yet\./);
  assert.match(chrome, /Computer/);
  assert.match(chrome, /openLabel = "Open"/);
  assert.match(chrome, /canOpen\(hasSandbox: Bool\?\)/);
  assert.match(chrome, /hasSandbox == true/);
  assert.match(chrome, /You're driving · agent paused/);
  assert.match(chrome, /barHeight: CGFloat = 52/);
  assert.match(chrome, /avatarSize: CGFloat = 24/);
  assert.match(chrome, /doneHeight: CGFloat = 44/);
  assert.match(chrome, /keyboardLabel = "Keyboard"/);
  assert.match(sheet, /aspectRatio\(16\s*\/\s*10/);
  assert.match(sheet, /cornerRadius:\s*8/);
  assert.match(sheet, /lineWidth:\s*1/);
  assert.match(sheet, /size:\s*12/);
  assert.doesNotMatch(sheet, /computer\/click/);
  const computerBlock = sheet.slice(
    sheet.indexOf("private var computerBlock"),
    sheet.indexOf("private var paneRoutines"),
  );
  assert.match(computerBlock, /onTapGesture/);
  assert.match(computerBlock, /openLabel/);
  assert.match(computerBlock, /canOpen/);
  assert.match(computerBlock, /openComputer/);
  assert.doesNotMatch(computerBlock, /NavigationLink/);
  const empty = computerBlock.slice(computerBlock.lastIndexOf("else"));
  assert.doesNotMatch(empty, /openLabel/);
  const content = readFileSync(
    join(here, "../../ios/SnorlaxBot/ContentView.swift"),
    "utf8",
  );
  assert.match(content, /fullScreenCover/);
  assert.match(content, /ComputerTakeoverView/);
  assert.match(takeover, /interactiveDismissDisabled/);
  assert.match(takeover, /HiddenKeyboardField/);
  assert.match(takeover, /doneLabel/);
  assert.match(takeover, /keyboardLabel/);
  assert.match(takeover, /MagnificationGesture/);
  assert.doesNotMatch(takeover, /RECORD_LABEL/);
  assert.doesNotMatch(takeover, /Save as skill/);
  assert.doesNotMatch(takeover, /computer\/record/);
  const client = readFileSync(
    join(here, "../../ios/SnorlaxBot/RuntimeClient.swift"),
    "utf8",
  );
  const model = readFileSync(
    join(here, "../../ios/SnorlaxBot/AppModel.swift"),
    "utf8",
  );
  assert.match(client, /computer\/session/);
  assert.match(client, /computer\/pointer/);
  assert.match(client, /computer\/key/);
  assert.match(client, /openComputerSession/);
  assert.match(model, /openComputerSession/);
  assert.match(model, /closeComputerSession/);
  assert.doesNotMatch(client, /computer\/record/);
  assert.doesNotMatch(model, /computer\/record/);
  assert.doesNotMatch(sheet, /computer\/record/);
  assert.doesNotMatch(sheet, /Save as skill/);
  assert.doesNotMatch(sheet, /RECORD_LABEL/);
  const chat = readFileSync(
    join(here, "../../ios/SnorlaxBot/ChatView.swift"),
    "utf8",
  );
  assert.doesNotMatch(chat, /computer\/record/);
  assert.doesNotMatch(chat, /Save as skill/);
  assert.doesNotMatch(content, /computer\/record/);
  assert.doesNotMatch(content, /Save as skill/);
  assert.match(sheet, /Add routine/);
  assert.match(sheet, /Remove \\\(row\.name\)\?/);
  assert.match(sheet, /Remove this memory\?/);
  assert.match(sheet, /Button\("Add"\)/);
  assert.match(sheet, /Button\("Remove"\)/);
  assert.match(sheet, /0 9 \* \* 1-5/);
  assert.match(sheet, /Taipei\. Weekdays 9:00 is 0 9 \* \* 1-5\./);
  assert.match(sheet, /No skills yet\./);
  assert.match(sheet, /minHeight: 44/);
  assert.match(sheet, /Schedule/);
  assert.match(sheet, /Webhook/);
  assert.match(sheet, /Slack/);
  assert.match(sheet, /GitHub/);
  assert.match(sheet, /Channel the bot is in\./);
  assert.match(sheet, /One repo\. No wildcards\./);
  assert.match(sheet, /visibleModes/);
  assert.match(sheet, /showsWebhookCopy/);
  const routinesBlock = sheet.slice(
    sheet.indexOf("private var routinesList"),
    sheet.indexOf("private var skillsList"),
  );
  assert.ok(
    routinesBlock.indexOf("showsWebhookCopy") <
      routinesBlock.indexOf('Button("Remove")'),
  );
  assert.ok(
    routinesBlock.indexOf('Button("Remove")') <
      routinesBlock.indexOf("Toggle"),
  );
  assert.match(client, /listSkills/);
  assert.match(client, /getSkill/);
  assert.match(client, /patchSkill/);
  assert.match(client, /deleteSkill/);
  assert.match(client, /createRoutine/);
  assert.match(client, /deleteRoutine/);
  assert.match(model, /addRoutine/);
  assert.match(model, /slackChannel/);
  assert.match(model, /githubRepo/);
  assert.match(model, /removeRoutine/);
  assert.match(model, /addSkill/);
  assert.match(model, /saveSkill/);
  assert.match(model, /removeSkill/);
  assert.match(sheet, /Edit skill/);
  assert.match(sheet, /New skill/);
  assert.match(sheet, /AddSkillSheet/);
  assert.match(sheet, /TextEditor/);
  assert.match(sheet, /minHeight: 200/);
  assert.match(sheet, /size: 12/);
  assert.match(sheet, /design: \.monospaced/);
  const skillsBlock = sheet.slice(
    sheet.indexOf("private var skillsList"),
    sheet.indexOf("private var memoryList"),
  );
  assert.match(skillsBlock, /Text\("Skills"\)/);
  assert.match(skillsBlock, /No skills yet\./);
  assert.match(skillsBlock, /Button\("Add"\)/);
  assert.match(skillsBlock, /Button\("Edit"\)/);
  assert.match(skillsBlock, /Button\("Remove"\)/);
  assert.ok(
    skillsBlock.indexOf('Button("Add")') <
      skillsBlock.indexOf('Button("Edit")'),
  );
  assert.ok(
    skillsBlock.indexOf('Button("Edit")') <
      skillsBlock.indexOf('Button("Remove")'),
  );
  assert.doesNotMatch(skillsBlock, /New skill/);
  const memoryBlock = sheet.slice(
    sheet.indexOf("private var memoryList"),
    sheet.indexOf("private var channelPane"),
  );
  assert.match(memoryBlock, /Text\("Memory"\)/);
  assert.match(memoryBlock, /No memories yet\./);
  assert.match(memoryBlock, /Button\("Remove"\)/);
  assert.match(memoryBlock, /lineLimit\(2\)/);
  assert.match(memoryBlock, /truncationMode\(\.tail\)/);
  assert.match(memoryBlock, /1\.2/);
  assert.match(memoryBlock, /onLongPressGesture/);
  assert.match(memoryBlock, /UIPasteboard\.general\.string = fact/);
  assert.doesNotMatch(memoryBlock, /fixedSize\(horizontal: false, vertical: true\)/);
  assert.doesNotMatch(memoryBlock, /Button\("Add"\)/);
  assert.doesNotMatch(memoryBlock, /Button\("Edit"\)/);
  assert.match(client, /listMemory/);
  assert.match(client, /forgetMemory/);
  assert.match(model, /loadMemories/);
  assert.match(model, /removeMemory/);
  assert.match(model, /refreshOpenMemory/);
  assert.match(model, /isMemoryToolLine/);
  assert.match(model, /Remembered/);
  assert.match(model, /Forgot/);
  assert.match(model, /showProfile/);
  const channelPane = sheet.slice(
    sheet.indexOf("channelPane"),
    sheet.indexOf("channelEditForm"),
  );
  assert.doesNotMatch(channelPane, /AddRoutineSheet/);
  assert.doesNotMatch(channelPane, /AddSkillSheet/);
  assert.doesNotMatch(channelPane, /EditSkillSheet/);
  assert.doesNotMatch(channelPane, /listSkills/);
  assert.doesNotMatch(channelPane, /listMemory/);
  assert.doesNotMatch(channelPane, /memoryList/);
  assert.doesNotMatch(channelPane, /ComputerTakeoverView/);
  assert.doesNotMatch(channelPane, /openLabel/);
});
