// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  USER_JUMP_ACTION,
  USER_JUMP_EPSILON,
  USER_JUMP_HIGHLIGHT_MS,
  USER_JUMP_KEYS,
  USER_JUMP_STICKY_INSET,
  composerTextOwnsUserJump,
  isUserJumpMessage,
  overlayTextFieldOwnsUserJump,
  pickUserJumpId,
  userJumpContentTop,
  userJumpHighlightAnimates,
  userJumpHighlightMs,
  userJumpScrollTop,
  userJumpView,
  userMessageJumpBlocked,
  userMessageJumpDirection,
  userMessageJumpShouldMove,
  type UserJumpRow,
  type UserJumpView,
} from "./userMessageJump.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "userMessageJump.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
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
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);

const PHRASE =
  "v1.25 jump between your sent messages from the keyboard (Cmd/Ctrl-Shift-Up scrolls to the previous user-RIGHT kind=message in the open chat's loaded transcript and Cmd/Ctrl-Shift-Down scrolls to the next one, relative to the current viewport; the target bubble gets a brief subtle highlight; either end stays clamped; a key repeat does not jump again; the chord still works from an empty composer and does not move the caret; when the composer has text, Cmd/Ctrl-Shift-Up and Cmd/Ctrl-Shift-Down keep selecting text; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; stick-to-bottom, the Jump chip, per-chat reading place, the sticky day header, and collapsed long messages stay; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-B, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-[ / ], Cmd/Ctrl-= / - / 0, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift ↑ / ↓; iOS hardware command-shift-up and command-shift-down, and the control variants, jump the same way and Gestures & shortcuts lists the chord; no new HTTP)";

const openGate = {
  chatOpen: true,
  composing: false,
  overlayTextField: false,
  composerHasText: false,
  inCard: false,
  findOpen: false,
  switchOpen: false,
  shortcutsOpen: false,
  renaming: false,
  lightboxOpen: false,
  menuOpen: false,
  blocked: false,
};

function view(scrollTop: number, extras: Partial<UserJumpView> = {}): UserJumpView {
  return userJumpView({
    scrollTop,
    stickyInset: extras.stickyInset ?? 0,
    maxScroll: extras.maxScroll ?? 10_000,
    epsilon: extras.epsilon,
  });
}

const sent: UserJumpRow[] = [
  { id: "a", top: 0 },
  { id: "b", top: 400 },
  { id: "c", top: 900 },
];

test(PHRASE, () => {
  assert.match(src, /v1\.25/);
  assert.match(src, /No HTTP/);
});

test("only a user-RIGHT kind=message is a jump target", () => {
  assert.equal(
    isUserJumpMessage({ role: "user", senderId: "user", kind: "message" }),
    true,
  );
  assert.equal(isUserJumpMessage({ role: "user", senderId: "user" }), true);
  assert.equal(
    isUserJumpMessage({ role: "assistant", senderId: "agent", kind: "message" }),
    false,
  );
  assert.equal(
    isUserJumpMessage({ role: "user", senderId: "user", kind: "tool" }),
    false,
  );
  assert.equal(
    isUserJumpMessage({ role: "user", senderId: "user", kind: "widget" }),
    false,
  );
  assert.equal(
    isUserJumpMessage({ role: "user", senderId: "user", kind: "approve" }),
    false,
  );
  assert.equal(
    isUserJumpMessage({ role: "user", senderId: "user", kind: "connect" }),
    false,
  );
});

test("Cmd/Ctrl-Shift-Up and Down are the jump chords", () => {
  assert.equal(
    userMessageJumpDirection({ key: "ArrowUp", metaKey: true, shiftKey: true }),
    "previous",
  );
  assert.equal(
    userMessageJumpDirection({ key: "ArrowDown", ctrlKey: true, shiftKey: true }),
    "next",
  );
  assert.equal(
    userMessageJumpDirection({
      key: "ArrowUp",
      metaKey: true,
      shiftKey: true,
      repeat: true,
    }),
    "previous",
  );
  assert.equal(userMessageJumpShouldMove({ repeat: true }), false);
  assert.equal(userMessageJumpShouldMove({ repeat: false }), true);
  assert.equal(userMessageJumpDirection({ key: "ArrowUp" }), null);
  assert.equal(userMessageJumpDirection({ key: "ArrowUp", shiftKey: true }), null);
  assert.equal(userMessageJumpDirection({ key: "ArrowUp", metaKey: true }), null);
  assert.equal(
    userMessageJumpDirection({ key: "ArrowUp", altKey: true, shiftKey: true }),
    null,
  );
  assert.equal(
    userMessageJumpDirection({
      key: "ArrowUp",
      metaKey: true,
      ctrlKey: true,
      shiftKey: true,
    }),
    null,
  );
  assert.equal(
    userMessageJumpDirection({
      key: "ArrowUp",
      metaKey: true,
      altKey: true,
      shiftKey: true,
    }),
    null,
  );
  assert.equal(
    userMessageJumpDirection({ key: "ArrowLeft", metaKey: true, shiftKey: true }),
    null,
  );
  assert.equal(userMessageJumpDirection({ key: "Home", metaKey: true, shiftKey: true }), null);
  assert.equal(userMessageJumpDirection({ key: "=", metaKey: true }), null);
  assert.equal(userMessageJumpDirection({ key: "[", metaKey: true }), null);
});

test("a composer that has text keeps selecting; an empty one does not", () => {
  assert.equal(composerTextOwnsUserJump(true, "hello"), true);
  assert.equal(composerTextOwnsUserJump(true, " "), true);
  assert.equal(composerTextOwnsUserJump(true, ""), false);
  assert.equal(composerTextOwnsUserJump(false, "hello"), false);
  assert.equal(overlayTextFieldOwnsUserJump(true, true), false);
  assert.equal(overlayTextFieldOwnsUserJump(true, false), true);
  assert.equal(overlayTextFieldOwnsUserJump(false, false), false);
});

test("IME, find, the switcher, and modal fields keep the key", () => {
  assert.equal(userMessageJumpBlocked(openGate), false);
  assert.equal(userMessageJumpBlocked({ ...openGate, chatOpen: false }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, composing: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, overlayTextField: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, composerHasText: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, inCard: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, findOpen: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, switchOpen: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, shortcutsOpen: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, renaming: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, lightboxOpen: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, menuOpen: true }), true);
  assert.equal(userMessageJumpBlocked({ ...openGate, blocked: true }), true);
});

test("previous and next follow the viewport and clamp at either end", () => {
  assert.equal(USER_JUMP_EPSILON, 8);
  assert.equal(pickUserJumpId(sent, "previous", view(0)), null);
  assert.equal(pickUserJumpId(sent, "next", view(0)), "b");
  assert.equal(pickUserJumpId(sent, "previous", view(400)), "a");
  assert.equal(pickUserJumpId(sent, "next", view(400)), "c");
  assert.equal(pickUserJumpId(sent, "next", view(900)), null);
  assert.equal(pickUserJumpId(sent, "previous", view(1200)), "c");
  assert.equal(pickUserJumpId([], "next", view(0)), null);
  assert.equal(pickUserJumpId([{ id: "", top: 10 }], "next", view(0)), null);
  // Scrolled into a long sent message: the first press brings its top back.
  assert.equal(
    pickUserJumpId([{ id: "long", top: 100 }, { id: "later", top: 800 }], "previous", view(250)),
    "long",
  );
  assert.equal(
    pickUserJumpId([{ id: "long", top: 100 }, { id: "later", top: 800 }], "next", view(250)),
    "later",
  );
});

test("a sticky day inset and a bottom clamp do not skip or repeat", () => {
  assert.equal(USER_JUMP_STICKY_INSET, 32);
  assert.equal(userJumpContentTop(140, 40, 200), 300);
  assert.equal(userJumpScrollTop(500, 32, 2000), 468);
  assert.equal(userJumpScrollTop(10, 32, 2000), 0);
  assert.equal(userJumpScrollTop(5000, 32, 400), 400);
  const parked = view(400, { stickyInset: 32, maxScroll: 400 });
  assert.equal(parked.viewAnchor, 432);
  // The last sent message cannot rise any higher than the clamp.
  assert.equal(
    pickUserJumpId([{ id: "early", top: 80 }, { id: "last", top: 500 }], "next", parked),
    null,
  );
  assert.equal(
    pickUserJumpId([{ id: "early", top: 80 }, { id: "last", top: 500 }], "previous", parked),
    "early",
  );
});

test("a row that is not laid out still sits in transcript order", () => {
  const rows: UserJumpRow[] = [
    { id: "a", top: 40 },
    { id: "b", top: null },
    { id: "c", top: 900 },
  ];
  assert.equal(pickUserJumpId(rows, "previous", view(400)), "b");
  assert.equal(pickUserJumpId(rows, "next", view(40)), "b");
  assert.equal(
    pickUserJumpId(
      [
        { id: "a", top: null },
        { id: "b", top: null },
        { id: "c", top: 400 },
      ],
      "previous",
      view(400),
    ),
    "b",
  );
  assert.equal(
    pickUserJumpId([{ id: "a", top: 20 }, { id: "b", top: null }], "previous", view(800)),
    "a",
  );
  assert.equal(
    pickUserJumpId([{ id: "a", top: 20 }, { id: "b", top: null }], "next", view(20)),
    "b",
  );
});

test("the highlight is brief and Reduce Motion skips the fade", () => {
  assert.equal(USER_JUMP_HIGHLIGHT_MS, 1200);
  assert.equal(userJumpHighlightMs(false), 1200);
  assert.equal(userJumpHighlightMs(true), 1200);
  assert.equal(userJumpHighlightAnimates(false), true);
  assert.equal(userJumpHighlightAnimates(true), false);
});

test("the jump is wired and listed, with no new HTTP", () => {
  assert.equal(USER_JUMP_KEYS, "Cmd/Ctrl Shift ↑ / ↓");
  assert.equal(USER_JUMP_ACTION, "Previous or next message you sent");
  const row = CHAT_SHORTCUTS.find((item) => item.id === "user-jump");
  assert.equal(row?.keys, USER_JUMP_KEYS);
  assert.equal(row?.action, USER_JUMP_ACTION);
  assert.match(shortcuts, /v1\.25/);
  assert.match(css, /@keyframes user-jump-highlight/);
  assert.match(css, /\.bubble\.user\[data-user-jump-highlight="true"\]/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.bubble\.user\[data-user-jump-highlight="true"\] \{\s*animation:\s*none;/,
  );
  const handler = app.slice(
    app.indexOf("const onUserMessageJump"),
    app.indexOf('addEventListener("keydown", onUserMessageJump, true)'),
  );
  assert.match(handler, /userMessageJumpDirection/);
  assert.match(handler, /userMessageJumpBlocked/);
  assert.match(handler, /composerTextOwnsUserJump/);
  assert.match(handler, /overlayTextFieldOwnsUserJump/);
  assert.match(handler, /pickUserJumpId/);
  assert.match(handler, /userJumpScrollTop/);
  assert.match(handler, /\.day-separator/);
  assert.match(handler, /data-user-jump/);
  assert.match(handler, /preventDefault/);
  assert.ok(handler.indexOf("userMessageJumpBlocked") < handler.indexOf("preventDefault"));
  assert.ok(handler.indexOf("preventDefault") < handler.indexOf("userMessageJumpShouldMove"));
  assert.match(handler, /onUserScroll/);
  assert.match(handler, /captureOpenReadingPlace/);
  assert.match(handler, /userJumpHighlightMs/);
  assert.doesNotMatch(handler, /setExpanded/);
  assert.doesNotMatch(handler, /Show more/);
  assert.match(app, /data-user-jump=\{/);
  assert.match(app, /isUserJumpMessage\(message\)/);
  assert.match(app, /data-user-jump-highlight=/);
  assert.match(app, /className="bubble user"/);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /src\/userMessageJump\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.25 /);
  assert.match(spec, /## 125\. v1\.25/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_user_message_jump\.py/);
});
