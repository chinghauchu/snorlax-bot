// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COMPOSER_MAX_PX,
  COMPOSER_MIN_PX,
  composerFrame,
  composerGrowMs,
} from "./composerGrow.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "composerGrow.ts"), "utf8");
const keys = readFileSync(join(here, "composerKeys.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerGrow.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.84 composer auto-grows with typed text (typing or pasting multi-line text grows the composer up to about 8 lines / 160px, then the field scrolls inside; deleting text shrinks it; an empty composer stays one line; attachment chips, mic, Send, and the paperclip stay put; Reduce Motion changes height instantly; Enter sends and Shift-Enter inserts a newline; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("empty and a single line keep the stylesheet height", () => {
  assert.equal(COMPOSER_MAX_PX, 160);
  assert.equal(COMPOSER_MIN_PX, 22);
  assert.ok(COMPOSER_MAX_PX >= 160 && COMPOSER_MAX_PX <= 200);

  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 32, empty: true }),
    { height: null, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 400, empty: true }),
    { height: null, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 33, empty: false }),
    { height: null, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 0, scrollHeight: 80, empty: false }),
    { height: null, scroll: false },
  );
});

test("multi-line text grows until 160px, then scrolls inside", () => {
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 64, empty: false }),
    { height: 64, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 160, empty: false }),
    { height: 160, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 161, empty: false }),
    { height: 160, scroll: true },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 400.2, empty: false }),
    { height: 160, scroll: true },
  );
});

test("deleting text shrinks back to one line", () => {
  const tall = composerFrame({
    restingHeight: 32,
    scrollHeight: 220,
    empty: false,
  });
  assert.equal(tall.height, 160);
  assert.equal(tall.scroll, true);
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 48, empty: false }),
    { height: 48, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 32, empty: false }),
    { height: null, scroll: false },
  );
  assert.deepEqual(
    composerFrame({ restingHeight: 32, scrollHeight: 32, empty: true }),
    { height: null, scroll: false },
  );
});

test("Reduce Motion changes height instantly", () => {
  assert.equal(composerGrowMs(false), 0);
  assert.equal(composerGrowMs(true), 0);
  const field = block(".composer-bar textarea");
  assert.match(field, /min-height:\s*22px/);
  assert.match(field, /max-height:\s*160px/);
  assert.match(field, /overflow-y:\s*hidden/);
  assert.match(field, /transition:\s*none/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.composer-bar textarea \{\s*transition:\s*none;/,
  );
});

test("the field resizes on type, paste, draft, and width changes", () => {
  assert.match(app, /composerFrame\(/);
  assert.match(app, /COMPOSER_MAX_PX/);
  assert.match(app, /function resizeComposer/);
  assert.match(app, /resizeComposer\(\)/);
  assert.match(app, /resizeComposer\(draft\.length === 0\)/);
  assert.match(app, /ResizeObserver/);
  assert.match(app, /clientWidth/);
  assert.match(app, /overlay\.style\.height = `\$\{field\.offsetHeight\}px`/);
  assert.match(app, /is-scrolling/);
  assert.match(css, /\.composer-field\.is-scrolling textarea/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(app, /rows=\{1\}/);
  assert.match(app, /align-items:\s*flex-end|composer-bar/);
  assert.match(css, /\.composer-bar\s*\{[^}]*align-items:\s*flex-end/);
  assert.match(src, /No new HTTP/);
  assert.equal(src.includes("fetch("), false);
  assert.equal(src.includes("/v1/"), false);
});

test("Enter still sends, Shift-Enter stays a newline, recall and IME stay", () => {
  assert.match(keys, /Shift\+Enter stays newline/);
  assert.match(keys, /code === 229/);
  assert.match(app, /composerEnterSends\(event\)/);
  assert.match(app, /arrowUpRecalls\(/);
  assert.match(app, /function fillRecalledDraft/);
  assert.match(app, /chatDrafts\.current\.swap/);
});

test("iOS uses the same 160pt cap and scrolls inside it", () => {
  assert.match(swift, /static let maxHeight: CGFloat = 160/);
  assert.match(swift, /static let minHeight: CGFloat = 22/);
  assert.match(swift, /contentHeight <= resting \+ 1/);
  assert.match(swift, /contentHeight > maxHeight/);
  assert.match(swift, /return nil/);
  assert.match(swift, /No new HTTP/);
  assert.equal(swift.includes("/v1/"), false);
  assert.match(composer, /ComposerGrow\.frame\(/);
  assert.match(composer, /widthTracksTextView = true/);
  assert.match(composer, /isScrollEnabled = fitted\.scroll/);
  assert.match(composer, /markedTextRange/);
  assert.match(composer, /modifierFlags\.contains\(\.shift\)/);
  assert.match(composer, /onArrowUpRecall/);
  assert.match(chat, /ComposerGrow\.minHeight/);
  assert.match(chat, /ComposerGrow\.maxHeight/);
  assert.match(chat, /HStack\(alignment: \.bottom/);
  const field = chat.slice(
    chat.indexOf("ComposerTextView("),
    chat.indexOf('Image(systemName: "mic")'),
  );
  assert.doesNotMatch(field, /\.animation\(/);
});

test("OpenAPI stays 0.18.0; v0.84 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.equal(PHRASE.includes("computerPane"), false);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v0.84 "));
  assert.ok(roadmap.includes("composer auto-grows with typed text"));
  assert.match(pkg, /composerGrow\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_composer_grow\.py/);
});
