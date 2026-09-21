// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.47 stick-to-bottom while streaming. Matches desktop `stickToBottom.ts`.
enum StickToBottom {
    static let nearBottom: CGFloat = 64
    static let jumpLabel = "Jump to latest"
    /// v0.63: Jump chip appear/dismiss opacity fade. Instant under Reduce Motion.
    static let jumpFadeMs: Double = 120
    static var jumpFadeSeconds: Double { jumpFadeMs / 1000 }

    struct JumpChipPaint: Equatable {
        var mounted: Bool
        var shown: Bool

        static let hidden = JumpChipPaint(mounted: false, shown: false)
    }

    static func jumpChipFadeSeconds(reduceMotion: Bool) -> Double {
        reduceMotion ? 0 : jumpFadeSeconds
    }

    static func jumpChipAnimation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: jumpFadeSeconds)
    }

    static func jumpChipAppear(reduceMotion: Bool) -> JumpChipPaint {
        JumpChipPaint(mounted: true, shown: reduceMotion)
    }

    static func jumpChipShown() -> JumpChipPaint {
        JumpChipPaint(mounted: true, shown: true)
    }

    static func jumpChipDismiss(reduceMotion: Bool) -> JumpChipPaint {
        reduceMotion ? .hidden : JumpChipPaint(mounted: true, shown: false)
    }

    struct State: Equatable {
        var armed: Bool
        var showJump: Bool

        static let armed = State(armed: true, showJump: false)
    }

    static func distanceFromBottom(
        contentHeight: CGFloat,
        containerHeight: CGFloat,
        offsetY: CGFloat
    ) -> CGFloat {
        contentHeight - containerHeight - offsetY
    }

    static func isNearBottom(
        contentHeight: CGFloat,
        containerHeight: CGFloat,
        offsetY: CGFloat,
        threshold: CGFloat = nearBottom
    ) -> Bool {
        distanceFromBottom(
            contentHeight: contentHeight,
            containerHeight: containerHeight,
            offsetY: offsetY
        ) <= threshold
    }

    static func shouldFollow(_ state: State) -> Bool {
        state.armed
    }

    static func onUserScroll(state: State, nearBottom: Bool) -> State {
        if nearBottom { return .armed }
        var next = state
        next.armed = false
        return next
    }

    static func onSendOrRegenerate() -> State { .armed }

    /// Snap, re-arm, dismiss chip. v0.62: callers then focus the composer.
    static func onJumpToLatest() -> State { .armed }

    static func isAssistantBubble(_ message: Message) -> Bool {
        !message.isFromUser
            && message.isKindMessage
            && !message.isToolLine
            && !message.isWidget
            && !message.isConnect
            && !message.isApprove
            && !message.isHandoffRoot
    }

    static func signature(messages: [Message]) -> String {
        guard let last = messages.last(where: isAssistantBubble) else { return "" }
        return "\(last.id):\(last.content.count)"
    }

    static func onAssistantActivity(state: State, prev: String, next: String) -> State {
        if !state.armed, !next.isEmpty, next != prev {
            var updated = state
            updated.showJump = true
            return updated
        }
        return state
    }

    /// v0.60: hardware Esc activates Jump when the chip is visible
    /// and no assistant turn is in flight. Same skips as v0.53
    /// (IME composing, pending widget / approve / connect). While
    /// generating, Esc=Stop wins — this returns false so Stop stays first.
    static func escapeJumps(
        showJump: Bool,
        busy: Bool,
        composing: Bool,
        pendingWidget: Bool,
        pendingApprove: Bool,
        pendingConnect: Bool
    ) -> Bool {
        showJump
            && !busy
            && !composing
            && !pendingWidget
            && !pendingApprove
            && !pendingConnect
    }
}
