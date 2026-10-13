// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v0.67: a muted day line above the first painted transcript row of
/// each local calendar day. Uses the existing `createdAt`. No new HTTP.
/// No animation (Reduce Motion has nothing to shorten).
/// Keep in lockstep with `desktop/src/daySeparator.ts`.
///
/// v0.85: that same line pins to the top of the transcript while its
/// day is on screen. The next day pushes it off. No animation.
/// `groups` is the section each label sticks inside. `pinnedDayLabel`
/// is the pin rule (the group covering the top of the viewport).
/// iOS pinned section headers and desktop CSS sticky follow it.
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

    struct Group: Identifiable {
        var id: String
        /// Nil for a leading run that has no day line yet. Nothing pins.
        var label: String?
        /// Inclusive index in the label list.
        var start: Int
        /// Exclusive index.
        var end: Int
    }

    struct Span {
        var label: String?
        var top: Double
        var bottom: Double
    }

    /// One run per day line. A new group starts at each non-nil label.
    /// Nils stay in the current run (hidden rows and undated rows do not
    /// split a day). A leading run of nils is one group with no label.
    static func groups(labels: [String?], ids: [String] = []) -> [Group] {
        guard !labels.isEmpty else { return [] }
        var out: [Group] = []
        var start = 0
        var label = labels[0]
        for index in 1..<labels.count {
            guard let next = labels[index] else { continue }
            out.append(makeGroup(label: label, start: start, end: index, ids: ids))
            label = next
            start = index
        }
        out.append(makeGroup(label: label, start: start, end: labels.count, ids: ids))
        return out
    }

    /// The label pinned at the top of the transcript.
    /// The group that covers `viewportTop` wins. A group already scrolled
    /// past (`bottom <= viewportTop`) does not. The next group's top
    /// pushes this one off. A covering group with no label pins nothing.
    static func pinnedDayLabel(groups: [Span], viewportTop: Double) -> String? {
        for group in groups {
            if group.bottom <= viewportTop { continue }
            if group.top > viewportTop { break }
            return group.label
        }
        return nil
    }

    private static func makeGroup(
        label: String?,
        start: Int,
        end: Int,
        ids: [String]
    ) -> Group {
        let id: String
        if ids.indices.contains(start), !ids[start].isEmpty {
            id = ids[start]
        } else {
            id = "day-\(start)"
        }
        return Group(id: id, label: label, start: start, end: end)
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
