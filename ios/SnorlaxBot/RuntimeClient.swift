// SPDX-License-Identifier: Apache-2.0
import Foundation

/// URLSession client for the locked camelCase `/v1` contract.
/// Wire types come from `Generated/V1Types.swift` (`protocol/openapi.yaml`).
struct RuntimeClient: Sendable {
    var baseURL: URL
    var token: String

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(Self.decodeDate)
        return decoder
    }

    private var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    /// Accepts Spark LAN hosts and Mac-local loopback (`http://127.0.0.1:8787`,
    /// `http://localhost:8787`). Loopback is first-class; do not reject it.
    static func normalizeBase(_ raw: String) -> URL? {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while value.hasSuffix("/") { value.removeLast() }
        guard !value.isEmpty else { return nil }
        if !value.contains("://") {
            value = "http://\(value)"
        }
        return URL(string: value)
    }

    func health() async throws -> Health {
        try await get("v1/health", authorized: false)
    }

    func listAgents() async throws -> [Agent] {
        try await get("v1/agents")
    }

    func createAgent(name: String = "New agent") async throws -> Agent {
        try await send("v1/agents", method: "POST", body: AgentCreate(name: name), expected: 201)
    }

    func createChannel(name: String, memberIds: [String]) async throws -> Agent {
        try await send(
            "v1/agents",
            method: "POST",
            body: AgentCreate(name: name, kind: .channel, memberIds: memberIds),
            expected: 201
        )
    }

    func getAgent(id: String) async throws -> Agent {
        try await get("v1/agents/\(Self.encode(id))")
    }

    func patchAgent(_ patch: AgentPatch, id: String) async throws -> Agent {
        try await send("v1/agents/\(Self.encode(id))", method: "PATCH", body: patch, expected: 200)
    }

    func deleteAgent(id: String) async throws {
        let request = try makeRequest("v1/agents/\(Self.encode(id))", method: "DELETE")
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.throwIfNeeded(data: data, response: response, allowed: [204])
    }

    func listRoutines(agentId: String) async throws -> [Routine] {
        try await get("v1/agents/\(Self.encode(agentId))/routines")
    }

    func listPlugins() async throws -> [Plugin] {
        try await get("v1/plugins")
    }

    func createPlugin(_ body: PluginCreate) async throws -> Plugin {
        try await send("v1/plugins", method: "POST", body: body, expected: 201)
    }

    func deletePlugin(id: String) async throws {
        let request = try makeRequest("v1/plugins/\(Self.encode(id))", method: "DELETE")
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.throwIfNeeded(data: data, response: response, allowed: [204])
    }

    func startPluginAuth(id: String) async throws -> PluginAuth {
        try await send(
            "v1/plugins/\(Self.encode(id))/auth",
            method: "POST",
            body: [String: String](),
            expected: 200
        )
    }

    func patchRoutine(agentId: String, routineId: String, enabled: Bool) async throws -> Routine {
        try await send(
            "v1/agents/\(Self.encode(agentId))/routines/\(Self.encode(routineId))",
            method: "PATCH",
            body: RoutinePatch(enabled: enabled),
            expected: 200
        )
    }

    func listMessages(agentId: String, limit: Int = 100, before: String? = nil, threadId: String? = nil) async throws -> [Message] {
        var items: [URLQueryItem] = [URLQueryItem(name: "limit", value: String(limit))]
        if let before {
            items.append(URLQueryItem(name: "before", value: before))
        }
        if let threadId {
            items.append(URLQueryItem(name: "threadId", value: threadId))
        }
        return try await get("v1/agents/\(Self.encode(agentId))/messages", query: items)
    }

    func sendMessage(
        agentId: String,
        content: String,
        images: [ImageIn],
        mentions: [String] = [],
        replyTo: String? = nil,
        channelId: String? = nil,
        widgetReply: WidgetReply? = nil,
        connectReply: ConnectReply? = nil,
        onEvent: @escaping @Sendable (StreamEvent) -> Void
    ) async throws {
        var request = try makeRequest(
            "v1/agents/\(Self.encode(agentId))/messages",
            method: "POST",
            body: MessageCreate(
                content: content,
                images: images.isEmpty ? nil : images,
                mentions: mentions.isEmpty ? nil : mentions,
                replyTo: replyTo,
                channelId: channelId,
                widgetReply: widgetReply,
                connectReply: connectReply
            )
        )
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 600

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 600
        config.timeoutIntervalForResource = 3600
        config.waitsForConnectivity = false
        let streamSession = URLSession(configuration: config)
        let (bytes, response) = try await streamSession.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw RuntimeError.http(status: 0, message: "No response") }
        if !(200 ..< 300).contains(http.statusCode) {
            var collected = Data()
            for try await chunk in bytes {
                collected.append(chunk)
            }
            throw Self.error(from: collected, status: http.statusCode)
        }

        var eventName = "message"
        var dataLines: [String] = []

        func flush() {
            guard !dataLines.isEmpty else { return }
            let raw = dataLines.joined(separator: "\n")
            dataLines = []
            let name = eventName
            eventName = "message"
            guard let event = StreamEvent.parse(name: name, data: raw) else { return }
            onEvent(event)
        }

        for try await line in bytes.lines {
            if line.isEmpty {
                flush()
                continue
            }
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("event:") {
                eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(line.dropFirst(5).trimmingCharacters(in: .whitespaces))
            }
        }
        flush()
    }

    func resolve(_ urlString: String) -> URL? {
        if let absolute = URL(string: urlString), let scheme = absolute.scheme, !scheme.isEmpty {
            return absolute
        }
        return URL(string: urlString, relativeTo: baseURL)?.absoluteURL
    }

    func data(from url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.throwIfNeeded(data: data, response: response, allowed: [200])
        return data
    }

    enum StreamEvent: Sendable {
        case delta(id: String, text: String, senderId: String?, senderName: String?, senderAvatar: String?)
        case done(Message)
        case tool(id: String, summary: String, done: Bool, senderId: String?, senderName: String?)
        case connectUrl(url: String, pluginId: String)
        case error(String)

        private struct ConnectUrl: Decodable, Sendable {
            var url: String
            var pluginId: String
        }

        static func parse(name: String, data: String) -> StreamEvent? {
            guard let payload = data.data(using: .utf8) else { return nil }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom(RuntimeClient.decodeDate)
            switch name {
            case "message.delta":
                guard let body = try? decoder.decode(MessageDelta.self, from: payload) else { return nil }
                return .delta(
                    id: body.id,
                    text: body.delta,
                    senderId: body.senderId,
                    senderName: body.senderName,
                    senderAvatar: body.senderAvatar
                )
            case "message.done":
                guard let message = try? decoder.decode(Message.self, from: payload) else { return nil }
                return .done(message)
            case "tool.start", "tool.done":
                guard let body = try? decoder.decode(ToolTrace.self, from: payload) else { return nil }
                return .tool(
                    id: body.id,
                    summary: body.summary,
                    done: name == "tool.done",
                    senderId: body.senderId,
                    senderName: body.senderName
                )
            case "connect.url":
                guard let body = try? decoder.decode(ConnectUrl.self, from: payload) else { return nil }
                return .connectUrl(url: body.url, pluginId: body.pluginId)
            case "error":
                let message = (try? decoder.decode(ErrorBody.self, from: payload))?.error ?? data
                return .error(message)
            default:
                return nil
            }
        }
    }

    private func get<T: Decodable>(
        _ path: String,
        authorized: Bool = true,
        query: [URLQueryItem] = []
    ) async throws -> T {
        let request = try makeRequest(path, method: "GET", authorized: authorized, query: query)
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.throwIfNeeded(data: data, response: response, allowed: [200])
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw RuntimeError.decoding
        }
    }

    private func send<Body: Encodable, T: Decodable>(
        _ path: String,
        method: String,
        body: Body,
        expected: Int
    ) async throws -> T {
        let request = try makeRequest(path, method: method, body: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.throwIfNeeded(data: data, response: response, allowed: [expected, 200])
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw RuntimeError.decoding
        }
    }

    private func makeRequest<Body: Encodable>(
        _ path: String,
        method: String,
        body: Body,
        authorized: Bool = true,
        query: [URLQueryItem] = []
    ) throws -> URLRequest {
        var request = try makeRequest(path, method: method, authorized: authorized, query: query)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return request
    }

    private func makeRequest(
        _ path: String,
        method: String,
        authorized: Bool = true,
        query: [URLQueryItem] = []
    ) throws -> URLRequest {
        let root = baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard var components = URLComponents(string: "\(root)/\(path)") else {
            throw RuntimeError.invalidURL
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else { throw RuntimeError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if authorized {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private static func throwIfNeeded(data: Data, response: URLResponse, allowed: [Int]) throws {
        guard let http = response as? HTTPURLResponse else {
            throw RuntimeError.http(status: 0, message: "No response")
        }
        if allowed.contains(http.statusCode) { return }
        throw error(from: data, status: http.statusCode)
    }

    private static func error(from data: Data, status: Int) -> RuntimeError {
        if let body = try? JSONDecoder().decode(ErrorBody.self, from: data), !body.error.isEmpty {
            return .http(status: status, message: body.error)
        }
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return .http(status: status, message: text?.isEmpty == false ? text! : "HTTP \(status)")
    }

    private static func encode(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    }

    private static func decodeDate(_ decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let date = plain.date(from: raw) { return date }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date \(raw)")
    }
}
