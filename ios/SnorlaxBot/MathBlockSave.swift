// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.29: Save on a completed assistant display-math block.
/// Writes the TeX interior as math.tex. Shows Saved for 1.5s, then
/// reverts. This side hands that file to the system share sheet and
/// does not ask for photo-library permission. The $$ delimiters are
/// not included. Copy still copies that TeX. Hidden while streaming
/// and while the closing $$ has not arrived. Inline math has no Save.
/// No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/mathBlockSave.ts`.
enum MathBlockSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save math"
    static let savedAria = "Saved"
    static let filename = "math.tex"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// Same gate as display-math Copy: a finished closed block only.
    static func showsSave(completed: Bool, closed: Bool) -> Bool {
        completed && closed
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the equation or send.
    static func keepsBlock() -> Bool { true }

    /// TeX interior only. No $$ delimiters. Interior whitespace stays.
    /// No extra trailing newline.
    static func bodyText(_ tex: String) -> String {
        tex
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Write UTF-8 TeX under the temporary directory. A failed write
    /// returns nil and the caller does not present the sheet or Saved.
    static func writeFile(tex: String, filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-math", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(bodyText(tex).utf8).write(to: file, options: .atomic)
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
            return "math.tex"
        }
        return filename
    }
}
