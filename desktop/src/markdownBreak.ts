// SPDX-License-Identifier: Apache-2.0

/**
 * v1.33: thematic breaks and GFM strikethrough on completed
 * assistant LEFT `kind=message`.
 *
 * Desktop ATX headings (`#`–`######`) already render through
 * react-markdown as h1–h6 (16px / 14px semibold). This module
 * does not re-parse them. iOS strikethrough already comes from
 * AttributedString. Desktop react-markdown has no remark-gfm, so
 * `~~text~~` stays tildes until `remarkStrikethrough`.
 *
 * Own-line `---`, `***`, and `___` (spaces allowed between the
 * marks) become a rule. A solid dash underline that continues a
 * setext heading stays in the markdown so that heading still
 * renders. Fences and `$$` stay intact.
 *
 * v1.82: a break indented into an open list item stays in that
 * item (the list renderer paints the rule there). A line that
 * only looks like a break inside an HTML block stays in the
 * block. A break at the list's margin still ends the list.
 * `* * *` is a break, not a list item.
 * v1.93: a tab stop counts toward the four-column indent.
 * A space and a tab before `---` is indented code when no
 * paragraph is open, so that line is not setext text and
 * the next `---` stays a rule. Streaming
 * (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownBreak.swift`.
 */

import { splitWebUrls } from "./linkify.ts";
import { ASCII_PUNCT } from "./markdownEscape.ts";
import { contentColumns } from "./markdownIndentedCode.ts";
import { htmlBlockEnd, markdownListEnd } from "./markdownList.ts";

export type BreakBlock =
  | { type: "markdown"; text: string }
  | { type: "rule" };

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: {
    hName?: string;
    hProperties?: { className?: string[] };
  };
};

/** Never animate, including when Reduce Motion is off. */
export function breakAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Pull thematic breaks out of completed markdown. `completed: false`
 * returns the text unchanged.
 */
export function splitThematicBreaks(
  text: string,
  completed = true,
): BreakBlock[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!completed) return [{ type: "markdown", text: src }];

  const lines = src.split("\n");
  const blocks: BreakBlock[] = [];
  let mdStart = 0;
  let fence: string | null = null;
  let inMath = false;
  let setextOpen = false;
  let paragraph = false;

  const pushMarkdown = (end: number) => {
    if (end <= mdStart) return;
    const chunk = lines.slice(mdStart, end).join("\n");
    if (chunk.trim()) blocks.push({ type: "markdown", text: chunk });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      setextOpen = false;
      paragraph = false;
      i += 1;
      continue;
    }
    // v1.82: an HTML block owns every line until it ends. A
    // `***` inside `<script>` or `<div>` is not a rule.
    const htmlEnd = htmlBlockEnd(lines, i, paragraph);
    if (htmlEnd != null && htmlEnd > i) {
      setextOpen = false;
      paragraph = false;
      i = htmlEnd;
      continue;
    }
    // A list span includes a break indented to the item. The
    // margin break that ends the list is left for the rule below.
    const listEnd = markdownListEnd(lines, i);
    if (listEnd != null && listEnd > i) {
      setextOpen = false;
      paragraph = false;
      i = listEnd;
      continue;
    }
    const marker = thematicBreakMarker(line);
    if (marker) {
      // `---` under an open paragraph is a setext underline.
      const setext = marker === "-" && isSolidRun(line, "-") && setextOpen;
      if (!setext) {
        pushMarkdown(i);
        blocks.push({ type: "rule" });
        mdStart = i + 1;
        setextOpen = false;
        paragraph = false;
        i += 1;
        continue;
      }
    }
    if (!line.trim()) {
      setextOpen = false;
      paragraph = false;
      i += 1;
      continue;
    }
    // Four-space indent continues an open paragraph. It is not
    // a break and it does not close the paragraph.
    if (paragraph && isIndentedCode(line)) {
      setextOpen = false;
      i += 1;
      continue;
    }
    setextOpen = isSetextContentLine(line);
    paragraph = setextOpen;
    i += 1;
  }
  pushMarkdown(lines.length);
  if (blocks.length === 0) return [{ type: "markdown", text: src }];
  return blocks;
}

/**
 * A CommonMark thematic break: 0–3 leading spaces, then three or
 * more `-`, `*`, or `_`. Spaces and tabs may sit between the marks.
 * Four-space indent and any other character are not a break.
 */
export function thematicBreakMarker(line: string): "-" | "*" | "_" | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const ch = line[i];
  if (ch !== "-" && ch !== "*" && ch !== "_") return null;
  let count = 0;
  for (let j = i; j < line.length; j += 1) {
    const c = line[j];
    if (c === ch) count += 1;
    else if (c === " " || c === "\t") continue;
    else return null;
  }
  if (count < 3) return null;
  return ch;
}

/**
 * remark plugin: GFM strikethrough becomes a `delete` node (`<del>`).
 * v1.84: the match is cmark-gfm's strikethrough extension. A delimiter
 * is a run of one or two tildes that is left-flanking, right-flanking,
 * or both, using the same flanking rule as `*`. The opener and the
 * closer must be the same length. A run of three or more is not a
 * delimiter, so `x ~~~foo~~~ y` stays literal and `~~a~~~b~~` strikes
 * `a~~~b`. `~~a~` and `~a~~` stay literal. `~foo~~bar~` strikes
 * `foo~~bar`. Punctuation flanking keeps `a~~.b~~`, `~~b.~~c`,
 * `a~~!~~`, and `a~(b)~c` literal, while `~~.b~~`, `~~b.~~`, and
 * `~~!~~` still strike. A `~~` that can open but not close does not
 * close an earlier opener, so `~~foo ~~bar~~` strikes `bar` only.
 * A soft newline may sit inside. A hard break still ends the pair
 * (v1.41), even though raw cmark-gfm would strike across it. A tilde
 * run inside an http(s), `www.`, or email autolink is not a delimiter.
 * Inline code and fenced code are left alone. A pair may wrap other
 * inline nodes (`~~**bold**~~`, `*~~foo~~*`). Overlapping `*` and `~`
 * (`~~*a~~b*~~`, `a*~~b~~*c`) stay on micromark's emphasis pass.
 * cmark pairs those on one stack and skips `~` when it measures `*`.
 * iOS full markdown does that. This plugin is the desktop half.
 * Streaming does not install the plugin. Copy keeps markdown source.
 */
export function remarkStrikethrough(): (tree: MdastNode) => void {
  return (tree) => {
    if (tree.children) tree.children = rewriteStrikeNodes(tree.children, "root");
  };
}

export function rewriteStrikeNodes(nodes: MdastNode[], parent = "root"): MdastNode[] {
  const prepared = explodeHardBreaks(nodes.map((node) => prepareStrikeNode(node)));
  const out: MdastNode[] = [];
  let segment: MdastNode[] = [];
  const flush = () => {
    if (segment.length === 0) return;
    out.push(...strikeSegment(segment, parent));
    segment = [];
  };
  for (const node of prepared) {
    if (node.type === "break") {
      flush();
      out.push(node);
      continue;
    }
    segment.push(node);
  }
  flush();
  return out;
}

const HARD_BREAK_TOKEN = "§§SBH§§";

type Flank = "ws" | "punct" | "other";

type Delim = {
  nodeIndex: number;
  offset: number;
  length: number;
  canOpen: boolean;
  canClose: boolean;
  position: number;
  removed: boolean;
};

type Pos = { n: number; o: number };

type Span = {
  openPos: Pos;
  start: Pos;
  end: Pos;
  after: Pos;
  kids: Span[];
};

function explodeHardBreaks(nodes: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = [];
  for (const node of nodes) {
    if (node.type !== "text" || !node.value?.includes(HARD_BREAK_TOKEN)) {
      out.push(node);
      continue;
    }
    const parts = node.value.split(HARD_BREAK_TOKEN);
    parts.forEach((part, index) => {
      if (index > 0) out.push({ type: "break" });
      if (part) out.push(textNode(part));
    });
  }
  return out;
}

function prepareStrikeNode(node: MdastNode): MdastNode {
  if (node.children && node.type !== "code" && node.type !== "inlineCode") {
    node.children = rewriteStrikeNodes(node.children, node.type);
  }
  return node;
}

function strikeSegment(nodes: MdastNode[], parent: string): MdastNode[] {
  const delims = collectDelims(nodes, parent);
  const pairs = matchDelims(delims);
  if (pairs.length === 0) return nodes;
  const holes: Array<{ n: number; o: number; len: number }> = [];
  for (const pair of pairs) {
    const open = delims[pair.open]!;
    const close = delims[pair.close]!;
    holes.push({ n: open.nodeIndex, o: open.offset, len: open.length });
    holes.push({ n: close.nodeIndex, o: close.offset, len: close.length });
  }
  const spans = nestSpans(nodes, delims, pairs);
  return emitStrike(nodes, { n: 0, o: 0 }, { n: nodes.length, o: 0 }, spans, holes);
}

function collectDelims(nodes: MdastNode[], parent: string): Delim[] {
  const delims: Delim[] = [];
  let position = 1;
  nodes.forEach((node, nodeIndex) => {
    if (node.type !== "text" || !node.value?.includes("~")) return;
    const value = node.value;
    const links = linkSpans(value);
    let i = 0;
    while (i < value.length) {
      const token = escapeTokenAt(value, i);
      if (token > 0) {
        i += token;
        continue;
      }
      if (value[i] !== "~" || isEscaped(value, i)) {
        i += 1;
        continue;
      }
      let end = i + 1;
      while (end < value.length && value[end] === "~" && !isEscaped(value, end)) end += 1;
      const length = end - i;
      // A delimiter run is one tilde or two. `end - i === 2` is the
      // double form. Three or more stay the characters.
      if ((end - i === 1 || end - i === 2) && !runInLink(links, i, end)) {
        const before = flankBefore(nodes, nodeIndex, i, parent);
        const after = flankAfter(nodes, nodeIndex, end, parent);
        const flags = flankFlags(before, after);
        if (flags.canOpen || flags.canClose) {
          delims.push({
            nodeIndex,
            offset: i,
            length,
            canOpen: flags.canOpen,
            canClose: flags.canClose,
            position,
            removed: false,
          });
          position += 1;
        }
      }
      i = end;
    }
  });
  return delims;
}

function matchDelims(delims: Delim[]): Array<{ open: number; close: number }> {
  const matches: Array<{ open: number; close: number }> = [];
  const bottom = [0, 0, 0];
  let i = 0;
  while (i < delims.length) {
    const closer = delims[i]!;
    if (closer.removed || !closer.canClose) {
      i += 1;
      continue;
    }
    const floor = bottom[closer.length % 3] ?? 0;
    let found = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      const opener = delims[j]!;
      if (opener.position < floor) break;
      if (opener.removed || !opener.canOpen) continue;
      const odd =
        (closer.canOpen || opener.canClose) &&
        closer.length % 3 !== 0 &&
        (opener.length + closer.length) % 3 === 0;
      if (!odd) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      bottom[closer.length % 3] = closer.position;
      if (!closer.canOpen) closer.removed = true;
      i += 1;
      continue;
    }
    if (delims[found]!.length === closer.length) matches.push({ open: found, close: i });
    for (let j = i; j >= found; j -= 1) delims[j]!.removed = true;
    i += 1;
  }
  return matches;
}

function nestSpans(
  nodes: MdastNode[],
  delims: Delim[],
  pairs: Array<{ open: number; close: number }>,
): Span[] {
  const items: Span[] = pairs.map((pair) => {
    const open = delims[pair.open]!;
    const close = delims[pair.close]!;
    return {
      openPos: { n: open.nodeIndex, o: open.offset },
      start: afterRun(nodes, open.nodeIndex, open.offset, open.length),
      end: { n: close.nodeIndex, o: close.offset },
      after: afterRun(nodes, close.nodeIndex, close.offset, close.length),
      kids: [],
    };
  });
  items.sort((a, b) => cmpPos(a.openPos, b.openPos));
  const roots: Span[] = [];
  const stack: Span[] = [];
  for (const item of items) {
    while (stack.length > 0 && cmpPos(stack[stack.length - 1]!.end, item.openPos) <= 0) {
      stack.pop();
    }
    if (stack.length > 0) stack[stack.length - 1]!.kids.push(item);
    else roots.push(item);
    stack.push(item);
  }
  return roots;
}

function emitStrike(
  nodes: MdastNode[],
  cur: Pos,
  end: Pos,
  spans: Span[],
  holes: Array<{ n: number; o: number; len: number }>,
): MdastNode[] {
  const out: MdastNode[] = [];
  let guard = 0;
  while (cmpPos(cur, end) < 0 && guard < 100000) {
    guard += 1;
    const hole = holes.find((item) => item.n === cur.n && item.o === cur.o);
    if (hole && cmpPos(afterRun(nodes, hole.n, hole.o, hole.len), end) <= 0) {
      cur = afterRun(nodes, hole.n, hole.o, hole.len);
      continue;
    }
    const span = spans.find((item) => item.start.n === cur.n && item.start.o === cur.o);
    if (span && cmpPos(span.end, end) <= 0) {
      const inner = emitStrike(nodes, span.start, span.end, span.kids, holes);
      if (inner.length > 0) out.push(strikeNode(inner));
      cur = span.after;
      continue;
    }
    const node = nodes[cur.n];
    if (!node) break;
    if (node.type !== "text") {
      out.push(node);
      cur = { n: cur.n + 1, o: 0 };
      continue;
    }
    const value = node.value ?? "";
    let stop = value.length;
    if (end.n === cur.n) stop = Math.min(stop, end.o);
    for (const item of holes) {
      if (item.n === cur.n && item.o > cur.o && item.o < stop) stop = item.o;
    }
    for (const item of spans) {
      if (item.start.n === cur.n && item.start.o > cur.o && item.start.o < stop) stop = item.start.o;
    }
    if (stop <= cur.o) {
      cur = { n: cur.n + 1, o: 0 };
      continue;
    }
    pushText(out, value.slice(cur.o, stop));
    cur = stop >= value.length ? { n: cur.n + 1, o: 0 } : { n: cur.n, o: stop };
  }
  return out;
}

function afterRun(nodes: MdastNode[], n: number, o: number, len: number): Pos {
  const value = nodes[n]?.value ?? "";
  const next = o + len;
  if (next < value.length) return { n, o: next };
  return { n: n + 1, o: 0 };
}

function cmpPos(a: Pos, b: Pos): number {
  if (a.n !== b.n) return a.n - b.n;
  return a.o - b.o;
}

function pushText(out: MdastNode[], value: string): void {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.value = `${last.value ?? ""}${value}`;
  else out.push(textNode(value));
}

function flankBefore(nodes: MdastNode[], index: number, offset: number, parent: string): Flank {
  const node = nodes[index];
  if (node?.type === "text" && offset > 0) return classBeforeOffset(node.value ?? "", offset);
  for (let i = index - 1; i >= 0; i -= 1) {
    const prev = nodes[i]!;
    if (prev.type === "text" && !(prev.value ?? "")) continue;
    return nodeFlank(prev, "end");
  }
  return boundary(parent);
}

function flankAfter(nodes: MdastNode[], index: number, offset: number, parent: string): Flank {
  const node = nodes[index];
  if (node?.type === "text" && offset < (node.value ?? "").length) {
    return classAfterOffset(node.value ?? "", offset);
  }
  for (let i = index + 1; i < nodes.length; i += 1) {
    const next = nodes[i]!;
    if (next.type === "text" && !(next.value ?? "")) continue;
    return nodeFlank(next, "start");
  }
  return boundary(parent);
}

function nodeFlank(node: MdastNode, side: "start" | "end"): Flank {
  if (node.type === "break") return "ws";
  if (node.type === "text") {
    const value = node.value ?? "";
    if (!value) return "other";
    return side === "start" ? classAfterOffset(value, 0) : classBeforeOffset(value, value.length);
  }
  return "punct";
}

function boundary(parent: string): Flank {
  if (
    parent === "emphasis" ||
    parent === "strong" ||
    parent === "link" ||
    parent === "image" ||
    parent === "delete"
  ) {
    return "punct";
  }
  return "ws";
}

function flankFlags(before: Flank, after: Flank): { canOpen: boolean; canClose: boolean } {
  const left = after !== "ws" && (after !== "punct" || before === "ws" || before === "punct");
  const right = before !== "ws" && (before !== "punct" || after === "ws" || after === "punct");
  return { canOpen: left, canClose: right };
}

function classBeforeOffset(value: string, offset: number): Flank {
  const head = value.slice(0, offset);
  const token = /§§SBE((?:[0-9A-F]{6})+)§§$/.exec(head);
  if (token?.[1]) return classOfHex(token[1], "last");
  const cp = codePointBefore(value, offset);
  return classOfChar(cp == null ? "" : String.fromCodePoint(cp));
}

function classAfterOffset(value: string, offset: number): Flank {
  if (offset >= value.length) return "ws";
  const token = /^§§SBE((?:[0-9A-F]{6})+)§§/.exec(value.slice(offset));
  if (token?.[1]) return classOfHex(token[1], "first");
  const cp = value.codePointAt(offset);
  return classOfChar(cp == null ? "" : String.fromCodePoint(cp));
}

function classOfHex(hex: string, which: "first" | "last"): Flank {
  const points: number[] = [];
  for (let i = 0; i + 6 <= hex.length; i += 6) points.push(Number.parseInt(hex.slice(i, i + 6), 16));
  const cp = which === "first" ? points[0] : points[points.length - 1];
  return classOfChar(cp == null ? "" : String.fromCodePoint(cp));
}

function classOfChar(ch: string): Flank {
  if (!ch || isStrikeWs(ch)) return "ws";
  // cmark: ASCII punctuation (including `$` `+` `<` `=` `>` `|` `^`,
  // which are Unicode symbols) or a Unicode punctuation category.
  if (ASCII_PUNCT.includes(ch) || /^\p{P}$/u.test(ch)) return "punct";
  return "other";
}

function isStrikeWs(ch: string): boolean {
  return (
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "\f" ||
    ch === "\v" ||
    /^\p{Zs}$/u.test(ch)
  );
}

function escapeTokenAt(value: string, index: number): number {
  const token = /^§§SBE(?:[0-9A-F]{6})+§§/.exec(value.slice(index));
  return token ? token[0].length : 0;
}

function codePointBefore(value: string, offset: number): number | null {
  if (offset <= 0) return null;
  const prev = offset - 1;
  const unit = value.charCodeAt(prev);
  if (unit >= 0xdc00 && unit <= 0xdfff && prev > 0) {
    const lead = value.charCodeAt(prev - 1);
    if (lead >= 0xd800 && lead <= 0xdbff) return value.codePointAt(prev - 1) ?? unit;
  }
  return unit;
}

function isEscaped(value: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && value[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

type LinkSpan = { start: number; end: number };

/**
 * Spans an extended autolink already owns. Tildes inside the
 * trimmed URL are not strikethrough delimiters.
 */
function linkSpans(value: string): LinkSpan[] {
  if (!/https?:\/\//i.test(value) && !/www\./i.test(value) && !value.includes("@")) {
    return [];
  }
  const pieces = splitWebUrls(value, { emails: true });
  const spans: LinkSpan[] = [];
  let at = 0;
  for (const piece of pieces) {
    const next = at + piece.value.length;
    if (piece.type === "link") spans.push({ start: at, end: next });
    at = next;
  }
  return spans;
}

function runInLink(spans: LinkSpan[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}


function textNode(value: string): MdastNode {
  return { type: "text", value };
}

function strikeNode(children: MdastNode[]): MdastNode {
  return {
    type: "delete",
    data: { hName: "del", hProperties: { className: ["md-strike"] } },
    children,
  };
}

function isSetextContentLine(line: string): boolean {
  if (!line.trim()) return false;
  if (isIndentedCode(line)) return false;
  if (isSolidRun(line, "-") || isSolidRun(line, "=")) return false;
  if (thematicBreakMarker(line)) return false;
  const body = stripIndent(line);
  if (body.startsWith(">")) return false;
  if (body.startsWith("#")) return false;
  if (/^(`{3,}|~{3,})/.test(body)) return false;
  if (isListItemLine(line)) return false;
  return true;
}

function isListItemLine(line: string): boolean {
  return listItemContentColumn(line) > 0;
}

/** Columns before the list item's text. 0 when the line is not an item. */
function listItemContentColumn(line: string): number {
  let index = 0;
  let columns = 0;
  while (index < line.length && line[index] === " " && columns < 3) {
    index += 1;
    columns += 1;
  }
  const rest = line.slice(index);
  let token = 0;
  if (/^[-+*][ \t]/.test(rest)) token = 1;
  else {
    const ordered = /^(\d{1,9}[.)])[ \t]/.exec(rest);
    if (!ordered) return 0;
    token = ordered[1]?.length ?? 0;
  }
  columns += token;
  const sep = rest[token];
  if (sep === " ") columns += 1;
  else if (sep === "\t") columns += 4 - (columns % 4);
  else columns += 1;
  return columns;
}

function isIndentedCode(line: string): boolean {
  const columns = contentColumns(line);
  return columns != null && columns >= 4;
}

function stripIndent(line: string): string {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  return line.slice(i);
}

/** Solid `-` or `=` run: a setext underline, not a spaced rule. */
function isSolidRun(line: string, marker: string): boolean {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  if (line[i] !== marker) return false;
  let saw = false;
  for (let j = i; j < line.length; j += 1) {
    const c = line[j];
    if (c === marker) {
      saw = true;
      continue;
    }
    if (c === " " || c === "\t") {
      for (let k = j; k < line.length; k += 1) {
        const tail = line[k];
        if (tail !== " " && tail !== "\t") return false;
      }
      return saw;
    }
    return false;
  }
  return saw;
}

function blockGate(
  line: string,
  fence: string | null,
  inMath: boolean,
): { fence: string | null; inMath: boolean; blocked: boolean } {
  if (!inMath) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[2] ?? "";
      const info = match[3] ?? "";
      if (!fence) {
        if (marker[0] === "`" && info.includes("`")) {
          return { fence: null, inMath, blocked: false };
        }
        return { fence: marker, inMath, blocked: true };
      }
      const same =
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        info.trim() === "";
      return { fence: same ? null : fence, inMath, blocked: true };
    }
  }
  if (fence) return { fence, inMath, blocked: true };
  if (line.trim() === "$$") return { fence, inMath: !inMath, blocked: true };
  if (inMath) return { fence, inMath, blocked: true };
  return { fence, inMath, blocked: false };
}
