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
  parsePluginArgs,
  pluginStatusLabel,
  catalogInstallBody,
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
  assert.deepEqual(parsePluginArgs("  --foo bar  "), ["--foo", "bar"]);
  assert.deepEqual(parsePluginArgs(""), []);
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
  const add = block(".plugin-add");
  const row = block(".plugin-row");
  const name = block(".plugin-name");
  const status = block(".plugin-status");
  const empty = block(".plugins-empty");
  const remove = block(".plugin-remove");
  const sheet = block(".modal.plugin-add-sheet");
  const primary = block(".plugin-add-primary");
  const addName = block(".plugin-add-name");

  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(add, /font-size:\s*12px/);
  assert.match(row, /height:\s*44px/);
  assert.match(name, /font-size:\s*14px/);
  assert.match(status, /font-size:\s*12px/);
  assert.match(status, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);
  assert.match(remove, /font-size:\s*12px/);
  assert.match(remove, /color:\s*var\(--text-muted\)/);
  assert.match(sheet, /width:\s*320px/);
  assert.match(primary, /min-height:\s*36px/);
  assert.match(addName, /font-size:\s*14px/);

  const connectSrc = readFileSync(join(here, "connect.ts"), "utf8");
  const api = readFileSync(join(here, "api.ts"), "utf8");
  assert.match(connectSrc, /Needs sign-in/);
  assert.match(app, /settings-plugins/);
  assert.match(app, /No plugins yet\./);
  assert.match(app, /pluginStatusLabel/);
  assert.match(app, /listPlugins/);
  assert.match(app, /startPluginAuth/);
  assert.match(app, /createPlugin/);
  assert.match(app, /transport: "stdio"/);
  assert.match(app, /transport: "url"/);
  assert.match(app, /deletePlugin/);
  assert.match(app, /plugin-add/);
  assert.match(app, /Add plugin/);
  assert.match(app, /plugin-add-primary/);
  assert.match(app, /placeholder="npx"/);
  assert.match(app, /placeholder="-y package"/);
  assert.match(app, /Server URL/);
  assert.match(app, /placeholder="https:\/\/"/);
  assert.match(app, /This disconnects it\./);
  assert.match(app, /plugin-remove/);
  assert.match(app, /connectReply/);
  assert.match(app, /onConnectUrl/);
  assert.match(api, /connect\.url/);
  assert.match(api, /\/v1\/plugins/);
  assert.doesNotMatch(api, /\/disconnect/);
  assert.doesNotMatch(api, /disconnectPlugin/);
  assert.doesNotMatch(app, /disconnectPlugin/);
  assert.doesNotMatch(app, /Uninstall/);
  assert.doesNotMatch(app, />Disconnect</);
  assert.doesNotMatch(api, /modelcontextprotocol/);
  assert.doesNotMatch(api, /tools\/list/);
  assert.doesNotMatch(api, /mcp\.json/);
  assert.match(app, /ConnectCard/);
  assert.match(app, /openOsBrowser/);
  assert.doesNotMatch(app, /info-plugins/);
  assert.doesNotMatch(app, /marketplace/);
  assert.doesNotMatch(app, /Add custom/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("Settings Memory lists user facts above Plugins, no Add", () => {
  const header = block(".settings-memory-header");
  const row = block(".settings-memory-row");
  const fact = block(".settings-memory-fact");
  const remove = block(".settings-memory-remove");
  const empty = block(".settings-memory-empty");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(row, /min-height:\s*44px/);
  assert.match(fact, /font-size:\s*14px/);
  assert.match(fact, /line-height:\s*1\.2/);
  assert.match(fact, /-webkit-line-clamp:\s*2/);
  assert.match(fact, /-webkit-box-orient:\s*vertical/);
  assert.match(fact, /overflow:\s*hidden/);
  assert.match(remove, /font-size:\s*12px/);
  assert.match(remove, /color:\s*var\(--text-muted\)/);
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);

  const api = readFileSync(join(here, "api.ts"), "utf8");
  assert.match(app, /settings-memory/);
  assert.match(app, /SettingsMemoryRow/);
  assert.match(app, /EMPTY_MEMORY/);
  assert.match(app, /getUserMemory/);
  assert.match(app, /deleteUserMemory/);
  assert.match(app, /pendingUserMemoryRemove/);
  assert.match(app, /refreshOpenUserMemory/);
  assert.match(app, /settingsOpenRef/);
  assert.match(app, /special-case user scope/);
  const userRefresh = app.slice(
    app.indexOf("function refreshOpenUserMemory"),
    app.indexOf("function openRoutineAdd"),
  );
  assert.match(userRefresh, /isMemoryToolLine/);
  assert.match(userRefresh, /loadUserMemory/);
  assert.match(userRefresh, /settingsOpenRef/);
  assert.doesNotMatch(userRefresh, /scope ===/);
  assert.doesNotMatch(userRefresh, /scope: "user"/);
  assert.doesNotMatch(userRefresh, /getMemory\(/);
  assert.ok(app.indexOf("settings-memory") < app.indexOf("settings-plugins"));
  const settings = app.slice(
    app.indexOf("aria-label=\"Settings\""),
    app.indexOf("settings-plugins"),
  );
  assert.match(settings, /settings-memory/);
  assert.match(settings, /EMPTY_MEMORY/);
  assert.doesNotMatch(settings, />\s*Add\s*</);
  assert.doesNotMatch(settings, /settings-memory-add/);
  assert.doesNotMatch(settings, /getMemory\(/);
  assert.match(api, /\/v1\/memory/);
  assert.match(api, /getUserMemory/);
  assert.match(api, /deleteUserMemory/);
  const userGet = api.slice(
    api.indexOf("export async function getUserMemory"),
    api.indexOf("export async function deleteUserMemory"),
  );
  assert.match(userGet, /\/v1\/memory/);
  assert.doesNotMatch(userGet, /\/v1\/agents\//);
  const userDel = api.slice(api.indexOf("export async function deleteUserMemory"));
  assert.match(userDel, /\/v1\/memory/);
  assert.match(userDel, /method: "DELETE"/);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("catalog sits below custom plugin rows with 12px Add, no search", () => {
  const header = block(".settings-catalog-header");
  const row = block(".catalog-row");
  const name = block(".catalog-name");
  const add = block(".catalog-add");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(row, /height:\s*44px/);
  assert.match(name, /font-size:\s*14px/);
  assert.match(add, /font-size:\s*12px/);
  assert.match(add, /color:\s*var\(--accent\)/);

  const api = readFileSync(join(here, "api.ts"), "utf8");
  const connectSrc = readFileSync(join(here, "connect.ts"), "utf8");
  assert.match(app, /settings-catalog/);
  assert.match(app, />Catalog</);
  assert.match(app, /pluginCatalog\.length > 0/);
  assert.match(app, /No plugins yet\./);
  assert.match(app, /listPluginCatalog/);
  assert.match(app, /addCatalogPlugin/);
  assert.match(app, /catalogInstallBody/);
  assert.match(api, /\/v1\/plugins\/catalog/);
  assert.match(connectSrc, /catalogInstallBody/);
  assert.ok(app.indexOf("settings-memory") < app.indexOf("settings-plugins"));
  assert.ok(app.indexOf("settings-plugins") < app.indexOf("settings-catalog"));
  assert.ok(app.indexOf("No plugins yet.") < app.indexOf("settings-catalog"));
  assert.doesNotMatch(app, /plugin-catalog-search/);
  assert.doesNotMatch(app, /placeholder="Search/);
  assert.doesNotMatch(app, /Uninstall from catalog/);
  assert.doesNotMatch(app, /POST \/catalog/);
  assert.doesNotMatch(app, /marketplace/);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("catalogInstallBody posts PluginCreate fields from a catalog row", () => {
  assert.deepEqual(
    catalogInstallBody({
      name: "Slack",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-slack"],
    }),
    {
      name: "Slack",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-slack"],
    },
  );
});
