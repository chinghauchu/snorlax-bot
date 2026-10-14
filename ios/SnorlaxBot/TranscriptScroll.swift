// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.03: hardware-keyboard scroll of the loaded transcript.
/// Page Up / Page Down move about one viewport. ⌘↑ / ⌃↑ (and Home)
/// jump to the oldest loaded messages. ⌘↓ / ⌃↓ (and End) jump to the
/// latest and use the Jump-to-latest path so stick-to-bottom re-arms
/// the same way the Jump chip does. The composer, find bar, lightbox,
/// shortcuts sheet, and any other text field keep the keys. IME stays
/// with the field. Scroll is an instant offset change, so Reduce
/// Motion adds no animation. No HTTP. Nothing is persisted.
/// Keep in lockstep with `desktop/src/transcriptScroll.ts`.
enum TranscriptScroll {
    static let pageKeysLabel = "Page Up / Page Down"
    static let pageAction = "Scroll the transcript"
    static let edgeKeysLabel = "⌘↑ / ⌘↓"
    static let edgeAction = "Oldest or latest messages"

    enum Key: Equatable {
        case pageUp
        case pageDown
        case home
        case end
        case up
        case down
        case other
    }

    enum Action: Equatable {
        case pageUp
        case pageDown
        case top
        case bottom
    }

    struct Box: Equatable {
        var offsetY: CGFloat
        var viewport: CGFloat
        var content: CGFloat

        static let zero = Box(offsetY: 0, viewport: 0, content: 0)

        var maxOffset: CGFloat { max(0, content - viewport) }
    }

    /// Page Up / Page Down with no modifiers. ⌘↑ / ⌘↓ and ⌃↑ / ⌃↓ are
    /// the Home / End equivalents. Bare Home / End match too, when
    /// focus is not in a text field. Shift and Option stay put.
    static func action(
        key: Key,
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Action? {
        if option || shift { return nil }
        if command && control { return nil }
        let chord = command || control
        switch key {
        case .pageUp:
            if chord { return nil }
            return .pageUp
        case .pageDown:
            if chord { return nil }
            return .pageDown
        case .up:
            return chord ? .top : nil
        case .down:
            return chord ? .bottom : nil
        case .home:
            return .top
        case .end:
            return .bottom
        case .other:
            return nil
        }
    }

    /// One viewport, clamped to the loaded transcript.
    static func offset(box: Box, action: Action) -> CGFloat {
        let maxOffset = box.maxOffset
        let delta = max(0, box.viewport)
        let raw: CGFloat
        switch action {
        case .pageUp:
            raw = box.offsetY - delta
        case .pageDown:
            raw = box.offsetY + delta
        case .top:
            raw = 0
        case .bottom:
            raw = maxOffset
        }
        return min(maxOffset, max(0, raw))
    }

    static func isNearBottom(offsetY: CGFloat, box: Box) -> Bool {
        box.maxOffset - offsetY <= StickToBottom.nearBottom
    }

    /// End / ⌘↓ uses Jump to latest. A page that merely lands near
    /// the bottom re-arms through the stick-to-bottom scroll check.
    static func prefersJumpToLatest(_ action: Action) -> Bool {
        action == .bottom
    }

    /// Keyboard scroll assigns an offset. Reduce Motion has no extra
    /// animation to turn off.
    static func scrollAnimation(reduceMotion: Bool) -> Animation? {
        if reduceMotion { return nil }
        return nil
    }

    static func transaction(reduceMotion: Bool) -> Transaction {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        if scrollAnimation(reduceMotion: reduceMotion) == nil {
            transaction.disablesAnimations = true
        }
        return transaction
    }

    struct CommandedScroll: Equatable {
        var box: Box
        var commandedY: CGFloat?
        var previousGeometryY: CGFloat
    }

    /// Hold a programmatic offset until geometry catches up, so a
    /// repeated Page Down advances. A user scroll elsewhere wins.
    static func reconcile(
        commandedY: CGFloat?,
        previousGeometryY: CGFloat,
        geometry: Box
    ) -> CommandedScroll {
        guard let commandedY else {
            return CommandedScroll(
                box: geometry,
                commandedY: nil,
                previousGeometryY: geometry.offsetY
            )
        }
        if abs(geometry.offsetY - commandedY) <= 1 {
            return CommandedScroll(
                box: geometry,
                commandedY: nil,
                previousGeometryY: geometry.offsetY
            )
        }
        let held = abs(geometry.offsetY - previousGeometryY) <= 1
        let approaching = abs(geometry.offsetY - commandedY) < abs(previousGeometryY - commandedY)
        if held || approaching {
            var box = geometry
            box.offsetY = commandedY
            return CommandedScroll(
                box: box,
                commandedY: commandedY,
                previousGeometryY: held ? previousGeometryY : geometry.offsetY
            )
        }
        return CommandedScroll(
            box: geometry,
            commandedY: nil,
            previousGeometryY: geometry.offsetY
        )
    }

    /// Widget, approve, connect, and rename fields are text inputs.
    /// The composer is too; callers also check its focus flag.
    static func textInputIsFirstResponder() -> Bool {
        guard let responder = UIResponder.snorlaxFirstResponder else { return false }
        return responder is UITextField || responder is UITextView
    }
}

private extension UIResponder {
    static weak var snorlaxCaptured: UIResponder?

    @objc func snorlaxCaptureFirstResponder() {
        UIResponder.snorlaxCaptured = self
    }

    static var snorlaxFirstResponder: UIResponder? {
        snorlaxCaptured = nil
        UIApplication.shared.sendAction(
            #selector(snorlaxCaptureFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
        return snorlaxCaptured
    }
}
