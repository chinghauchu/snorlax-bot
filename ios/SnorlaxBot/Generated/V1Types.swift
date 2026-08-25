// SPDX-License-Identifier: Apache-2.0
//
// Generated from protocol/openapi.yaml (Snorlax-Bot 0.3.0).
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
    enum Kind: String, Codable, Hashable, Sendable {
        case agent
        case channel
    }

    var id: String
    var name: String
    var title: String
    var description: String
    var avatar: String?
    var kind: Kind
    var memberIds: [String]
    var createdAt: Date
    var updatedAt: Date

    init(id: String, name: String, title: String, description: String, avatar: String?, kind: Kind, memberIds: [String], createdAt: Date, updatedAt: Date) {
        self.id = id
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
        self.kind = kind
        self.memberIds = memberIds
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey { case id, name, title, description, avatar, kind, memberIds, createdAt, updatedAt }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        avatar = try container.decode(String?.self, forKey: .avatar)
        kind = try container.decode(Kind.self, forKey: .kind)
        memberIds = try container.decode([String].self, forKey: .memberIds)
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
        try container.encode(kind, forKey: .kind)
        try container.encode(memberIds, forKey: .memberIds)
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
        try container.encode(avatar, forKey: .avatar)
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
        try container.encode(avatar, forKey: .avatar)
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

struct Mention: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String

    init(id: String, name: String) {
        self.id = id
        self.name = name
    }

    enum CodingKeys: String, CodingKey { case id, name }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
    }
}

struct HandoffRef: Codable, Hashable, Sendable {
    var channelId: String
    var threadId: String

    init(channelId: String, threadId: String) {
        self.channelId = channelId
        self.threadId = threadId
    }

    enum CodingKeys: String, CodingKey { case channelId, threadId }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        channelId = try container.decode(String.self, forKey: .channelId)
        threadId = try container.decode(String.self, forKey: .threadId)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(channelId, forKey: .channelId)
        try container.encode(threadId, forKey: .threadId)
    }
}

struct Message: Codable, Hashable, Identifiable, Sendable {
    enum Role: String, Codable, Hashable, Sendable {
        case user
        case assistant
    }
    enum Kind: String, Codable, Hashable, Sendable {
        case message
        case handoff
    }

    var id: String
    var agentId: String
    var role: Role
    var content: String
    var images: [ImageOut]
    var createdAt: Date
    var senderId: String
    var senderName: String
    var senderAvatar: String?
    var hop: Int
    var mentions: [Mention]
    var kind: Kind?
    var replyTo: String?
    var handoff: HandoffRef?
    var userAsk: String?
    var brief: String?
    var replyCount: Int?

    init(id: String, agentId: String, role: Role, content: String, images: [ImageOut], createdAt: Date, senderId: String, senderName: String, senderAvatar: String?, hop: Int, mentions: [Mention], kind: Kind? = nil, replyTo: String? = nil, handoff: HandoffRef? = nil, userAsk: String? = nil, brief: String? = nil, replyCount: Int? = nil) {
        self.id = id
        self.agentId = agentId
        self.role = role
        self.content = content
        self.images = images
        self.createdAt = createdAt
        self.senderId = senderId
        self.senderName = senderName
        self.senderAvatar = senderAvatar
        self.hop = hop
        self.mentions = mentions
        self.kind = kind
        self.replyTo = replyTo
        self.handoff = handoff
        self.userAsk = userAsk
        self.brief = brief
        self.replyCount = replyCount
    }

    enum CodingKeys: String, CodingKey { case id, agentId, role, content, images, createdAt, senderId, senderName, senderAvatar, hop, mentions, kind, replyTo, handoff, userAsk, brief, replyCount }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        agentId = try container.decode(String.self, forKey: .agentId)
        role = try container.decode(Role.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        images = try container.decode([ImageOut].self, forKey: .images)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        senderId = try container.decode(String.self, forKey: .senderId)
        senderName = try container.decode(String.self, forKey: .senderName)
        senderAvatar = try container.decode(String?.self, forKey: .senderAvatar)
        hop = try container.decode(Int.self, forKey: .hop)
        mentions = try container.decode([Mention].self, forKey: .mentions)
        kind = try container.decodeIfPresent(Kind.self, forKey: .kind)
        replyTo = try container.decodeIfPresent(String.self, forKey: .replyTo)
        handoff = try container.decodeIfPresent(HandoffRef.self, forKey: .handoff)
        userAsk = try container.decodeIfPresent(String.self, forKey: .userAsk)
        brief = try container.decodeIfPresent(String.self, forKey: .brief)
        replyCount = try container.decodeIfPresent(Int.self, forKey: .replyCount)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(agentId, forKey: .agentId)
        try container.encode(role, forKey: .role)
        try container.encode(content, forKey: .content)
        try container.encode(images, forKey: .images)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(senderId, forKey: .senderId)
        try container.encode(senderName, forKey: .senderName)
        try container.encode(senderAvatar, forKey: .senderAvatar)
        try container.encode(hop, forKey: .hop)
        try container.encode(mentions, forKey: .mentions)
        try container.encodeIfPresent(kind, forKey: .kind)
        try container.encode(replyTo, forKey: .replyTo)
        try container.encodeIfPresent(handoff, forKey: .handoff)
        try container.encode(userAsk, forKey: .userAsk)
        try container.encode(brief, forKey: .brief)
        try container.encodeIfPresent(replyCount, forKey: .replyCount)
    }
}

struct MessageCreate: Codable, Hashable, Sendable {
    var content: String
    var images: [ImageIn]?
    var mentions: [String]?
    var replyTo: String?

    init(content: String, images: [ImageIn]? = nil, mentions: [String]? = nil, replyTo: String? = nil) {
        self.content = content
        self.images = images
        self.mentions = mentions
        self.replyTo = replyTo
    }

    enum CodingKeys: String, CodingKey { case content, images, mentions, replyTo }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        content = try container.decode(String.self, forKey: .content)
        images = try container.decodeIfPresent([ImageIn].self, forKey: .images)
        mentions = try container.decodeIfPresent([String].self, forKey: .mentions)
        replyTo = try container.decodeIfPresent(String.self, forKey: .replyTo)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(images, forKey: .images)
        try container.encodeIfPresent(mentions, forKey: .mentions)
        try container.encode(replyTo, forKey: .replyTo)
    }
}

struct MessageDelta: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var role: String
    var delta: String
    var senderId: String?
    var senderName: String?
    var senderAvatar: String?

    init(id: String, role: String, delta: String, senderId: String? = nil, senderName: String? = nil, senderAvatar: String? = nil) {
        self.id = id
        self.role = role
        self.delta = delta
        self.senderId = senderId
        self.senderName = senderName
        self.senderAvatar = senderAvatar
    }

    enum CodingKeys: String, CodingKey { case id, role, delta, senderId, senderName, senderAvatar }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        role = try container.decode(String.self, forKey: .role)
        delta = try container.decode(String.self, forKey: .delta)
        senderId = try container.decodeIfPresent(String.self, forKey: .senderId)
        senderName = try container.decodeIfPresent(String.self, forKey: .senderName)
        senderAvatar = try container.decodeIfPresent(String.self, forKey: .senderAvatar)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(role, forKey: .role)
        try container.encode(delta, forKey: .delta)
        try container.encodeIfPresent(senderId, forKey: .senderId)
        try container.encodeIfPresent(senderName, forKey: .senderName)
        try container.encode(senderAvatar, forKey: .senderAvatar)
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
