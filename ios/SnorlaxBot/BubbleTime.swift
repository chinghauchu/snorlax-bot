// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.65: local time for a chat bubble, from the existing `createdAt`.
/// Today is `h:mm AM`. Any other local day prefixes `MMM d`, plus the
/// year when it is not this year. Nil while the bubble is still streaming.
/// Keep in lockstep with `desktop/src/bubbleTime.ts`.
enum BubbleTime {
    static let fadeMs = 120

    /// Desktop hover fade. Instant when Reduce Motion is on.
    /// iOS uses the system long-press menu (no custom fade).
    static func fadeMs(reduceMotion: Bool) -> Int {
        reduceMotion ? 0 : fadeMs
    }

    /// Local clock label. Nil while that bubble is still streaming.
    static func label(createdAt: Date, now: Date = Date(), streaming: Bool = false) -> String? {
        guard !streaming else { return nil }
        return format(createdAt, now: now)
    }

    /// `h:mm AM`, or `MMM d, h:mm AM` (with year) when not today.
    static func format(_ createdAt: Date, now: Date = Date()) -> String {
        let time = clock(createdAt)
        if Calendar.current.isDate(createdAt, inSameDayAs: now) {
            return time
        }
        return "\(day(createdAt, now: now)), \(time)"
    }

    private static let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    private static func clock(_ date: Date) -> String {
        let cal = Calendar.current
        var hour = cal.component(.hour, from: date)
        let minute = cal.component(.minute, from: date)
        let suffix = hour >= 12 ? "PM" : "AM"
        hour = hour % 12
        if hour == 0 { hour = 12 }
        return "\(hour):" + String(format: "%02d", minute) + " \(suffix)"
    }

    private static func day(_ date: Date, now: Date) -> String {
        let cal = Calendar.current
        let monthIndex = cal.component(.month, from: date) - 1
        let month = months[monthIndex]
        let day = cal.component(.day, from: date)
        let year = cal.component(.year, from: date)
        if year != cal.component(.year, from: now) {
            return "\(month) \(day), \(year)"
        }
        return "\(month) \(day)"
    }
}
