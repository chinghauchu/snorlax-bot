// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v2.22: line numbers on a completed assistant code fence.
/// Lines sits beside Wrap. Default is no gutter. Lines shows a muted
/// number on each line of that block only. Each block is independent.
/// The choice lives in memory for the app session and is not written to disk.
/// Relaunch drops it. Copy and Save still use the fence body,
/// with no numbers added. No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/codeBlockLines.ts`.
enum CodeBlockLines {
    static let linesLabel = "Lines"
    static let hideLabel = "No lines"
    static let linesAria = "Show line numbers"
    static let hideAria = "Hide line numbers"

    /// In-memory only. Not written to disk.
    private static var session: [String: Bool] = [:]

    static func numberedByDefault() -> Bool { false }

    /// Not saved across relaunch. The dictionary dies with the process.
    static func persistsAcrossRelaunch() -> Bool { false }

    /// Numbers are display chrome. Copy and Save keep the fence body.
    static func includedInClipboard() -> Bool { false }

    static func blockId(scope: String, index: Int) -> String {
        "\(scope)\u{0}\(index)"
    }

    static func isNumbered(id: String) -> Bool {
        guard !id.isEmpty else { return numberedByDefault() }
        return session[id] ?? numberedByDefault()
    }

    static func setNumbered(id: String, numbered: Bool) {
        guard !id.isEmpty else { return }
        if numbered {
            session[id] = true
        } else {
            session[id] = nil
        }
    }

    /// Flip one block. Other ids are left alone.
    static func toggle(id: String, numbered: Bool) -> Bool {
        let next = !numbered
        setNumbered(id: id, numbered: next)
        return next
    }

    static func showsLines(completed: Bool) -> Bool {
        completed
    }

    static func label(numbered: Bool) -> String {
        numbered ? hideLabel : linesLabel
    }

    static func accessibilityLabel(numbered: Bool) -> String {
        numbered ? hideAria : linesAria
    }

    /// One trailing newline is the fence closer, not an extra line.
    static func bodyText(_ source: String) -> String {
        source.hasSuffix("\n") ? String(source.dropLast()) : source
    }

    /// Logical lines, including a blank line. A fence-closer newline is dropped.
    static func lines(_ source: String) -> [String] {
        let body = bodyText(source)
        if body.isEmpty { return [] }
        return body.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    }

    /// 1-based gutter text. Display only.
    static func gutterLabel(index: Int) -> String {
        String(index + 1)
    }

    /// Width of the last number, in digits. A 10-line block is two digits.
    static func gutterChars(count: Int) -> Int {
        let n = max(count, 1)
        return String(n).count
    }

    /// Split after highlight so a string or comment that spans lines keeps its color.
    static func splitSpans(_ spans: [CodeHighlight.Span]) -> [[CodeHighlight.Span]] {
        if spans.isEmpty { return [] }
        var lines: [[CodeHighlight.Span]] = []
        var current: [CodeHighlight.Span] = []
        func push() {
            lines.append(current)
            current = []
        }
        for span in spans {
            let parts = span.text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            for (offset, part) in parts.enumerated() {
                if offset > 0 { push() }
                if !part.isEmpty {
                    current.append(CodeHighlight.Span(text: part, kind: span.kind))
                }
            }
        }
        push()
        return lines
    }

    static func paintLine(
        _ spans: [CodeHighlight.Span],
        language: String,
        completed: Bool
    ) -> AttributedString {
        var result = AttributedString()
        let colorize = CodeHighlight.shouldHighlight(language: language, completed: completed)
        for span in spans {
            var piece = AttributedString(span.text)
            if colorize, let color = CodeHighlight.uiColor(span.kind), !span.text.isEmpty {
                piece.uiKit.foregroundColor = color
            }
            result.append(piece)
        }
        return result
    }

    /// One row per logical line. A split that disagrees falls back to plain text.
    static func paintedLines(
        _ source: String,
        language: String,
        completed: Bool
    ) -> [AttributedString] {
        let plain = lines(source)
        if plain.isEmpty { return [] }
        let rows = splitSpans(CodeHighlight.highlight(bodyText(source), language: language))
        if rows.count != plain.count {
            return plain.map { AttributedString($0) }
        }
        return rows.map { paintLine($0, language: language, completed: completed) }
    }

    /// Label and layout swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}

private struct CodeBlockNumberedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// True while this fence is showing its line-number gutter.
    var codeBlockNumbered: Bool {
        get { self[CodeBlockNumberedKey.self] }
        set { self[CodeBlockNumberedKey.self] = newValue }
    }
}
