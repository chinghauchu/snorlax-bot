// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.97: muted section headers in the chat list.
/// Pinned stays the header for the pin group. Unpinned chats in the
/// main roster sit under Chats. A group with no rows does not paint
/// a header. Headers are chrome: they are not rows, so Option+Up/Down
/// still walks pin order then roster order. The Archived list is
/// separate and does not grow a Chats header. No HTTP.
/// Keep in lockstep with `desktop/src/chatSections.ts`.
enum ChatSections {
    static let chatsLabel = "Chats"

    /// A non-positive count is an empty group.
    static func showsHeader(count: Int) -> Bool {
        count > 0
    }

    /// Main-list headers in visible order. Empty groups are omitted.
    /// Archive is not a header here.
    static func labels(pinnedCount: Int, restCount: Int) -> [String] {
        var headers: [String] = []
        if showsHeader(count: pinnedCount) {
            headers.append(ChatPins.groupLabel)
        }
        if showsHeader(count: restCount) {
            headers.append(chatsLabel)
        }
        return headers
    }
}
