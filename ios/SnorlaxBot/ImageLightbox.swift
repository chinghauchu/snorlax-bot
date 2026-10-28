// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v0.79: tap an image on a user-RIGHT or assistant-LEFT kind=message
/// bubble to open a full-size overlay. Close, a tap outside, Esc, or a
/// swipe down dismisses it. Videos stay the player. File chips stay chips.
/// 120ms opacity; instant when Reduce Motion is on. Existing attachment
/// bytes only. No new HTTP.
///
/// v2.11: Save sits beside Close and uses the bytes that painted this
/// image, including a pending preview. The system share sheet receives
/// that file. Photo-library permission is not requested. The overlay
/// stays open. Nothing is sent and a pending chip is not removed.
///
/// v2.12: Zoom out and Zoom in sit with Save. Double-tap toggles 1×
/// and 2×. Pinch zooms between 1× and 4×. A zoomed picture can be
/// dragged. Swipe-down dismisses only at 1×.
enum ImageLightbox {
    static let close = "Close"
    static let label = "Image"
    /// Keep in lockstep with desktop `IMAGE_LIGHTBOX_FADE_MS`.
    static let fadeMs: Double = 120
    static var fadeSeconds: Double { fadeMs / 1000 }

    struct Paint: Equatable {
        var mounted: Bool
        var shown: Bool

        static let hidden = Paint(mounted: false, shown: false)
    }

    struct Target: Identifiable, Equatable {
        let id: String
        var url: String
        var name: String
        var local: Data?
    }

    static func isImage(_ kind: Attachment.Kind) -> Bool {
        kind == .image
    }

    static func label(for name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? label : trimmed
    }

    static func fadeSeconds(reduceMotion: Bool) -> Double {
        reduceMotion ? 0 : fadeSeconds
    }

    static func animation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: fadeSeconds)
    }

    static func appear(reduceMotion: Bool) -> Paint {
        Paint(mounted: true, shown: reduceMotion)
    }

    static func shown() -> Paint {
        Paint(mounted: true, shown: true)
    }

    static func dismiss(reduceMotion: Bool) -> Paint {
        reduceMotion ? .hidden : Paint(mounted: true, shown: false)
    }

    /// Esc closes the lightbox. IME composition keeps Esc.
    static func escapeCloses(open: Bool, composing: Bool) -> Bool {
        open && !composing
    }

    /// Fit the image inside the lightbox, scaling a small chip up to the screen.
    static func fittedSize(image: CGSize, in bounds: CGSize) -> CGSize {
        guard image.width > 0, image.height > 0, bounds.width > 0, bounds.height > 0 else {
            return .zero
        }
        let scale = min(bounds.width / image.width, bounds.height / image.height)
        return CGSize(width: image.width * scale, height: image.height * scale)
    }

    /// Swipe down dismisses. A mostly horizontal drag does not.
    static func swipeDismisses(translation: CGSize) -> Bool {
        translation.height > 80 && translation.height > abs(translation.width)
    }
}

struct ImageLightboxOverlay: View {
    let target: ImageLightbox.Target
    let shown: Bool
    let reduceMotion: Bool
    @Binding var zoom: LightboxZoom.State
    var closeFocused: FocusState<Bool>.Binding
    let onFitted: (CGSize) -> Void
    let onClose: () -> Void

    @Environment(AppModel.self) private var model
    @State private var image: UIImage?
    @State private var imageData: Data?
    @State private var shareURL: URL?
    @State private var fitted = CGSize.zero
    @State private var pinchBase: Double = 1
    @State private var pinchActive = false
    @State private var panOrigin = CGSize.zero
    @State private var panActive = false

    var body: some View {
        GeometryReader { geo in
            let bounds = CGSize(
                width: max(geo.size.width - 48, 0),
                height: max(geo.size.height - 96, 0)
            )
            ZStack {
                Color.black.opacity(0.72)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { onClose() }
                picture(in: bounds)
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .overlay(alignment: .topTrailing) {
                HStack(spacing: 8) {
                    Button(LightboxZoom.zoomOutLabel) {
                        applyZoom(.zoomOut)
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color(uiColor: .secondarySystemBackground))
                    }
                    .buttonStyle(.plain)
                    .disabled(!LightboxZoom.canZoomOut(zoom.scale))
                    .opacity(LightboxZoom.canZoomOut(zoom.scale) ? 1 : 0.4)
                    .accessibilityLabel(LightboxZoom.zoomOutAccessibility)
                    .transaction { transaction in
                        if !LightboxZoom.animatesLabel(reduceMotion: reduceMotion) {
                            transaction.animation = nil
                        }
                    }
                    Button(LightboxZoom.zoomInLabel) {
                        applyZoom(.zoomIn)
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color(uiColor: .secondarySystemBackground))
                    }
                    .buttonStyle(.plain)
                    .disabled(!LightboxZoom.canZoomIn(zoom.scale))
                    .opacity(LightboxZoom.canZoomIn(zoom.scale) ? 1 : 0.4)
                    .accessibilityLabel(LightboxZoom.zoomInAccessibility)
                    .transaction { transaction in
                        if !LightboxZoom.animatesLabel(reduceMotion: reduceMotion) {
                            transaction.animation = nil
                        }
                    }
                    if imageData != nil {
                        Button(LightboxSave.label) {
                            saveImage()
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color(uiColor: .secondarySystemBackground))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(LightboxSave.accessibilityLabel)
                        .transaction { transaction in
                            if !LightboxSave.animates(reduceMotion: reduceMotion) {
                                transaction.animation = nil
                            }
                        }
                    }
                    Button(ImageLightbox.close, action: onClose)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color(uiColor: .secondarySystemBackground))
                        }
                        .buttonStyle(.plain)
                        .focused(closeFocused)
                        .keyboardShortcut(.cancelAction)
                        .accessibilityLabel(ImageLightbox.close)
                        .onExitCommand(perform: onClose)
                }
                .padding(12)
            }
        }
        .sheet(isPresented: Binding(
            get: { shareURL != nil },
            set: { if !$0 { shareURL = nil } }
        )) {
            if let shareURL {
                LightboxShareSheet(url: shareURL)
            }
        }
        .ignoresSafeArea()
        .opacity(shown ? 1 : 0)
        .allowsHitTesting(shown)
        .animation(ImageLightbox.animation(reduceMotion: reduceMotion), value: shown)
        .transaction { transaction in
            if reduceMotion {
                transaction.animation = nil
            }
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityElement(children: .contain)
        .onExitCommand(perform: onClose)
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                if LightboxZoom.allowsSwipeDismiss(scale: zoom.scale),
                   ImageLightbox.swipeDismisses(translation: value.translation) {
                    onClose()
                }
            }
        )
        .onChange(of: zoom) { _, next in
            if !pinchActive && !panActive {
                pinchBase = next.scale
                panOrigin = CGSize(width: next.x, height: next.y)
            }
        }
        .onAppear {
            if shown { closeFocused.wrappedValue = true }
        }
        .onChange(of: shown) { _, isShown in
            if isShown { closeFocused.wrappedValue = true }
        }
        .task(id: target.id) { await load() }
    }

    /// Scale the picture already shown. The overlay stays open.
    /// Nothing is sent and a pending chip is not removed.
    private func applyZoom(_ action: LightboxZoom.Action) {
        guard LightboxZoom.keepsOpen() else { return }
        let next = LightboxZoom.applied(
            zoom,
            action: action,
            fittedWidth: fitted.width,
            fittedHeight: fitted.height
        )
        if let animation = LightboxZoom.animation(reduceMotion: reduceMotion) {
            withAnimation(animation) { zoom = next }
        } else {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { zoom = next }
        }
        pinchBase = next.scale
        panOrigin = CGSize(width: next.x, height: next.y)
    }

    private func rememberFitted(_ size: CGSize) {
        fitted = size
        onFitted(size)
    }

    @ViewBuilder
    private func picture(in bounds: CGSize) -> some View {
        if let image {
            let size = ImageLightbox.fittedSize(image: image.size, in: bounds)
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .frame(width: max(size.width, 1), height: max(size.height, 1))
                .scaleEffect(zoom.scale)
                .offset(x: zoom.x, y: zoom.y)
                .contentShape(Rectangle())
                .highPriorityGesture(
                    TapGesture(count: 2).onEnded {
                        guard LightboxZoom.doubleTapZooms(count: 2) else { return }
                        applyZoom(.toggle)
                    }
                )
                .onTapGesture {}
                .simultaneousGesture(
                    MagnificationGesture()
                        .onChanged { value in
                            if !pinchActive {
                                pinchActive = true
                                pinchBase = zoom.scale
                                panOrigin = CGSize(width: zoom.x, height: zoom.y)
                            }
                            zoom = LightboxZoom.pinched(
                                baseScale: pinchBase,
                                magnification: value,
                                x: panOrigin.width,
                                y: panOrigin.height,
                                fittedWidth: size.width,
                                fittedHeight: size.height
                            )
                        }
                        .onEnded { value in
                            let next = LightboxZoom.pinched(
                                baseScale: pinchBase,
                                magnification: value,
                                x: panOrigin.width,
                                y: panOrigin.height,
                                fittedWidth: size.width,
                                fittedHeight: size.height
                            )
                            zoom = next
                            pinchActive = false
                            pinchBase = next.scale
                            panOrigin = CGSize(width: next.x, height: next.y)
                        }
                )
                .simultaneousGesture(
                    DragGesture(minimumDistance: 4)
                        .onChanged { value in
                            guard LightboxZoom.panEnabled(zoom.scale) else { return }
                            if !panActive {
                                panActive = true
                                panOrigin = CGSize(width: zoom.x, height: zoom.y)
                            }
                            zoom = LightboxZoom.panned(
                                scale: zoom.scale,
                                originX: panOrigin.width,
                                originY: panOrigin.height,
                                dx: value.translation.width,
                                dy: value.translation.height,
                                fittedWidth: size.width,
                                fittedHeight: size.height
                            )
                        }
                        .onEnded { _ in
                            panActive = false
                            panOrigin = CGSize(width: zoom.x, height: zoom.y)
                        }
                )
                .accessibilityLabel(ImageLightbox.label(for: target.name))
                .accessibilityHint(LightboxZoom.doubleTapHint(scale: zoom.scale))
                .onAppear { rememberFitted(size) }
                .onChange(of: size.width) { _, _ in rememberFitted(size) }
                .onChange(of: size.height) { _, _ in rememberFitted(size) }
        } else {
            ProgressView()
                .tint(.white)
        }
    }

    /// Write the bytes already shown and present the share sheet.
    /// The overlay stays open. Nothing is sent and no chip is removed.
    private func saveImage() {
        guard LightboxSave.keepsOpen() else { return }
        guard let imageData, !imageData.isEmpty else { return }
        let name = LightboxSave.filename(
            name: target.name,
            url: target.url,
            sniffed: LightboxSave.sniffExtension(imageData)
        )
        let file = LightboxSave.temporaryFileURL(filename: name)
        do {
            try FileManager.default.createDirectory(
                at: file.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try imageData.write(to: file, options: .atomic)
        } catch {
            return
        }
        shareURL = file
    }

    private func load() async {
        image = nil
        imageData = nil
        shareURL = nil
        if let local = target.local, !local.isEmpty, let uiImage = UIImage(data: local) {
            imageData = local
            image = uiImage
            return
        }
        let urlString = target.url
        if urlString.hasPrefix("data:"),
           let data = DataURI.decode(urlString),
           !data.isEmpty,
           let uiImage = UIImage(data: data) {
            imageData = data
            image = uiImage
            return
        }
        guard !urlString.isEmpty,
              let client = model.client,
              let url = client.resolve(urlString)
        else { return }
        do {
            let data = try await client.data(from: url)
            guard !Task.isCancelled, !data.isEmpty, let uiImage = UIImage(data: data) else { return }
            imageData = data
            image = uiImage
        } catch {
            image = nil
            imageData = nil
        }
    }
}

/// The system share sheet for one saved image file. Save Image, Copy,
/// and Files are the system's actions. This view does not request
/// photo-library permission.
private struct LightboxShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
