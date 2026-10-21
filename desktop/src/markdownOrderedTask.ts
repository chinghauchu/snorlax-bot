// SPDX-License-Identifier: Apache-2.0

/**
 * v1.59: GFM task markers on ordered list items in a completed
 * assistant LEFT `kind=message`.
 *
 * `- [ ]` / `- [x]` / `* [X]` already render as read-only glyphs
 * (v1.32). This cut is the same marker after an ordered marker:
 * `1. [ ] todo`, `2. [x] done`, `9) [X] done`, including a nested
 * `1. [ ]` inside another item. The list item keeps its number.
 * The checkbox is a glyph, not a control. A checked item is muted.
 *
 * The marker is `[ ]`, `[x]`, or `[X]` at the start of the item
 * (up to three spaces), then a space, a tab, or the end of the
 * line. `[x]done` stays the characters. `see [ ] later` stays the
 * characters. A code span that starts the item, and a backslash
 * before `[`, stay literal. A `[x]` later inside a code span stays
 * inside that span.
 *
 * Streaming (`completed: false`) does not run this plugin, so the
 * bubble stays as it does today. Copy controls keep markdown
 * source — this module does not copy. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownOrderedTask.swift`.
 */

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

/** Unchecked marker left in the parsed list item for the glyph pass. */
export const ORDERED_TASK_UNCHECKED_TOKEN = "§§SBK0§§";

/** Checked marker left in the parsed list item for the glyph pass. */
export const ORDERED_TASK_CHECKED_TOKEN = "§§SBK1§§";

const TOKEN_RE = /^§§SBK([01])§§/;

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

/** Never animate, including when Reduce Motion is off. */
export function orderedTaskAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * A GFM task marker at the start of a list item's first paragraph.
 * Null when the brackets are not the item marker: no space after
 * `]`, text before `[`, a leading code span, or an escaped bracket.
 */
export function parseListItemTask(
  text: string,
): { checked: boolean; text: string } | null {
  const nl = text.indexOf("\n");
  const first = nl < 0 ? text : text.slice(0, nl);
  const rest = nl < 0 ? "" : text.slice(nl + 1);
  let i = 0;
  while (i < first.length && i < 3 && first[i] === " ") i += 1;
  if (first[i] !== "[") return null;
  i += 1;
  const mark = first[i];
  if (mark !== " " && mark !== "x" && mark !== "X") return null;
  i += 1;
  if (first[i] !== "]") return null;
  i += 1;
  if (i < first.length && first[i] !== " " && first[i] !== "\t") return null;
  while (first[i] === " " || first[i] === "\t") i += 1;
  const tail = first.slice(i);
  let body = tail;
  if (rest) body = tail ? `${tail}\n${rest}` : rest;
  return { checked: mark !== " ", text: body };
}

/** Drop a leading task token. Null when the string does not start with one. */
export function stripOrderedTaskToken(
  value: string,
): { checked: boolean; rest: string } | null {
  const match = TOKEN_RE.exec(value);
  if (!match?.[0]) return null;
  return { checked: match[1] === "1", rest: value.slice(match[0].length) };
}

/**
 * Replace a leading task marker on each list item with a token.
 * Runs before hard breaks so the marker is still one text node.
 * Fences and code spans never start a paragraph with `[`.
 */
export function remarkOrderedTaskMarkers(): (tree: MdastNode) => void {
  return (tree) => {
    markListItems(tree);
  };
}

function markListItems(node: MdastNode): void {
  if (node.type === "listItem") markListItem(node);
  for (const child of node.children ?? []) markListItems(child);
}

function markListItem(item: MdastNode): void {
  const first = item.children?.[0];
  if (!first || first.type !== "paragraph") return;
  const text = first.children?.[0];
  if (!text || text.type !== "text" || text.value == null) return;
  const parsed = parseListItemTask(text.value);
  if (!parsed) return;
  const nl = text.value.indexOf("\n");
  const firstLine = nl < 0 ? text.value : text.value.slice(0, nl);
  const onFirst = parseListItemTask(firstLine);
  if (!onFirst) return;
  const consumed = firstLine.length - onFirst.text.length;
  const token = parsed.checked
    ? ORDERED_TASK_CHECKED_TOKEN
    : ORDERED_TASK_UNCHECKED_TOKEN;
  text.value = `${token}${text.value.slice(consumed)}`;
}

/**
 * Remove one leading task token from rendered list-item children.
 * The token may sit on a text node or on the first child of a
 * paragraph element. Checked is null when there is no token.
 */
export function peelOrderedTaskChildren(children: ReactNode): {
  checked: boolean | null;
  children: ReactNode;
} {
  const list = Children.toArray(children);
  let index = 0;
  while (index < list.length && isBlankText(list[index])) index += 1;
  if (index >= list.length) return { checked: null, children };
  const peeled = peelNode(list[index]);
  if (!peeled) return { checked: null, children };
  const head = peeled.node === "" || peeled.node == null ? [] : [peeled.node];
  return {
    checked: peeled.checked,
    children: [...list.slice(0, index), ...head, ...list.slice(index + 1)],
  };
}

function isBlankText(node: ReactNode): boolean {
  return typeof node === "string" && node.trim() === "";
}

function peelNode(
  node: ReactNode,
): { checked: boolean; node: ReactNode } | null {
  if (typeof node === "string") {
    const hit = stripOrderedTaskToken(node);
    if (!hit) return null;
    return { checked: hit.checked, node: hit.rest };
  }
  if (!isValidElement(node)) return null;
  const props = node.props as { children?: ReactNode; text?: unknown };
  if (typeof props.text === "string") {
    const hit = stripOrderedTaskToken(props.text);
    if (!hit) return null;
    return {
      checked: hit.checked,
      node: cloneElement(node as ReactElement<{ text: string }>, {
        text: hit.rest,
      }),
    };
  }
  if (props.children == null) return null;
  const inner = peelOrderedTaskChildren(props.children);
  if (inner.checked == null) return null;
  const kids = Children.toArray(inner.children);
  return {
    checked: inner.checked,
    node:
      kids.length > 0
        ? cloneElement(node, {}, ...kids)
        : cloneElement(node, {}, ""),
  };
}

/** Put the glyph at the start of a paragraph wrapper, or in front of the item. */
export function withOrderedTaskGlyph(
  children: ReactNode,
  glyph: ReactNode,
): ReactNode {
  const list = Children.toArray(children);
  let index = 0;
  while (index < list.length && isBlankText(list[index])) index += 1;
  const first = list[index];
  if (isValidElement(first)) {
    const props = first.props as { children?: ReactNode };
    if (props.children != null) {
      const inner = Children.toArray(props.children);
      const replaced = cloneElement(first, {}, glyph, ...inner);
      return [...list.slice(0, index), replaced, ...list.slice(index + 1)];
    }
  }
  return [...list.slice(0, index), glyph, ...list.slice(index)];
}
