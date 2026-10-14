// SPDX-License-Identifier: Apache-2.0
import Foundation

struct ModelProviderOption: Identifiable, Hashable, Sendable {
    var id: String
    var label: String
}

/// v0.98: provider labels, Use default, and the Settings link on a key error.
/// Keys themselves stay on the runtime. This type never stores one.
enum ModelProvider {
    static let localModelId = "meta-llama/Llama-3.3-70B-Instruct-FP8"

    static let options: [ModelProviderOption] = [
        ModelProviderOption(id: "omlx", label: "Local (oMLX)"),
        ModelProviderOption(id: "vllm", label: "Spark (vLLM)"),
        ModelProviderOption(id: "openai", label: "OpenAI"),
        ModelProviderOption(id: "anthropic", label: "Anthropic"),
        ModelProviderOption(id: "gemini", label: "Google Gemini"),
        ModelProviderOption(id: "grok", label: "xAI Grok"),
    ]

    static let keyProviders = ["openai", "anthropic", "gemini", "grok"]

    static func label(for id: String) -> String {
        options.first(where: { $0.id == id })?.label ?? id
    }

    /// Empty provider or a blank id is Use default.
    static func choice(provider: String, id: String) -> ModelChoice? {
        let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !provider.isEmpty, provider != "default", !trimmed.isEmpty,
              let known = ModelChoice.Provider(rawValue: provider)
        else { return nil }
        return ModelChoice(provider: known, id: trimmed)
    }

    static func summary(_ model: ModelChoice?) -> String {
        guard let model else { return "Use default" }
        let id = model.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return "Use default" }
        return "\(label(for: model.provider.rawValue)) · \(id)"
    }

    static func bubbleModel(_ model: String?) -> String? {
        let text = (model ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    static func isKeyError(_ code: String?) -> Bool {
        code == "missing_key" || code == "invalid_key"
    }

    /// The sentence stays plain. Settings is the button, not part of the body.
    static func errorCopy(_ content: String) -> (text: String, link: String) {
        let stripped = content
            .replacingOccurrences(
                of: #"\s*Settings\.?\s*$"#,
                with: "",
                options: .regularExpression
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (stripped.isEmpty ? content : stripped, "Settings")
    }
}

/// Agent info-pane save. `model: null` is explicit so Use default clears an override.
/// Other patches omit `model` and must not clear it.
struct AgentProfileWrite: Encodable, Sendable {
    var name: String
    var title: String
    var description: String
    var avatar: String?
    var model: ModelChoice?

    enum CodingKeys: String, CodingKey {
        case name, title, description, avatar, model
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(avatar, forKey: .avatar)
        if let model {
            try container.encode(model, forKey: .model)
        } else {
            try container.encodeNil(forKey: .model)
        }
    }
}
