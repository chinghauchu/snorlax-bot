// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

/// v1.25: jump between your sent messages from a hardware keyboard.
/// ⌘⇧↑ / ⌃⇧↑ scrolls to the previous user-RIGHT kind=message in the
/// open chat's loaded transcript. ⌘⇧↓ / ⌃⇧↓ scrolls to the next one.
/// The target is the sent message relative to the current viewport,
/// under the sticky day header. The target bubble gets a brief subtle
/// highlight. Either end stays clamped. A key repeat does not jump
/// again. The chord works from an empty composer and does not move
/// the caret. When the composer has text, the chord stays with the
/// field so the arrows keep selecting text. IME keeps the key. Find,
/// the shortcuts sheet, rename, the lightbox, and any other text field
/// keep the key. Stick-to-bottom, the Jump chip, per-chat reading
/// place, the sticky day header, and collapsed long messages stay.
/// No HTTP. Keep in lockstep with `desktop/src/userMessageJump.ts`.
enum UserMessageJump {
    static let keysLabel = "⌘⇧↑ / ⌘⇧↓"
    static let action = "Previous or next message you sent"
    static let epsilon: CGFloat = 8
    static let highlightSeconds: Double = 1.2
    /// Pinned day line: 12pt top, about 16pt of 12pt type, 4pt bottom.
    static let stickyInset: CGFloat = 32

    enum Direction: Equatable {
        case previous
        case next
    }

    struct Row: Equatable {
        var id: String
        /// Content Y of the row top. Nil when that row is not laid out.
        var top: CGFloat?
    }

    struct ViewLine: Equatable {
        var viewAnchor: CGFloat
        var scrollTop: CGFloat
        var stickyInset: CGFloat
        var maxOffset: CGFloat
        var epsilon: CGFloat
    }

    /// ⌘⇧↑ / ⌃⇧↑ is previous. ⌘⇧↓ / ⌃⇧↓ is next. Not both modifiers,
    /// and not with Option. Shift is required, so ↑ recall, ⌥↑ / ⌥↓,
    /// and ⌘↑ / ⌘↓ stay.
    static func direction(
        up: Bool,
        down: Bool,
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Direction? {
        if option || !shift { return nil }
        if command == control { return nil }
        if up { return .previous }
        if down { return .next }
        return nil
    }

    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The arrows select text once the composer has any characters.
    static func composerOwnsChord(composerFocused: Bool, text: String) -> Bool {
        composerFocused && !text.isEmpty
    }

    /// The composer may take this chord. Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    static func viewLine(
        scrollTop: CGFloat,
        stickyInset: CGFloat,
        maxOffset: CGFloat,
        epsilon: CGFloat = UserMessageJump.epsilon
    ) -> ViewLine {
        let inset = max(0, stickyInset)
        let limit = max(0, maxOffset)
        return ViewLine(
            viewAnchor: scrollTop + inset,
            scrollTop: scrollTop,
            stickyInset: inset,
            maxOffset: limit,
            epsilon: epsilon
        )
    }

    /// Scroll so the row's top sits just under the sticky day header.
    static func scrollOffset(
        targetTop: CGFloat,
        stickyInset: CGFloat,
        maxOffset: CGFloat
    ) -> CGFloat {
        let limit = max(0, maxOffset)
        let raw = targetTop - max(0, stickyInset)
        if raw <= 0 { return 0 }
        if raw >= limit { return limit }
        return raw
    }

    static func highlightDuration(reduceMotion: Bool) -> Double {
        _ = reduceMotion
        return highlightSeconds
    }

    static func highlightAnimates(reduceMotion: Bool) -> Bool {
        !reduceMotion
    }

    /// Previous is the closest sent message above the reading line.
    /// Next is the closest one below it. Either end is nil.
    /// Rows that are not laid out still count when a later laid-out
    /// row shows which side of the line they are on. Transcript order.
    static func pick(
        rows: [Row],
        direction: Direction,
        line: ViewLine
    ) -> String? {
        let list = rows.filter { !$0.id.isEmpty }
        if list.isEmpty { return nil }
        if direction == .previous {
            var lastAbove: String?
            for index in list.indices {
                let row = list[index]
                if row.top == nil {
                    if nextMeasuredIndex(list, start: index + 1) < 0 { break }
                    lastAbove = row.id
                    continue
                }
                if strictlyAbove(row, line: line) {
                    lastAbove = row.id
                    continue
                }
                return lastAbove
            }
            return lastAbove
        }
        var lastSettled = -1
        for index in list.indices {
            let row = list[index]
            if row.top != nil && settled(row, line: line) {
                lastSettled = index
                continue
            }
            if row.top == nil {
                let later = nextMeasuredIndex(list, start: index + 1)
                if later >= 0 && settled(list[later], line: line) { continue }
                if lastSettled >= 0 { return row.id }
                if later >= 0 && !settled(list[later], line: line) { return list[0].id }
                continue
            }
            if lastSettled >= 0 && index > lastSettled + 1 {
                return list[lastSettled + 1].id
            }
            return row.id
        }
        return nil
    }

    private static func nextMeasuredIndex(_ rows: [Row], start: Int) -> Int {
        guard start < rows.count else { return -1 }
        for index in start..<rows.count {
            if rows[index].top != nil { return index }
        }
        return -1
    }

    private static func strictlyAbove(_ row: Row, line: ViewLine) -> Bool {
        guard let top = row.top else { return false }
        return top < line.viewAnchor - line.epsilon
    }

    private static func settled(_ row: Row, line: ViewLine) -> Bool {
        guard let top = row.top else { return false }
        if top <= line.viewAnchor + line.epsilon { return true }
        let commanded = scrollOffset(
            targetTop: top,
            stickyInset: line.stickyInset,
            maxOffset: line.maxOffset
        )
        let clamped = commanded >= line.maxOffset - line.epsilon
        return clamped && line.scrollTop + line.epsilon >= commanded
    }
}
