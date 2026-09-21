// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.52: 12pt muted blinking caret at the end of the mid-stream LEFT
/// growing bubble, after the first assistant token until complete / Stop.
/// Never with waiting ···. Not on tool / widget / approve / connect /
/// user-right.
enum StreamingCaretChrome {
    /// Show the caret after the first token while this LEFT `kind=message`
    /// is still in flight. Hide on complete / Stop. Mutually exclusive
    /// with waiting ··· (`hasFirstToken`).
    static func shouldShow(
        busy: Bool,
        completed: Bool,
        hasFirstToken: Bool,
        isUser: Bool,
        isKindMessage: Bool
    ) -> Bool {
        busy && !completed && hasFirstToken && !isUser && isKindMessage
    }
}

struct StreamingCaretView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                bar
            } else {
                TimelineView(.animation(minimumInterval: 0.5, paused: false)) { context in
                    bar.opacity(Self.blink(at: context.date))
                }
            }
        }
        .accessibilityHidden(true)
    }

    private var bar: some View {
        RoundedRectangle(cornerRadius: 0.5, style: .continuous)
            .fill(Color.secondary)
            .frame(width: 1.5, height: 12)
    }

    /// 1s step blink — Reduce Motion skips this path.
    private static func blink(at date: Date) -> Double {
        let phase = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1)
        return phase < 0.5 ? 1 : 0
    }
}
