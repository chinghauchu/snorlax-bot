// SPDX-License-Identifier: Apache-2.0
//
// Generated from protocol/openapi.yaml (Snorlax-Bot 0.1.0).
// Do not edit by hand. Regenerate with:
//   python3 ios/scripts/generate_v1_types.py
//
import Foundation

struct Health: Codable, Hashable, Sendable {
    var ok: Bool
    var name: String
    var version: String

    init(ok: Bool, name: String, version: String) {
        self.ok = ok
        self.name = name
        self.version = version
    }

    enum CodingKeys: String, CodingKey { case ok, name, version }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        name = try container.decode(String.self, forKey: .name)
        version = try container.decode(String.self, forKey: .version)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ok, forKey: .ok)
        try container.encode(name, forKey: .name)
        try container.encode(version, forKey: .version)
    }
}

struct Agent: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var title: String
    var description: String
    var avatar: String?
    var createdAt: Date
    var updatedAt: Date

    init(id: String, name: String, title: String, description: String, avatar: String?, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey { case id, name, title, description, avatar, createdAt, updatedAt }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        avatar = try container.decode(String?.self, forKey: .avatar)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(avatar, forKey: .avatar)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
}

struct AgentCreate: Codable, Hashable, Sendable {
    var name: String?
    var title: String?
    var description: String?
    var avatar: String?

    init(name: String? = nil, title: String? = nil, description: String? = nil, avatar: String? = nil) {
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
    }

    enum CodingKeys: String, CodingKey { case name, title, description, avatar }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(avatar, forKey: .avatar)
    }
}

struct AgentPatch: Codable, Hashable, Sendable {
    var name: String?
    var title: String?
    var description: String?
    var avatar: String?

    init(name: String? = nil, title: String? = nil, description: String? = nil, avatar: String? = nil) {
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
    }

    enum CodingKeys: String, CodingKey { case name, title, description, avatar }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(avatar, forKey: .avatar)
    }
}

struct ImageOut: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var mime: String
    var url: String

    init(id: String, mime: String, url: String) {
        self.id = id
        self.mime = mime
        self.url = url
    }

    enum CodingKeys: String, CodingKey { case id, mime, url }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        mime = try container.decode(String.self, forKey: .mime)
        url = try container.decode(String.self, forKey: .url)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(mime, forKey: .mime)
        try container.encode(url, forKey: .url)
    }
}

struct ImageIn: Codable, Hashable, Sendable {
    var mime: String
    var data: String

    init(mime: String, data: String) {
        self.mime = mime
        self.data = data
    }

    enum CodingKeys: String, CodingKey { case mime, data }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        mime = try container.decode(String.self, forKey: .mime)
        data = try container.decode(String.self, forKey: .data)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(mime, forKey: .mime)
        try container.encode(data, forKey: .data)
    }
}

struct Message: Codable, Hashable, Identifiable, Sendable {
    enum Role: String, Codable, Hashable, Sendable {
        case user
        case assistant
    }

    var id: String
    var agentId: String
    var role: Role
    var content: String
    var images: [ImageOut]
    var createdAt: Date

    init(id: String, agentId: String, role: Role, content: String, images: [ImageOut], createdAt: Date) {
        self.id = id
        self.agentId = agentId
        self.role = role
        self.content = content
        self.images = images
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey { case id, agentId, role, content, images, createdAt }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        agentId = try container.decode(String.self, forKey: .agentId)
        role = try container.decode(Role.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        images = try container.decode([ImageOut].self, forKey: .images)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
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
}

struct MessageCreate: Codable, Hashable, Sendable {
    var content: String
    var images: [ImageIn]?

    init(content: String, images: [ImageIn]? = nil) {
        self.content = content
        self.images = images
    }

    enum CodingKeys: String, CodingKey { case content, images }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        content = try container.decode(String.self, forKey: .content)
        images = try container.decodeIfPresent([ImageIn].self, forKey: .images)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(images, forKey: .images)
    }
}

struct MessageDelta: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var role: String
    var delta: String

    init(id: String, role: String, delta: String) {
        self.id = id
        self.role = role
        self.delta = delta
    }

    enum CodingKeys: String, CodingKey { case id, role, delta }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        role = try container.decode(String.self, forKey: .role)
        delta = try container.decode(String.self, forKey: .delta)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(role, forKey: .role)
        try container.encode(delta, forKey: .delta)
    }
}

struct ErrorBody: Codable, Hashable, Sendable {
    var error: String

    init(error: String) {
        self.error = error
    }

    enum CodingKeys: String, CodingKey { case error }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        error = try container.decode(String.self, forKey: .error)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(error, forKey: .error)
    }
}
