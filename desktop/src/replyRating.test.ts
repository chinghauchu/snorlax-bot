// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  REPLY_RATING_BAD_ARIA,
  REPLY_RATING_BAD_LABEL,
  REPLY_RATING_GOOD_ARIA,
  REPLY_RATING_GOOD_LABEL,
  REPLY_RATING_STORAGE_KEY,
  offersReplyRating,
  parseReplyRatings,
  replyRatingAnimates,
  replyRatingAria,
  replyRatingLabel,
  replyRatingPressed,
  serializeReplyRatings,
  toggleReplyRating,
  writeReplyRatings,
  readReplyRatings,
  type ReplyRatingStorage,
} from "./replyRating.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "replyRating.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ReplyRating.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.20 rate a reply";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing ${selector}`);
  return css.slice(at, css.indexOf("}", at) + 1);
}

function memoryStorage(): ReplyRatingStorage & { raw: string | null } {
  const box = { raw: null as string | null };
  return {
    get raw() {
      return box.raw;
    },
    set raw(value: string | null) {
      box.raw = value;
    },
    getItem() {
      return box.raw;
    },
    setItem(_key: string, value: string) {
      box.raw = value;
    },
  };
}

test("Good and Bad are exclusive, and the same mark clears", () => {
  assert.equal(REPLY_RATING_GOOD_LABEL, "Good");
  assert.equal(REPLY_RATING_BAD_LABEL, "Bad");
  assert.equal(REPLY_RATING_GOOD_ARIA, "Good response");
  assert.equal(REPLY_RATING_BAD_ARIA, "Bad response");
  assert.equal(replyRatingLabel("good"), "Good");
  assert.equal(replyRatingLabel("bad"), "Bad");
  assert.equal(replyRatingAria("good"), "Good response");
  assert.equal(replyRatingAria("bad"), "Bad response");
  assert.equal(replyRatingPressed(null, "good"), false);
  assert.equal(replyRatingPressed("good", "good"), true);
  assert.equal(replyRatingPressed("good", "bad"), false);
  assert.equal(replyRatingPressed(undefined, "bad"), false);
  assert.equal(replyRatingAnimates(false), false);
  assert.equal(replyRatingAnimates(true), false);

  const offer = { fromUser: false, kindMessage: true, completed: true };
  assert.equal(offersReplyRating(offer), true);
  assert.equal(offersReplyRating({ ...offer, fromUser: true }), false);
  assert.equal(offersReplyRating({ ...offer, kindMessage: false }), false);
  assert.equal(offersReplyRating({ ...offer, completed: false }), false);

  assert.deepEqual(toggleReplyRating({}, "m1", "good"), { m1: "good" });
  assert.deepEqual(toggleReplyRating({ m1: "good" }, "m1", "bad"), { m1: "bad" });
  assert.deepEqual(toggleReplyRating({ m1: "bad" }, "m1", "bad"), {});
  assert.deepEqual(toggleReplyRating({ m1: "good", m2: "bad" }, "m1", "good"), {
    m2: "bad",
  });
  const kept = { m1: "good" as const };
  assert.equal(toggleReplyRating(kept, "", "bad"), kept);
});

test("the mark round-trips in local storage and drops corrupt values", () => {
  assert.equal(REPLY_RATING_STORAGE_KEY, "snorlax.replyRating");
  assert.deepEqual(parseReplyRatings(null), {});
  assert.deepEqual(parseReplyRatings(""), {});
  assert.deepEqual(parseReplyRatings("nope"), {});
  assert.deepEqual(parseReplyRatings("[]"), {});
  assert.deepEqual(parseReplyRatings("42"), {});
  assert.deepEqual(
    parseReplyRatings('{"a":"good","b":"nope","c":1,"":"good","d":"bad"}'),
    { a: "good", d: "bad" },
  );
  assert.equal(
    serializeReplyRatings({ a: "good", "": "bad", b: "bad" }),
    JSON.stringify({ a: "good", b: "bad" }),
  );

  const storage = memoryStorage();
  assert.deepEqual(readReplyRatings(null), {});
  assert.deepEqual(readReplyRatings(storage), {});
  writeReplyRatings(null, { a: "good" });
  let map = toggleReplyRating({}, "m1", "good");
  writeReplyRatings(storage, map);
  assert.deepEqual(readReplyRatings(storage), { m1: "good" });
  map = toggleReplyRating(readReplyRatings(storage), "m1", "bad");
  writeReplyRatings(storage, map);
  assert.deepEqual(readReplyRatings(storage), { m1: "bad" });
  map = toggleReplyRating(readReplyRatings(storage), "m2", "good");
  writeReplyRatings(storage, map);
  assert.deepEqual(readReplyRatings(storage), { m1: "bad", m2: "good" });
  storage.raw = "{";
  assert.deepEqual(readReplyRatings(storage), {});
  assert.equal(src.includes("/v1/"), false);
});

test("desktop and iOS offer Good and Bad only on a finished assistant reply", () => {
  const actions = sliceFn(app, "function MessageActions(", "function QuoteMessageButton(");
  assert.match(actions, /offersReplyRating\(/);
  assert.match(actions, /replyRatingLabel\("good"\)/);
  assert.match(actions, /replyRatingLabel\("bad"\)/);
  assert.match(actions, /replyRatingAria\("good"\)/);
  assert.match(actions, /replyRatingAria\("bad"\)/);
  assert.match(actions, /aria-pressed=\{replyRatingPressed\(rating, "good"\)\}/);
  assert.match(actions, /aria-pressed=\{replyRatingPressed\(rating, "bad"\)\}/);
  assert.match(actions, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(actions, /onRate\("good"\)/);
  assert.match(actions, /onRate\("bad"\)/);
  assert.match(actions, /className="message-action"/);
  assert.doesNotMatch(actions, /fetch\(/);
  assert.doesNotMatch(actions, /\/v1\//);
  const goodAt = actions.indexOf('onRate("good")');
  const badAt = actions.indexOf('onRate("bad")');
  const regenAt = actions.lastIndexOf("Regenerate");
  assert.ok(regenAt >= 0 && goodAt > regenAt && badAt > goodAt);

  const user = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.doesNotMatch(user, /onRate\(/);
  assert.doesNotMatch(user, /offersReplyRating/);
  assert.doesNotMatch(user, /replyRatingLabel/);

  const rate = sliceFn(app, "function onRateReply(", "function onTogglePin(");
  assert.match(rate, /toggleReplyRating\(current, id, pick\)/);
  assert.match(rate, /writeReplyRatings\(browserReplyRatingStorage\(\), next\)/);
  assert.doesNotMatch(rate, /fetch\(/);
  assert.doesNotMatch(rate, /\/v1\//);
  assert.doesNotMatch(rate, /regeneratePostBody/);
  assert.match(app, /readReplyRatings\(browserReplyRatingStorage\(\)\)/);
  assert.match(app, /rating=\{replyRatings\[message\.id\] \?\? null\}/);
  assert.match(app, /onRate=\{\(pick\) => onRateReply\(message\.id, pick\)\}/);
  assert.match(app, /completed=\{completed\}/);

  const btnAt = css.indexOf("\n.message-action {");
  assert.ok(btnAt >= 0, "missing .message-action");
  const btn = css.slice(btnAt, css.indexOf("}", btnAt) + 1);
  assert.match(btn, /font-size:\s*12px/);
  assert.match(btn, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(btn, /transition/);
  assert.match(css, /\.message-action\[aria-pressed="true"\]/);
  const row = block(".message-actions");
  assert.match(row, /flex-wrap:\s*wrap/);
  assert.match(row, /gap:\s*12px/);

  assert.match(chat, /ReplyRating\.offers\(/);
  assert.match(chat, /fromUser: message\.isFromUser/);
  assert.match(chat, /model\.toggleReplyRating\(id: message\.id, pick: pick\)/);
  assert.match(chat, /ReplyRating\.label\(pick\)/);
  assert.match(chat, /ReplyRating\.accessibilityLabel\(pick\)/);
  assert.match(chat, /ReplyRating\.pressed\(current: current, pick: pick\)/);
  assert.match(chat, /Color\.primary/);
  assert.doesNotMatch(
    chat.slice(chat.indexOf("} else if isUser {"), chat.indexOf("AssistantMarkdown(")),
    /ReplyRating/,
  );
  const rowButtons = sliceFn(chat, "if showRegenerate {", "if isUser, let jump");
  assert.match(rowButtons, /if offersReplyRating/);
  assert.match(rowButtons, /replyRatingControl\(ReplyRating\.good/);
  assert.match(rowButtons, /replyRatingControl\(ReplyRating\.bad/);
  assert.doesNotMatch(rowButtons, /wantsComposerFocus/);
  const menu = sliceFn(chat, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet");
  assert.match(menu, /if showReplyRating/);
  assert.match(menu, /Button\(ReplyRating\.goodLabel\)/);
  assert.match(menu, /Button\(ReplyRating\.badLabel\)/);

  const toggle = sliceFn(model, "func toggleReplyRating(", "var isConfigured");
  assert.match(toggle, /ReplyRating\.toggled\(replyRatings, id: id, pick: pick\)/);
  assert.doesNotMatch(toggle, /\/v1\//);
  assert.doesNotMatch(toggle, /send\(/);
  assert.doesNotMatch(toggle, /wantsComposerFocus/);
  assert.match(model, /ReplyRating\.read\(\)/);
  assert.match(model, /ReplyRating\.write\(replyRatings\)/);

  assert.match(swift, /static let storageKey = "snorlax.replyRating"/);
  assert.match(swift, /static let goodLabel = "Good"/);
  assert.match(swift, /static let badLabel = "Bad"/);
  assert.match(swift, /static let goodAria = "Good response"/);
  assert.match(swift, /static let badAria = "Bad response"/);
  assert.match(swift, /static func offers/);
  assert.match(swift, /static func toggled/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(shortcuts, /Good response/);
  assert.doesNotMatch(iosShortcuts, /Good response/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 220\. v2\.20/);
  assert.match(ci, /test_ios_reply_rating\.py/);
  assert.match(pkg, /src\/replyRating\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
