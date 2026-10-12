// SPDX-License-Identifier: Apache-2.0
import Foundation
import UniformTypeIdentifiers

/// v0.75: drop files or images onto the chat composer. They become
/// the same pending chips as the paperclip. A text selection does
/// not. Nothing is sent. No HTTP.
enum ChatDrop {
    static let label = "Drop files to attach"

    /// File and image types. Plain text is absent so a text selection
    /// does not light the composer.
    static var types: [UTType] {
        [.fileURL, .image, .movie, .video, .pdf, .jpeg, .png, .gif, .heic, .webP, .mpeg4Movie, .quickTimeMovie]
    }

    struct Payload: Equatable {
        var name: String
        var mime: String
        var data: Data
    }

    /// True when the drag offers a file or image, not a text selection.
    static func accepts(typeIdentifiers offered: [String]) -> Bool {
        for raw in offered {
            guard let type = UTType(raw) else { continue }
            if type.conforms(to: .fileURL) { return true }
            if type.conforms(to: .image) { return true }
            if type.conforms(to: .movie) { return true }
            if type.conforms(to: .video) { return true }
            if type.conforms(to: .pdf) { return true }
        }
        return false
    }

    static func accepts(providers: [NSItemProvider]) -> Bool {
        guard !providers.isEmpty else { return false }
        let offered = providers.flatMap(\.registeredTypeIdentifiers)
        // The system already matched `types` before calling us. An empty
        // list still counts; a text-only list does not.
        if offered.isEmpty { return true }
        return accepts(typeIdentifiers: offered)
    }

    static func load(_ provider: NSItemProvider) async -> Payload? {
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
           let payload = await loadFilePayload(provider) {
            return payload
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
           let data = await loadData(provider, type: .image),
           !data.isEmpty {
            let mime = data.sniffedImageMIME
            return Payload(
                name: ComposerPasteboard.bitmapName(mime: mime),
                mime: mime,
                data: data
            )
        }
        let videoType: UTType? =
            provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
            ? .movie
            : (provider.hasItemConformingToTypeIdentifier(UTType.video.identifier) ? .video : nil)
        if let videoType,
           let data = await loadData(provider, type: videoType),
           !data.isEmpty {
            let mime = data.sniffedVideoMIME ?? "video/mp4"
            return Payload(name: "clip.mp4", mime: mime, data: data)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier),
           let data = await loadData(provider, type: .pdf),
           !data.isEmpty {
            return Payload(name: "file.pdf", mime: "application/pdf", data: data)
        }
        return nil
    }

    /// Read the file before the provider deletes a temporary URL.
    private static func loadFilePayload(_ provider: NSItemProvider) async -> Payload? {
        await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: URL.self) { object, _ in
                guard let url = object as? URL else {
                    continuation.resume(returning: nil)
                    return
                }
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url), !data.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
                    ?? "application/octet-stream"
                let name = url.lastPathComponent.isEmpty ? "file" : url.lastPathComponent
                continuation.resume(returning: Payload(name: name, mime: mime, data: data))
            }
        }
    }

    private static func loadData(_ provider: NSItemProvider, type: UTType) async -> Data? {
        await withCheckedContinuation { continuation in
            provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
                continuation.resume(returning: data)
            }
        }
    }
}
