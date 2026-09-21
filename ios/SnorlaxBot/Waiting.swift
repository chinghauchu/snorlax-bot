// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// LEFT waiting ··· chrome until the first assistant token/content.
enum WaitingChrome {
    static let word = "waiting"
    static let dot = "·"
    static let label = "waiting ···"

    /// Show waiting ··· after Send while this turn is busy and neither
    /// streamed assistant text nor a tool line has started.
    static func shouldShow(busy: Bool, hasLiveAssistant: Bool, hasLiveTool: Bool) -> Bool {
        busy && !hasLiveAssistant && !hasLiveTool
    }
}

struct WaitingLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(WaitingChrome.word)
            if reduceMotion {
                Text("\(WaitingChrome.dot)\(WaitingChrome.dot)\(WaitingChrome.dot)")
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

    /// Sequential pulse — Grok Bot waiting ··· feel.
    private static func dotOpacity(t: TimeInterval, index: Int) -> Double {
        let cycle = 1.2
        let phase = (t.truncatingRemainder(dividingBy: cycle) - Double(index) * 0.2) / cycle
        let p = phase.truncatingRemainder(dividingBy: 1)
        let wrapped = p < 0 ? p + 1 : p
        // Bright around 40% of the cycle (matches desktop waiting-dot keyframes).
        if wrapped > 0.25 && wrapped < 0.55 {
            return 1
        }
        return 0.35
    }
}
