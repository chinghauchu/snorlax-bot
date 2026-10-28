// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v2.13: step between images the lightbox can already open.
/// Previous and Next walk the open chat in reading order: image
/// attachments, then markdown images in each completed assistant
/// bubble, then pending image chips. One picture hides the
/// controls. The ends disable the matching control. Arrow keys
/// step while the overlay is open and are not a shortcuts-list
/// chord. A horizontal swipe steps at 1×. Swipe-down still
/// dismisses. A zoomed picture pans instead. Stepping resets to
/// fit, does not close, send, or remove a chip, and does not fade
/// the overlay. Videos and file chips stay out. No slide. No new HTTP.
/// Keep in lockstep with `desktop/src/lightboxStep.ts`.
enum LightboxStep {
    static let previousLabel = "Previous"
    static let nextLabel = "Next"
    static let previousAccessibility = "Previous image"
    static let nextAccessibility = "Next image"
    static let swipeDistance: CGFloat = 80

    enum Direction: String {
        case previous
        case next
    }

    struct Scope: Equatable {
        var messageID: String
        var bubble: Int
    }

    /// Occurrence counts shared by every markdown run in one bubble.
    /// A new box per bubble keeps the first `cat.png` at 0.
    final class Counts {
        var counts: [String: Int] = [:]

        func next(_ url: String) -> Int {
            let occurrence = counts[url] ?? 0
            counts[url] = occurrence + 1
            return occurrence
        }
    }

    static func keepsOpen() -> Bool { true }

    /// The picture swaps. There is no slide, including when Reduce Motion is off.
    static func animates() -> Bool { false }

    /// Tool, widget, connect, approve, and a channel-timeline handoff have no image chrome.
    static func showsChrome(message: Message, channelTimeline: Bool) -> Bool {
        if message.isToolLine || message.isWidget || message.isConnect || message.isApprove {
            return false
        }
        if channelTimeline && message.isHandoffRoot { return false }
        return true
    }

    /// The same bubble split the transcript paints.
    static func assistantBubbles(message: Message, completed: Bool) -> [String] {
        let reference = MarkdownReferenceLink.resolve(message.displayContent, completed: completed)
        let prepared = MarkdownFootnote.extract(reference, completed: completed)
        if prepared.notes.isEmpty && reference == message.displayContent {
            return MarkdownSplit.bubbles(in: message.displayContent, completed: completed)
        }
        return MarkdownSplit.bubbles(in: prepared.text, completed: completed)
    }

    /// Images AssistantMarkdown will open, in the order it paints them.
    /// The prepares match `AssistantMarkdown.flowPieces`.
    static func markdownTargets(messageID: String, bubble: Int, text: String) -> [ImageLightbox.Target] {
        let source = MarkdownLinkTitle.prepare(
            MarkdownImage.prepareAlts(
                MarkdownReferenceLink.prepareSpacedDestinations(
                    MarkdownLinkDest.prepare(text, completed: true),
                    completed: true
                ),
                completed: true
            ),
            completed: true
        )
        var images: [MarkdownImage.Inline] = []
        for piece in MarkdownSplit.splitInlineMath(source) {
            guard case .text(let chunk) = piece else { continue }
            for part in MarkdownImage.split(chunk, completed: true) {
                guard case .image(let image) = part, image.link == nil else { continue }
                images.append(image)
            }
        }
        var counts: [String: Int] = [:]
        return images.map { image in
            let occurrence = counts[image.url] ?? 0
            counts[image.url] = occurrence + 1
            return ImageLightbox.Target(
                id: markdownID(
                    messageID: messageID,
                    bubble: bubble,
                    url: image.url,
                    occurrence: occurrence
                ),
                url: image.url,
                name: ImageLightbox.label(for: image.alt),
                local: nil
            )
        }
    }

    /// Stable id for one markdown image. Occurrence restarts each bubble.
    static func markdownID(messageID: String, bubble: Int, url: String, occurrence: Int) -> String {
        "md:\(messageID):\(bubble):\(occurrence):\(url)"
    }

    static func index(in items: [ImageLightbox.Target], currentID: String) -> Int {
        guard !currentID.isEmpty else { return -1 }
        return items.firstIndex { $0.id == currentID } ?? -1
    }

    /// Hidden for a single picture, and when this picture is not in the strip.
    static func positionLabel(index: Int, count: Int) -> String? {
        guard count >= 2, index >= 0, index < count else { return nil }
        return "\(index + 1) of \(count)"
    }

    static func canStep(index: Int, count: Int, direction: Direction) -> Bool {
        guard positionLabel(index: index, count: count) != nil else { return false }
        switch direction {
        case .previous:
            return index > 0
        case .next:
            return index < count - 1
        }
    }

    static func target(
        in items: [ImageLightbox.Target],
        currentID: String,
        direction: Direction
    ) -> ImageLightbox.Target? {
        let at = index(in: items, currentID: currentID)
        guard canStep(index: at, count: items.count, direction: direction) else { return nil }
        let next = direction == .previous ? at - 1 : at + 1
        guard items.indices.contains(next) else { return nil }
        return items[next]
    }

    /// Unmodified arrow keys. Command, Control, Option, and Shift stay put.
    static func keyAction(
        key: KeyEquivalent,
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Direction? {
        if command || control || option || shift { return nil }
        if key == .leftArrow { return .previous }
        if key == .rightArrow { return .next }
        return nil
    }

    /// Horizontal swipe at 1×. Finger moving left opens the next picture.
    /// A vertical drag stays the dismiss gesture. Above 1× the drag pans.
    static func swipeDirection(x: CGFloat, y: CGFloat, scale: Double) -> Direction? {
        if LightboxZoom.panEnabled(scale) { return nil }
        guard x.isFinite, y.isFinite else { return nil }
        if abs(x) <= swipeDistance { return nil }
        if abs(x) <= abs(y) { return nil }
        return x < 0 ? .next : .previous
    }

    /// Pictures the open chat can already show, top to bottom.
    /// Pending chips sit under the transcript, so they are last.
    static func strip(
        messages: [Message],
        channelTimeline: Bool,
        incompleteMessageID: String?,
        localPreviews: [String: [Data]],
        pending: [PendingChatAttachment]
    ) -> [ImageLightbox.Target] {
        var out: [ImageLightbox.Target] = []
        for message in messages {
            guard showsChrome(message: message, channelTimeline: channelTimeline) else { continue }
            let attachments = message.userRightAttachments
            let images = attachments.filter { ImageLightbox.isImage($0.kind) }
            let videos = attachments.filter { $0.kind == .video }
            for image in images where !image.id.isEmpty {
                out.append(
                    ImageLightbox.Target(
                        id: image.id,
                        url: image.url,
                        name: image.name,
                        local: nil
                    )
                )
            }
            if images.isEmpty && videos.isEmpty {
                let previews = localPreviews[message.id] ?? []
                for (offset, data) in previews.enumerated() {
                    guard UIImage(data: data) != nil else { continue }
                    out.append(
                        ImageLightbox.Target(
                            id: "local-\(message.id)-\(offset)",
                            url: "",
                            name: ImageLightbox.label,
                            local: data
                        )
                    )
                }
            }
            if message.isFromUser { continue }
            if message.id == incompleteMessageID { continue }
            let bubbles = assistantBubbles(message: message, completed: true)
            for (bubble, text) in bubbles.enumerated() {
                out.append(contentsOf: markdownTargets(messageID: message.id, bubble: bubble, text: text))
            }
        }
        for row in pending {
            guard let data = PendingImagePreview.previewData(kind: row.kind, data: row.previewData),
                  UIImage(data: data) != nil
            else { continue }
            out.append(
                ImageLightbox.Target(
                    id: row.id,
                    url: row.url,
                    name: row.name,
                    local: data
                )
            )
        }
        return out
    }
}

private struct MarkdownLightboxScopeKey: EnvironmentKey {
    static let defaultValue = LightboxStep.Scope(messageID: "", bubble: 0)
}

private struct MarkdownLightboxCountsKey: EnvironmentKey {
    static let defaultValue = LightboxStep.Counts()
}

extension EnvironmentValues {
    var markdownLightboxScope: LightboxStep.Scope {
        get { self[MarkdownLightboxScopeKey.self] }
        set { self[MarkdownLightboxScopeKey.self] = newValue }
    }

    var markdownLightboxCounts: LightboxStep.Counts {
        get { self[MarkdownLightboxCountsKey.self] }
        set { self[MarkdownLightboxCountsKey.self] = newValue }
    }
}
