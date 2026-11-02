// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.41: Save on a completed assistant Footnotes list.
/// Writes one GFM definition per rendered note as notes.md. Shows
/// Saved for 1.5s, then reverts. This side hands that file to the
/// system share sheet and does not ask for photo-library permission.
/// Display order and original labels stay. The Footnotes title and
/// the painted numbers are not the file. Copy still copies that same
/// text. Hidden while streaming. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/footnoteSave.ts`.
enum FootnoteSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save footnotes"
    static let savedAria = "Saved"
    static let filename = "notes.md"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished list with a note to save. Streaming draws no list.
    static func showsSave(completed: Bool, notes: [MarkdownFootnote.Note]) -> Bool {
        completed && !markdown(notes).isEmpty
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the list or send.
    static func keepsList() -> Bool { true }

    /// One `[^label]:` definition per note. No extra trailing newline.
    static func bodyText(_ notes: [MarkdownFootnote.Note]) -> String {
        markdown(notes)
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Write UTF-8 markdown under the temporary directory. A failed
    /// write returns nil and the caller does not present the sheet or
    /// Saved.
    static func writeFile(notes: [MarkdownFootnote.Note], filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-footnote", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(bodyText(notes).utf8).write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }

    /// Display order. Nested `§§SBFNn§§` tokens become `[^label]` again.
    /// Continuation lines are indented four spaces.
    static func markdown(_ notes: [MarkdownFootnote.Note]) -> String {
        if notes.isEmpty { return "" }
        var labels: [Int: String] = [:]
        for note in notes {
            labels[note.number] = note.label
        }
        return notes.map { definition($0, labels: labels) }.joined(separator: "\n")
    }

    private static func definition(
        _ note: MarkdownFootnote.Note,
        labels: [Int: String]
    ) -> String {
        let lines = noteLines(restore(note.text, labels: labels))
        let first = lines.first ?? ""
        var out = [first.isEmpty ? "[^\(note.label)]:" : "[^\(note.label)]: \(first)"]
        for line in lines.dropFirst() {
            out.append(line.isEmpty ? "" : "    \(line)")
        }
        return out.joined(separator: "\n")
    }

    private static func restore(_ text: String, labels: [Int: String]) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"§§SBFN(\d+)§§"#) else {
            return text
        }
        let original = text as NSString
        let matches = regex.matches(
            in: text,
            range: NSRange(location: 0, length: original.length)
        )
        if matches.isEmpty { return text }
        let mutable = NSMutableString(string: text)
        for match in matches.reversed() {
            let digits = original.substring(with: match.range(at: 1))
            guard let number = Int(digits), let label = labels[number] else { continue }
            mutable.replaceCharacters(in: match.range, with: "[^\(label)]")
        }
        return mutable as String
    }

    private static func noteLines(_ text: String) -> [String] {
        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        if normalized.isEmpty { return [""] }
        var parts = normalized.split(
            separator: "\n",
            omittingEmptySubsequences: false
        ).map(String.init)
        while parts.count > 1 && parts.last?.isEmpty == true {
            parts.removeLast()
        }
        return parts
    }

    private static func safeLeaf(_ filename: String) -> String {
        if filename.isEmpty
            || filename.contains("/")
            || filename.contains("\\")
            || filename == "."
            || filename == ".."
            || filename.hasPrefix(".") {
            return "notes.md"
        }
        return filename
    }
}
