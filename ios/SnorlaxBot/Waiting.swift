// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// LEFT 12pt muted pulsing ··· until the first assistant token.
enum WaitingChrome {
    static let dot = "·"
    static let label = "···"

    /// Show pulsing ··· after Send while busy, until the first token,
    /// a tool line, Stop, error, or empty reply.
    static func shouldShow(
        busy: Bool,
        hasFirstToken: Bool,
        hasLiveTool: Bool,
        hasError: Bool = false
    ) -> Bool {
        busy && !hasFirstToken && !hasLiveTool && !hasError
    }

    static func hasToken(content: String, attachmentCount: Int) -> Bool {
        !content.isEmpty || attachmentCount > 0
    }

    static func isEmptyAssistantReply(
        isUser: Bool,
        isKindMessage: Bool,
        content: String,
        attachmentCount: Int
    ) -> Bool {
        guard !isUser, isKindMessage else { return false }
        return !hasToken(content: content, attachmentCount: attachmentCount)
    }
}

struct WaitingLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                Text(WaitingChrome.label)
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    HStack(spacing: 0) {
                        ForEach(0 ..< 3, id: \.self) { index in
                            Text(WaitingChrome.dot)
                                .opacity(Self.dotOpacity(t: t, index: index))
                        }
                    }
                }
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(.secondary)
        .accessibilityLabel(WaitingChrome.label)
    }

    /// Sequential pulse — Grok Bot ··· feel.
    private static func dotOpacity(t: TimeInterval, index: Int) -> Double {
        let cycle = 1.2
        let phase = (t.truncatingRemainder(dividingBy: cycle) - Double(index) * 0.2) / cycle
        let p = phase.truncatingRemainder(dividingBy: 1)
        let wrapped = p < 0 ? p + 1 : p
        if wrapped > 0.25 && wrapped < 0.55 {
            return 1
        }
        return 0.35
    }
}
