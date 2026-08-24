// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Sketch of the locked `/v1` client. SSE streaming is ticket I1.
struct RuntimeClient: Sendable {
    var baseURL: URL
    var token: String

    func health() async throws -> RuntimeHealth {
        try await get("v1/health")
    }

    func agents() async throws -> [Agent] {
        let body: AgentList = try await get("v1/agents")
        return body.agents
    }

    func messages(agentId: String) async throws -> [Message] {
        let body: MessageList = try await get("v1/agents/\(agentId)/messages")
        return body.messages
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw RuntimeError.http
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum RuntimeError: Error {
    case http
}

struct RuntimeHealth: Codable, Sendable {
    var status: String
    var model: String
    var inference_backend: String
    var seeded_agent_id: String
    var bind_host: String
}

struct Agent: Codable, Identifiable, Sendable {
    var id: String
    var name: String
    var instructions: String
    var created_at: String
    var updated_at: String
}

struct AgentList: Codable, Sendable {
    var agents: [Agent]
}

struct Message: Codable, Identifiable, Sendable {
    var id: String
    var agent_id: String
    var role: String
    var content: String
    var created_at: String
}

struct MessageList: Codable, Sendable {
    var messages: [Message]
}
