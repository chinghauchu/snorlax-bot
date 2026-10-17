// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.29: soft-wrap toggle on assistant code fences.
/// The v0.11 language label already sits in the fence header (empty when
/// the fence has no info string). Wrap sits beside Copy. Default is no
/// wrap, with horizontal scroll. Wrap soft-wraps that block's long lines.
/// Each block is independent. The choice lives in memory for the app
/// session and is not written to disk. Relaunch drops it.
/// No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/codeBlockWrap.ts`.
enum CodeBlockWrap {
    static let wrapLabel = "Wrap"
    static let unwrapLabel = "Unwrap"
    static let wrapAria = "Wrap lines"
    static let unwrapAria = "Unwrap lines"

    /// In-memory only. Not written to disk.
    private static var session: [String: Bool] = [:]

    static func wrapsByDefault() -> Bool { false }

    /// Not saved across relaunch. The dictionary dies with the process.
    static func persistsAcrossRelaunch() -> Bool { false }

    static func blockId(scope: String, index: Int) -> String {
        "\(scope)\u{0}\(index)"
    }

    static func isWrapped(id: String) -> Bool {
        guard !id.isEmpty else { return wrapsByDefault() }
        return session[id] ?? wrapsByDefault()
    }

    static func setWrapped(id: String, wrapped: Bool) {
        guard !id.isEmpty else { return }
        if wrapped {
            session[id] = true
        } else {
            session[id] = nil
        }
    }

    /// Flip one block. Other ids are left alone.
    static func toggle(id: String, wrapped: Bool) -> Bool {
        let next = !wrapped
        setWrapped(id: id, wrapped: next)
        return next
    }

    static func showsWrap(completed: Bool) -> Bool {
        completed
    }

    static func label(wrapped: Bool) -> String {
        wrapped ? unwrapLabel : wrapLabel
    }

    static func accessibilityLabel(wrapped: Bool) -> String {
        wrapped ? unwrapAria : wrapAria
    }

    /// Horizontal scroll when not wrapped. Soft wrap fills the column.
    static func expandsHorizontally(wrapped: Bool) -> Bool {
        !wrapped
    }

    /// Label and layout swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
