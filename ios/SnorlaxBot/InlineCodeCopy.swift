// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v2.28: Copy on a completed assistant inline code span.
/// Desktop shows a hover Copy. iOS offers Copy code on the edit menu
/// when the selection lies inside one span, and copies that whole span
/// (no backticks), then shows Copied for 1.5s. A code fence keeps its
/// own Copy. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/inlineCodeCopy.ts`.
enum InlineCodeCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let menuLabel = "Copy code"
    static let copyAria = "Copy inline code"
    static let copiedAria = "Copied"
    static let mark = "1"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000
    static let copiedNotification = Notification.Name("snorlax.inlineCodeCopied")

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Span text only. No backtick delimiters. Interior whitespace stays.
    static func clipboardText(_ text: String) -> String {
        text
    }

    /// The menu already wrote the pasteboard. Tell the transcript.
    static func noteCopied() {
        NotificationCenter.default.post(name: copiedNotification, object: nil)
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    static func isMark(_ value: Any?) -> Bool {
        guard let text = value as? String else { return false }
        return text == mark
    }

    /// UTF-16 ranges of inline code. A fence is not one of these.
    /// Presentation intent counts before a round trip drops it. The
    /// mark counts after that. Adjacent runs become one span.
    static func ranges(in text: AttributedString) -> [NSRange] {
        var spans: [NSRange] = []
        for run in text.runs {
            let marked = run.snorlaxInlineCode == mark
            let coded = run.inlinePresentationIntent?.contains(.code) == true
            guard marked || coded else { continue }
            let slice = String(text.characters[run.range])
            if slice.isEmpty { continue }
            let prefix = String(text.characters[text.startIndex..<run.range.lowerBound])
            let range = NSRange(
                location: (prefix as NSString).length,
                length: (slice as NSString).length
            )
            if range.length > 0 { spans.append(range) }
        }
        return merge(spans)
    }

    /// Put the mark back after a bridge that drops custom attributes.
    /// Ranges are UTF-16. A range that no longer fits is skipped.
    static func apply(_ text: inout AttributedString, ranges: [NSRange]) {
        let raw = String(text.characters)
        for range in ranges {
            guard range.length > 0, let swift = Range(range, in: raw) else { continue }
            guard let start = AttributedString.Index(swift.lowerBound, within: text),
                  let end = AttributedString.Index(swift.upperBound, within: text),
                  start < end
            else { continue }
            text[start..<end].snorlaxInlineCode = mark
        }
    }

    /// The whole span when `selection` lies entirely inside one mark.
    /// An empty selection, or one that starts in the span and ends
    /// outside it, returns nil. The result is the span, not the slice.
    static func spanText(in text: NSAttributedString, selection: NSRange) -> String? {
        if selection.location == NSNotFound || selection.length <= 0 { return nil }
        let selEnd = selection.location + selection.length
        if selection.location < 0 || selEnd > text.length { return nil }
        let full = NSRange(location: 0, length: text.length)
        var found: NSRange?
        var spilled = false
        text.enumerateAttribute(.snorlaxInlineCode, in: full, options: []) { value, range, stop in
            guard isMark(value) else { return }
            let rangeEnd = range.location + range.length
            let startsInside = selection.location >= range.location && selection.location < rangeEnd
            if !startsInside { return }
            if selEnd > rangeEnd {
                spilled = true
            } else {
                found = range
            }
            stop.pointee = true
        }
        if spilled { return nil }
        guard let found else { return nil }
        let raw = text.attributedSubstring(from: found).string
        if raw.isEmpty { return nil }
        return raw
    }

    private static func merge(_ ranges: [NSRange]) -> [NSRange] {
        let sorted = ranges.sorted { $0.location < $1.location }
        var out: [NSRange] = []
        for range in sorted {
            if range.length <= 0 { continue }
            if out.isEmpty {
                out.append(range)
                continue
            }
            var last = out[out.count - 1]
            let lastEnd = last.location + last.length
            if range.location <= lastEnd {
                let end = max(lastEnd, range.location + range.length)
                last.length = end - last.location
                out[out.count - 1] = last
            } else {
                out.append(range)
            }
        }
        return out
    }
}
