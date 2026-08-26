// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// Assistant LEFT `kind=message` markdown. User-right stays plain `MentionLabel`.
struct AssistantMarkdown: View {
    let text: String
    var names: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MarkdownSplit.segments(in: MarkdownSplit.stabilize(text)).enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .markdown(let source):
                    MarkdownRun(source: source, names: names)
                case .code(_, let source):
                    CodeFence(source: source)
                }
            }
        }
        .font(.system(size: 14))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CodeFence: View {
    let source: String

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack {
                Spacer(minLength: 0)
                Button("Copy") {
                    UIPasteboard.general.string = source
                }
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            }
            Text(source)
                .font(.system(size: 12, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(
            Color(uiColor: .tertiarySystemFill),
            in: RoundedRectangle(cornerRadius: 8)
        )
    }
}

private struct MarkdownRun: View {
    let source: String
    let names: [String]
    @Environment(\.openURL) private var openURL

    var body: some View {
        Text(attributed)
            .font(.system(size: 14))
            .textSelection(.enabled)
            .multilineTextAlignment(.leading)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme?.lowercased() == "https" else { return .discarded }
                openURL(url)
                return .handled
            })
    }

    private var attributed: AttributedString {
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
        dropUnsafeLinks(&parsed)
        highlightMentions(&parsed)
        return parsed
    }

    private func styleInlineCode(_ parsed: inout AttributedString) {
        for run in parsed.runs {
            guard let intent = run.inlinePresentationIntent, intent.contains(.code) else { continue }
            parsed[run.range].font = .system(size: 12, design: .monospaced)
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
        return result
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
