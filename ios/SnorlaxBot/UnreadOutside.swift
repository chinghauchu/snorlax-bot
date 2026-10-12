// SPDX-License-Identifier: Apache-2.0

import Foundation
import UserNotifications

/// v0.77 unread reply count outside the chat list.
/// The number is how many chats carry the v0.70 unread dot.
/// Channel handoff unread does not count. No new storage. No HTTP.
/// The chat list title always shows it. The app icon badge is set
/// only when badge permission is already granted. Asking on first
/// launch would show a blocking prompt, and provisional authorization
/// does not enable the badge, so this type never asks for permission.
/// Keep in lockstep with `desktop/src/unreadOutside.ts`.
enum UnreadOutside {
    static let appName = "Snorlax-Bot"

    static func count(_ ids: Set<String>) -> Int {
        ids.reduce(0) { partial, id in id.isEmpty ? partial : partial + 1 }
    }

    /// Plain name when nothing is unread.
    static func title(count: Int) -> String {
        guard count > 0 else { return appName }
        return "(\(count)) \(appName)"
    }

    /// Nil clears the icon badge.
    static func badgeNumber(count: Int) -> Int? {
        count > 0 ? count : nil
    }

    /// Already-granted badge permission. Not-determined would prompt.
    static func iconBadgeAllowed(authorized: Bool, badgeEnabled: Bool) -> Bool {
        authorized && badgeEnabled
    }

    /// Sets or clears the icon badge when permission is already on.
    /// Returns without touching the badge when a prompt would be required.
    @MainActor
    static func applyIconBadge(count: Int) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let allowed = iconBadgeAllowed(
            authorized: settings.authorizationStatus == .authorized,
            badgeEnabled: settings.badgeSetting == .enabled
        )
        guard allowed else { return }
        let number = badgeNumber(count: count) ?? 0
        try? await UNUserNotificationCenter.current().setBadgeCount(number)
    }
}
