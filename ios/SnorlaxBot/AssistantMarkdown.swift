// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// Assistant LEFT `kind=message` markdown. User-right stays plain `MentionLabel`.
struct AssistantMarkdown: View {
    let text: String
    var names: [String] = []
    /// Defer mermaid / math until the LEFT message is complete.
    var completed: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MarkdownSplit.segments(in: MarkdownSplit.stabilize(text)).enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .markdown(let source):
                    MarkdownRun(source: source, names: names, completed: completed)
                case .code(let language, let source):
                    if completed && MarkdownSplit.isMermaidLanguage(language) {
                        MermaidFence(language: language, source: source)
                    } else {
                        CodeFence(language: language, source: source)
                    }
                case .blockMath(let source, let raw, let closed):
                    if completed && closed {
                        MathBlock(source: source, raw: raw)
                    } else {
                        MathFallback(raw: raw, block: true)
                    }
                }
            }
        }
        .font(.system(size: 14))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MermaidFence: View {
    let language: String
    let source: String
    @Environment(\.colorScheme) private var colorScheme
    @State private var failed = false
    @State private var size = CGSize(width: 1, height: 1)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FenceBar(language: language, source: source)
            if failed {
                FenceSource(source: source)
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
    }
}

private struct CodeFence: View {
    let language: String
    let source: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FenceBar(language: language, source: source)
            FenceSource(source: source)
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
}

private struct FenceBar: View {
    let language: String
    let source: String

    var body: some View {
        HStack {
            Text(language)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Button("Copy") {
                UIPasteboard.general.string = source
            }
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }
}

private struct FenceSource: View {
    let source: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            Text(source)
                .font(.system(size: 12, design: .monospaced))
                .lineSpacing(12 * 0.45)
                .textSelection(.enabled)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
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

    var body: some View {
        if block {
            ScrollView(.horizontal, showsIndicators: true) {
                Text(raw)
                    .font(.system(size: 13, design: .monospaced))
                    .textSelection(.enabled)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(raw)
                .font(.system(size: 13, design: .monospaced))
                .textSelection(.enabled)
        }
    }
}

private struct MarkdownRun: View {
    let source: String
    let names: [String]
    var completed: Bool = true
    @Environment(\.openURL) private var openURL

    var body: some View {
        let pieces = MarkdownSplit.splitInlineMath(source)
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
                            MathFallback(raw: raw, block: false)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func markdownText(_ src: String) -> some View {
        Text(wrapping(attributed(src)))
            .font(.system(size: 14))
            .textSelection(.enabled)
            .multilineTextAlignment(.leading)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme?.lowercased() == "https" else { return .discarded }
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

    private func attributed(_ src: String) -> AttributedString {
        var parsed: AttributedString
        do {
            var options = AttributedString.MarkdownParsingOptions()
            options.interpretedSyntax = .full
            options.failurePolicy = .returnPartiallyParsedIfPossible
            parsed = try AttributedString(markdown: src, options: options)
        } catch {
            parsed = AttributedString(src)
        }
        styleHeadings(&parsed)
        styleInlineCode(&parsed)
        dropUnsafeLinks(&parsed)
        highlightMentions(&parsed)
        return parsed
    }

    private func styleHeadings(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let intent = run.presentationIntent else { continue }
            for component in intent.components {
                if case .header(let level) = component.kind {
                    let size: CGFloat = level <= 1 ? 16 : 14
                    parsed[run.range].font = .system(size: size, weight: .semibold)
                }
            }
        }
    }

    private func styleInlineCode(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let intent = run.inlinePresentationIntent, intent.contains(.code) else { continue }
            parsed[run.range].font = .system(size: 13, design: .monospaced)
            parsed[run.range].foregroundColor = .accentColor
            parsed[run.range].backgroundColor = Color.accentColor.opacity(0.18)
        }
    }

    private func dropUnsafeLinks(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let url = run.link else { continue }
            if url.scheme?.lowercased() != "https" {
                parsed[run.range].link = nil
            } else {
                parsed[run.range].foregroundColor = .accentColor
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
            parsed[start..<end].font = .system(size: 14, weight: .semibold)
        }
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
