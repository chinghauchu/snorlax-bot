// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v0.81: a completed assistant LEFT `kind=message` bubble whose body is
/// taller than about 14 lines shows the first chunk and a muted 12pt
/// Show more. Tap expands that bubble and the control becomes Show less.
/// Mid-stream plaintext stays open. A Stop partial collapses only once
/// it is completed. Each bubble in a turn collapses on its own. 160ms;
/// instant when Reduce Motion is on. The control is not focusable, so
/// it does not move composer focus. An active find match in that bubble
/// stays fully visible. No new HTTP.
enum LongMessageCollapse {
    static let showMore = "Show more"
    static let showLess = "Show less"
    static let lines: CGFloat = 14
    static let expandSeconds: Double = 0.16

    /// About 14 lines of the 14pt body.
    static var maxHeight: CGFloat {
        UIFont.systemFont(ofSize: 14).lineHeight * lines
    }

    /// The same 14 lines after Dynamic Type and the transcript text scale.
    static func scaledMaxHeight(percent: Int, dynamicType: DynamicTypeSize) -> CGFloat {
        let size = TranscriptTextScale.points(base: 14, percent: percent, dynamicType: dynamicType)
        return UIFont.systemFont(ofSize: size).lineHeight * lines
    }

    static func overflows(height: CGFloat, limit: CGFloat = maxHeight) -> Bool {
        height > limit + 1
    }

    static func shouldClamp(
        completed: Bool,
        overflows: Bool,
        expanded: Bool,
        activeFind: Bool
    ) -> Bool {
        completed && overflows && !expanded && !activeFind
    }

    static func showToggle(completed: Bool, overflows: Bool, activeFind: Bool) -> Bool {
        completed && overflows && !activeFind
    }

    static func label(expanded: Bool) -> String {
        expanded ? showLess : showMore
    }

    static func animation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: expandSeconds)
    }
}

private struct LongMessageHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// One completed LEFT bubble. Streaming passes `completed: false` and
/// stays open. State is per bubble.
struct LongMessageBody<Content: View>: View {
    var completed: Bool
    var text: String
    var activeFind: Bool
    @ViewBuilder var content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.transcriptTextPercent) private var transcriptTextPercent
    @State private var expanded = false
    @State private var fullHeight: CGFloat = 0

    private var scaledLimit: CGFloat {
        LongMessageCollapse.scaledMaxHeight(
            percent: transcriptTextPercent,
            dynamicType: dynamicTypeSize
        )
    }

    private var overflows: Bool {
        LongMessageCollapse.overflows(height: fullHeight, limit: scaledLimit)
    }

    private var clamp: Bool {
        LongMessageCollapse.shouldClamp(
            completed: completed,
            overflows: overflows,
            expanded: expanded,
            activeFind: activeFind
        )
    }

    private var limit: CGFloat? {
        if clamp { return scaledLimit }
        if expanded && overflows && fullHeight > 0 { return fullHeight }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            content()
                .fixedSize(horizontal: false, vertical: true)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: LongMessageHeightKey.self,
                            value: proxy.size.height
                        )
                    }
                )
                .frame(maxHeight: limit, alignment: .top)
                .clipped()
                .animation(
                    LongMessageCollapse.animation(reduceMotion: reduceMotion),
                    value: expanded
                )
            if LongMessageCollapse.showToggle(
                completed: completed,
                overflows: overflows,
                activeFind: activeFind
            ) {
                Button(LongMessageCollapse.label(expanded: expanded)) {
                    expanded.toggle()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .focusable(false)
                .accessibilityLabel(LongMessageCollapse.label(expanded: expanded))
            }
        }
        .onPreferenceChange(LongMessageHeightKey.self) { fullHeight = $0 }
        .onChange(of: text) { _, _ in
            expanded = false
        }
        .transaction { transaction in
            if reduceMotion {
                transaction.animation = nil
            }
        }
    }
}
