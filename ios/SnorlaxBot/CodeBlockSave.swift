// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.21: save a completed assistant code block.
/// A muted Save sits beside Copy on that fence. This side writes the
/// full source and hands that file to the system share sheet. It does
/// not ask for photo-library permission. Lines hidden by Show more are
/// included. A streaming fence hides Save. A math block has no Save.
/// Nothing is sent. No new shortcut. No animation.
/// Keep in lockstep with `desktop/src/codeBlockSave.ts`.
enum CodeBlockSave {
    static let label = "Save"
    static let accessibilityLabel = "Save code"
    static let stem = "snippet"
    static let fallbackName = "snippet.txt"
    static let maxFilename = 80

    /// Fence info word → extension. The visible filename is `snippet.{ext}`.
    static let languageExtensions: [String: String] = [
        "bash": "sh",
        "c": "c",
        "c#": "cs",
        "c++": "cpp",
        "cc": "cpp",
        "cjs": "cjs",
        "cpp": "cpp",
        "cs": "cs",
        "csharp": "cs",
        "css": "css",
        "cxx": "cpp",
        "dart": "dart",
        "diff": "diff",
        "go": "go",
        "golang": "go",
        "gql": "graphql",
        "graphql": "graphql",
        "h": "h",
        "hpp": "hpp",
        "htm": "html",
        "html": "html",
        "ini": "ini",
        "java": "java",
        "javascript": "js",
        "js": "js",
        "json": "json",
        "jsonc": "json",
        "jsx": "jsx",
        "kotlin": "kt",
        "kt": "kt",
        "kts": "kts",
        "lua": "lua",
        "markdown": "md",
        "md": "md",
        "mermaid": "mmd",
        "mjs": "mjs",
        "patch": "diff",
        "php": "php",
        "plain": "txt",
        "plaintext": "txt",
        "proto": "proto",
        "py": "py",
        "python": "py",
        "r": "r",
        "rb": "rb",
        "rs": "rs",
        "ruby": "rb",
        "rust": "rs",
        "scala": "scala",
        "scss": "scss",
        "sh": "sh",
        "shell": "sh",
        "sql": "sql",
        "svelte": "svelte",
        "swift": "swift",
        "text": "txt",
        "toml": "toml",
        "ts": "ts",
        "tsx": "tsx",
        "txt": "txt",
        "typescript": "ts",
        "vue": "vue",
        "xml": "xml",
        "yaml": "yml",
        "yml": "yml",
        "zsh": "sh",
    ]

    /// Info word that names a whole file, not `snippet.{ext}`.
    static let fileNames: [String: String] = [
        "dockerfile": "Dockerfile",
        "gemfile": "Gemfile",
        "makefile": "Makefile",
    ]

    private static let windowsReserved: Set<String> = [
        "con", "prn", "aux", "nul",
        "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ]

    /// Same gate as fence Copy: a finished block only.
    static func showsSave(completed: Bool) -> Bool {
        completed
    }

    /// Saving does not expand, collapse, send, or remove the fence.
    static func keepsFence() -> Bool { true }

    /// The label does not change, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Fence source only. No fences, no language tag. Interior whitespace stays.
    static func bodyText(_ source: String) -> String {
        source
    }

    /// Share-sheet name. A path keeps its last segment. A segment that
    /// already has a short extension stays. A language word becomes
    /// `snippet.{ext}`. Anything else is `snippet.txt`.
    static func filename(language: String) -> String {
        let cleaned = sanitize(basename(firstToken(language)))
        if cleaned.isEmpty { return fallbackName }
        let name: String
        if plainExtension(of: cleaned) != nil && !reservedStem(cleaned) {
            name = cleaned
        } else {
            let key = cleaned.lowercased()
            if let whole = fileNames[key] {
                name = whole
            } else if let ext = languageExtensions[key] {
                name = "\(stem).\(ext)"
            } else {
                name = fallbackName
            }
        }
        if reservedStem(name) { return fallbackName }
        return cap(name)
    }

    /// Write UTF-8 source under the temporary directory. A failed write
    /// returns nil and the caller does not present the sheet.
    static func writeFile(source: String, filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-code", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(bodyText(source).utf8).write(to: file, options: .atomic)
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
            return fallbackName
        }
        return filename
    }

    private static func firstToken(_ language: String) -> String {
        let trimmed = language.trimmingCharacters(in: .whitespacesAndNewlines)
        if let space = trimmed.firstIndex(where: { $0.isWhitespace }) {
            return String(trimmed[..<space])
        }
        return trimmed
    }

    private static func basename(_ token: String) -> String {
        let parts = token.split(omittingEmptySubsequences: true) { ch in
            ch == "/" || ch == "\\"
        }
        return parts.last.map(String.init) ?? ""
    }

    private static func sanitize(_ segment: String) -> String {
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

    /// 1–8 ASCII letters or digits after the last dot. The stem must exist.
    private static func plainExtension(of filename: String) -> String? {
        guard let dot = filename.lastIndex(of: "."),
              dot != filename.startIndex,
              filename.index(after: dot) != filename.endIndex
        else { return nil }
        let ext = String(filename[filename.index(after: dot)...])
        let ok = ext.unicodeScalars.allSatisfy { scalar in
            let value = scalar.value
            return (value >= 48 && value <= 57)
                || (value >= 65 && value <= 90)
                || (value >= 97 && value <= 122)
        }
        guard (1...8).contains(ext.count), ok else { return nil }
        return ext
    }

    private static func reservedStem(_ filename: String) -> Bool {
        let stem = filename.split(separator: ".").first.map(String.init) ?? ""
        return windowsReserved.contains(stem.lowercased())
    }

    private static func cap(_ name: String) -> String {
        if name.count <= maxFilename { return name }
        guard let dot = name.lastIndex(of: "."), dot != name.startIndex else {
            return String(name.prefix(maxFilename))
        }
        let ext = String(name[dot...])
        if (2...9).contains(ext.count), plainExtension(of: name) != nil {
            let room = maxFilename - ext.count
            if room > 0 {
                return String(name.prefix(room)) + ext
            }
        }
        return String(name.prefix(maxFilename))
    }
}
