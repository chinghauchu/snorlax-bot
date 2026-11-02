// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.40: Copy links and Save as links.md on a completed assistant
/// reply that contains links.
/// The file lists each rendered link in order, one markdown link per
/// line: the visible label, then the URL that link would open. Copy
/// writes that same text. This side hands links.md to the system share
/// sheet and does not ask for photo-library permission. The controls
/// read Copied or Saved for 1.5s. They sit in the action row. Images
/// are not links. Fences, inline code, indented code, and math are not
/// links. An unsafe scheme is not a link. Per-link Copy link still
/// copies one URL. Message Copy still copies the whole reply. Message
/// Save still writes reply.md. Hidden while streaming and on user
/// bubbles. Streaming text stays plain. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/messageLinks.ts`.
enum MessageLinks {
    static let copyLabel = "Copy links"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy links"
    static let copiedAria = "Copied"
    static let saveLabel = "Save as links.md"
    static let savedLabel = "Saved"
    static let saveAria = "Save as links.md"
    static let savedAria = "Saved"
    static let filename = "links.md"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    struct Entry {
        var label: String
        var url: String
    }

    /// A finished assistant reply with at least one rendered link.
    /// Streaming has no control. A user bubble does not.
    static func shows(
        fromUser: Bool,
        kindMessage: Bool,
        completed: Bool,
        markdown: String
    ) -> Bool {
        completed && !fromUser && kindMessage && !links(in: markdown).isEmpty
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func copyAccessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    static func fileLabel(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func saveAccessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the reply or send.
    static func keepsReply() -> Bool { true }

    /// Rendered links in document order. Reference links resolve first.
    static func links(in markdown: String) -> [Entry] {
        let src = normalize(MarkdownReferenceLink.resolve(normalize(markdown), completed: true))
        let spans = MarkdownLinkTitle.listedSpans(src)
        var items: [(start: Int, entry: Entry)] = []
        for span in spans where !span.image {
            guard let url = openedInline(span.dest) else { continue }
            let label = collapse(span.label)
            items.append((
                start: span.start,
                entry: Entry(label: label.isEmpty ? url : label, url: url)
            ))
        }
        let masked = mask(src, ranges: spans.map { (start: $0.start, end: $0.end) } + MarkdownLinkTitle.protectedSpans(src))
        var offset = 0
        for piece in WebLinks.split(masked, streaming: false, emails: true) {
            if piece.kind == .link, !piece.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               let url = openedAutolink(piece.value) {
                let label = collapse(piece.value)
                items.append((
                    start: offset,
                    entry: Entry(label: label.isEmpty ? url : label, url: url)
                ))
            }
            offset += piece.value.count
        }
        items.sort { $0.start < $1.start }
        return items.map(\.entry)
    }

    /// Clipboard text and file body. One markdown link per line. No
    /// extra trailing newline.
    static func bodyText(_ markdown: String) -> String {
        links(in: markdown).map { linkLine(label: $0.label, url: $0.url) }.joined(separator: "\n")
    }

    static func clipboardText(_ markdown: String) -> String {
        bodyText(markdown)
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
            .appendingPathComponent("snorlax-links", isDirectory: true)
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

    private static func normalize(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
    }

    private static func collapse(_ label: String) -> String {
        label.split { $0.isWhitespace }.joined(separator: " ")
    }

    private static func openedInline(_ dest: String) -> String? {
        let trimmed = dest.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let href = trimmed.contains(where: { $0.isWhitespace || $0 == "\\" || $0 == "<" || $0 == ">" })
            ? MarkdownReferenceLink.encodeDestination(trimmed)
            : trimmed
        guard WebLinks.url(href) != nil else { return nil }
        return href
    }

    private static func openedAutolink(_ visible: String) -> String? {
        guard let url = WebLinks.url(visible) else { return nil }
        return url.absoluteString
    }

    private static func linkLine(label: String, url: String) -> String {
        let safe = label
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "[", with: "\\[")
            .replacingOccurrences(of: "]", with: "\\]")
        let wrap = url.contains { $0 == ")" || $0 == "<" || $0 == ">" || $0.isWhitespace }
        let dest = wrap
            ? "<\(url.replacingOccurrences(of: ">", with: "%3E"))>"
            : url
        return "[\(safe)](\(dest))"
    }

    private static func mask(_ text: String, ranges: [(start: Int, end: Int)]) -> String {
        var chars = Array(text)
        var merged: [(start: Int, end: Int)] = []
        let sorted = ranges
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start || ($0.start == $1.start && $0.end < $1.end) }
        for range in sorted {
            if var last = merged.last, range.start <= last.end {
                last.end = max(last.end, range.end)
                merged[merged.count - 1] = last
            } else {
                merged.append(range)
            }
        }
        for range in merged {
            let start = max(0, min(range.start, chars.count))
            let end = max(start, min(range.end, chars.count))
            if end > start {
                for index in start..<end {
                    chars[index] = " "
                }
            }
        }
        return String(chars)
    }

    private static func safeLeaf(_ filename: String) -> String {
        if filename.isEmpty
            || filename.contains("/")
            || filename.contains("\\")
            || filename == "."
            || filename == ".."
            || filename.hasPrefix(".") {
            return "links.md"
        }
        return filename
    }
}
