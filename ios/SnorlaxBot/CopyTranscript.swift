// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.13: hardware ⌘⇧E / ⌃⇧E copies the open chat's loaded transcript.
/// The clipboard text is user and assistant `kind=message` bodies, in
/// order, separated by a blank line. Tool, widget, approve, connect,
/// and handoff rows are skipped. They are not written as one-liners.
/// A kind=message that is still streaming is included when it already
/// has text. Whitespace-only bodies are skipped. Nothing useful copies
/// nothing, so the pasteboard stays put. Muted Copied sits beside the
/// chat name for 1.2s. No toast. The composer does not own the chord
/// and does not insert the letter. A key repeat is swallowed and does
/// not copy again. IME marked text keeps it, and so does any other
/// text field (find, rename, search, settings, a widget, approve, or
/// connect card). Nothing is copied when no chat is open. No new HTTP.
/// Keep in lockstep with `desktop/src/copyTranscript.ts`.
enum CopyTranscript {
    static let keysLabel = "⌘⇧E"
    static let action = "Copy the transcript"
    static let copiedLabel = "Copied"
    /// Same 1.2s as the message Copy feedback. No toast.
    static let feedbackNanoseconds: UInt64 = 1_200_000_000

    /// Exactly one of Command or Control, plus Shift, with E.
    /// Option stays put. A plain E, or ⌘E without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without copying again.
    static func isChord(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Bool {
        if option || !shift { return false }
        if command == control { return false }
        if String(key).lowercased() == "e" { return true }
        return characters.lowercased() == "e"
    }

    /// The first press copies. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧E.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// Loaded user and assistant kind=message bodies, in order.
    /// Missing kind counts as message (`isKindMessage`). Each body is
    /// trimmed. Whitespace-only bodies are skipped. Parts are separated
    /// by a blank line. Tool, widget, approve, connect, and handoff
    /// rows are skipped. Nil when nothing useful remains.
    static func plainText(messages: [Message]) -> String? {
        var parts: [String] = []
        for row in messages {
            guard row.isKindMessage else { continue }
            let body = row.content.trimmingCharacters(in: .whitespacesAndNewlines)
            if body.isEmpty { continue }
            parts.append(body)
        }
        if parts.isEmpty { return nil }
        return parts.joined(separator: "\n\n")
    }
}
