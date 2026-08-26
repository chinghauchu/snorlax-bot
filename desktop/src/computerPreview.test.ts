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

test("desktop identity pane paints Computer above Routines without Open or clicks", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const css = readFileSync(join(here, "styles.css"), "utf8");
  const preview = readFileSync(join(here, "AgentComputer.tsx"), "utf8");
  const api = readFileSync(join(here, "api.ts"), "utf8");
  const pane = app.slice(
    app.indexOf("info-identity"),
    app.indexOf("<ComputerPane"),
  );
  assert.match(pane, /AgentComputer/);
  assert.ok(pane.indexOf("AgentComputer") < pane.indexOf("info-routines"));
  assert.doesNotMatch(pane, />\s*Open\s*</);
  assert.doesNotMatch(preview, /onClick/);
  assert.doesNotMatch(preview, /pointer:\s*pointer/);
  assert.doesNotMatch(preview, /computer\/click/);
  assert.match(preview, /COMPUTER_POLL_MS/);
  assert.match(preview, /NO_COMPUTER_YET/);
  assert.match(preview, /Authorization/);
  assert.match(preview, /Bearer/);
  assert.match(api, /\/v1\/agents\/\$\{encodeURIComponent\(agentId\)\}\/computer/);
  assert.doesNotMatch(api, /computer\/click/);
  assert.doesNotMatch(api, /computer\/key/);
  assert.doesNotMatch(api, /computer\/scroll/);
  assert.match(css, /\.info-computer-frame \{/);
  assert.match(css, /width:\s*288px/);
  assert.match(css, /height:\s*180px/);
  assert.match(css, /border-radius:\s*8px/);
  assert.match(css, /object-fit:\s*contain/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("iOS agent sheet matches: 16:10, 8pt, 12pt labels, no tap-to-open", () => {
  const sheet = readFileSync(
    join(here, "../../ios/SnorlaxBot/ProfileSheet.swift"),
    "utf8",
  );
  assert.match(sheet, /No computer yet\./);
  assert.match(sheet, /Computer/);
  assert.match(sheet, /aspectRatio\(16\s*\/\s*10/);
  assert.match(sheet, /cornerRadius:\s*8/);
  assert.match(sheet, /lineWidth:\s*1/);
  assert.match(sheet, /size:\s*12/);
  assert.doesNotMatch(sheet, /tap-to-open/i);
  assert.doesNotMatch(sheet, /computer\/click/);
  const computerBlock = sheet.slice(
    sheet.indexOf("computerBlock"),
    sheet.indexOf("routinesList"),
  );
  assert.doesNotMatch(computerBlock, /onTapGesture/);
  assert.doesNotMatch(computerBlock, /NavigationLink/);
  assert.match(sheet, /allowsHitTesting\(false\)/);
});
