// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v0.57: while a LEFT `kind=message` is mid-stream (growing bubble +
/// caret), paint plain text only — no live markdown, mermaid, or math.
/// v0.82 still linkifies a bare http(s) URL in that plain text once it
/// is complete; a URL at the end of the buffer stays plain. On complete
/// or Stop (partial stays completed): render markdown once (bold / lists
/// / code / links + mermaid + math), then apply the existing blank-line
/// multi-bubble split.
enum MidStreamPlaintext {
    /// Markdown (and mermaid / math) only after the LEFT turn completes.
    static func shouldRenderMarkdown(completed: Bool) -> Bool {
        completed
    }
}

struct MidStreamPlaintextView: View {
    let text: String
    var rowId: String = ""
    @Environment(\.openURL) private var openURL
    @Environment(\.chatFind) private var find
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.transcriptTextPercent) private var transcriptTextPercent

    var body: some View {
        let active = find.activeRowId == rowId
        let painted = ChatFind.paint(
            WebLinks.attributed(text, streaming: true),
            query: find.query,
            activeStart: active ? find.activeStart : -1,
            activeEnd: active ? find.activeEnd : -1
        )
        Text(wrapping(painted))
            .font(
                .system(
                    size: TranscriptTextScale.points(
                        base: 14,
                        percent: transcriptTextPercent,
                        dynamicType: dynamicTypeSize
                    )
                )
            )
            .textSelection(.enabled)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                guard WebLinks.allows(url) else { return .discarded }
                openURL(url)
                return .handled
            })
    }

    private func wrapping(_ text: AttributedString) -> AttributedString {
        let ns = NSMutableAttributedString(text)
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byCharWrapping
        ns.addAttribute(
            .paragraphStyle,
            value: style,
            range: NSRange(location: 0, length: ns.length)
        )
        return AttributedString(ns)
    }
}
