// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.32: Save the open chat's loaded transcript.
/// Writes the same plain text the copy chord copies, as transcript.txt.
/// Shows Saved for 1.5s, then reverts. This side hands that file to the
/// system share sheet from the chat header and does not ask for
/// photo-library permission. The copy chord still copies and does not
/// write the file. Hidden when no chat is open or nothing useful is
/// loaded. Reply Save stays reply.md. User-message Save stays
/// message.txt. No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/transcriptSave.ts`.
enum TranscriptSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save transcript"
    static let savedAria = "Saved"
    static let filename = "transcript.txt"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// An open chat with the same text the copy chord would copy.
    static func showsSave(chatOpen: Bool, text: String?) -> Bool {
        guard chatOpen, let text, !text.isEmpty else { return false }
        return true
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not send or switch chats.
    static func keepsChat() -> Bool { true }

    /// The plain text the copy chord already copies. Interior whitespace
    /// stays. No extra trailing newline.
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
            .appendingPathComponent("snorlax-transcript", isDirectory: true)
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
            return "transcript.txt"
        }
        return filename
    }
}
