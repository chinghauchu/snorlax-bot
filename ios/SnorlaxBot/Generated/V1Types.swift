// SPDX-License-Identifier: Apache-2.0
//
// Generated from protocol/openapi.yaml (Snorlax-Bot 0.18.0).
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
    var sharedProject: Bool
    var createdAt: Date
    var updatedAt: Date

    init(id: String, name: String, title: String, description: String, avatar: String?, kind: Kind, memberIds: [String], sharedProject: Bool, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
        self.kind = kind
        self.memberIds = memberIds
        self.sharedProject = sharedProject
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey { case id, name, title, description, avatar, kind, memberIds, sharedProject, createdAt, updatedAt }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        avatar = try container.decode(String?.self, forKey: .avatar)
        kind = try container.decode(Kind.self, forKey: .kind)
        memberIds = try container.decode([String].self, forKey: .memberIds)
        sharedProject = try container.decode(Bool.self, forKey: .sharedProject)
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
        try container.encode(sharedProject, forKey: .sharedProject)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
}

struct AgentCreate: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Hashable, Sendable {
        case agent
        case channel
    }

    var name: String?
    var title: String?
    var description: String?
    var avatar: String?
    var kind: Kind?
    var memberIds: [String]?

    init(name: String? = nil, title: String? = nil, description: String? = nil, avatar: String? = nil, kind: Kind? = nil, memberIds: [String]? = nil) {
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
        self.kind = kind
        self.memberIds = memberIds
    }

    enum CodingKeys: String, CodingKey { case name, title, description, avatar, kind, memberIds }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        kind = try container.decodeIfPresent(Kind.self, forKey: .kind)
        memberIds = try container.decodeIfPresent([String].self, forKey: .memberIds)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(avatar, forKey: .avatar)
        try container.encodeIfPresent(kind, forKey: .kind)
        try container.encodeIfPresent(memberIds, forKey: .memberIds)
    }
}

struct AgentPatch: Codable, Hashable, Sendable {
    var name: String?
    var title: String?
    var description: String?
    var avatar: String?
    var memberIds: [String]?
    var sharedProject: Bool?

    init(name: String? = nil, title: String? = nil, description: String? = nil, avatar: String? = nil, memberIds: [String]? = nil, sharedProject: Bool? = nil) {
        self.name = name
        self.title = title
        self.description = description
        self.avatar = avatar
        self.memberIds = memberIds
        self.sharedProject = sharedProject
    }

    enum CodingKeys: String, CodingKey { case name, title, description, avatar, memberIds, sharedProject }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        memberIds = try container.decodeIfPresent([String].self, forKey: .memberIds)
        sharedProject = try container.decodeIfPresent(Bool.self, forKey: .sharedProject)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(avatar, forKey: .avatar)
        try container.encodeIfPresent(memberIds, forKey: .memberIds)
        try container.encodeIfPresent(sharedProject, forKey: .sharedProject)
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
        case tool
        case widget
        case connect
    }
    enum ConnectStatus: String, Codable, Hashable, Sendable {
        case pending
        case connected
        case dismissed
    }
    enum WidgetStatus: String, Codable, Hashable, Sendable {
        case pending
        case resolved
        case dismissed
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
    var widget: Widget?
    var connect: ConnectCard?
    var connectStatus: ConnectStatus?
    var widgetStatus: WidgetStatus?
    var widgetValues: [String]?
    var routineName: String?

    init(id: String, agentId: String, role: Role, content: String, images: [ImageOut], createdAt: Date, senderId: String, senderName: String, senderAvatar: String?, hop: Int, mentions: [Mention], kind: Kind? = nil, replyTo: String? = nil, handoff: HandoffRef? = nil, userAsk: String? = nil, brief: String? = nil, replyCount: Int? = nil, widget: Widget? = nil, connect: ConnectCard? = nil, connectStatus: ConnectStatus? = nil, widgetStatus: WidgetStatus? = nil, widgetValues: [String]? = nil, routineName: String? = nil) {
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
        self.widget = widget
        self.connect = connect
        self.connectStatus = connectStatus
        self.widgetStatus = widgetStatus
        self.widgetValues = widgetValues
        self.routineName = routineName
    }

    enum CodingKeys: String, CodingKey { case id, agentId, role, content, images, createdAt, senderId, senderName, senderAvatar, hop, mentions, kind, replyTo, handoff, userAsk, brief, replyCount, widget, connect, connectStatus, widgetStatus, widgetValues, routineName }

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
        widget = try container.decodeIfPresent(Widget.self, forKey: .widget)
        connect = try container.decodeIfPresent(ConnectCard.self, forKey: .connect)
        connectStatus = try container.decodeIfPresent(ConnectStatus.self, forKey: .connectStatus)
        widgetStatus = try container.decodeIfPresent(WidgetStatus.self, forKey: .widgetStatus)
        widgetValues = try container.decodeIfPresent([String].self, forKey: .widgetValues)
        routineName = try container.decodeIfPresent(String.self, forKey: .routineName)
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
        try container.encodeIfPresent(widget, forKey: .widget)
        try container.encodeIfPresent(connect, forKey: .connect)
        try container.encodeIfPresent(connectStatus, forKey: .connectStatus)
        try container.encodeIfPresent(widgetStatus, forKey: .widgetStatus)
        try container.encodeIfPresent(widgetValues, forKey: .widgetValues)
        try container.encode(routineName, forKey: .routineName)
    }
}

struct WidgetOption: Codable, Hashable, Sendable {
    enum Style: String, Codable, Hashable, Sendable {
        case `default`
        case primary
        case danger
    }

    var label: String
    var value: String?
    var description: String?
    var style: Style?

    init(label: String, value: String? = nil, description: String? = nil, style: Style? = nil) {
        self.label = label
        self.value = value
        self.description = description
        self.style = style
    }

    enum CodingKeys: String, CodingKey { case label, value, description, style }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        label = try container.decode(String.self, forKey: .label)
        value = try container.decodeIfPresent(String.self, forKey: .value)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        style = try container.decodeIfPresent(Style.self, forKey: .style)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(label, forKey: .label)
        try container.encodeIfPresent(value, forKey: .value)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(style, forKey: .style)
    }
}

struct Widget: Codable, Hashable, Sendable {
    var prompt: String
    var helpText: String?
    var options: [WidgetOption]
    var allowCustom: Bool?
    var multiSelect: Bool?
    var dismissOnMoveOn: Bool?

    init(prompt: String, helpText: String? = nil, options: [WidgetOption], allowCustom: Bool? = nil, multiSelect: Bool? = nil, dismissOnMoveOn: Bool? = nil) {
        self.prompt = prompt
        self.helpText = helpText
        self.options = options
        self.allowCustom = allowCustom
        self.multiSelect = multiSelect
        self.dismissOnMoveOn = dismissOnMoveOn
    }

    enum CodingKeys: String, CodingKey { case prompt, helpText, options, allowCustom, multiSelect, dismissOnMoveOn }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        prompt = try container.decode(String.self, forKey: .prompt)
        helpText = try container.decodeIfPresent(String.self, forKey: .helpText)
        options = try container.decode([WidgetOption].self, forKey: .options)
        allowCustom = try container.decodeIfPresent(Bool.self, forKey: .allowCustom)
        multiSelect = try container.decodeIfPresent(Bool.self, forKey: .multiSelect)
        dismissOnMoveOn = try container.decodeIfPresent(Bool.self, forKey: .dismissOnMoveOn)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(prompt, forKey: .prompt)
        try container.encode(helpText, forKey: .helpText)
        try container.encode(options, forKey: .options)
        try container.encodeIfPresent(allowCustom, forKey: .allowCustom)
        try container.encodeIfPresent(multiSelect, forKey: .multiSelect)
        try container.encodeIfPresent(dismissOnMoveOn, forKey: .dismissOnMoveOn)
    }
}

struct WidgetReply: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var values: [String]?
    var dismissed: Bool?

    init(id: String, values: [String]? = nil, dismissed: Bool? = nil) {
        self.id = id
        self.values = values
        self.dismissed = dismissed
    }

    enum CodingKeys: String, CodingKey { case id, values, dismissed }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        values = try container.decodeIfPresent([String].self, forKey: .values)
        dismissed = try container.decodeIfPresent(Bool.self, forKey: .dismissed)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(values, forKey: .values)
        try container.encodeIfPresent(dismissed, forKey: .dismissed)
    }
}

struct ConnectCard: Codable, Hashable, Sendable {
    var prompt: String
    var pluginId: String
    var helpText: String?

    init(prompt: String, pluginId: String, helpText: String? = nil) {
        self.prompt = prompt
        self.pluginId = pluginId
        self.helpText = helpText
    }

    enum CodingKeys: String, CodingKey { case prompt, pluginId, helpText }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        prompt = try container.decode(String.self, forKey: .prompt)
        pluginId = try container.decode(String.self, forKey: .pluginId)
        helpText = try container.decodeIfPresent(String.self, forKey: .helpText)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(prompt, forKey: .prompt)
        try container.encode(pluginId, forKey: .pluginId)
        try container.encode(helpText, forKey: .helpText)
    }
}

struct ConnectReply: Codable, Hashable, Identifiable, Sendable {
    var id: String?
    var dismissed: Bool?

    init(id: String? = nil, dismissed: Bool? = nil) {
        self.id = id
        self.dismissed = dismissed
    }

    enum CodingKeys: String, CodingKey { case id, dismissed }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        dismissed = try container.decodeIfPresent(Bool.self, forKey: .dismissed)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(id, forKey: .id)
        try container.encodeIfPresent(dismissed, forKey: .dismissed)
    }
}

struct MessageCreate: Codable, Hashable, Sendable {
    var content: String?
    var images: [ImageIn]?
    var mentions: [String]?
    var replyTo: String?
    var channelId: String?
    var widgetReply: WidgetReply?
    var connectReply: ConnectReply?

    init(content: String? = nil, images: [ImageIn]? = nil, mentions: [String]? = nil, replyTo: String? = nil, channelId: String? = nil, widgetReply: WidgetReply? = nil, connectReply: ConnectReply? = nil) {
        self.content = content
        self.images = images
        self.mentions = mentions
        self.replyTo = replyTo
        self.channelId = channelId
        self.widgetReply = widgetReply
        self.connectReply = connectReply
    }

    enum CodingKeys: String, CodingKey { case content, images, mentions, replyTo, channelId, widgetReply, connectReply }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        content = try container.decodeIfPresent(String.self, forKey: .content)
        images = try container.decodeIfPresent([ImageIn].self, forKey: .images)
        mentions = try container.decodeIfPresent([String].self, forKey: .mentions)
        replyTo = try container.decodeIfPresent(String.self, forKey: .replyTo)
        channelId = try container.decodeIfPresent(String.self, forKey: .channelId)
        widgetReply = try container.decodeIfPresent(WidgetReply.self, forKey: .widgetReply)
        connectReply = try container.decodeIfPresent(ConnectReply.self, forKey: .connectReply)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(content, forKey: .content)
        try container.encodeIfPresent(images, forKey: .images)
        try container.encodeIfPresent(mentions, forKey: .mentions)
        try container.encode(replyTo, forKey: .replyTo)
        try container.encode(channelId, forKey: .channelId)
        try container.encodeIfPresent(widgetReply, forKey: .widgetReply)
        try container.encodeIfPresent(connectReply, forKey: .connectReply)
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

struct ToolTrace: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var summary: String
    var ok: Bool?
    var senderId: String?
    var senderName: String?

    init(id: String, name: String, summary: String, ok: Bool? = nil, senderId: String? = nil, senderName: String? = nil) {
        self.id = id
        self.name = name
        self.summary = summary
        self.ok = ok
        self.senderId = senderId
        self.senderName = senderName
    }

    enum CodingKeys: String, CodingKey { case id, name, summary, ok, senderId, senderName }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        summary = try container.decode(String.self, forKey: .summary)
        ok = try container.decodeIfPresent(Bool.self, forKey: .ok)
        senderId = try container.decodeIfPresent(String.self, forKey: .senderId)
        senderName = try container.decodeIfPresent(String.self, forKey: .senderName)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(summary, forKey: .summary)
        try container.encode(ok, forKey: .ok)
        try container.encodeIfPresent(senderId, forKey: .senderId)
        try container.encodeIfPresent(senderName, forKey: .senderName)
    }
}

struct WorkspaceEntry: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Hashable, Sendable {
        case file
        case dir
    }

    var name: String
    var kind: Kind
    var size: Int?

    init(name: String, kind: Kind, size: Int? = nil) {
        self.name = name
        self.kind = kind
        self.size = size
    }

    enum CodingKeys: String, CodingKey { case name, kind, size }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        kind = try container.decode(Kind.self, forKey: .kind)
        size = try container.decodeIfPresent(Int.self, forKey: .size)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(size, forKey: .size)
    }
}

struct WorkspaceListing: Codable, Hashable, Sendable {
    var root: String
    var path: String
    var entries: [WorkspaceEntry]

    init(root: String, path: String, entries: [WorkspaceEntry]) {
        self.root = root
        self.path = path
        self.entries = entries
    }

    enum CodingKeys: String, CodingKey { case root, path, entries }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        root = try container.decode(String.self, forKey: .root)
        path = try container.decode(String.self, forKey: .path)
        entries = try container.decode([WorkspaceEntry].self, forKey: .entries)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(root, forKey: .root)
        try container.encode(path, forKey: .path)
        try container.encode(entries, forKey: .entries)
    }
}

struct WorkspaceFile: Codable, Hashable, Sendable {
    var path: String
    var content: String
    var truncated: Bool?

    init(path: String, content: String, truncated: Bool? = nil) {
        self.path = path
        self.content = content
        self.truncated = truncated
    }

    enum CodingKeys: String, CodingKey { case path, content, truncated }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        path = try container.decode(String.self, forKey: .path)
        content = try container.decode(String.self, forKey: .content)
        truncated = try container.decodeIfPresent(Bool.self, forKey: .truncated)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(path, forKey: .path)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(truncated, forKey: .truncated)
    }
}

struct ComputerPreview: Codable, Hashable, Sendable {
    enum Driving: String, Codable, Hashable, Sendable {
        case user
        case agent
        case idle
    }

    var hasSandbox: Bool
    var width: Int
    var height: Int
    var imageUrl: String?
    var driving: Driving?
    var recording: Bool?

    init(hasSandbox: Bool, width: Int, height: Int, imageUrl: String? = nil, driving: Driving? = nil, recording: Bool? = nil) {
        self.hasSandbox = hasSandbox
        self.width = width
        self.height = height
        self.imageUrl = imageUrl
        self.driving = driving
        self.recording = recording
    }

    enum CodingKeys: String, CodingKey { case hasSandbox, width, height, imageUrl, driving, recording }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        hasSandbox = try container.decode(Bool.self, forKey: .hasSandbox)
        width = try container.decode(Int.self, forKey: .width)
        height = try container.decode(Int.self, forKey: .height)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        driving = try container.decodeIfPresent(Driving.self, forKey: .driving)
        recording = try container.decodeIfPresent(Bool.self, forKey: .recording)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(hasSandbox, forKey: .hasSandbox)
        try container.encode(width, forKey: .width)
        try container.encode(height, forKey: .height)
        try container.encodeIfPresent(imageUrl, forKey: .imageUrl)
        try container.encodeIfPresent(driving, forKey: .driving)
        try container.encodeIfPresent(recording, forKey: .recording)
    }
}

struct ComputerSession: Codable, Hashable, Sendable {
    var sessionId: String

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    enum CodingKeys: String, CodingKey { case sessionId }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try container.decode(String.self, forKey: .sessionId)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(sessionId, forKey: .sessionId)
    }
}

struct ComputerRecording: Codable, Hashable, Sendable {
    var recording: Bool

    init(recording: Bool) {
        self.recording = recording
    }

    enum CodingKeys: String, CodingKey { case recording }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        recording = try container.decode(Bool.self, forKey: .recording)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(recording, forKey: .recording)
    }
}

struct PointerEvent: Codable, Hashable, Sendable {
    enum Type: String, Codable, Hashable, Sendable {
        case move
        case down
        case up
        case click
    }

    var x: Int
    var y: Int
    var type: Type

    init(x: Int, y: Int, type: Type) {
        self.x = x
        self.y = y
        self.type = type
    }

    enum CodingKeys: String, CodingKey { case x, y, type }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        x = try container.decode(Int.self, forKey: .x)
        y = try container.decode(Int.self, forKey: .y)
        type = try container.decode(Type.self, forKey: .type)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(x, forKey: .x)
        try container.encode(y, forKey: .y)
        try container.encode(type, forKey: .type)
    }
}

struct KeyEvent: Codable, Hashable, Sendable {
    enum Type: String, Codable, Hashable, Sendable {
        case down
        case up
        case type
    }

    var key: String
    var type: Type
    var text: String?

    init(key: String, type: Type, text: String? = nil) {
        self.key = key
        self.type = type
        self.text = text
    }

    enum CodingKeys: String, CodingKey { case key, type, text }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decode(String.self, forKey: .key)
        type = try container.decode(Type.self, forKey: .type)
        text = try container.decodeIfPresent(String.self, forKey: .text)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(key, forKey: .key)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(text, forKey: .text)
    }
}

struct Routine: Codable, Hashable, Identifiable, Sendable {
    enum Kind: String, Codable, Hashable, Sendable {
        case cron
        case webhook
        case slack
        case github
    }

    var id: String
    var name: String
    var skill: String
    var kind: Kind
    var schedule: String?
    var enabled: Bool
    var scheduleLabel: String?
    var webhookUrl: String?
    var label: String?

    init(id: String, name: String, skill: String, kind: Kind, schedule: String? = nil, enabled: Bool, scheduleLabel: String? = nil, webhookUrl: String? = nil, label: String? = nil) {
        self.id = id
        self.name = name
        self.skill = skill
        self.kind = kind
        self.schedule = schedule
        self.enabled = enabled
        self.scheduleLabel = scheduleLabel
        self.webhookUrl = webhookUrl
        self.label = label
    }

    enum CodingKeys: String, CodingKey { case id, name, skill, kind, schedule, enabled, scheduleLabel, webhookUrl, label }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        skill = try container.decode(String.self, forKey: .skill)
        kind = try container.decode(Kind.self, forKey: .kind)
        schedule = try container.decodeIfPresent(String.self, forKey: .schedule)
        enabled = try container.decode(Bool.self, forKey: .enabled)
        scheduleLabel = try container.decodeIfPresent(String.self, forKey: .scheduleLabel)
        webhookUrl = try container.decodeIfPresent(String.self, forKey: .webhookUrl)
        label = try container.decodeIfPresent(String.self, forKey: .label)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(skill, forKey: .skill)
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(schedule, forKey: .schedule)
        try container.encode(enabled, forKey: .enabled)
        try container.encodeIfPresent(scheduleLabel, forKey: .scheduleLabel)
        try container.encodeIfPresent(webhookUrl, forKey: .webhookUrl)
        try container.encodeIfPresent(label, forKey: .label)
    }
}

struct RoutineTrigger: Codable, Hashable, Sendable {
    var type: String
    var label: String?

    init(type: String, label: String? = nil) {
        self.type = type
        self.label = label
    }

    enum CodingKeys: String, CodingKey { case type, label }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        label = try container.decodeIfPresent(String.self, forKey: .label)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(label, forKey: .label)
    }
}

struct RoutineCreate: Codable, Hashable, Sendable {
    var name: String
    var skill: String
    var schedule: String?
    var trigger: RoutineTrigger?

    init(name: String, skill: String, schedule: String? = nil, trigger: RoutineTrigger? = nil) {
        self.name = name
        self.skill = skill
        self.schedule = schedule
        self.trigger = trigger
    }

    enum CodingKeys: String, CodingKey { case name, skill, schedule, trigger }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        skill = try container.decode(String.self, forKey: .skill)
        schedule = try container.decodeIfPresent(String.self, forKey: .schedule)
        trigger = try container.decodeIfPresent(RoutineTrigger.self, forKey: .trigger)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(skill, forKey: .skill)
        try container.encodeIfPresent(schedule, forKey: .schedule)
        try container.encodeIfPresent(trigger, forKey: .trigger)
    }
}

struct RoutinePatch: Codable, Hashable, Sendable {
    var enabled: Bool

    init(enabled: Bool) {
        self.enabled = enabled
    }

    enum CodingKeys: String, CodingKey { case enabled }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try container.decode(Bool.self, forKey: .enabled)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(enabled, forKey: .enabled)
    }
}

struct SkillInfo: Codable, Hashable, Sendable {
    enum Source: String, Codable, Hashable, Sendable {
        case workspace
        case skillsDir
    }

    var name: String
    var description: String
    var source: Source
    var path: String

    init(name: String, description: String, source: Source, path: String) {
        self.name = name
        self.description = description
        self.source = source
        self.path = path
    }

    enum CodingKeys: String, CodingKey { case name, description, source, path }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        source = try container.decode(Source.self, forKey: .source)
        path = try container.decode(String.self, forKey: .path)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(description, forKey: .description)
        try container.encode(source, forKey: .source)
        try container.encode(path, forKey: .path)
    }
}

struct Skill: Codable, Hashable, Identifiable, Sendable {
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

struct SkillCreate: Codable, Hashable, Sendable {
    var name: String

    init(name: String) {
        self.name = name
    }

    enum CodingKeys: String, CodingKey { case name }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
    }
}

struct SkillBody: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var body: String

    init(id: String, name: String, body: String) {
        self.id = id
        self.name = name
        self.body = body
    }

    enum CodingKeys: String, CodingKey { case id, name, body }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        body = try container.decode(String.self, forKey: .body)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(body, forKey: .body)
    }
}

struct SkillPatch: Codable, Hashable, Sendable {
    var name: String
    var body: String

    init(name: String, body: String) {
        self.name = name
        self.body = body
    }

    enum CodingKeys: String, CodingKey { case name, body }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        body = try container.decode(String.self, forKey: .body)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(body, forKey: .body)
    }
}

struct Plugin: Codable, Hashable, Identifiable, Sendable {
    enum Status: String, Codable, Hashable, Sendable {
        case connected
        case needsAuth
    }

    var id: String
    var name: String
    var status: Status

    init(id: String, name: String, status: Status) {
        self.id = id
        self.name = name
        self.status = status
    }

    enum CodingKeys: String, CodingKey { case id, name, status }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        status = try container.decode(Status.self, forKey: .status)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(status, forKey: .status)
    }
}

struct PluginCreate: Codable, Hashable, Sendable {
    enum Transport: String, Codable, Hashable, Sendable {
        case stdio
        case url
    }

    var name: String
    var transport: Transport
    var command: String?
    var args: [String]?
    var url: String?

    init(name: String, transport: Transport, command: String? = nil, args: [String]? = nil, url: String? = nil) {
        self.name = name
        self.transport = transport
        self.command = command
        self.args = args
        self.url = url
    }

    enum CodingKeys: String, CodingKey { case name, transport, command, args, url }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        transport = try container.decode(Transport.self, forKey: .transport)
        command = try container.decodeIfPresent(String.self, forKey: .command)
        args = try container.decodeIfPresent([String].self, forKey: .args)
        url = try container.decodeIfPresent(String.self, forKey: .url)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(transport, forKey: .transport)
        try container.encodeIfPresent(command, forKey: .command)
        try container.encodeIfPresent(args, forKey: .args)
        try container.encodeIfPresent(url, forKey: .url)
    }
}

struct PluginAuth: Codable, Hashable, Sendable {
    var authorizationUrl: String

    init(authorizationUrl: String) {
        self.authorizationUrl = authorizationUrl
    }

    enum CodingKeys: String, CodingKey { case authorizationUrl }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        authorizationUrl = try container.decode(String.self, forKey: .authorizationUrl)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(authorizationUrl, forKey: .authorizationUrl)
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
