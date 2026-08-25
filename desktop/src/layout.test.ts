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
  const idx = css.indexOf(`${selector} {`);
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

  assert.match(app, /grid-template-columns:\s*256px\s+1fr/);
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

test("info pane is a 320px overlay, not a third column", () => {
  const app = block(".app");
  const profile = block(".profile");
  assert.match(app, /grid-template-columns:\s*256px\s+1fr/);
  assert.doesNotMatch(app, /320px/);
  assert.match(profile, /position:\s*absolute/);
  assert.match(profile, /width:\s*320px/);
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

