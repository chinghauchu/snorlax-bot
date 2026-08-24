// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

enum Role: String, Codable, Sendable {
    case user
    case assistant
}

struct Health: Codable, Sendable {
    var ok: Bool
    var name: String
    var version: String
}

struct Agent: Codable, Identifiable, Hashable, Sendable {
    static let seedID = "snorlax-bot"

    var id: String
    var name: String
    var title: String
    var description: String
    var avatar: String?
    var createdAt: Date
    var updatedAt: Date

    var isSeed: Bool { id == Self.seedID }

    static let placeholder = Agent(
        id: seedID,
        name: "Snorlax-Bot",
        title: "Assistant",
        description: "",
        avatar: nil,
        createdAt: .distantPast,
        updatedAt: .distantPast
    )
}

struct ImageOut: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var mime: String
    var url: String
}

struct ImageIn: Codable, Sendable {
    var mime: String
    var data: String
}

struct Message: Codable, Identifiable, Sendable {
    var id: String
    var agentId: String
    var role: Role
    var content: String
    var images: [ImageOut]
    var createdAt: Date
    /// Local-only previews for an optimistic user bubble. Not in the wire format.
    var localPreviews: [Data] = []

    enum CodingKeys: String, CodingKey {
        case id, agentId, role, content, images, createdAt
    }

    init(
        id: String,
        agentId: String,
        role: Role,
        content: String,
        images: [ImageOut],
        createdAt: Date,
        localPreviews: [Data] = []
    ) {
        self.id = id
        self.agentId = agentId
        self.role = role
        self.content = content
        self.images = images
        self.createdAt = createdAt
        self.localPreviews = localPreviews
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        agentId = try container.decode(String.self, forKey: .agentId)
        role = try container.decode(Role.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        images = try container.decode([ImageOut].self, forKey: .images)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        localPreviews = []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(agentId, forKey: .agentId)
        try container.encode(role, forKey: .role)
        try container.encode(content, forKey: .content)
        try container.encode(images, forKey: .images)
        try container.encode(createdAt, forKey: .createdAt)
    }

    static func optimisticUser(agentId: String, content: String, previews: [Data]) -> Message {
        Message(
            id: "local-\(UUID().uuidString)",
            agentId: agentId,
            role: .user,
            content: content,
            images: [],
            createdAt: Date(),
            localPreviews: previews
        )
    }

    static func streamingAssistant(id: String, agentId: String, content: String) -> Message {
        Message(
            id: id,
            agentId: agentId,
            role: .assistant,
            content: content,
            images: [],
            createdAt: Date()
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

struct AgentPatch: Encodable, Sendable {
    var name: String
    var title: String
    var description: String
    var avatar: String?
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
