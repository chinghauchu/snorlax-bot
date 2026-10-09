// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v0.67: a muted day line above the first painted transcript row of
/// each local calendar day. Uses the existing `createdAt`. No new HTTP.
/// No animation (Reduce Motion has nothing to shorten).
/// Keep in lockstep with `desktop/src/daySeparator.ts`.
enum DaySeparator {
    static let todayLabel = "Today"
    static let yesterdayLabel = "Yesterday"

    struct Row {
        var createdAt: Date?
        /// Collapsed tool lines are not painted, so they do not start a day.
        var hidden: Bool
    }

    private static let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    private static let weekdays = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday",
    ]

    /// Today, Yesterday, the weekday when it is 2–6 local days ago,
    /// otherwise `MMM d` (with the year when it is not this year).
    static func label(
        createdAt: Date?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String? {
        guard let createdAt else { return nil }
        let days = calendarDaysBefore(date: createdAt, now: now, calendar: calendar)
        if days == 0 { return todayLabel }
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

    /// One label per input row. The first painted row of each local day
    /// gets the label. Hidden rows stay nil and do not move the day boundary.
    static func labels(
        rows: [Row],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [String?] {
        var out: [String?] = []
        out.reserveCapacity(rows.count)
        var prevKey: String?
        var seenDated = false
        for row in rows {
            if row.hidden {
                out.append(nil)
                continue
            }
            guard let createdAt = row.createdAt else {
                out.append(nil)
                continue
            }
            let key = dayKey(createdAt, calendar: calendar)
            if !seenDated || key != prevKey {
                out.append(label(createdAt: createdAt, now: now, calendar: calendar))
                seenDated = true
                prevKey = key
            } else {
                out.append(nil)
            }
        }
        return out
    }

    private static func dayKey(_ date: Date, calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(parts.year ?? 0)-\(parts.month ?? 0)-\(parts.day ?? 0)"
    }

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
