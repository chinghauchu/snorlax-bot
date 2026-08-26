// SPDX-License-Identifier: Apache-2.0
import AuthenticationServices
import UIKit

/// Opens `authorizationUrl` in the system browser (`ASWebAuthenticationSession`).
/// The OAuth callback hits the runtime, so the client polls GET /v1/plugins.
@MainActor
enum PluginBrowser {
    static func open(_ url: URL) async {
        await withCheckedContinuation { continuation in
            var holder: SessionBox?
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: nil) { _, _ in
                holder = nil
                continuation.resume()
            }
            let box = SessionBox(session: session)
            holder = box
            session.presentationContextProvider = box
            session.prefersEphemeralWebBrowserSession = false
            if !session.start() {
                holder = nil
                continuation.resume()
            }
        }
    }

    private final class SessionBox: NSObject, ASWebAuthenticationPresentationContextProviding {
        let session: ASWebAuthenticationSession

        init(session: ASWebAuthenticationSession) {
            self.session = session
        }

        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            if let key = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
                return key
            }
            return scenes.flatMap(\.windows).first ?? ASPresentationAnchor()
        }
    }
}
