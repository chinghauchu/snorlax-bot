// SPDX-License-Identifier: Apache-2.0

/**
 * v1.78: CommonMark link-title forms on a completed assistant
 * LEFT `kind=message`.
 *
 * v1.46 already showed a title as the tooltip. Checked again on
 * main at v1.77: the basic `"title"`, `'title'`, and `(title)`
 * forms are there, and so is an escaped quote and `&amp;` inside
 * a one-line title. v1.77 left link-title quote forms out of
 * scope. The scanners still disagree with cmark-gfm:
 *
 * - a title may span a line break, and a reference definition
 *   may put the title on the next line
 * - a blank line inside a title is not a title
 * - `(` and `)` inside a parenthesis title must be escaped
 * - the title must be separated from the destination by
 *   whitespace
 * - a backslash escapes ASCII punctuation only
 * - character references decode, then backslashes unescape
 * - an invalid title is not a link, an image, or a definition
 *
 * The tooltip is that title with whitespace collapsed. An empty
 * result has no tooltip. Streaming does not rewrite titles.
 * Copy keeps markdown source. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownLinkTitleForm.swift`.
 */

import { ASCII_PUNCT, readCharacterReference } from "./markdownEscape.ts";

const PUNCT = new Set(ASCII_PUNCT);

export type TitleScan = { raw: string; next: number };

/**
 * cmark-gfm `scan_link_title` at `index`, which points at the
 * opening `"`, `'`, or `(`. Returns the raw interior (delimiters
 * not included) and the index just after the closer. A blank line
 * or an unescaped `(` inside a parenthesis title fails the scan.
 */
export function readCommonMarkTitle(
  src: string,
  index: number,
  blocked?: (index: number) => boolean,
): TitleScan | null {
  const open = src[index];
  if (open !== '"' && open !== "'" && open !== "(") return null;
  const close = open === "(" ? ")" : open;
  let j = index + 1;
  let raw = "";
  while (j < src.length) {
    if (blocked?.(j)) return null;
    const ch = src[j] ?? "";
    if (ch === "\0") return null;
    if (ch === "\\" && j + 1 < src.length) {
      const next = src[j + 1] ?? "";
      if (next !== "\0" && PUNCT.has(next)) {
        if (blocked?.(j + 1)) return null;
        raw += ch + next;
        j += 2;
        continue;
      }
    }
    if (open === "(" && ch === "(") return null;
    if (ch === close) {
      if (hasBlankLine(raw)) return null;
      return { raw, next: j + 1 };
    }
    raw += ch;
    j += 1;
  }
  return null;
}

/** Entities first, then backslash escapes. Same order as cmark. */
export function decodeCommonMarkTitle(raw: string): string {
  let entities = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "&") {
      const ref = readCharacterReference(raw, i);
      if (ref) {
        entities += ref.value;
        i = ref.next;
        continue;
      }
    }
    entities += raw[i] ?? "";
    i += 1;
  }
  let out = "";
  for (let k = 0; k < entities.length; k += 1) {
    const ch = entities[k] ?? "";
    const next = entities[k + 1] ?? "";
    if (ch === "\\" && PUNCT.has(next)) {
      out += next;
      k += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Leading and trailing whitespace drops. A run inside becomes one space. */
export function collapseCommonMarkTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Tooltip text for a raw title interior. Empty means no tooltip. */
export function commonMarkTitleHint(raw: string): string {
  return collapseCommonMarkTitle(decodeCommonMarkTitle(raw));
}

/**
 * Escape a decoded title so a later CommonMark parse restores it.
 * `&` is a numeric reference so a second entity pass cannot turn
 * `&amp;` into `&`.
 */
export function formatCommonMarkTitle(decoded: string): string {
  let out = "";
  for (const ch of decoded) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "&") out += "&#38;";
    else out += ch;
  }
  return out;
}

/** Quoted title both platform parsers already accept. */
export function normalizedTitle(raw: string): string {
  return `"${formatCommonMarkTitle(commonMarkTitleHint(raw))}"`;
}

function hasBlankLine(raw: string): boolean {
  const norm = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return /\n[ \t]*\n/.test(norm);
}
