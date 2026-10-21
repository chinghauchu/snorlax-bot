// SPDX-License-Identifier: Apache-2.0

/**
 * v1.52: CommonMark multi-backtick code spans on a completed
 * assistant LEFT `kind=message`.
 *
 * A code span opens with a run of N backticks and closes at the
 * next run of exactly N. ``code with ` inside`` renders as inline
 * code: the delimiter backticks are not shown, and a backtick
 * inside the span is. A line ending inside the span becomes a
 * space and stays in that bubble. A blank line is a paragraph
 * break, so the span does not cross it. A line of three
 * or more backticks whose info string contains a backtick is not
 * a fence. An unmatched opener stays literal and scanning
 * continues after it. Real fences, indented code, and math stay
 * literal. Streaming is unchanged. Copy keeps markdown source.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownCodeSpan.swift`.
 */

import { fenceRanges, inlineCodeRanges, type Range } from "./math.ts";

export { fenceInfoAllowsOpen } from "./math.ts";

/** Closed inline code spans, using the real fence rule above. */
export function codeSpanRanges(src: string): Range[] {
  return inlineCodeRanges(src, fenceRanges(src));
}

/** True when `offset` sits inside a closed code span. */
export function offsetInsideCodeSpan(src: string, offset: number): boolean {
  return codeSpanRanges(src).some((span) => offset >= span.start && offset < span.end);
}
