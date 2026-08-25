// SPDX-License-Identifier: Apache-2.0
import SwiftUI

@main
struct SnorlaxBotApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .tint(model.accent.color)
                .preferredColorScheme(model.theme.colorScheme)
        }
    }
}
