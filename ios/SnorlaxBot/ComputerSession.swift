// SPDX-License-Identifier: Apache-2.0
import CoreGraphics
import Foundation
import SwiftUI

/// v0.20 iOS Record chrome on the v0.19 takeover bar.
/// Runtime protocol is unchanged v0.16: POST/DELETE
/// `/v1/agents/{id}/computer/record` then `POST /v1/agents/{id}/skills { name }`.
/// Discard is omit that POST. Record only inside a takeover session.
/// No pinch-zoom. No blank New skill. Channel 409.
enum ComputerTakeoverChrome {
    static let openLabel = "Open"
    static let doneLabel = "Done"
    static let keyboardLabel = "Keyboard"
    static let drivingLabel = "You're driving · agent paused"
    static let noComputerYet = "No computer yet."
    static let computerLabel = "Computer"
    static let recordLabel = "Record"
    static let stopLabel = "Stop"
    static let saveAsSkillTitle = "Save as skill"
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let cancelLabel = "Cancel"
    static let barHeight: CGFloat = 52
    static let avatarSize: CGFloat = 24
    static let doneHeight: CGFloat = 44
    static let labelSize: CGFloat = 12
    static let recordDotSize: CGFloat = 6
    static let saveButtonHeight: CGFloat = 44
    static let skillNameSize: CGFloat = 14
    static let savedFeedbackMs = 1500
    /// `--danger` (#ff6b6b), same as desktop Record/Stop.
    static let danger = Color(red: 1, green: 107.0 / 255.0, blue: 107.0 / 255.0)
    static let sandboxWidth = 1280
    static let sandboxHeight = 800
    static let tapSlop: CGFloat = 8
    static let sessionPath = "/computer/session"
    static let pointerPath = "/computer/pointer"
    static let keyPath = "/computer/key"
    static let recordPath = "/computer/record"
    static let skillsPath = "/skills"

    static func canOpen(hasSandbox: Bool?) -> Bool {
        hasSandbox == true
    }

    /// Empty `No computer yet.` has no Open. The 16:10 shot and trailing
    /// Open both start a session POST when `hasSandbox`.
    static func openPostsSession(hasSandbox: Bool?) -> Bool {
        canOpen(hasSandbox: hasSandbox)
    }

    /// Record is only offered inside an open takeover session.
    static func recordOffered(sessionOpen: Bool) -> Bool {
        sessionOpen
    }

    static func recordControlLabel(recording: Bool) -> String {
        recording ? stopLabel : recordLabel
    }

    static func doneDisabled(recording: Bool) -> Bool {
        recording
    }

    /// iOS has no Esc. Stop is the only way out of record (Done is disabled).
    static func escapeStopsRecord() -> Bool {
        false
    }

    static func saveDisabled(name: String) -> Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Save POSTs `/skills { name }` (writes SKILL.md). × / Cancel discards
    /// — omit that POST, no SKILL.md.
    static func writesSkill(saved: Bool) -> Bool {
        saved
    }

    static func letterbox(
        containerWidth: CGFloat,
        containerHeight: CGFloat,
        sourceWidth: CGFloat = CGFloat(sandboxWidth),
        sourceHeight: CGFloat = CGFloat(sandboxHeight)
    ) -> (x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, scale: CGFloat) {
        let scale = min(containerWidth / sourceWidth, containerHeight / sourceHeight)
        let width = sourceWidth * scale
        let height = sourceHeight * scale
        return (
            x: (containerWidth - width) / 2,
            y: (containerHeight - height) / 2,
            width: width,
            height: height,
            scale: scale
        )
    }

    static func mapPointer(
        localX: CGFloat,
        localY: CGFloat,
        containerWidth: CGFloat,
        containerHeight: CGFloat
    ) -> (x: Int, y: Int)? {
        let box = letterbox(
            containerWidth: containerWidth,
            containerHeight: containerHeight
        )
        let x = localX - box.x
        let y = localY - box.y
        if x < 0 || y < 0 || x > box.width || y > box.height {
            return nil
        }
        let px = max(0, min(sandboxWidth - 1, Int(floor(x / box.scale))))
        let py = max(0, min(sandboxHeight - 1, Int(floor(y / box.scale))))
        return (x: px, y: py)
    }

    static func isTap(translation: CGSize) -> Bool {
        hypot(translation.width, translation.height) < tapSlop
    }

    /// Tap is click. Pan is move. No pinch.
    static func pointerType(translation: CGSize, ended: Bool) -> PointerEvent.`Type`? {
        let tap = isTap(translation: translation)
        if ended {
            return tap ? .click : nil
        }
        return tap ? nil : .move
    }

    static func keyEvents(inserting text: String) -> [KeyEvent] {
        if text == "\n" || text == "\r" {
            return [
                KeyEvent(key: "Enter", type: .down),
                KeyEvent(key: "Enter", type: .up),
            ]
        }
        return [KeyEvent(key: text, type: .type, text: text)]
    }

    static func keyEventsForDeleteBackward() -> [KeyEvent] {
        [
            KeyEvent(key: "Backspace", type: .down),
            KeyEvent(key: "Backspace", type: .up),
        ]
    }
}
