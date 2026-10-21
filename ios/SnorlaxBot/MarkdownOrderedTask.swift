// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.59: GFM task markers on ordered list items in a completed
/// assistant LEFT `kind=message`.
///
/// `- [ ]` / `- [x]` / `* [X]` already render as read-only glyphs
/// (v1.32). This cut is the same marker after an ordered marker:
/// `1. [ ] todo`, `2. [x] done`, `9) [X] done`, including a nested
/// `1. [ ]` inside another item. The list item keeps its number.
/// The checkbox is a glyph, not a control. A checked item is muted.
///
/// The marker is `[ ]`, `[x]`, or `[X]` at the start of the item
/// (up to three spaces), then a space, a tab, or the end of the
/// line. `[x]done` stays the characters. `see [ ] later` stays the
/// characters. A code span that starts the item, and a backslash
/// before `[`, stay literal. A `[x]` later inside a code span stays
/// inside that span.
///
/// Streaming (`completed: false`) does not draw list rows, so the
/// bubble stays as it does today. Copy controls keep markdown source.
/// This type does not write the pasteboard. No animation.
/// No new HTTP.
/// Keep in lockstep with `desktop/src/markdownOrderedTask.ts`.
enum MarkdownOrderedTask {
    struct ParsedItem: Equatable {
        var checked: Bool
        var text: String
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// A GFM task marker at the start of a list item. Nil when the
    /// brackets are not the item marker.
    static func parseItem(_ text: String) -> ParsedItem? {
        let nl = text.firstIndex(of: "\n")
        let first = nl.map { String(text[..<$0]) } ?? text
        let rest = nl.map { String(text[text.index(after: $0)...]) } ?? ""
        var index = first.startIndex
        var spaces = 0
        while index < first.endIndex, spaces < 3, first[index] == " " {
            index = first.index(after: index)
            spaces += 1
        }
        guard index < first.endIndex, first[index] == "[" else { return nil }
        index = first.index(after: index)
        guard index < first.endIndex else { return nil }
        let mark = first[index]
        guard mark == " " || mark == "x" || mark == "X" else { return nil }
        index = first.index(after: index)
        guard index < first.endIndex, first[index] == "]" else { return nil }
        index = first.index(after: index)
        if index < first.endIndex, first[index] != " " && first[index] != "\t" {
            return nil
        }
        while index < first.endIndex, first[index] == " " || first[index] == "\t" {
            index = first.index(after: index)
        }
        let tail = String(first[index...])
        let body: String
        if rest.isEmpty {
            body = tail
        } else if tail.isEmpty {
            body = rest
        } else {
            body = tail + "\n" + rest
        }
        return ParsedItem(checked: mark != " ", text: body)
    }
}
