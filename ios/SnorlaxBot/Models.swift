// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI
import UIKit
import UniformTypeIdentifiers

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
    var isKindMessage: Bool { kind == nil || kind == .message }
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

    static func optimisticUser(
        agentId: String,
        content: String,
        attachments: [Attachment] = []
    ) -> Message {
        Message(
            id: "local-\(UUID().uuidString)",
            agentId: agentId,
            role: .user,
            content: content,
            images: [],
            attachments: attachments,
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
            attachments: [],
            createdAt: Date(),
            senderId: senderId,
            senderName: senderName,
            senderAvatar: senderAvatar,
            hop: 0,
            mentions: []
        )
    }

    var userRightAttachments: [Attachment] {
        if !attachments.isEmpty { return attachments }
        return images.map {
            Attachment(id: $0.id, kind: .image, name: $0.id, url: $0.url, size: 0)
        }
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

struct PendingChatAttachment: Identifiable, Sendable {
    var id: String
    var kind: Attachment.Kind
    var name: String
    var url: String
    var size: Int
    var previewData: Data?
    var posterImage: UIImage?

    var asAttachment: Attachment {
        Attachment(id: id, kind: kind, name: name, url: url, size: size)
    }
}

enum ChatAttachment {
    static let maxBytes = 10 * 1024 * 1024
    static let maxVideoBytes = 50 * 1024 * 1024
    static let errMax = "Max 10MB."
    static let errMaxVideo = "Max 50MB."

    static func isVideo(name: String, mime: String) -> Bool {
        let mime = mime.lowercased()
        let lowered = name.lowercased()
        return mime.hasPrefix("video/")
            || lowered.hasSuffix(".mp4")
            || lowered.hasSuffix(".mov")
            || lowered.hasSuffix(".m4v")
            || lowered.hasSuffix(".webm")
            || lowered.hasSuffix(".avi")
            || lowered.hasSuffix(".mkv")
    }

    static func clientError(name: String, mime: String, size: Int) -> String? {
        if isVideo(name: name, mime: mime) {
            if size > maxVideoBytes { return errMaxVideo }
            return nil
        }
        if size > maxBytes { return errMax }
        return nil
    }

    static func formatSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return "\(Int((Double(bytes) / 1024.0).rounded())) KB" }
        let mb = Double(bytes) / (1024.0 * 1024.0)
        if mb < 10 {
            return String(format: "%.1f MB", mb)
        }
        return "\(Int(mb.rounded())) MB"
    }
}

enum ComposerPasteboard {
    struct Attachment: Sendable {
        var name: String
        var mime: String
        var data: Data
    }

    static func bitmapName(mime: String) -> String {
        switch mime.lowercased() {
        case "image/jpeg", "image/jpg": return "image.jpg"
        case "image/gif": return "image.gif"
        case "image/webp": return "image.webp"
        default: return "image.png"
        }
    }

    static func attachments(from board: UIPasteboard) -> [Attachment] {
        var out: [Attachment] = []
        var seen = Set<Int>()

        func add(name: String, mime: String, data: Data) {
            guard !data.isEmpty else { return }
            let key = data.hashValue &+ data.count
            if seen.contains(key) { return }
            seen.insert(key)
            out.append(Attachment(name: name, mime: mime, data: data))
        }

        for item in board.items {
            if let url = fileURL(from: item) {
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url), !data.isEmpty {
                    let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
                        ?? mimeForData(data)
                    add(name: url.lastPathComponent, mime: mime, data: data)
                    continue
                }
            }
            if let data = imageData(from: item) {
                let mime = data.sniffedImageMIME
                add(name: bitmapName(mime: mime), mime: mime, data: data)
                continue
            }
            if let data = videoData(from: item) {
                let mime = data.sniffedVideoMIME ?? "video/mp4"
                add(name: "video.mp4", mime: mime, data: data)
            }
        }

        if out.isEmpty, let image = board.image, let data = image.pngData() {
            add(name: "image.png", mime: "image/png", data: data)
        }
        return out
    }

    static func shouldIntercept(_ board: UIPasteboard) -> Bool {
        !attachments(from: board).isEmpty
    }

    static func plainText(from board: UIPasteboard, files: [Attachment]) -> String {
        let raw = board.string ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        if trimmed.lowercased().hasPrefix("file://") { return "" }
        if files.count == 1 {
            let name = files[0].name
            if trimmed == name || trimmed.hasSuffix("/\(name)") { return "" }
        }
        return raw
    }

    private static func fileURL(from item: [String: Any]) -> URL? {
        for key in ["public.file-url", UTType.fileURL.identifier] {
            guard let value = item[key] else { continue }
            if let url = value as? URL, url.isFileURL { return url }
            if let s = value as? String, let url = URL(string: s), url.isFileURL { return url }
            if let data = value as? Data {
                if let url = URL(dataRepresentation: data, relativeTo: nil), url.isFileURL {
                    return url
                }
                if let s = String(data: data, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                   let url = URL(string: s), url.isFileURL
                {
                    return url
                }
            }
        }
        return nil
    }

    private static func imageData(from item: [String: Any]) -> Data? {
        let keys = [
            "public.png", "public.jpeg", "public.jpeg-2000", "public.gif",
            "public.tiff", "public.webp", "public.heic", "com.apple.uikit.image",
            UTType.png.identifier, UTType.jpeg.identifier, UTType.gif.identifier,
            UTType.webP.identifier, UTType.image.identifier,
        ]
        for key in keys {
            if let data = item[key] as? Data, !data.isEmpty { return data }
            if let image = item[key] as? UIImage { return image.pngData() }
        }
        return nil
    }

    private static func videoData(from item: [String: Any]) -> Data? {
        let keys = [
            "public.mpeg-4", "public.movie", "com.apple.quicktime-movie",
            UTType.mpeg4Movie.identifier, UTType.quickTimeMovie.identifier,
            UTType.movie.identifier, UTType.video.identifier,
        ]
        for key in keys {
            if let data = item[key] as? Data, !data.isEmpty { return data }
            if let url = fileURL(from: [key: item[key] as Any]) {
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url), !data.isEmpty { return data }
            }
        }
        return nil
    }

    private static func mimeForData(_ data: Data) -> String {
        if let video = data.sniffedVideoMIME { return video }
        return data.sniffedImageMIME
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
        if count >= 12, self[4..<8] == Data("ftyp".utf8) {
            let brand = String(data: self[8..<12], encoding: .ascii)?.lowercased() ?? ""
            if ["heic", "heif", "mif1", "msf1"].contains(brand) { return "image/heic" }
        }
        return "image/jpeg"
    }

    var sniffedVideoMIME: String? {
        if count >= 12, self[4..<8] == Data("ftyp".utf8) {
            let brand = String(data: self[8..<12], encoding: .ascii)?.lowercased() ?? ""
            if ["heic", "heif", "mif1", "msf1"].contains(brand) { return nil }
            return "video/mp4"
        }
        if starts(with: [0x1A, 0x45, 0xDF, 0xA3]) { return "video/webm" }
        return nil
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
