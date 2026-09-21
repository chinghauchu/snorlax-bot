// SPDX-License-Identifier: Apache-2.0

import SwiftUI

/// v0.56 compact tool traces. Matches desktop `compactToolTraces.ts`.
/// Within one assistant turn, 2+ consecutive kind=tool lines collapse
/// client-side into one 12pt muted `N tools` line with a small chevron.
/// Default collapsed. Single tool unchanged. Live: first tool paints
/// normally; on the 2nd, swap to collapsed and bump N. kind=widget /
/// approve / connect never fold into the stack. No new HTTP.
enum CompactToolTraces {
    static let collapseAt = 2
    static let font: CGFloat = 12
    static let chevronSize: CGFloat = 10

    struct Item: Equatable {
        var id: String
        var summary: String
        var messageIndex: Int
    }

    struct Stack: Equatable, Identifiable {
        var id: String
        var items: [Item]
        var messageIndexes: [Int]
        var liveIds: [String]
    }

    struct LivePaint: Equatable {
        var header: Stack?
        var lines: [LiveToolTrace]
    }

    static func label(count: Int) -> String {
        "\(count) tools"
    }

    static func shouldCollapse(count: Int) -> Bool {
        count >= collapseAt
    }

    /// kind=widget / approve / connect never fold into the tool stack.
    static func neverFolds(kind: Message.Kind?) -> Bool {
        kind == .widget || kind == .approve || kind == .connect
    }

    static func isFoldableTool(kind: Message.Kind?) -> Bool {
        kind == .tool
    }

    static func stacks(
        messages: [Message],
        liveTraces: [LiveToolTrace],
        liveAt: Int?
    ) -> [Stack] {
        struct Row {
            var id: String
            var kind: Message.Kind?
            var summary: String
            var messageIndex: Int
            var live: Bool
        }
        var rows: [Row] = []
        let insertAt: Int? = {
            guard !liveTraces.isEmpty else { return nil }
            if let liveAt, liveAt >= 0 { return liveAt }
            return messages.count
        }()

        func insertLive() {
            for trace in liveTraces {
                rows.append(
                    Row(
                        id: trace.id,
                        kind: .tool,
                        summary: trace.summary,
                        messageIndex: -1,
                        live: true
                    )
                )
            }
        }

        for (index, message) in messages.enumerated() {
            if insertAt == index { insertLive() }
            rows.append(
                Row(
                    id: message.id,
                    kind: message.kind,
                    summary: message.content,
                    messageIndex: index,
                    live: false
                )
            )
        }
        if insertAt == messages.count { insertLive() }

        var stacks: [Stack] = []
        var i = 0
        while i < rows.count {
            guard isFoldableTool(kind: rows[i].kind) else {
                i += 1
                continue
            }
            var items: [Item] = []
            var messageIndexes: [Int] = []
            var liveIds: [String] = []
            while i < rows.count, isFoldableTool(kind: rows[i].kind) {
                let row = rows[i]
                items.append(
                    Item(id: row.id, summary: row.summary, messageIndex: row.messageIndex)
                )
                if !row.live, row.messageIndex >= 0 {
                    messageIndexes.append(row.messageIndex)
                }
                if row.live { liveIds.append(row.id) }
                i += 1
            }
            stacks.append(
                Stack(
                    id: items[0].id,
                    items: items,
                    messageIndexes: messageIndexes,
                    liveIds: liveIds
                )
            )
        }
        return stacks
    }

    /// Default collapsed when the run is 2+. Single tool: never collapsed chrome.
    static func collapsed(expanded: Set<String>, stackId: String, count: Int) -> Bool {
        guard shouldCollapse(count: count) else { return false }
        return !expanded.contains(stackId)
    }

    static func toggle(expanded: Set<String>, stackId: String) -> Set<String> {
        var next = expanded
        if next.contains(stackId) {
            next.remove(stackId)
        } else {
            next.insert(stackId)
        }
        return next
    }

    static func stack(for index: Int, in stacks: [Stack]) -> Stack? {
        stacks.first { $0.messageIndexes.contains(index) }
    }

    /// Skip subsequent persisted tools in a collapsed 2+ run.
    static func hidePersisted(stack: Stack?, index: Int, collapsed: Bool) -> Bool {
        guard let stack, collapsed, let first = stack.messageIndexes.first else {
            return false
        }
        return index != first
    }

    /// Chevron + `N tools` on the first persisted tool of a 2+ run.
    static func showHeader(stack: Stack?, index: Int) -> Bool {
        guard let stack, shouldCollapse(count: stack.items.count) else { return false }
        return stack.messageIndexes.first == index
    }

    static func livePaint(
        stacks: [Stack],
        liveTraces: [LiveToolTrace],
        expanded: Set<String>
    ) -> LivePaint {
        guard !liveTraces.isEmpty else { return LivePaint(header: nil, lines: []) }
        let liveIds = Set(liveTraces.map(\.id))
        guard let stack = stacks.first(where: { !$0.liveIds.filter(liveIds.contains).isEmpty })
        else {
            return LivePaint(header: nil, lines: liveTraces)
        }
        let collapse = shouldCollapse(count: stack.items.count)
        let isCollapsed = collapse && !expanded.contains(stack.id)
        let mixed = !stack.messageIndexes.isEmpty
        if mixed {
            return LivePaint(header: nil, lines: isCollapsed ? [] : liveTraces)
        }
        if !collapse { return LivePaint(header: nil, lines: liveTraces) }
        return LivePaint(header: stack, lines: isCollapsed ? [] : liveTraces)
    }
}

struct ToolStackHeader: View {
    let count: Int
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 4) {
                Image(systemName: "chevron.right")
                    .font(.system(size: CompactToolTraces.chevronSize, weight: .semibold))
                    .rotationEffect(.degrees(expanded ? 90 : 0))
                Text(CompactToolTraces.label(count: count))
                    .font(.system(size: CompactToolTraces.font))
            }
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(CompactToolTraces.label(count: count))
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
    }
}
