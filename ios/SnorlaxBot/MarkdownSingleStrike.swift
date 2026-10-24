// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.50 promoted `~text~` to `~~text~~` and v1.70 stashed every
/// other single tilde. v1.84 retires that rewrite.
///
/// cmark-gfm strikes a flanking run of one tilde the same way it
/// strikes a run of two, and the two lengths have to match.
/// Rewriting `~text~` into `~~text~~` before the parse changed the
/// characters flanking rules look at (`a~.b~c` became `a~~.b~~c`)
/// and hid matches the extension does make (`~foo~~bar~`,
/// `This ~is ~ legit~`, `~foo` then a newline then `bar~`).
/// iOS full markdown (AttributedString `.full`, cmark-gfm
/// strikethrough) already applies left/right flanking, equal run
/// lengths, intraword tildes, and soft line breaks. Desktop
/// `remarkStrikethrough` does the same pass. This function stays
/// in the pipeline so the call site is unchanged, and it returns
/// the text unchanged.
///
/// A hard break still ends a pair on desktop (v1.41). Streaming
/// (`completed: false`) returns the text unchanged. Copy keeps
/// markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownSingleStrike.ts`.
enum MarkdownSingleStrike {
    /// `completed: false` returns `text`. v1.84 returns `text` either way.
    static func promote(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty || !text.contains("~") { return text }
        return text
    }
}
