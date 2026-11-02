// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.38: Save on a completed assistant heading section.
/// Writes the heading line plus the lines under it as section.md.
/// Shows Saved for 1.5s, then reverts. This side hands that file to
/// the system share sheet and does not ask for photo-library
/// permission. Copy still copies those lines. Hidden while streaming.
/// No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/sectionSave.ts`.
enum SectionSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save section"
    static let savedAria = "Saved"
    static let filename = "section.md"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished section with lines to save. Streaming has no section.
    static func showsSave(completed: Bool, source: String) -> Bool {
        completed && !source.isEmpty
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the section or send.
    static func keepsSection() -> Bool { true }

    /// Heading line plus the lines under it. No extra trailing newline.
    static func bodyText(_ source: String) -> String {
        source
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
            .appendingPathComponent("snorlax-section", isDirectory: true)
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
            return "section.md"
        }
        return filename
    }
}
