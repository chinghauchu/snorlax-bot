// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.44: a Contents outline on a finished long assistant reply.
/// Three or more ATX headings of level 1–3 show a muted Contents list
/// above the first bubble. Each row is that heading. Tap scrolls the
/// heading into view. A heading hidden under a folded ancestor opens
/// that ancestor first. A heading inside a clamped bubble opens that
/// bubble. Two headings stay plain. `####`, setext, and a heading
/// marker inside a fence, list, quote, math block, or HTML block stay
/// out. Streaming stays plain text. A user message stays plain. The
/// choice is not saved. Copy still copies the reply. The control is
/// not focusable. No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/replyContents.ts`.
enum ReplyContents {
    static let label = "Contents"
    static let goToEmpty = "Go to heading"
    static let minimum = 3
    static let indentStep: CGFloat = 12
    /// The heading marker lands in the middle of the transcript.
    static let scrollAnchor = UnitPoint.center

    struct Entry: Equatable {
        var level: Int
        var title: String
        var offset: Int
    }

    static func entries(_ text: String, completed: Bool) -> [Entry] {
        if text.isEmpty || !completed { return [] }
        let sections = HeadingSection.split(text, completed: true)
        if sections.count < minimum { return [] }
        return sections.map { section in
            Entry(
                level: section.level,
                title: title(from: section.headingLine),
                offset: section.offset
            )
        }
    }

    static func shows(count: Int, minimum: Int = ReplyContents.minimum) -> Bool {
        count >= minimum
    }

    /// Display text of one ATX heading line. Closing hashes come off.
    static func title(from headingLine: String) -> String {
        var columns = 0
        var index = headingLine.startIndex
        while index < headingLine.endIndex && columns <= 3 {
            let ch = headingLine[index]
            if ch == " " {
                columns += 1
                index = headingLine.index(after: index)
                continue
            }
            if ch == "\t" {
                columns += 4 - (columns % 4)
                index = headingLine.index(after: index)
                continue
            }
            break
        }
        while index < headingLine.endIndex && headingLine[index] == "#" {
            index = headingLine.index(after: index)
        }
        if index < headingLine.endIndex {
            let ch = headingLine[index]
            if ch == " " || ch == "\t" {
                index = headingLine.index(after: index)
            }
        }
        var text = trimEdge(String(headingLine[index...]))
        if let range = text.range(of: #"[ \t]+#+$"#, options: .regularExpression) {
            text = trimEdge(String(text[..<range.lowerBound]))
        }
        return text
    }

    static func indent(_ level: Int) -> CGFloat {
        if level <= 1 { return 0 }
        return CGFloat(level - 1) * indentStep
    }

    static func goToLabel(_ title: String) -> String {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return goToEmpty }
        return "Go to \(name)"
    }

    static func anchor(messageId: String, offset: Int) -> String {
        "contents:\(messageId):\(offset)"
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Collapsed ancestors whose body contains this heading.
    /// The heading's own section is not opened.
    static func ancestorsToOpen(
        sections: [HeadingSection.Section],
        offset: Int,
        collapsed: Set<Int>
    ) -> [Int] {
        if sections.isEmpty || collapsed.isEmpty { return [] }
        var open: [Int] = []
        for parent in sections {
            if parent.offset == offset || !collapsed.contains(parent.offset) { continue }
            guard let body = SectionCollapse.bodyRange(parent) else { continue }
            if offset >= body.start && offset < body.end {
                open.append(parent.offset)
            }
        }
        return open
    }

    static func bubbleIndex(_ byBubble: [[HeadingSection.Section]], offset: Int) -> Int? {
        for (index, sections) in byBubble.enumerated() {
            if sections.contains(where: { $0.offset == offset }) { return index }
        }
        return nil
    }

    private static func trimEdge(_ text: String) -> String {
        var start = text.startIndex
        var end = text.endIndex
        while start < end {
            let ch = text[start]
            if ch != " " && ch != "\t" { break }
            start = text.index(after: start)
        }
        while end > start {
            let prev = text.index(before: end)
            let ch = text[prev]
            if ch != " " && ch != "\t" { break }
            end = prev
        }
        return String(text[start..<end])
    }
}

/// Scroll a heading marker. The transcript owns the real scroller.
struct ReplyContentsScroll {
    var jump: (String) -> Void

    func scroll(_ anchor: String) {
        if anchor.isEmpty { return }
        jump(anchor)
    }
}

private struct ReplyContentsScrollKey: EnvironmentKey {
    static let defaultValue = ReplyContentsScroll { _ in }
}

extension EnvironmentValues {
    var replyContentsScroll: ReplyContentsScroll {
        get { self[ReplyContentsScrollKey.self] }
        set { self[ReplyContentsScrollKey.self] = newValue }
    }
}

/// Contents above the first bubble. Rows are not focusable.
struct ReplyContentsList: View {
    var entries: [ReplyContents.Entry]
    var onJump: (ReplyContents.Entry) -> Void

    var body: some View {
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(ReplyContents.label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)
                ForEach(entries, id: \.offset) { entry in
                    Button {
                        onJump(entry)
                    } label: {
                        Text(entry.title)
                            .font(.system(size: 13))
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, ReplyContents.indent(entry.level))
                    }
                    .buttonStyle(.plain)
                    .focusable(false)
                    .accessibilityLabel(ReplyContents.goToLabel(entry.title))
                }
            }
            .padding(.bottom, 6)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(ReplyContents.label)
        }
    }
}
