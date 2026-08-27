// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

extension Agent {
    static let seedID = "snorlax-bot"
    static let channelID = "snorlax-bot-group"

    var isSeed: Bool { id == Self.seedID }
    var isChannel: Bool { kind == .channel }
    var isSeedChannel: Bool { id == Self.channelID }
    var canEditChannel: Bool { isChannel && !isSeedChannel }

    var rosterSubtitle: String { isChannel ? "Channel" : title }

    /// Seed channel present → prefer a channel. Seed gone → agent first,
    /// else a remaining channel. Never invent `snorlax-bot-group`.
    static func fallbackRosterSelection(in roster: [Agent]) -> Agent? {
        if roster.contains(where: { $0.id == channelID }) {
            return roster.first(where: \.isChannel)
                ?? roster.first(where: \.isSeed)
                ?? roster.first
        }
        return roster.first(where: { $0.kind == .agent })
            ?? roster.first(where: \.isChannel)
            ?? roster.first
    }

    static func nextRosterSelection(
        in roster: [Agent],
        removedId: String?,
        currentId: String?
    ) -> Agent? {
        if let currentId,
           currentId != removedId,
           let row = roster.first(where: { $0.id == currentId })
        {
            return row
        }
        return fallbackRosterSelection(in: roster)
    }

    /// Wordmark chrome when the roster is empty. Not a real roster row —
    /// never invent `snorlax-bot-group` after delete.
    static let chrome = Agent(
        id: "",
        name: "Snorlax-Bot",
        title: "",
        description: "",
        avatar: nil,
        kind: .agent,
        memberIds: [],
        sharedProject: false,
        createdAt: .distantPast,
        updatedAt: .distantPast
    )

    static let placeholderChannel = Agent(
        id: channelID,
        name: "Snorlax-Bot",
        title: "",
        description: "",
        avatar: nil,
        kind: .channel,
        memberIds: [seedID],
        sharedProject: false,
        createdAt: .distantPast,
        updatedAt: .distantPast
    )

    static let placeholder = Agent(
        id: seedID,
        name: "Snorlax",
        title: "Assistant",
        description: "",
        avatar: nil,
        kind: .agent,
        memberIds: [],
        sharedProject: false,
        createdAt: .distantPast,
        updatedAt: .distantPast
    )
}

extension Message {
    var isFromUser: Bool { senderId == "user" || (senderId.isEmpty && role == .user) }
    var isHandoffRoot: Bool { kind == .handoff && replyTo == nil }
    var isToolLine: Bool { kind == .tool }
    var isWidget: Bool { kind == .widget || widget != nil }
    var isConnect: Bool { kind == .connect || connect != nil }
    var hasRoutineKicker: Bool {
        guard let routineName, !routineName.isEmpty else { return false }
        return true
    }

    var jump: HandoffRef? { handoff }

    func visibleJump(in roster: [Agent]) -> HandoffRef? {
        guard let jump else { return nil }
        guard roster.contains(where: { $0.id == jump.channelId && $0.isChannel }) else {
            return nil
        }
        return jump
    }

    var displayContent: String {
        let raw = content
        let prefix = "from \(senderName):"
        if raw.lowercased().hasPrefix(prefix.lowercased()) {
            return String(raw.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
        }
        if raw.lowercased().hasPrefix("from "),
           let colon = raw.firstIndex(of: ":")
        {
            let head = raw[..<colon]
            if head.split(separator: " ").count <= 3 {
                return String(raw[raw.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            }
        }
        return raw
    }

    static func optimisticUser(agentId: String, content: String) -> Message {
        Message(
            id: "local-\(UUID().uuidString)",
            agentId: agentId,
            role: .user,
            content: content,
            images: [],
            createdAt: Date(),
            senderId: "user",
            senderName: "User",
            senderAvatar: nil,
            hop: 0,
            mentions: []
        )
    }

    static func streamingAssistant(
        id: String,
        agentId: String,
        content: String,
        senderId: String,
        senderName: String,
        senderAvatar: String?
    ) -> Message {
        Message(
            id: id,
            agentId: agentId,
            role: .assistant,
            content: content,
            images: [],
            createdAt: Date(),
            senderId: senderId,
            senderName: senderName,
            senderAvatar: senderAvatar,
            hop: 0,
            mentions: []
        )
    }
}

extension Plugin {
    static func kindConnected(_ kind: String, plugins: [Plugin]) -> Bool {
        let needle = kind.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return false }
        return plugins.contains { row in
            row.status == .connected &&
                "\(row.id) \(row.name)".localizedCaseInsensitiveContains(needle)
        }
    }
}

extension Routine {
    var isWebhook: Bool {
        kind == .webhook
    }

    var showsWebhookCopy: Bool {
        isWebhook && !(webhookUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func visibleOnPane(plugins: [Plugin]) -> Bool {
        switch kind {
        case .slack:
            return plugins.contains { row in
                row.status == .connected &&
                    "\(row.id) \(row.name)".localizedCaseInsensitiveContains("slack")
            }
        case .github:
            return plugins.contains { row in
                row.status == .connected &&
                    "\(row.id) \(row.name)".localizedCaseInsensitiveContains("github")
            }
        default:
            return true
        }
    }

    var mutedLine: String {
        if isWebhook { return "Webhook" }
        if kind == .slack {
            if let label, !label.isEmpty { return label }
            return "Slack"
        }
        if kind == .github {
            if let label, !label.isEmpty { return label }
            return "GitHub"
        }
        if let scheduleLabel, !scheduleLabel.isEmpty { return scheduleLabel }
        return Self.humanizeTaipeiCron(schedule ?? "")
    }

    var copyPayload: String {
        (webhookUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func humanizeTaipeiCron(_ cron: String) -> String {
        let fields = cron.split(whereSeparator: \.isWhitespace).map(String.init)
        guard fields.count == 5 else { return cron }
        let minute = fields[0]
        let hour = fields[1]
        let dom = fields[2]
        let month = fields[3]
        let dow = fields[4]
        guard let minuteN = Int(minute), let hourN = Int(hour) else { return cron }
        let clock = "\(hourN):" + String(format: "%02d", minuteN)
        if dom == "*", month == "*", dow == "*" { return "Every day \(clock)" }
        if dom == "*", month == "*", (dow == "1-5" || dow == "1,2,3,4,5") {
            return "Weekdays \(clock)"
        }
        if dom == "*", month == "*", (dow == "0,6" || dow == "6,0") {
            return "Weekends \(clock)"
        }
        return cron
    }
}

struct PendingImage: Sendable {
    var mime: String
    var data: Data

    var asInput: ImageIn {
        ImageIn(mime: mime, data: data.base64EncodedString())
    }
}

enum AppTheme: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}

enum AccentChoice: String, CaseIterable, Identifiable, Sendable {
    case teal
    case cream
    case blue
    case purple
    case orange
    case pink
    case red

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .teal: Color(red: 0.498, green: 0.702, blue: 0.627)
        case .cream: Color(red: 0.788, green: 0.706, blue: 0.541)
        case .blue: Color.blue
        case .purple: Color.purple
        case .orange: Color.orange
        case .pink: Color.pink
        case .red: Color.red
        }
    }
}

extension Data {
    var sniffedImageMIME: String {
        if starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "image/png" }
        if starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
        if starts(with: [0x47, 0x49, 0x46]) { return "image/gif" }
        if count >= 12,
           self[0..<4] == Data("RIFF".utf8),
           self[8..<12] == Data("WEBP".utf8)
        {
            return "image/webp"
        }
        if count >= 12, self[4..<8] == Data("ftyp".utf8) { return "image/heic" }
        return "image/jpeg"
    }
}

enum RuntimeError: LocalizedError {
    case invalidURL
    case http(status: Int, message: String)
    case decoding
    case stream(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Runtime URL is not valid."
        case .http(_, let message):
            return message
        case .decoding:
            return "The runtime sent a response this client could not read."
        case .stream(let message):
            return message
        }
    }
}

struct LiveToolTrace: Identifiable, Hashable, Sendable {
    var id: String
    var summary: String
    var senderId: String?
    var senderName: String?
}
