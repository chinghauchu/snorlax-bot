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
        if let avatar = agent.avatar, !avatar.isEmpty {
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
