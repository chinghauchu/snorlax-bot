// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

private enum MarkdownFlowPiece {
    case text(String)
    case inlineMath(source: String, raw: String, closed: Bool)
    case image(MarkdownImage.Inline)
}

/// Assistant LEFT `kind=message` markdown. User-right stays plain `MentionLabel`.
struct AssistantMarkdown: View {
    let text: String
    var names: [String] = []
    /// Defer mermaid / math until the LEFT message is complete.
    var completed: Bool = true
    /// Session key for per-fence wrap. Empty still keys by fence index.
    var wrapScope: String = ""
    /// The last bubble of a message draws the footnotes list.
    var showFootnotes: Bool = false
    @Environment(\.markdownFootnotes) private var markdownFootnotes

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MarkdownSplit.segments(in: MarkdownSplit.stabilize(text)).enumerated()), id: \.offset) { index, segment in
                switch segment {
                case .markdown(let source):
                    MarkdownTablePieces(
                        source: source,
                        names: names,
                        completed: completed,
                        wrapScope: wrapScope
                    )
                case .code(let language, let source):
                    if completed && MarkdownSplit.isMermaidLanguage(language) {
                        MermaidFence(
                            language: language,
                            source: source,
                            completed: completed,
                            wrapId: CodeBlockWrap.blockId(scope: wrapScope, index: index)
                        )
                    } else {
                        CodeFence(
                            language: language,
                            source: source,
                            completed: completed,
                            wrapId: CodeBlockWrap.blockId(scope: wrapScope, index: index)
                        )
                    }
                case .blockMath(let source, let raw, let closed):
                    if completed && closed {
                        MathBlock(source: source, raw: raw)
                    } else {
                        MathFallback(raw: raw, block: true, quoteEnabled: completed)
                    }
                }
            }
            if showFootnotes && !markdownFootnotes.isEmpty {
                MarkdownFootnoteList(
                    notes: markdownFootnotes,
                    names: names,
                    completed: completed
                )
            }
        }
        .transcriptFont(14)
    }
}

/// Completed pipe tables render here. Streaming passes `completed: false`
/// and stays a markdown run, the same plain text as today.
private struct MarkdownTablePieces: View {
    let source: String
    let names: [String]
    var completed: Bool
    var wrapScope: String = ""

    var body: some View {
        let pieces = MarkdownTable.split(source, completed: completed)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(pieces.enumerated()), id: \.offset) { _, piece in
                switch piece {
                case .markdown(let text):
                    MarkdownQuoteTaskPieces(
                        source: text,
                        names: names,
                        completed: completed,
                        wrapScope: wrapScope
                    )
                case .table(let table):
                    MarkdownTableBlock(table: table, names: names, completed: completed)
                }
            }
        }
    }
}

/// Completed quotes and task lists. Streaming is one markdown run.
private struct MarkdownQuoteTaskPieces: View {
    let source: String
    let names: [String]
    var completed: Bool
    var wrapScope: String

    var body: some View {
        let blocks = MarkdownQuoteTask.split(source, completed: completed)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .markdown(let text):
                    MarkdownBreakPieces(
                        source: text,
                        names: names,
                        completed: completed,
                        wrapScope: wrapScope
                    )
                case .quote(let text):
                    MarkdownQuoteBlock(
                        source: text,
                        names: names,
                        completed: completed,
                        wrapScope: wrapScope
                    )
                case .tasks(let items):
                    MarkdownTaskList(
                        items: items,
                        names: names,
                        completed: completed,
                        wrapScope: wrapScope
                    )
                }
            }
        }
    }
}

/// Muted left rule and indent. Nested `>>` is another quote inside.
private struct MarkdownQuoteBlock: View {
    let source: String
    let names: [String]
    var completed: Bool
    var wrapScope: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        AssistantMarkdown(
            text: source,
            names: names,
            completed: completed,
            wrapScope: wrapScope
        )
        .foregroundStyle(.secondary)
        .padding(.leading, 10)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color(uiColor: .separator))
                .frame(width: 2)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(MarkdownQuoteTask.animation(reduceMotion: reduceMotion), value: source)
    }
}

/// Read-only checkbox glyphs. Checked rows are muted. Not a toggle.
private struct MarkdownTaskList: View {
    let items: [MarkdownQuoteTask.TaskItem]
    let names: [String]
    var completed: Bool
    var wrapScope: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                MarkdownTaskRow(
                    item: item,
                    names: names,
                    completed: completed,
                    wrapScope: wrapScope
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(MarkdownQuoteTask.animation(reduceMotion: reduceMotion), value: items)
    }
}

private struct MarkdownTaskRow: View {
    let item: MarkdownQuoteTask.TaskItem
    let names: [String]
    var completed: Bool
    var wrapScope: String

    var body: some View {
        let row = HStack(alignment: .top, spacing: 8) {
            Text(MarkdownQuoteTask.glyph(checked: item.checked))
                .transcriptFont(14)
                .accessibilityLabel(MarkdownQuoteTask.glyphLabel(checked: item.checked))
            if !item.text.isEmpty {
                AssistantMarkdown(
                    text: item.text,
                    names: names,
                    completed: completed,
                    wrapScope: wrapScope
                )
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if item.checked {
            row.foregroundStyle(.secondary)
        } else {
            row
        }
    }
}

/// Completed own-line rules. A message with no rule stays one run.
/// List markers are drawn after rules, still before the text view.
private struct MarkdownBreakPieces: View {
    let source: String
    let names: [String]
    var completed: Bool
    var wrapScope: String = ""

    var body: some View {
        let parts = MarkdownBreak.split(source, completed: completed)
        if parts.count == 1, case .markdown(let text) = parts[0] {
            MarkdownListPieces(
                source: text,
                names: names,
                completed: completed,
                wrapScope: wrapScope
            )
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    switch part {
                    case .markdown(let text):
                        MarkdownListPieces(
                            source: text,
                            names: names,
                            completed: completed,
                            wrapScope: wrapScope
                        )
                    case .rule:
                        MarkdownRule()
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Completed lists. An ordered list keeps its start number.
/// Nested lists render under the item with their own marker.
/// Streaming stays one markdown run.
private struct MarkdownListPieces: View {
    let source: String
    let names: [String]
    var completed: Bool
    var wrapScope: String

    var body: some View {
        let blocks = MarkdownList.split(source, completed: completed)
        if blocks.count == 1, case .markdown(let text) = blocks[0] {
            MarkdownRun(source: text, names: names, completed: completed)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    switch block {
                    case .markdown(let text):
                        MarkdownRun(source: text, names: names, completed: completed)
                    case .list(let group):
                        MarkdownListBlock(
                            group: group,
                            names: names,
                            completed: completed,
                            wrapScope: wrapScope
                        )
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Markers sit beside the item. The item body is markdown again,
/// so a nested list indents under this marker.
private struct MarkdownListBlock: View {
    let group: MarkdownList.Group
    let names: [String]
    var completed: Bool
    var wrapScope: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.markdownListDepth) private var depth

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(group.items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: 8) {
                    Text(
                        MarkdownList.marker(
                            ordered: group.ordered,
                            start: group.start,
                            index: index,
                            depth: depth
                        )
                    )
                    .transcriptFont(14)
                    .fixedSize(horizontal: true, vertical: true)
                    .accessibilityLabel(
                        MarkdownList.markerLabel(
                            ordered: group.ordered,
                            start: group.start,
                            index: index,
                            depth: depth
                        )
                    )
                    if !item.isEmpty {
                        AssistantMarkdown(
                            text: item,
                            names: names,
                            completed: completed,
                            wrapScope: wrapScope
                        )
                        .environment(\.markdownListDepth, depth + 1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(MarkdownList.animation(reduceMotion: reduceMotion), value: group.items)
    }
}

/// Thin muted rule. Not a control. No animation.
private struct MarkdownRule: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Rectangle()
            .fill(Color(uiColor: .separator))
            .frame(height: 1)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Separator")
            .animation(MarkdownBreak.animation(reduceMotion: reduceMotion), value: reduceMotion)
    }
}

/// Horizontal scroll lives on the table, not the bubble. Copy writes the
/// markdown source. The label swap does not animate.
private struct MarkdownTableBlock: View {
    let table: MarkdownTable.Table
    let names: [String]
    var completed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var copied = false
    @State private var pulse = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if MarkdownTableCopy.showsCopy(completed: completed) {
                HStack {
                    Spacer(minLength: 0)
                    Button(MarkdownTableCopy.label(copied: copied)) {
                        UIPasteboard.general.string = MarkdownTableCopy.clipboardText(table.source)
                        copied = true
                        pulse += 1
                        let ticket = pulse
                        Task {
                            try? await Task.sleep(nanoseconds: MarkdownTableCopy.feedbackNanoseconds)
                            if ticket == pulse {
                                copied = false
                            }
                        }
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .buttonStyle(.plain)
                    .accessibilityLabel(MarkdownTableCopy.accessibilityLabel(copied: copied))
                    .animation(MarkdownTableCopy.animation(reduceMotion: reduceMotion), value: copied)
                }
                .padding(.horizontal, 10)
                .padding(.top, 6)
            }
            ScrollView(.horizontal, showsIndicators: true) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    GridRow {
                        ForEach(Array(table.header.enumerated()), id: \.offset) { index, cell in
                            tableCell(cell, column: index, header: true, last: table.rows.isEmpty)
                        }
                    }
                    ForEach(Array(table.rows.enumerated()), id: \.offset) { rowIndex, row in
                        GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { index, cell in
                                tableCell(
                                    cell,
                                    column: index,
                                    header: false,
                                    last: rowIndex == table.rows.count - 1
                                )
                            }
                        }
                    }
                }
                .fixedSize(horizontal: true, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(uiColor: .secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 8)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(uiColor: .separator), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func tableCell(_ text: String, column: Int, header: Bool, last: Bool) -> some View {
        MarkdownRun(
            source: text.isEmpty ? " " : text,
            names: names,
            completed: completed,
            hugsText: true,
            header: header
        )
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .overlay(alignment: .bottom) {
            if !last {
                Rectangle()
                    .fill(Color(uiColor: .separator))
                    .frame(height: 1)
            }
        }
        .gridColumnAlignment(columnAlign(column))
    }

    private func columnAlign(_ column: Int) -> HorizontalAlignment {
        let align = column < table.align.count ? table.align[column] : .left
        switch align {
        case .left: return .leading
        case .center: return .center
        case .right: return .trailing
        }
    }
}

private struct MermaidFence: View {
    let language: String
    let source: String
    var completed: Bool
    var wrapId: String
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var failed: Bool
    @State private var size: CGSize
    @State private var wrapped: Bool

    init(language: String, source: String, completed: Bool = true, wrapId: String = "") {
        self.language = language
        self.source = source
        self.completed = completed
        self.wrapId = wrapId
        _failed = State(initialValue: false)
        _size = State(initialValue: CGSize(width: 1, height: 1))
        _wrapped = State(initialValue: CodeBlockWrap.isWrapped(id: wrapId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FenceBar(
                language: language,
                source: source,
                completed: completed,
                wrapped: wrapped,
                showsWrap: failed,
                onToggleWrap: toggleWrap
            )
            if failed {
                FenceSource(source: source, wrapped: wrapped)
            } else {
                ScrollView(.horizontal, showsIndicators: true) {
                    MermaidWebView(
                        source: source,
                        background: MermaidColors.hex(UIColor.secondarySystemBackground),
                        text: MermaidColors.hex(UIColor.label),
                        muted: MermaidColors.hex(UIColor.secondaryLabel),
                        border: MermaidColors.hex(UIColor.separator),
                        accent: MermaidColors.hex(UIColor.tintColor),
                        dark: colorScheme == .dark,
                        failed: $failed,
                        size: $size
                    )
                    .frame(width: max(size.width, 1), height: max(size.height, 1), alignment: .topLeading)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(uiColor: .secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 8)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(uiColor: .separator), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .animation(CodeBlockWrap.animation(reduceMotion: reduceMotion), value: wrapped)
        .onChange(of: wrapId) { _, next in
            wrapped = CodeBlockWrap.isWrapped(id: next)
        }
    }

    private func toggleWrap() {
        wrapped = CodeBlockWrap.toggle(id: wrapId, wrapped: wrapped)
    }
}

private struct CodeFence: View {
    let language: String
    let source: String
    var completed: Bool
    var wrapId: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var wrapped: Bool

    init(language: String, source: String, completed: Bool = true, wrapId: String = "") {
        self.language = language
        self.source = source
        self.completed = completed
        self.wrapId = wrapId
        _wrapped = State(initialValue: CodeBlockWrap.isWrapped(id: wrapId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FenceBar(
                language: language,
                source: source,
                completed: completed,
                wrapped: wrapped,
                showsWrap: true,
                onToggleWrap: toggleWrap
            )
            FenceSource(source: source, wrapped: wrapped, language: language, completed: completed)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(uiColor: .secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 8)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(uiColor: .separator), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .animation(CodeBlockWrap.animation(reduceMotion: reduceMotion), value: wrapped)
        .onChange(of: wrapId) { _, next in
            wrapped = CodeBlockWrap.isWrapped(id: next)
        }
    }

    private func toggleWrap() {
        wrapped = CodeBlockWrap.toggle(id: wrapId, wrapped: wrapped)
    }
}

private struct FenceBar: View {
    let language: String
    let source: String
    var completed: Bool = true
    var wrapped: Bool = false
    var showsWrap: Bool = false
    var onToggleWrap: () -> Void = {}
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var copied = false
    @State private var pulse = 0

    var body: some View {
        HStack {
            Text(language)
                .transcriptFont(12)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if showsWrap && CodeBlockWrap.showsWrap(completed: completed) {
                Button(CodeBlockWrap.label(wrapped: wrapped)) {
                    onToggleWrap()
                }
                .transcriptFont(12)
                .foregroundStyle(.secondary)
                .buttonStyle(.plain)
                .accessibilityLabel(CodeBlockWrap.accessibilityLabel(wrapped: wrapped))
                .animation(CodeBlockWrap.animation(reduceMotion: reduceMotion), value: wrapped)
            }
            if CodeBlockCopy.showsCopy(completed: completed) {
                Button(CodeBlockCopy.label(copied: copied)) {
                    UIPasteboard.general.string = CodeBlockCopy.clipboardText(source)
                    copied = true
                    pulse += 1
                    let ticket = pulse
                    Task {
                        try? await Task.sleep(nanoseconds: CodeBlockCopy.feedbackNanoseconds)
                        if ticket == pulse {
                            copied = false
                        }
                    }
                }
                .transcriptFont(12)
                .foregroundStyle(.secondary)
                .buttonStyle(.plain)
                .accessibilityLabel(CodeBlockCopy.accessibilityLabel(copied: copied))
                .animation(CodeBlockCopy.animation(reduceMotion: reduceMotion), value: copied)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }
}

private struct FenceSource: View {
    let source: String
    var quoteEnabled = true
    var wrapped = false
    var language: String = ""
    var completed: Bool = true
    @Environment(\.chatFind) private var find
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.transcriptTextPercent) private var transcriptTextPercent

    private var metrics: TranscriptTextScale.Metrics {
        TranscriptTextScale.metrics(percent: transcriptTextPercent, dynamicType: dynamicTypeSize)
    }

    var body: some View {
        Group {
            if CodeBlockWrap.expandsHorizontally(wrapped: wrapped) {
                ScrollView(.horizontal, showsIndicators: true) {
                    sourceText(expandsHorizontally: true)
                        .fixedSize(horizontal: true, vertical: true)
                }
            } else {
                sourceText(expandsHorizontally: false)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    private func sourceText(expandsHorizontally: Bool) -> some View {
        let painted = CodeHighlight.paint(source, language: language, completed: completed)
        QuoteSelectableText(
            text: ChatFind.paint(painted, query: find.query),
            quoteEnabled: quoteEnabled,
            font: metrics.fenceFont,
            expandsHorizontally: expandsHorizontally,
            onQuote: { model.quoteIntoComposer($0) }
        )
        .font(.system(size: 12, design: .monospaced))
        .transcriptFont(12, design: .monospaced)
    }
}

private struct MathBlock: View {
    let source: String
    let raw: String
    @State private var failed = false
    @State private var size = CGSize(width: 1, height: 1)

    var body: some View {
        Group {
            if failed {
                MathFallback(raw: raw, block: true)
            } else {
                ScrollView(.horizontal, showsIndicators: true) {
                    MathWebView(
                        source: source,
                        display: true,
                        text: MermaidColors.hex(UIColor.label),
                        failed: $failed,
                        size: $size
                    )
                    .frame(width: max(size.width, 1), height: max(size.height, 1), alignment: .topLeading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct MathInline: View {
    let source: String
    let raw: String
    @State private var failed = false
    @State private var size = CGSize(width: 1, height: 1)

    var body: some View {
        Group {
            if failed {
                MathFallback(raw: raw, block: false)
            } else {
                MathWebView(
                    source: source,
                    display: false,
                    text: MermaidColors.hex(UIColor.label),
                    failed: $failed,
                    size: $size
                )
                .frame(width: max(size.width, 1), height: max(size.height, 1), alignment: .center)
            }
        }
    }
}

private struct MathFallback: View {
    let raw: String
    var block: Bool
    var quoteEnabled = true
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.transcriptTextPercent) private var transcriptTextPercent

    private var metrics: TranscriptTextScale.Metrics {
        TranscriptTextScale.metrics(percent: transcriptTextPercent, dynamicType: dynamicTypeSize)
    }

    var body: some View {
        if block {
            ScrollView(.horizontal, showsIndicators: true) {
                QuoteSelectableText(
                    text: AttributedString(raw),
                    quoteEnabled: quoteEnabled,
                    font: metrics.mathFont,
                    expandsHorizontally: true,
                    onQuote: { model.quoteIntoComposer($0) }
                )
                .fixedSize(horizontal: true, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            QuoteSelectableText(
                text: AttributedString(raw),
                quoteEnabled: quoteEnabled,
                font: metrics.mathFont,
                onQuote: { model.quoteIntoComposer($0) }
            )
        }
    }
}

private struct MarkdownRun: View {
    let source: String
    let names: [String]
    var completed: Bool = true
    /// Table cells size to their text so a wide table can scroll.
    var hugsText: Bool = false
    /// Header cells use semibold body text.
    var header: Bool = false
    @Environment(\.openURL) private var openURL
    @Environment(\.chatFind) private var find
    @Environment(\.markdownFootnotes) private var markdownFootnotes
    @Environment(AppModel.self) private var model
    @State private var shownFootnote: MarkdownFootnote.Note?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.transcriptTextPercent) private var transcriptTextPercent

    private var metrics: TranscriptTextScale.Metrics {
        TranscriptTextScale.metrics(percent: transcriptTextPercent, dynamicType: dynamicTypeSize)
    }

    var body: some View {
        let pieces = flowPieces
        let content = Group {
            if pieces.count == 1, case .text(let only) = pieces[0] {
                markdownText(only)
            } else {
                MathFlowLayout(spacing: 4, lineSpacing: 2) {
                    ForEach(Array(pieces.enumerated()), id: \.offset) { _, piece in
                        switch piece {
                        case .text(let text):
                            markdownText(text)
                        case .inlineMath(let tex, let raw, let closed):
                            if completed && closed {
                                MathInline(source: tex, raw: raw)
                            } else {
                                MathFallback(raw: raw, block: false, quoteEnabled: completed)
                            }
                        case .image(let image):
                            MarkdownInlineImage(image: image, compact: hugsText)
                        }
                    }
                }
                .fixedSize(horizontal: hugsText, vertical: true)
                .frame(maxWidth: hugsText ? nil : .infinity, alignment: .leading)
            }
        }
        return content.popover(item: $shownFootnote) { note in
            MarkdownFootnotePopover(note: note, names: names)
                .presentationCompactAdaptation(.popover)
                .environment(\.markdownFootnotes, markdownFootnotes)
        }
    }

    /// Inline math stays a flow. Completed images join that flow.
    /// Streaming text is not split, so a growing bubble stays plain.
    private var flowPieces: [MarkdownFlowPiece] {
        var out: [MarkdownFlowPiece] = []
        for piece in MarkdownSplit.splitInlineMath(source) {
            switch piece {
            case .inlineMath(let tex, let raw, let closed):
                out.append(.inlineMath(source: tex, raw: raw, closed: closed))
            case .text(let text):
                if !completed {
                    if !text.isEmpty { out.append(.text(text)) }
                    continue
                }
                for part in MarkdownImage.split(text, completed: true) {
                    switch part {
                    case .text(let value):
                        if !value.isEmpty { out.append(.text(value)) }
                    case .image(let image):
                        out.append(.image(image))
                    }
                }
            }
        }
        return out
    }

    @ViewBuilder
    private func markdownText(_ src: String) -> some View {
        let label = selectable(src)
        if hugsText {
            // Table cells stay one line so a wide table scrolls instead of squashing.
            label
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: true)
                .frame(minWidth: 0, alignment: .leading)
        } else {
            // Long unbroken URLs wrap inside the bubble.
            label
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        }
    }

    private func selectable(_ src: String) -> QuoteSelectableText {
        QuoteSelectableText(
            text: wrapping(attributed(src)),
            quoteEnabled: completed,
            font: header
                ? UIFont.systemFont(ofSize: metrics.body, weight: .semibold)
                : metrics.bodyFont,
            expandsHorizontally: hugsText,
            onQuote: { model.quoteIntoComposer($0) },
            onLink: { url in
                if let note = MarkdownFootnote.note(for: url, in: markdownFootnotes) {
                    shownFootnote = note
                    return
                }
                guard WebLinks.allows(url) else { return }
                openURL(url)
            }
        )
    }

    private func wrapping(_ text: AttributedString) -> AttributedString {
        let ns = NSMutableAttributedString(text)
        // SwiftUI.Font set on AttributedString does not survive this
        // UITextView round trip. Apply UIFont from the heading intent
        // onto the NS string so #–###### paint as 16/14 semibold.
        // Footnote tokens are replaced after that, from the end, so
        // heading ranges already written stay aligned.
        styleHeadings(text, ns: ns)
        MarkdownFootnote.applyMarkers(ns, baseSize: metrics.body)
        let style = NSMutableParagraphStyle()
        if hugsText {
            style.lineBreakMode = .byClipping
        } else {
            style.lineBreakMode = .byCharWrapping
        }
        ns.addAttribute(
            .paragraphStyle,
            value: style,
            range: NSRange(location: 0, length: ns.length)
        )
        return AttributedString(ns)
    }

    private func attributed(_ src: String) -> AttributedString {
        // Math delimiters are already split out. Escapes and character
        // references become tokens before the markdown parser, then
        // paint as text after autolinks so they cannot form syntax or HTML.
        // A hard break (two spaces or a backslash before the newline)
        // becomes a token here and a real newline after the parse.
        // A plain newline stays a soft break, which renders as a space.
        let escaped = MarkdownEscape.protect(src, completed: completed)
        let source = MarkdownHardBreak.apply(escaped, completed: completed)
        var parsed: AttributedString
        do {
            var options = AttributedString.MarkdownParsingOptions()
            options.interpretedSyntax = .full
            options.failurePolicy = .returnPartiallyParsedIfPossible
            parsed = try AttributedString(markdown: source, options: options)
        } catch {
            parsed = AttributedString(source)
        }
        styleInlineCode(&parsed)
        parsed = WebLinks.applyingLinks(parsed, streaming: false)
        parsed = MarkdownEscape.restore(parsed)
        parsed = MarkdownHardBreak.restore(parsed)
        dropUnsafeLinks(&parsed)
        highlightMentions(&parsed)
        markHeadingFonts(&parsed)
        MarkdownFootnote.applyMarkers(&parsed, baseSize: metrics.body)
        return ChatFind.paint(parsed, query: find.query)
    }

    /// UIFont on the UIKit scope, so a later NS round trip (find highlight,
    /// wrapping, UITextView) keeps the heading size. SwiftUI.Font does not.
    private func markHeadingFonts(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let level = headingLevel(run.presentationIntent) else { continue }
            let size = level <= 1 ? metrics.heading : metrics.body
            parsed[run.range].uiKit.font = UIFont.systemFont(ofSize: size, weight: .semibold)
        }
    }

    private func headingLevel(_ intent: PresentationIntent?) -> Int? {
        guard let intent else { return nil }
        var level: Int?
        for component in intent.components {
            if case .header(let value) = component.kind {
                level = value
            }
        }
        guard let level, level >= 1, level <= 6 else { return nil }
        return level
    }

    /// ATX and setext headings. Level 1 is 16pt semibold; levels 2–6
    /// are 14pt semibold, matching desktop `.assistant-md h1` / `h2`.
    private func styleHeadings(_ source: AttributedString, ns: NSMutableAttributedString) {
        for run in source.runs {
            guard let level = headingLevel(run.presentationIntent) else { continue }
            let size = level <= 1 ? metrics.heading : metrics.body
            let font = UIFont.systemFont(ofSize: size, weight: .semibold)
            let range = Self.utf16Range(run.range, in: source)
            guard range.location >= 0,
                  range.length > 0,
                  range.location + range.length <= ns.length
            else { continue }
            ns.addAttribute(.font, value: font, range: range)
        }
    }

    private static func utf16Range(
        _ range: Range<AttributedString.Index>,
        in source: AttributedString
    ) -> NSRange {
        let prefix = String(source.characters[source.startIndex..<range.lowerBound])
        let slice = String(source.characters[range])
        return NSRange(location: prefix.utf16.count, length: slice.utf16.count)
    }

    private func styleInlineCode(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let intent = run.inlinePresentationIntent, intent.contains(.code) else { continue }
            parsed[run.range].font = metrics.codeFont
            parsed[run.range].foregroundColor = .accentColor
            parsed[run.range].backgroundColor = Color.accentColor.opacity(0.18)
        }
    }

    private func dropUnsafeLinks(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let url = run.link else { continue }
            if WebLinks.allows(url) {
                parsed[run.range].foregroundColor = .accentColor
            } else {
                parsed[run.range].link = nil
            }
        }
    }

    private func highlightMentions(_ parsed: inout AttributedString) {
        let lowered = Set(names.map { $0.lowercased() } + ["everyone"])
        guard let pattern = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9._-]*)") else {
            return
        }
        let text = String(parsed.characters)
        let ns = text as NSString
        for match in pattern.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let token = ns.substring(with: match.range(at: 1))
            guard lowered.contains(token.lowercased()) else { continue }
            guard let stringRange = Range(match.range, in: text) else { continue }
            guard let start = AttributedString.Index(stringRange.lowerBound, within: parsed),
                  let end = AttributedString.Index(stringRange.upperBound, within: parsed)
            else { continue }
            parsed[start..<end].foregroundColor = .accentColor
            parsed[start..<end].font = metrics.bodySemibold
        }
    }
}

/// v0.54 same-turn multi-bubble gap. Consecutive LEFT bubbles from the
/// same completed turn (blank-line split) sit 6pt apart. Different turns
/// and after tool / widget / approve / connect stay 12pt. User-right
/// unchanged (4pt same-sender / 16pt speaker change). Mid-stream is one
/// growing bubble.
enum AssistantBubbleGap {
    static let sameTurn: CGFloat = 6
    static let differentTurn: CGFloat = 12
    static let userSameSender: CGFloat = 4
    static let userNewSender: CGFloat = 16

    static func turnSpacing(
        index: Int,
        isUser: Bool,
        sameSender: Bool,
        isHandoffRoot: Bool
    ) -> CGFloat {
        if isHandoffRoot { return index == 0 ? 0 : userNewSender }
        guard index > 0 else { return 0 }
        if isUser { return sameSender ? userSameSender : userNewSender }
        return differentTurn
    }
}

enum MarkdownSplit {
    enum Segment: Equatable {
        case markdown(String)
        case code(language: String, source: String)
        case blockMath(source: String, raw: String, closed: Bool)
    }

    enum InlinePiece: Equatable {
        case text(String)
        case inlineMath(source: String, raw: String, closed: Bool)
    }

    /// Language tag is exactly `mermaid` (case-insensitive).
    static func isMermaidLanguage(_ language: String) -> Bool {
        language.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "mermaid"
    }

    /// v0.48: completed LEFT `kind=message` splits on blank lines.
    /// Mid-stream stays one growing bubble. Fences and `$$` math stay intact.
    static func bubbles(in text: String, completed: Bool) -> [String] {
        if text.isEmpty { return [] }
        if !completed { return [text] }
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var parts: [String] = []
        var chunk: [String] = []
        var fence: String?
        var inMath = false

        func flush() {
            while let first = chunk.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
                chunk.removeFirst()
            }
            while let last = chunk.last, last.trimmingCharacters(in: .whitespaces).isEmpty {
                chunk.removeLast()
            }
            let joined = chunk.joined(separator: "\n")
            if !joined.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append(joined)
            }
            chunk = []
        }

        for line in lines {
            if !inMath, let _ = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) {
                if let markerRange = line.range(of: #"[`~]{3,}"#, options: .regularExpression) {
                    let marker = String(line[markerRange])
                    let info = String(line[markerRange.upperBound...])
                    if fence == nil {
                        fence = marker
                    } else if let open = fence,
                              marker.first == open.first,
                              marker.count >= open.count,
                              info.trimmingCharacters(in: .whitespaces).isEmpty
                    {
                        fence = nil
                    }
                }
            } else if fence == nil {
                if line.trimmingCharacters(in: .whitespaces) == "$$" {
                    inMath.toggle()
                }
            }

            if fence == nil, !inMath, line.trimmingCharacters(in: .whitespaces).isEmpty {
                flush()
                continue
            }
            chunk.append(line)
        }
        flush()
        return parts
    }

    static func stabilize(_ text: String) -> String {
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
        var fence: String?
        for line in lines {
            let raw = String(line)
            guard let match = raw.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) else {
                continue
            }
            let body = String(raw[match])
            guard let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else { continue }
            let marker = String(body[markerRange])
            let info = String(body[markerRange.upperBound...])
            if fence == nil {
                fence = marker
                continue
            }
            if let open = fence,
               marker.first == open.first,
               marker.count >= open.count,
               info.trimmingCharacters(in: .whitespaces).isEmpty
            {
                fence = nil
            }
        }
        guard let closer = fence else { return text }
        return text.hasSuffix("\n") ? text + closer : text + "\n" + closer
    }

    static func segments(in text: String) -> [Segment] {
        var result: [Segment] = []
        var rest = Substring(text)
        while let open = firstFence(in: rest) {
            let before = String(rest[rest.startIndex..<open.lowerBound])
            if !before.isEmpty { result.append(.markdown(before)) }
            let marker = String(rest[open])
            let afterMarker = rest[open.upperBound...]
            let nl = afterMarker.firstIndex(of: "\n") ?? afterMarker.endIndex
            let language = String(afterMarker[afterMarker.startIndex..<nl]).trimmingCharacters(in: .whitespaces)
            let bodyStart: Substring.Index
            if nl == afterMarker.endIndex {
                bodyStart = afterMarker.endIndex
            } else {
                bodyStart = afterMarker.index(after: nl)
            }
            let bodyRest = afterMarker[bodyStart...]
            if let close = closingFence(in: bodyRest, matching: marker) {
                var source = String(bodyRest[bodyRest.startIndex..<close.lowerBound])
                if source.hasSuffix("\n") { source.removeLast() }
                result.append(.code(language: language, source: source))
                rest = bodyRest[close.upperBound...]
            } else {
                result.append(.code(language: language, source: String(bodyRest)))
                rest = ""
                break
            }
        }
        let tail = String(rest)
        if !tail.isEmpty { result.append(.markdown(tail)) }
        if result.isEmpty { result.append(.markdown(text)) }
        return result.flatMap { segment in
            guard case .markdown(let source) = segment else { return [segment] }
            return splitBlockMath(source)
        }
    }

    /// Own-line `$$ ... $$` only. Single `$...$` is never math.
    static func splitBlockMath(_ text: String) -> [Segment] {
        var result: [Segment] = []
        var rest = Substring(text)
        while let open = firstOwnLineDollarDollar(in: rest) {
            let before = String(rest[rest.startIndex..<open.lowerBound])
            if !before.isEmpty { result.append(.markdown(before)) }
            let line = lineContents(in: rest, covering: open.lowerBound)
            let trimmed = line.text.trimmingCharacters(in: .whitespaces)
            if trimmed == "$$" {
                let afterOpen = rest[open.upperBound...]
                let bodyStart: Substring.Index
                if let nl = afterOpen.firstIndex(of: "\n") {
                    bodyStart = afterOpen.index(after: nl)
                } else {
                    bodyStart = afterOpen.endIndex
                }
                let bodyRest = rest[bodyStart...]
                if let close = firstOwnLineDollarDollar(in: bodyRest, lone: true) {
                    var source = String(bodyRest[bodyRest.startIndex..<close.lowerBound])
                    if source.hasSuffix("\n") { source.removeLast() }
                    let rawEnd = lineEnd(in: rest, from: close.lowerBound)
                    let raw = String(rest[open.lowerBound..<rawEnd]).trimmingCharacters(in: .newlines)
                    result.append(.blockMath(source: source, raw: raw, closed: true))
                    rest = rest[rawEnd...]
                    if rest.first == "\n" {
                        rest = rest[rest.index(after: rest.startIndex)...]
                    }
                } else {
                    let source = String(bodyRest)
                    result.append(.blockMath(source: source, raw: String(rest[open.lowerBound...]), closed: false))
                    rest = ""
                    break
                }
            } else if trimmed.hasPrefix("$$"), trimmed.hasSuffix("$$"), trimmed.count > 4 {
                let tex = String(trimmed.dropFirst(2).dropLast(2))
                    .trimmingCharacters(in: .whitespaces)
                result.append(.blockMath(source: tex, raw: trimmed, closed: true))
                rest = rest[line.end...]
                if rest.first == "\n" {
                    rest = rest[rest.index(after: rest.startIndex)...]
                }
            } else {
                rest = rest[rest.index(after: open.lowerBound)...]
            }
        }
        let tail = String(rest)
        if !tail.isEmpty { result.append(.markdown(tail)) }
        if result.isEmpty { result.append(.markdown(text)) }
        return result
    }

    /// Inline `\( ... \)` only. Skips inline `code`.
    static func splitInlineMath(_ text: String) -> [InlinePiece] {
        var result: [InlinePiece] = []
        var rest = Substring(text)
        while let open = firstInlineMathOpen(in: rest) {
            let before = String(rest[rest.startIndex..<open.lowerBound])
            if !before.isEmpty { result.append(.text(before)) }
            let after = rest[open.upperBound...]
            if let close = firstInlineMathClose(in: after) {
                let source = String(after[after.startIndex..<close.lowerBound])
                let raw = String(rest[open.lowerBound..<close.upperBound])
                result.append(.inlineMath(source: source, raw: raw, closed: true))
                rest = after[close.upperBound...]
            } else {
                result.append(.inlineMath(source: String(after), raw: String(rest[open.lowerBound...]), closed: false))
                rest = ""
                break
            }
        }
        let tail = String(rest)
        if !tail.isEmpty { result.append(.text(tail)) }
        if result.isEmpty { result.append(.text(text)) }
        return result
    }

    private static func firstOwnLineDollarDollar(in text: Substring, lone: Bool = false) -> Range<Substring.Index>? {
        var lineStart = text.startIndex
        while lineStart < text.endIndex {
            let lineEnd = text[lineStart...].firstIndex(of: "\n") ?? text.endIndex
            let line = text[lineStart..<lineEnd]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let isOpen: Bool
            if lone {
                isOpen = trimmed == "$$"
            } else {
                isOpen = trimmed == "$$" || (trimmed.hasPrefix("$$") && trimmed.hasSuffix("$$") && trimmed.count > 4)
            }
            if isOpen, let range = line.range(of: "$$") {
                let start = range.lowerBound
                let end = line.index(start, offsetBy: 2)
                return start..<end
            }
            if lineEnd == text.endIndex { break }
            lineStart = text.index(after: lineEnd)
        }
        return nil
    }

    private static func lineContents(in text: Substring, covering index: Substring.Index) -> (text: String, end: Substring.Index) {
        var start = text.startIndex
        var cursor = text.startIndex
        while cursor < text.endIndex {
            let lineEnd = text[cursor...].firstIndex(of: "\n") ?? text.endIndex
            if index >= cursor && index < lineEnd || index == cursor {
                return (String(text[cursor..<lineEnd]), lineEnd)
            }
            if lineEnd == text.endIndex {
                return (String(text[cursor..<lineEnd]), lineEnd)
            }
            start = text.index(after: lineEnd)
            cursor = start
        }
        return (String(text), text.endIndex)
    }

    private static func lineEnd(in text: Substring, from index: Substring.Index) -> Substring.Index {
        text[index...].firstIndex(of: "\n") ?? text.endIndex
    }

    private static func firstInlineMathOpen(in text: Substring) -> Range<Substring.Index>? {
        firstInlineDelimiter(in: text, open: true)
    }

    private static func firstInlineMathClose(in text: Substring) -> Range<Substring.Index>? {
        firstInlineDelimiter(in: text, open: false)
    }

    private static func firstInlineDelimiter(in text: Substring, open: Bool) -> Range<Substring.Index>? {
        let needle = open ? "\\(" : "\\)"
        var i = text.startIndex
        var inCode = false
        while i < text.endIndex {
            if text[i] == "`" {
                inCode.toggle()
                i = text.index(after: i)
                continue
            }
            if !inCode {
                let remaining = text[i...]
                if remaining.hasPrefix(needle) {
                    let end = text.index(i, offsetBy: 2)
                    return i..<end
                }
            }
            i = text.index(after: i)
        }
        return nil
    }

    private static func firstFence(in text: Substring) -> Range<Substring.Index>? {
        lineFenceRange(in: text, closing: nil)
    }

    private static func closingFence(in text: Substring, matching open: String) -> Range<Substring.Index>? {
        lineFenceRange(in: text, closing: open)
    }

    private static func lineFenceRange(in text: Substring, closing: String?) -> Range<Substring.Index>? {
        var lineStart = text.startIndex
        while lineStart < text.endIndex {
            let lineEnd = text[lineStart...].firstIndex(of: "\n") ?? text.endIndex
            let line = text[lineStart..<lineEnd]
            if let marker = fenceMarker(in: line, closing: closing) {
                let start = text.index(lineStart, offsetBy: marker.leading)
                let end = text.index(start, offsetBy: marker.marker.count)
                return start..<end
            }
            if lineEnd == text.endIndex { break }
            lineStart = text.index(after: lineEnd)
        }
        return nil
    }

    private static func fenceMarker(in line: Substring, closing: String?) -> (leading: Int, marker: String)? {
        var i = 0
        var idx = line.startIndex
        while i < 3, idx < line.endIndex, line[idx] == " " {
            i += 1
            idx = line.index(after: idx)
        }
        guard idx < line.endIndex else { return nil }
        let ch = line[idx]
        guard ch == "`" || ch == "~" else { return nil }
        if let closing, ch != closing.first { return nil }
        var count = 0
        var scan = idx
        while scan < line.endIndex, line[scan] == ch {
            count += 1
            scan = line.index(after: scan)
        }
        guard count >= 3 else { return nil }
        if let closing, count < closing.count { return nil }
        if closing != nil {
            let info = line[scan...].trimmingCharacters(in: .whitespaces)
            if !info.isEmpty { return nil }
        }
        return (i, String(repeating: String(ch), count: count))
    }
}
