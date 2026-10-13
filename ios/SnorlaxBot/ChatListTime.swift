// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.83: compact relative time beside each chat's last-message preview.
/// Uses that chat's latest message `createdAt` already in memory.
/// Today is now / Nm / Nh. Then Yesterday, the weekday within the past
/// week, then a short date. A light timer re-renders the labels.
/// No new HTTP.
/// Keep in lockstep with `desktop/src/chatListTime.ts`.
enum ChatListTime {
    static let nowLabel = "now"
    static let yesterdayLabel = "Yesterday"
    /// One clock for the whole list. Cheap, and "now" still becomes "1m".
    static let tickSeconds: TimeInterval = 30

    private static let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    private static let weekdays = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday",
    ]

    /// now under a minute (and any future stamp), Nm, Nh on the same local
    /// day, Yesterday, the weekday 2–6 local days ago, otherwise `MMM d`
    /// (with the year when it is not this year). Nil when missing.
    static func label(
        createdAt: Date?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String? {
        guard let createdAt else { return nil }
        let elapsed = now.timeIntervalSince(createdAt)
        let days = calendarDaysBefore(date: createdAt, now: now, calendar: calendar)
        if elapsed < 60 || days < 0 { return nowLabel }
        if days == 0 {
            let minutes = Int(elapsed / 60)
            if minutes < 60 { return "\(minutes)m" }
            let hours = Int(elapsed / 3600)
            return "\(max(hours, 1))h"
        }
        if days == 1 { return yesterdayLabel }
        if (2...6).contains(days) {
            let index = calendar.component(.weekday, from: createdAt) - 1
            if weekdays.indices.contains(index) { return weekdays[index] }
        }
        let monthIndex = calendar.component(.month, from: createdAt) - 1
        let month = months.indices.contains(monthIndex) ? months[monthIndex] : "Jan"
        let day = calendar.component(.day, from: createdAt)
        let year = calendar.component(.year, from: createdAt)
        if year != calendar.component(.year, from: now) {
            return "\(month) \(day), \(year)"
        }
        return "\(month) \(day)"
    }

    /// Same local-day count as `DaySeparator`. Positive when `date` is before `now`.
    private static func calendarDaysBefore(
        date: Date,
        now: Date,
        calendar: Calendar
    ) -> Int {
        let startDate = calendar.startOfDay(for: date)
        let startNow = calendar.startOfDay(for: now)
        return calendar.dateComponents([.day], from: startDate, to: startNow).day ?? 0
    }
}
