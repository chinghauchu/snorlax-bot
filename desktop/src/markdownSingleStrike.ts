// SPDX-License-Identifier: Apache-2.0

/**
 * v1.50 promoted `~text~` to `~~text~~` and v1.70 stashed every
 * other single tilde. v1.84 retires that rewrite.
 *
 * cmark-gfm strikes a flanking run of one tilde the same way it
 * strikes a run of two, and the two lengths have to match.
 * Rewriting `~text~` into `~~text~~` before the parse changed the
 * characters flanking rules look at (`a~.b~c` became `a~~.b~~c`)
 * and hid matches the extension does make (`~foo~~bar~`,
 * `This ~is ~ legit~`, `~foo` then a newline then `bar~`).
 * Desktop `remarkStrikethrough` now applies that rule. iOS full
 * markdown already does. This function stays in the pipeline so
 * the call site is unchanged, and it returns the text unchanged.
 *
 * A hard break still ends a pair inside the strikethrough pass
 * (v1.41). Streaming (`completed: false`) is unchanged. Copy
 * controls keep markdown source. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownSingleStrike.swift`.
 */

/**
 * v1.84: no rewrite. `completed` is part of the call-site contract.
 */
export function promoteSingleTilde(text: string, completed = true): string {
  if (!completed) return text;
  return text;
}
