// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct AgentAvatar: View {
    let agent: Agent
    var size: CGFloat

    var body: some View {
        avatar
            .frame(width: size, height: size)
            .clipShape(Circle())
    }

    @ViewBuilder
    private var avatar: some View {
        if agent.isChannel, agent.avatar == nil || agent.avatar?.isEmpty == true {
            ZStack {
                Circle().fill(Color.accentColor.opacity(0.25))
                Image(systemName: "person.2.fill")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(.primary)
            }
        } else if let avatar = agent.avatar, !avatar.isEmpty {
            if avatar.hasPrefix("data:"), let data = DataURI.decode(avatar), let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                RemoteImage(urlString: avatar, mime: "image/jpeg")
            }
        } else {
            ZStack {
                Circle().fill(Color.accentColor.opacity(0.25))
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(.primary)
            }
        }
    }

    private var initials: String {
        let parts = agent.name.split(separator: " ")
        let first = parts.first?.first.map(String.init) ?? "?"
        let second = parts.dropFirst().first?.first.map(String.init) ?? ""
        return (first + second).uppercased()
    }
}

struct RemoteImage: View {
    let urlString: String
    var mime: String
    @Environment(AppModel.self) private var model
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(uiColor: .tertiarySystemFill))
                    .overlay { ProgressView().scaleEffect(0.8) }
                    .frame(minHeight: 80)
            }
        }
        .task(id: urlString) { await load() }
    }

    private func load() async {
        if urlString.hasPrefix("data:"), let data = DataURI.decode(urlString) {
            image = UIImage(data: data)
            return
        }
        guard let client = model.client, let url = client.resolve(urlString) else { return }
        do {
            let data = try await client.data(from: url)
            image = UIImage(data: data)
        } catch {
            image = nil
        }
    }
}

enum DataURI {
    static func decode(_ value: String) -> Data? {
        let marker = "base64,"
        guard let range = value.range(of: marker) else { return nil }
        return Data(base64Encoded: String(value[range.upperBound...]))
    }
}

struct MentionLabel: View {
    let text: String
    let names: [String]
    var links = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        Text(attributed)
            .multilineTextAlignment(.leading)
            .environment(\.openURL, OpenURLAction { url in
                guard links, url.scheme?.lowercased() == "https" else { return .discarded }
                openURL(url)
                return .handled
            })
    }

    private var attributed: AttributedString {
        var output = AttributedString()
        let pattern = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9._-]*)")
        let ns = text as NSString
        let full = NSRange(location: 0, length: ns.length)
        var last = 0
        let lowered = names.map { $0.lowercased() } + ["everyone"]
        pattern?.enumerateMatches(in: text, range: full) { match, _, _ in
            guard let match else { return }
            if match.range.location > last {
                appendPlain(ns.substring(with: NSRange(location: last, length: match.range.location - last)), to: &output)
            }
            let token = ns.substring(with: match.range(at: 1))
            var chunk = AttributedString(ns.substring(with: match.range))
            let resolved = lowered.contains(token.lowercased())
            if resolved {
                chunk.foregroundColor = .accentColor
                chunk.font = .system(size: 14, weight: .semibold)
            }
            output.append(chunk)
            last = match.range.location + match.range.length
        }
        if last < ns.length {
            appendPlain(ns.substring(from: last), to: &output)
        }
        if output.characters.isEmpty {
            appendPlain(text, to: &output)
        }
        return output
    }

    private func appendPlain(_ raw: String, to output: inout AttributedString) {
        guard links else {
            output.append(AttributedString(raw))
            return
        }
        guard let pattern = try? NSRegularExpression(pattern: "https://[^\\s<>\"'`]+") else {
            output.append(AttributedString(raw))
            return
        }
        let ns = raw as NSString
        let full = NSRange(location: 0, length: ns.length)
        var last = 0
        pattern.enumerateMatches(in: raw, range: full) { match, _, _ in
            guard let match else { return }
            if match.range.location > last {
                output.append(AttributedString(ns.substring(with: NSRange(location: last, length: match.range.location - last))))
            }
            var url = ns.substring(with: match.range)
            while let lastChar = url.last, ".,;:!?)".contains(lastChar) {
                url.removeLast()
            }
            if let parsed = URL(string: url), parsed.scheme?.lowercased() == "https" {
                var chunk = AttributedString(url)
                chunk.link = parsed
                chunk.foregroundColor = .accentColor
                output.append(chunk)
                last = match.range.location + url.count
            } else {
                last = match.range.location
            }
        }
        if last < ns.length {
            output.append(AttributedString(ns.substring(from: last)))
        }
    }
}
