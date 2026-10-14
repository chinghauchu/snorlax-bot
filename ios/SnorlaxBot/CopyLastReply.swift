// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.00: hardware ⌘⇧C / ⌃⇧C copies the latest completed assistant reply.
/// The text is the same `content` the Copy button copies. A reply that
/// is still streaming is skipped. An empty reply copies nothing.
/// Plain ⌘C still copies a selection. Find, the shortcuts sheet, and
/// the lightbox keep the key. Nothing is sent. No HTTP.
/// v0.56 compact tool traces stay as they are.
/// Keep in lockstep with `desktop/src/copyLastReply.ts`.
enum CopyLastReply {
    static let keysLabel = "⌘⇧C"
    static let action = "Copy the last reply"

    /// Exactly one of Command or Control, plus Shift, with C.
    /// Option stays put. A plain C, or ⌘C without Shift, is not this chord.
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
        if String(key).lowercased() == "c" { return true }
        return characters.lowercased() == "c"
    }

    /// Latest completed LEFT kind=message with text.
    /// `liveIndex` is skipped while `sending` is true.
    static func lastReply(
        messages: [Message],
        sending: Bool,
        liveIndex: Int?
    ) -> Message? {
        for index in messages.indices.reversed() {
            let row = messages[index]
            if row.isFromUser || !row.isKindMessage { continue }
            if sending, let liveIndex, index == liveIndex { continue }
            if row.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                continue
            }
            return row
        }
        return nil
    }
}
