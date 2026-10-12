// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.78: a failed Send stays in the transcript.
/// Network / runtime down, HTTP 4xx/5xx, or an SSE error before any
/// reply (including inference_unavailable) leaves the user bubble
/// muted with Couldn't send · Retry. Retry resends the same text and
/// attachments through the existing send path. Tap Retry, or the
/// long-press menu. No auto-retry. No HTTP.
/// Keep in lockstep with `desktop/src/failedSend.ts`.
enum FailedSend {
    static let couldnt = "Couldn't send"
    static let retry = "Retry"
    static let remove = "Remove"
    static let line = "Couldn't send · Retry"
    static let inferenceUnavailable = "inference_unavailable"

    static func isPreReplyFailure(sawReply: Bool, error: String?) -> Bool {
        if sawReply { return false }
        let trimmed = (error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty
    }

    static func isInferenceUnavailable(_ error: String?) -> Bool {
        (error ?? "").contains(inferenceUnavailable)
    }

    /// A delta, tool, card, or non-empty assistant message means a reply started.
    static func replyStarted(
        delta: String?,
        isUser: Bool,
        isTool: Bool,
        isCard: Bool,
        content: String
    ) -> Bool {
        if isTool || isCard { return true }
        if let delta, !delta.isEmpty { return true }
        if isUser { return false }
        return !content.isEmpty
    }

    /// User row the runtime saved before inference failed.
    static func orphanUserID(
        before: Set<String>,
        listed: [Message],
        content: String
    ) -> String? {
        for row in listed.reversed() {
            guard row.isFromUser else { continue }
            if before.contains(row.id) { continue }
            if row.content != content { continue }
            return row.id
        }
        return nil
    }

    static func mark(
        _ records: [FailedSendRecord],
        _ next: FailedSendRecord
    ) -> [FailedSendRecord] {
        records.filter { $0.id != next.id } + [next]
    }

    static func dismiss(_ records: [FailedSendRecord], id: String) -> [FailedSendRecord] {
        records.filter { $0.id != id }
    }

    static func forChat(
        _ records: [FailedSendRecord],
        agentId: String,
        threadId: String?
    ) -> [FailedSendRecord] {
        records.filter { $0.agentId == agentId && $0.threadId == threadId }
    }

    /// Server transcript plus local failed bubbles. A persisted
    /// pre-reply user row stays hidden for this session.
    static func paint(
        listed: [Message],
        failed: [FailedSendRecord],
        hidden: Set<String>
    ) -> [Message] {
        var hiddenIDs = hidden
        for row in failed {
            if let orphan = row.orphanServerId {
                hiddenIDs.insert(orphan)
            }
        }
        var visible = listed.filter { !hiddenIDs.contains($0.id) }
        let have = Set(visible.map(\.id))
        for row in failed where !have.contains(row.message.id) {
            let stamp = row.message.createdAt
            if let index = visible.firstIndex(where: { $0.createdAt > stamp }) {
                visible.insert(row.message, at: index)
            } else {
                visible.append(row.message)
            }
        }
        return visible
    }

    static func retryBlocked(busy: Bool) -> Bool {
        busy
    }
}

struct FailedSendRecord: Identifiable {
    var id: String
    var agentId: String
    var threadId: String?
    var content: String
    var attachmentIds: [String]
    var mentionIds: [String]
    var message: Message
    var orphanServerId: String?
}
