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
 * renders. Fences and `$$` stay intact. Streaming
 * (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownBreak.swift`.
 */

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
  let inList = false;
  let listContentCol = 0;

  const pushMarkdown = (end: number) => {
    if (end <= mdStart) return;
    const chunk = lines.slice(mdStart, end).join("\n");
    if (chunk.trim()) blocks.push({ type: "markdown", text: chunk });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      setextOpen = false;
      inList = false;
      listContentCol = 0;
      continue;
    }
    const marker = thematicBreakMarker(line);
    if (marker) {
      const indent = leadingSpaceColumns(line);
      // A solid dash underline indented into the open list item is a
      // setext heading inside that item, not a rule beside the list.
      const insideList =
        inList &&
        marker === "-" &&
        isSolidRun(line, "-") &&
        listContentCol > 0 &&
        indent >= listContentCol;
      const setext =
        marker === "-" && isSolidRun(line, "-") && setextOpen && !inList;
      if (!setext && !insideList) {
        pushMarkdown(i);
        blocks.push({ type: "rule" });
        mdStart = i + 1;
        setextOpen = false;
        inList = false;
        listContentCol = 0;
        continue;
      }
    }
    if (!line.trim()) {
      setextOpen = false;
      inList = false;
      listContentCol = 0;
      continue;
    }
    if (isListItemLine(line)) {
      inList = true;
      listContentCol = listItemContentColumn(line);
      setextOpen = false;
      continue;
    }
    if (inList) {
      setextOpen = false;
      continue;
    }
    setextOpen = isSetextContentLine(line);
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
 * remark plugin: `~~text~~` becomes a `delete` node (`<del>`).
 * Inline code and fenced code are left alone. A pair may wrap
 * other inline nodes (`~~**bold**~~`). Unclosed tildes stay text.
 */
export function remarkStrikethrough(): (tree: MdastNode) => void {
  return (tree) => {
    if (tree.children) tree.children = rewriteStrikeNodes(tree.children);
  };
}

export function rewriteStrikeNodes(nodes: MdastNode[]): MdastNode[] {
  const prepared = nodes.map(prepareStrikeNode);
  const out: MdastNode[] = [];
  let i = 0;
  while (i < prepared.length) {
    const node = prepared[i]!;
    if (node.type !== "text" || !node.value?.includes("~~")) {
      out.push(node);
      i += 1;
      continue;
    }
    const value = node.value ?? "";
    const open = value.indexOf("~~");
    const close = value.indexOf("~~", open + 2);
    if (close >= 0 && !value.slice(open + 2, close).includes("\n")) {
      if (open > 0) out.push(textNode(value.slice(0, open)));
      const inner = value.slice(open + 2, close);
      if (inner.length > 0) out.push(strikeNode([textNode(inner)]));
      else out.push(textNode(value.slice(open, close + 2)));
      const rest = value.slice(close + 2);
      if (rest) {
        prepared[i] = textNode(rest);
        continue;
      }
      i += 1;
      continue;
    }
    const ahead = findStrikeClose(prepared, i + 1);
    if (!ahead) {
      out.push(node);
      i += 1;
      continue;
    }
    if (open > 0) out.push(textNode(value.slice(0, open)));
    const inner: MdastNode[] = [];
    const lead = value.slice(open + 2);
    if (lead) inner.push(textNode(lead));
    for (let k = i + 1; k < ahead.index; k += 1) inner.push(prepared[k]!);
    if (ahead.before) inner.push(textNode(ahead.before));
    if (strikeText(inner).length > 0) out.push(strikeNode(rewriteStrikeNodes(inner)));
    else out.push(textNode(`${value.slice(open, open + 2)}${ahead.before}~~`));
    if (ahead.after) {
      prepared[ahead.index] = textNode(ahead.after);
      i = ahead.index;
    } else {
      i = ahead.index + 1;
    }
  }
  return out;
}

function prepareStrikeNode(node: MdastNode): MdastNode {
  if (node.children && node.type !== "code" && node.type !== "inlineCode") {
    node.children = rewriteStrikeNodes(node.children);
  }
  return node;
}

function findStrikeClose(
  nodes: MdastNode[],
  start: number,
): { index: number; before: string; after: string } | null {
  for (let k = start; k < nodes.length; k += 1) {
    const node = nodes[k]!;
    if (node.type === "break") return null;
    if (node.type !== "text") continue;
    const value = node.value ?? "";
    const nl = value.indexOf("\n");
    const mark = value.indexOf("~~");
    if (nl >= 0 && (mark < 0 || nl < mark)) return null;
    if (mark >= 0) {
      return {
        index: k,
        before: value.slice(0, mark),
        after: value.slice(mark + 2),
      };
    }
  }
  return null;
}

function strikeText(nodes: MdastNode[]): string {
  return nodes
    .map((node) => (node.type === "text" ? (node.value ?? "") : "x"))
    .join("");
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

function leadingSpaceColumns(line: string): number {
  let columns = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

function isIndentedCode(line: string): boolean {
  if (line.startsWith("\t")) return true;
  return /^ {4,}/.test(line);
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
