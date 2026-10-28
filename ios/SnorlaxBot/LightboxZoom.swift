// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.12: zoom the image the lightbox is already showing.
/// Fit is 1×. Zoom in / Zoom out, double-tap, and pinch move between
/// 1× and 4×. A zoomed picture can be dragged. + / = zoom in, − zooms
/// out, and 0 fits, only while the overlay is open. Zoom does not
/// close, send, or remove a chip. Save still writes the original
/// bytes. Reduce Motion changes the scale instantly; otherwise 120ms.
/// Dragging and pinching do not ease. No new shortcuts-list chord.
/// No new HTTP.
/// Keep in lockstep with `desktop/src/lightboxZoom.ts`.
enum LightboxZoom {
    static let minScale: Double = 1
    static let maxScale: Double = 4
    static let step: Double = 0.5
    static let doubleScale: Double = 2
    static let wheelNotch: Double = 48
    static let transitionMs: Double = 120

    static let zoomInLabel = "Zoom in"
    static let zoomOutLabel = "Zoom out"
    static let zoomInAccessibility = "Zoom in"
    static let zoomOutAccessibility = "Zoom out"

    enum Action: String {
        case zoomIn = "in"
        case zoomOut = "out"
        case fit
        case toggle
    }

    struct State: Equatable {
        var scale: Double
        var x: Double
        var y: Double

        static let fit = State(scale: 1, x: 0, y: 0)
    }

    struct Limits: Equatable {
        var maxX: Double
        var maxY: Double
    }

    static func quantize(_ scale: Double) -> Double {
        (scale * 1000).rounded() / 1000
    }

    static func clampScale(_ scale: Double) -> Double {
        guard scale.isFinite else { return minScale }
        return min(maxScale, max(minScale, quantize(scale)))
    }

    static func canZoomIn(_ scale: Double) -> Bool {
        clampScale(scale) < maxScale - 0.001
    }

    static func canZoomOut(_ scale: Double) -> Bool {
        clampScale(scale) > minScale + 0.001
    }

    static func panEnabled(_ scale: Double) -> Bool {
        canZoomOut(scale)
    }

    /// Swipe-down dismiss stays the v0.79 gesture, and only at 1×.
    static func allowsSwipeDismiss(scale: Double) -> Bool {
        !panEnabled(scale)
    }

    static func panLimits(fittedWidth: Double, fittedHeight: Double, scale: Double) -> Limits {
        guard panEnabled(scale) else { return Limits(maxX: 0, maxY: 0) }
        let width = fittedWidth.isFinite ? max(0, fittedWidth) : 0
        let height = fittedHeight.isFinite ? max(0, fittedHeight) : 0
        return Limits(
            maxX: ((scale - 1) * width) / 2,
            maxY: ((scale - 1) * height) / 2
        )
    }

    static func finite(_ value: Double) -> Double {
        value.isFinite ? value : 0
    }

    static func clampPan(_ zoom: State, limits: Limits) -> State {
        let scale = clampScale(zoom.scale)
        guard panEnabled(scale) else { return .fit }
        let maxX = max(0, finite(limits.maxX))
        let maxY = max(0, finite(limits.maxY))
        return State(
            scale: scale,
            x: min(maxX, max(-maxX, finite(zoom.x))),
            y: min(maxY, max(-maxY, finite(zoom.y)))
        )
    }

    private static func stepped(_ zoom: State, direction: Double) -> State {
        let scale = clampScale(zoom.scale + direction * step)
        guard panEnabled(scale) else { return .fit }
        return State(scale: scale, x: finite(zoom.x), y: finite(zoom.y))
    }

    static func zoomedIn(_ zoom: State) -> State { stepped(zoom, direction: 1) }
    static func zoomedOut(_ zoom: State) -> State { stepped(zoom, direction: -1) }

    /// Double-tap: 1× goes to 2×, anything larger returns to fit.
    static func toggled(_ zoom: State) -> State {
        if panEnabled(zoom.scale) { return .fit }
        return State(scale: doubleScale, x: 0, y: 0)
    }

    static func applied(
        _ zoom: State,
        action: Action,
        fittedWidth: Double,
        fittedHeight: Double
    ) -> State {
        let next: State
        switch action {
        case .zoomIn: next = zoomedIn(zoom)
        case .zoomOut: next = zoomedOut(zoom)
        case .toggle: next = toggled(zoom)
        case .fit: next = .fit
        }
        return clampPan(next, limits: panLimits(
            fittedWidth: fittedWidth,
            fittedHeight: fittedHeight,
            scale: next.scale
        ))
    }

    static func pinchScale(baseScale: Double, magnification: Double) -> Double {
        guard baseScale.isFinite else { return minScale }
        guard magnification.isFinite, magnification > 0 else { return clampScale(baseScale) }
        return clampScale(baseScale * magnification)
    }

    static func pinched(
        baseScale: Double,
        magnification: Double,
        x: Double,
        y: Double,
        fittedWidth: Double,
        fittedHeight: Double
    ) -> State {
        let scale = pinchScale(baseScale: baseScale, magnification: magnification)
        return clampPan(
            State(scale: scale, x: x, y: y),
            limits: panLimits(fittedWidth: fittedWidth, fittedHeight: fittedHeight, scale: scale)
        )
    }

    static func panned(
        scale: Double,
        originX: Double,
        originY: Double,
        dx: Double,
        dy: Double,
        fittedWidth: Double,
        fittedHeight: Double
    ) -> State {
        guard panEnabled(scale) else { return .fit }
        return clampPan(
            State(scale: scale, x: originX + dx, y: originY + dy),
            limits: panLimits(fittedWidth: fittedWidth, fittedHeight: fittedHeight, scale: scale)
        )
    }

    /// Negative deltaY zooms in. One event takes one step.
    static func wheeled(
        _ zoom: State,
        deltaY: Double,
        pending: Double,
        fittedWidth: Double,
        fittedHeight: Double
    ) -> (zoom: State, pending: Double) {
        guard deltaY.isFinite, deltaY != 0 else {
            return (zoom, finite(pending))
        }
        let total = finite(pending) + deltaY
        if abs(total) < wheelNotch { return (zoom, total) }
        let next = applied(
            zoom,
            action: total < 0 ? .zoomIn : .zoomOut,
            fittedWidth: fittedWidth,
            fittedHeight: fittedHeight
        )
        let consumed = total < 0 ? -wheelNotch : wheelNotch
        var rest = total - consumed
        if abs(rest) >= wheelNotch { rest = 0 }
        return (next, rest)
    }

    /// Unmodified + / = zoom in, − / _ zoom out, 0 fits.
    /// Command, Control, and Option stay with transcript text size.
    static func keyAction(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Action? {
        if command || control || option { return nil }
        let tokens = [String(key), characters]
        if tokens.contains("+") || tokens.contains("=") { return .zoomIn }
        if tokens.contains("-") || tokens.contains("_") { return .zoomOut }
        if shift { return nil }
        if tokens.contains("0") { return .fit }
        return nil
    }

    static func doubleTapZooms(count: Int) -> Bool {
        count >= 2
    }

    static func keepsOpen() -> Bool { true }

    static func animation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: transitionMs / 1000)
    }

    /// The button label does not fade, including when Reduce Motion is off.
    static func animatesLabel(reduceMotion: Bool) -> Bool {
        _ = reduceMotion
        return false
    }

    static func doubleTapHint(scale: Double) -> String {
        panEnabled(scale) ? "Double-tap to fit" : "Double-tap to zoom"
    }
}
