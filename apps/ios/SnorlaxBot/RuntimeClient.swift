// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Sketch of the locked `/v1` client. SSE streaming is ticket I1.
struct RuntimeClient: Sendable {
    var baseURL: URL
    var token: String

    func health() async throws -> Health {
        try await get("v1/health", authorized: false)
    }

    func agents() async throws -> [Agent] {
        try await get("v1/agents")
    }

    func messages(agentId: String) async throws -> [Message] {
        try await get("v1/agents/\(agentId)/messages")
    }

    private func get<T: Decodable>(_ path: String, authorized: Bool = true) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        if authorized {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
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

struct Health: Codable, Sendable {
    var ok: Bool
    var name: String
    var version: String
}

struct Agent: Codable, Identifiable, Sendable {
    var id: String
    var name: String
    var title: String
    var description: String
    var avatar: String?
    var createdAt: String
    var updatedAt: String
}

struct Message: Codable, Identifiable, Sendable {
    var id: String
    var agentId: String
    var role: String
    var content: String
    var images: [ImageOut]
    var createdAt: String
}

struct ImageOut: Codable, Identifiable, Sendable {
    var id: String
    var mime: String
    var url: String
}
