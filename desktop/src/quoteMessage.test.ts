// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { quoteBlock } from "./quoteSelection.ts";
import {
  QUOTE_MESSAGE_ARIA,
  QUOTE_MESSAGE_LABEL,
  QUOTE_MESSAGE_READING_ATTR,
  offersQuoteMessage,
  quoteMessageSourceId,
} from "./quoteMessage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "quoteMessage.ts"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteMessage.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const shortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.17 quote a whole message";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

const ready = {
  fromUser: true,
  kindMessage: true,
  content: "earlier prompt",
  completed: true,
  pending: false,
};

test("Quote is offered for settled user text and a completed assistant reply", () => {
  assert.equal(offersQuoteMessage(ready), true);
  assert.equal(offersQuoteMessage({ ...ready, fromUser: false }), true);
  assert.equal(offersQuoteMessage({ ...ready, pending: true }), false);
  assert.equal(offersQuoteMessage({ ...ready, content: "" }), false);
  assert.equal(offersQuoteMessage({ ...ready, content: " \n\t" }), false);
  assert.equal(offersQuoteMessage({ ...ready, kindMessage: false }), false);
  assert.equal(
    offersQuoteMessage({ ...ready, fromUser: false, completed: false }),
    false,
  );
  assert.equal(offersQuoteMessage({ ...ready, fromUser: true, completed: false }), true);
  assert.equal(QUOTE_MESSAGE_LABEL, "Quote");
  assert.equal(QUOTE_MESSAGE_ARIA, "Quote message");
  assert.equal(quoteBlock("hello\n\nthere"), "> hello\n>\n> there");
  assert.equal(
    quoteMessageSourceId({
      closest(selector) {
        assert.equal(selector, `[${QUOTE_MESSAGE_READING_ATTR}]`);
        return { getAttribute: () => "msg-1" };
      },
    }),
    "msg-1",
  );
  assert.equal(quoteMessageSourceId(null), "");
  assert.equal(quoteMessageSourceId({}), "");
  assert.equal(
    quoteMessageSourceId({
      closest: () => ({ getAttribute: () => "  " }),
    }),
    "",
  );
});

test("desktop and iOS quote the whole message without sending", () => {
  assert.match(swift, /static let label = "Quote"/);
  assert.match(swift, /static let accessibilityLabel = "Quote message"/);
  assert.match(swift, /static func offers\(/);
  assert.match(swift, /QuoteSelection\.block\(content\) != nil/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(src.includes("computerPane.ts"), false);
  assert.equal(swift.includes("computerPane.ts"), false);

  const insert = sliceFn(
    app,
    "function quoteMessageIntoComposer(",
    "quoteMessageRef.current = quoteMessageIntoComposer",
  );
  assert.match(insert, /if \(takeoverOpen\) return/);
  assert.match(insert, /appendQuoteToDraft\(draftRef\.current, text\)/);
  assert.match(insert, /if \(!next\) return/);
  assert.match(insert, /pendingCaret\.current = next\.caret/);
  assert.match(insert, /setDraft\(next\.text\)/);
  assert.match(insert, /recallArmedAfterEdit\(next\.text, armed\)/);
  assert.match(insert, /quoteJumps\.current\.note\(active\.id, threadId, text, messageId\)/);
  assert.match(insert, /removeAllRanges\(\)/);
  assert.doesNotMatch(insert, /onSend\(/);
  assert.doesNotMatch(insert, /queueFollowUp/);
  assert.doesNotMatch(insert, /fetch\(/);
  assert.doesNotMatch(insert, /\/v1\//);

  const button = sliceFn(app, "function QuoteMessageButton(", "function UserMessageCopy(");
  assert.match(button, /offersQuoteMessage\(/);
  assert.match(button, /QUOTE_MESSAGE_ARIA/);
  assert.match(button, /QUOTE_MESSAGE_LABEL/);
  assert.match(button, /quoteMessageSourceId\(event\.currentTarget\)/);
  assert.match(button, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(button, /className="message-action"/);
  assert.doesNotMatch(button, /onSend/);

  const user = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.match(user, /<QuoteMessageButton/);
  assert.match(user, /fromUser/);
  assert.match(user, /pending=\{false\}/);
  assert.match(user, /COPY_CONTROL_LABEL/);
  assert.doesNotMatch(user, /fromUser=\{false\}/);
  assert.doesNotMatch(user, /onSpeak/);
  assert.doesNotMatch(user, /Regenerate/);

  const assistant = sliceFn(app, "function MessageActions(", "function QuoteMessageButton(");
  assert.match(assistant, /<QuoteMessageButton/);
  assert.match(assistant, /fromUser=\{false\}/);
  assert.match(assistant, /pending=\{false\}/);
  assert.match(assistant, /COPY_CONTROL_LABEL/);
  const quoteAt = assistant.indexOf("<QuoteMessageButton");
  const speakAt = assistant.indexOf("onClick={onSpeak}");
  assert.ok(quoteAt >= 0 && speakAt > quoteAt);

  assert.match(app, /data-reading-id=\{message\.id\}/);
  assert.match(app, /function quoteIntoComposer\(/);

  const iosInsert = sliceFn(
    model,
    "func quoteMessageIntoComposer(",
    "func clearRecallFromEscape(",
  );
  assert.match(iosInsert, /QuoteSelection\.append\(draft: draft, selection: text\)/);
  assert.match(iosInsert, /computerTakeoverOpen/);
  assert.match(iosInsert, /pendingComposerCaret = next\.caret/);
  assert.match(iosInsert, /wantsComposerFocus = true/);
  assert.match(iosInsert, /quoteJumps\.note\(/);
  assert.match(iosInsert, /sourceId: sourceId/);
  assert.doesNotMatch(iosInsert, /send\(/);
  assert.doesNotMatch(iosInsert, /\/v1\//);
  assert.match(model, /func quoteIntoComposer\(/);

  assert.match(chat, /QuoteMessage\.offers\(/);
  assert.match(chat, /!message\.isToolLine/);
  assert.match(chat, /!message\.isHandoffRoot/);
  assert.match(chat, /OptimisticSend\.isOptimistic\(message\.id\)/);
  assert.match(chat, /model\.failedSend\(id: message\.id\) == nil/);
  assert.match(chat, /showQuoteMessage: offersWholeQuote/);
  assert.match(chat, /model\.quoteMessageIntoComposer\(message\.content, sourceId: message\.id\)/);
  assert.match(chat, /Button\(QuoteSelection\.label\)/);
  assert.match(chat, /Button\(QuoteMessage\.label\)/);
  assert.match(chat, /QuoteSelection\.menuSelection\(\) == nil/);
  assert.match(chat, /QuoteMessage\.accessibilityLabel/);
  assert.match(shortcuts, /Quote the whole message/);
  assert.match(shortcuts, /Select text, then Quote/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const body of [openapi, protocol, runtimeOpenapi]) {
    assert.match(body, /version: 0\.18\.0/);
    assert.doesNotMatch(body, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 217\. v2\.17/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
  assert.match(ci, /test_ios_quote_message\.py/);
  assert.match(pkg, /src\/quoteMessage\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
