// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.30: Save on a completed assistant reply.
/// Writes that reply's markdown source as reply.md. Shows Saved for
/// 1.5s, then reverts. This side hands that file to the system share
/// sheet and does not ask for photo-library permission. One file covers
/// the whole reply. Copy still copies that source. Hidden while
/// streaming and on user bubbles. A code fence, a table, and a
/// display-math block keep their own Save. No animation. No new
/// shortcut.
/// Keep in lockstep with `desktop/src/replyMarkdownSave.ts`.
enum ReplyMarkdownSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save reply"
    static let savedAria = "Saved"
    static let filename = "reply.md"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// Same gate as assistant Copy: a finished LEFT kind=message.
    static func showsSave(fromUser: Bool, kindMessage: Bool, completed: Bool) -> Bool {
        completed && !fromUser && kindMessage
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the reply or send.
    static func keepsReply() -> Bool { true }

    /// Markdown source only. Interior whitespace stays. No extra
    /// trailing newline.
    static func bodyText(_ markdown: String) -> String {
        markdown
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Write UTF-8 markdown under the temporary directory. A failed
    /// write returns nil and the caller does not present the sheet or
    /// Saved.
    static func writeFile(markdown: String, filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-reply", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(bodyText(markdown).utf8).write(to: file, options: .atomic)
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
            return "reply.md"
        }
        return filename
    }
}
