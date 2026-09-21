// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.57: while a LEFT `kind=message` is mid-stream (growing bubble +
/// caret), paint plain text only — no live markdown, mermaid, or math.
/// On complete or Stop (partial stays completed): render markdown once
/// (bold / lists / code / links + mermaid + math), then apply the
/// existing blank-line multi-bubble split.
enum MidStreamPlaintext {
    /// Markdown (and mermaid / math) only after the LEFT turn completes.
    static func shouldRenderMarkdown(completed: Bool) -> Bool {
        completed
    }
}

struct MidStreamPlaintextView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .textSelection(.enabled)
            .multilineTextAlignment(.leading)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
    }
}
