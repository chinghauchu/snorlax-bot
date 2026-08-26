// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// LEFT thinking chrome while a turn is in flight.
enum ThinkingChrome {
    static let label = "Thinking"

    /// Show the flowing LEFT thinking line only while this turn is busy and
    /// neither streamed assistant text nor a tool line has started.
    static func shouldShow(busy: Bool, hasLiveAssistant: Bool, hasLiveTool: Bool) -> Bool {
        busy && !hasLiveAssistant && !hasLiveTool
    }
}

struct ThinkingLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                Text(ThinkingChrome.label)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                    let cycle = context.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: 1.4) / 1.4
                    // Secondary fill is the guaranteed paint; gradient is overlay-only.
                    Text(ThinkingChrome.label)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .overlay {
                            Text(ThinkingChrome.label)
                                .font(.system(size: 12))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [
                                            Color.secondary,
                                            Color.primary.opacity(0.72),
                                            Color.secondary,
                                        ],
                                        startPoint: UnitPoint(x: -0.45 + cycle * 1.9, y: 0.5),
                                        endPoint: UnitPoint(x: 0.15 + cycle * 1.9, y: 0.5)
                                    )
                                )
                        }
                }
            }
        }
        .accessibilityLabel(ThinkingChrome.label)
    }
}
