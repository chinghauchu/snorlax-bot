// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

extension Agent {
    static let seedID = "snorlax-bot"
    static let channelID = "snorlax-bot-group"

    var isSeed: Bool { id == Self.seedID }
    var isChannel: Bool { kind == .channel }
    var isProtected: Bool { isSeed || isChannel }

    static let placeholderChannel = Agent(
        id: channelID,
        name: "Snorlax-Bot",
        title: "Group",
        description: "",
        avatar: nil,
        kind: .channel,
        memberIds: [seedID],
        createdAt: .distantPast,
        updatedAt: .distantPast
    )

    static let placeholder = Agent(
        id: seedID,
        name: "Snorlax-Bot",
        title: "Assistant",
        description: "",
        avatar: nil,
        kind: .agent,
        memberIds: [],
        createdAt: .distantPast,
        updatedAt: .distantPast
    )
}

extension Message {
    var isFromUser: Bool { senderId == "user" || (senderId.isEmpty && role == .user) }

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
