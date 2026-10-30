// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.31: Save on a settled user message.
/// Writes that message's text as message.txt. Shows Saved for 1.5s,
/// then reverts. This side hands that file to the system share sheet
/// from the long-press menu and does not ask for photo-library
/// permission. Copy still copies that text. Hidden while the
/// optimistic send is in flight and on assistant replies. Reply Save
/// stays reply.md. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/userMessageSave.ts`.
enum UserMessageSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save message"
    static let savedAria = "Saved"
    static let filename = "message.txt"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// Same gate as user Copy: a settled user-RIGHT kind=message.
    static func showsSave(fromUser: Bool, kindMessage: Bool, pending: Bool) -> Bool {
        fromUser && kindMessage && !pending
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the message or send.
    static func keepsMessage() -> Bool { true }

    /// The text Copy already copies. Interior whitespace stays. No
    /// extra trailing newline.
    static func bodyText(_ text: String) -> String {
        text
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Write UTF-8 text under the temporary directory. A failed write
    /// returns nil and the caller does not present the sheet or Saved.
    static func writeFile(text: String, filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-user-message", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(bodyText(text).utf8).write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }

    private static func safeLeaf(_ filename: String) -> String {
        if filename.isEmpty
            || filename.contains("/")
            || filename.contains("\\")
            || filename == "."
            || filename == ".."
            || filename.hasPrefix(".") {
            return "message.txt"
        }
        return filename
    }
}
