// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isTranscriptVisible } from "./mentions.ts";
import {
  connectOf,
  connectStatusOf,
  isConnect,
  isPendingConnect,
  pluginStatusLabel,
  resolvedConnectLabel,
} from "./connect.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("connect helpers lock kind=connect status on the Message", () => {
  const pending = {
    id: "msg_c",
    kind: "connect" as const,
    connectStatus: "pending" as const,
    connect: {
      prompt: "Connect Slack to read your channels.",
      pluginId: "slack",
      helpText: "Opens your browser to sign in.",
    },
  };
  assert.equal(isConnect(pending), true);
  assert.equal(isPendingConnect(pending), true);
  assert.equal(connectOf(pending)?.pluginId, "slack");
  assert.equal(connectStatusOf(pending), "pending");
  assert.equal(pluginStatusLabel("connected"), "Connected");
  assert.equal(pluginStatusLabel("needsAuth"), "Needs sign-in");
  assert.equal(resolvedConnectLabel("connected"), "Connected");
  assert.equal(resolvedConnectLabel("dismissed"), "Dismissed");
  assert.equal(isPendingConnect({ ...pending, connectStatus: "connected" }), false);
  assert.equal(isConnect({ kind: "widget" }), false);
});

test("1:1 isolation hides another speaker's connect card", () => {
  const alice = { id: "alice", kind: "agent" as const };
  const bobCard = {
    senderId: "bob",
    kind: "connect",
    connect: { prompt: "Connect Example", pluginId: "example" },
  };
  const aliceCard = {
    senderId: "alice",
    kind: "connect",
    connect: { prompt: "Connect Example", pluginId: "example" },
  };
  assert.equal(isTranscriptVisible(bobCard, alice), false);
  assert.equal(isTranscriptVisible(aliceCard, alice), true);
  assert.equal(
    isTranscriptVisible(bobCard, { id: "room", kind: "channel" }),
    true,
  );
});

test("connect card chrome is LEFT, not a bubble, 240-320px", () => {
  const card = block(".connect-card");
  const prompt = block(".connect-prompt");
  const help = block(".connect-help");
  const status = block(".connect-status");
  const dismiss = block(".connect-dismiss");
  const primary = block(".connect-primary");

  assert.match(card, /min-width:\s*240px/);
  assert.match(card, /max-width:\s*320px/);
  assert.match(card, /border-radius:\s*12px/);
  assert.match(card, /padding:\s*12px/);
  assert.match(card, /border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(card, /background:\s*var\(--bubble\)/);
  assert.match(prompt, /font-size:\s*14px/);
  assert.match(prompt, /line-height:\s*1\.4/);
  assert.match(help, /font-size:\s*12px/);
  assert.match(help, /color:\s*var\(--text-muted\)/);
  assert.match(status, /font-size:\s*12px/);
  assert.match(status, /color:\s*var\(--text-muted\)/);
  assert.match(dismiss, /width:\s*20px/);
  assert.match(dismiss, /height:\s*20px/);
  assert.match(primary, /min-height:\s*36px/);
  assert.match(primary, /color-mix\(in srgb,\s*var\(--accent\)\s+28%/);
  assert.doesNotMatch(css, /\.connect-card\.right/);
  assert.match(css, /\.turn\.left\s+\.connect-card/);
  assert.match(css, /\n\.widget-card \{/);
  assert.doesNotMatch(css, /\.widget-card,\s*\.connect-card/);
  assert.doesNotMatch(css, /\.connect-card,\s*\.widget-card/);
});

test("plugins list is Settings only, not the agent pane", () => {
  const header = block(".settings-plugins-header");
  const row = block(".plugin-row");
  const name = block(".plugin-name");
  const status = block(".plugin-status");
  const empty = block(".plugins-empty");

  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(row, /height:\s*44px/);
  assert.match(name, /font-size:\s*14px/);
  assert.match(status, /font-size:\s*12px/);
  assert.match(status, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);

  const connectSrc = readFileSync(join(here, "connect.ts"), "utf8");
  const api = readFileSync(join(here, "api.ts"), "utf8");
  assert.match(connectSrc, /Needs sign-in/);
  assert.match(app, /settings-plugins/);
  assert.match(app, /No plugins yet\./);
  assert.match(app, /pluginStatusLabel/);
  assert.match(app, /listPlugins/);
  assert.match(app, /startPluginAuth/);
  assert.match(app, /connectReply/);
  assert.match(app, /onConnectUrl/);
  assert.match(api, /connect\.url/);
  assert.match(app, /ConnectCard/);
  assert.match(app, /openOsBrowser/);
  assert.doesNotMatch(app, /info-plugins/);
  assert.doesNotMatch(app, /marketplace/);
  assert.doesNotMatch(app, /Add custom/);
  assert.doesNotMatch(app, /uninstall/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
