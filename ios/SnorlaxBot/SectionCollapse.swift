// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.43: collapse a long assistant heading section.
/// A completed ATX heading of level 1–3 whose body is longer than 14
/// lines shows the heading and a muted Show more. Tap expands that
/// section and the control becomes Show less. Lines under the heading
/// hide, including lines that render in later blank-line bubbles, until
/// the next heading of the same or higher level. Each section collapses
/// on its own. The choice is not saved. Streaming stays plain text.
/// Copy and Save still use the full section. An active find hit inside
/// the section keeps it open. The control is not focusable. No
/// animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/sectionCollapse.ts`.
enum SectionCollapse {
    static let showMore = "Show more"
    static let showLess = "Show less"
    static let showMoreAria = "Show more section"
    static let showLessAria = "Show less section"

    /// Body lines under the heading. The heading line does not count.
    /// One more line than this collapses. Blank lines inside the section count.
    static let bodyLines = 14

    struct Span: Equatable {
        var start: Int
        var end: Int
    }

    struct Plan: Equatable {
        /// Bubble indexes that are not painted.
        var hidden: Set<Int>
        /// Section offsets whose body is hidden.
        var collapsed: Set<Int>
        /// Section offsets that show Show more or Show less.
        var toggles: Set<Int>
        /// Section offsets skipped because a collapsed ancestor contains them.
        var hiddenPieces: Set<Int>
        /// Offsets the reader opened. Not a server field.
        var expanded: Set<Int>
    }

    static func bodyLineCount(source: String, headingLine: String) -> Int {
        let lines = source.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        if lines.isEmpty || lines[0] != headingLine { return 0 }
        return lines.count - 1
    }

    static func overflows(_ lineCount: Int, limit: Int = bodyLines) -> Bool {
        lineCount > limit
    }

    /// The lines under the heading, in document offsets. Nil when the section is only the heading.
    static func bodyRange(_ section: HeadingSection.Section) -> Span? {
        if bodyLineCount(source: section.source, headingLine: section.headingLine) <= 0 { return nil }
        let start = section.offset + section.headingLine.count + 1
        let end = section.offset + section.source.count
        if start >= end { return nil }
        return Span(start: start, end: end)
    }

    static func label(expanded: Bool) -> String {
        expanded ? showLess : showMore
    }

    static func accessibilityLabel(expanded: Bool) -> String {
        expanded ? showLessAria : showMoreAria
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Bubble index encoded after the message id. Desktop uses `:`, iOS uses `#`.
    static func findBubble(messageId: String, rowId: String, separator: Character) -> Int? {
        if messageId.isEmpty || rowId.isEmpty { return nil }
        let prefix = "\(messageId)\(separator)"
        guard rowId.hasPrefix(prefix) else { return nil }
        let rest = String(rowId.dropFirst(prefix.count))
        if rest.isEmpty || rest.contains(where: { !$0.isNumber }) { return nil }
        return Int(rest)
    }

    /// The part of this bubble under the heading. Empty when the bubble is only the heading.
    static func tail(bubbleText: String, headingLine: String) -> String {
        let prefix = headingLine + "\n"
        guard bubbleText.hasPrefix(prefix) else { return "" }
        return String(bubbleText.dropFirst(prefix.count))
    }

    /// Text to paint for one heading piece. A collapsed section keeps the heading line.
    static func visibleText(bubbleText: String, headingLine: String, collapsed: Bool) -> String {
        if !collapsed { return bubbleText }
        if bubbleText == headingLine || bubbleText.hasPrefix(headingLine + "\n") {
            return headingLine
        }
        return bubbleText
    }

    /// A heading that sits in a collapsed ancestor's body is not painted.
    static func pieceHidden(
        offset: Int,
        sections: [HeadingSection.Section],
        collapsed: Set<Int>
    ) -> Bool {
        for parent in sections {
            if !collapsed.contains(parent.offset) || parent.offset == offset { continue }
            guard let body = bodyRange(parent) else { continue }
            if offset >= body.start && offset < body.end { return true }
        }
        return false
    }

    /// Last bubble that is still painted. -1 when every bubble is hidden.
    static func lastPaintedBubble(count: Int, hidden: Set<Int>) -> Int {
        if count <= 0 { return -1 }
        var index = count - 1
        while index >= 0 {
            if !hidden.contains(index) { return index }
            index -= 1
        }
        return -1
    }

    /// The active find hit lies in this section's body, so the body stays painted.
    static func findKeepsOpen(
        section: HeadingSection.Section,
        bubbles: [String],
        spans: [Span],
        activeBubble: Int?,
        activeStart: Int?
    ) -> Bool {
        guard let body = bodyRange(section), let activeBubble else { return false }
        guard activeBubble >= 0, activeBubble < spans.count else { return false }
        let span = spans[activeBubble]
        if span.start < 0 { return false }
        if span.start >= body.start && span.end <= body.end { return true }
        guard activeBubble < bubbles.count else { return false }
        let bubble = bubbles[activeBubble]
        guard let start = activeStart, start >= 0, start < bubble.count else { return false }
        let at = span.start + start
        return at >= body.start && at < body.end
    }

    static func plan(
        document: String,
        bubbles: [String],
        completed: Bool,
        expanded: Set<Int>,
        activeBubble: Int?,
        activeStart: Int?
    ) -> Plan {
        let empty = Plan(
            hidden: [],
            collapsed: [],
            toggles: [],
            hiddenPieces: [],
            expanded: expanded
        )
        if !completed || document.isEmpty || bubbles.isEmpty { return empty }
        let sections = HeadingSection.split(document, completed: true)
        if sections.isEmpty { return empty }
        let rawSpans = HeadingSection.spans(document: document, bubbles: bubbles)
        let spans = rawSpans.map { Span(start: $0.start, end: $0.end) }
        var collapsed = Set<Int>()
        var toggles = Set<Int>()
        for section in sections {
            let lines = bodyLineCount(source: section.source, headingLine: section.headingLine)
            if !overflows(lines) { continue }
            let findOpen = findKeepsOpen(
                section: section,
                bubbles: bubbles,
                spans: spans,
                activeBubble: activeBubble,
                activeStart: activeStart
            )
            if !findOpen { toggles.insert(section.offset) }
            if !expanded.contains(section.offset) && !findOpen {
                collapsed.insert(section.offset)
            }
        }
        var hidden = Set<Int>()
        for (index, span) in spans.enumerated() {
            if span.start < 0 { continue }
            for section in sections {
                if !collapsed.contains(section.offset) { continue }
                guard let body = bodyRange(section) else { continue }
                if span.start >= body.start && span.end <= body.end {
                    hidden.insert(index)
                    break
                }
            }
        }
        var hiddenPieces = Set<Int>()
        for section in sections {
            if pieceHidden(offset: section.offset, sections: sections, collapsed: collapsed) {
                hiddenPieces.insert(section.offset)
            }
        }
        return Plan(
            hidden: hidden,
            collapsed: collapsed,
            toggles: toggles,
            hiddenPieces: hiddenPieces,
            expanded: expanded
        )
    }
}
