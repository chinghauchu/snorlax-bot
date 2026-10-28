// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v2.11: save the image the lightbox is already showing.
/// A muted Save control sits beside Close. This side writes the bytes
/// that painted the image and hands that file to the system share
/// sheet. It does not ask for photo-library permission. The overlay
/// stays open. Nothing is sent, and a pending chip is not removed.
/// No new animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/lightboxSave.ts`.
enum LightboxSave {
    static let label = "Save"
    static let accessibilityLabel = "Save image"
    static let fallbackStem = "Image"
    static let fallbackExtension = "png"

    static let imageExtensions: Set<String> = [
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif", "avif", "svg",
    ]

    /// A URL, or bytes already in hand, is enough to offer Save.
    static func offered(url: String, hasBytes: Bool) -> Bool {
        if hasBytes { return true }
        return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Saving does not dismiss the overlay and does not remove a chip.
    static func keepsOpen() -> Bool { true }

    /// The label does not fade, including when Reduce Motion is off.
    static func animates(reduceMotion: Bool) -> Bool {
        _ = reduceMotion
        return false
    }

    /// File name for the share sheet. A name that already ends in an
    /// image extension wins. Otherwise the extension comes from the
    /// sniffed bytes, then the URL, then a data URL, then png.
    static func filename(name: String, url: String, sniffed: String? = nil) -> String {
        let cleaned = sanitize(name)
        if imageExtension(of: cleaned) != nil { return cleaned }
        let ext = knownExtension(sniffed)
            ?? imageExtension(of: urlBasename(url))
            ?? dataUrlExtension(url)
            ?? fallbackExtension
        let stem = cleaned.isEmpty ? fallbackStem : cleaned
        return "\(stem).\(ext)"
    }

    /// PNG, JPEG, GIF, WebP, or BMP. Anything else is nil.
    static func sniffExtension(_ data: Data) -> String? {
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "png" }
        if data.starts(with: [0xFF, 0xD8, 0xFF]) { return "jpg" }
        if data.starts(with: [0x47, 0x49, 0x46]) { return "gif" }
        if data.count >= 12,
           data.starts(with: [0x52, 0x49, 0x46, 0x46]),
           data[8] == 0x57,
           data[9] == 0x45,
           data[10] == 0x42,
           data[11] == 0x50 {
            return "webp"
        }
        if data.starts(with: [0x42, 0x4D]) { return "bmp" }
        return nil
    }

    static func temporaryFileURL(filename: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-lightbox", isDirectory: true)
            .appendingPathComponent(filename, isDirectory: false)
    }

    private static func sanitize(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(omittingEmptySubsequences: true) { ch in
            ch == "/" || ch == "\\"
        }
        let segment = parts.last.map(String.init) ?? ""
        var out = ""
        out.reserveCapacity(segment.count)
        for scalar in segment.unicodeScalars {
            let value = scalar.value
            if value < 32 || value == 127 { continue }
            if "\\/:*?\"<>|".unicodeScalars.contains(scalar) { continue }
            out.unicodeScalars.append(scalar)
        }
        var result = out.trimmingCharacters(in: .whitespacesAndNewlines)
        while result.hasPrefix(".") { result.removeFirst() }
        while result.hasSuffix(".") || result.hasSuffix(" ") {
            result.removeLast()
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func urlBasename(_ url: String) -> String {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("data:") || trimmed.hasPrefix("blob:") { return "" }
        let noHash = trimmed.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
            .first
            .map(String.init) ?? ""
        let noQuery = noHash.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
            .first
            .map(String.init) ?? ""
        let parts = noQuery.split(omittingEmptySubsequences: true) { ch in
            ch == "/" || ch == "\\"
        }
        return parts.last.map(String.init) ?? ""
    }

    private static func imageExtension(of filename: String) -> String? {
        guard let dot = filename.lastIndex(of: "."),
              dot != filename.startIndex,
              filename.index(after: dot) != filename.endIndex
        else { return nil }
        return knownExtension(String(filename[filename.index(after: dot)...]))
    }

    private static func knownExtension(_ ext: String?) -> String? {
        guard let ext else { return nil }
        let lower = ext.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let bare = lower.hasPrefix(".") ? String(lower.dropFirst()) : lower
        return imageExtensions.contains(bare) ? bare : nil
    }

    private static func dataUrlExtension(_ url: String) -> String? {
        let lowered = url.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard lowered.hasPrefix("data:image/") else { return nil }
        let rest = lowered.dropFirst("data:image/".count)
        let subtype = rest.prefix { ch in ch != ";" && ch != "," }
        if subtype == "svg+xml" { return "svg" }
        if subtype == "jpeg" { return "jpg" }
        return knownExtension(String(subtype))
    }
}
