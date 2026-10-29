// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.16: collapse a very long user message.
/// A settled user-RIGHT kind=message taller than about 14 lines shows
/// the first chunk and Show more. Tap expands that bubble and the
/// control becomes Show less. An in-flight optimistic send stays open.
/// A failed send is settled and can collapse. Each bubble collapses
/// on its own. The 14-line measure, labels, Reduce Motion, and the
/// active-find unclamp stay in LongMessageCollapse. No new HTTP.
/// Keep in lockstep with `desktop/src/userLongMessage.ts`.
enum UserLongMessage {
    /// The bubble may collapse only after it has settled.
    /// An in-flight optimistic send stays fully open.
    static func settled(
        fromUser: Bool,
        kindMessage: Bool,
        hasText: Bool,
        pending: Bool
    ) -> Bool {
        fromUser && kindMessage && hasText && !pending
    }
}

/// One user bubble. `settled` is LongMessageBody's completed flag, so
/// a send still in flight stays open and an active find match stays
/// fully visible. The control does not take composer focus.
struct UserMessageClamp<Content: View>: View {
    var settled: Bool
    var text: String
    var activeFind: Bool
    @ViewBuilder var content: () -> Content

    var body: some View {
        LongMessageBody(
            completed: settled,
            text: text,
            activeFind: activeFind
        ) {
            content()
        }
    }
}
