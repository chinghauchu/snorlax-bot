// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.47 stick-to-bottom while streaming. Matches desktop `stickToBottom.ts`.
enum StickToBottom {
    static let nearBottom: CGFloat = 64
    static let jumpLabel = "Jump to latest"

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
}
