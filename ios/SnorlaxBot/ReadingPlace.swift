// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.74: per-chat reading place. Switching away remembers whether
/// the transcript was at the latest messages or parked on an earlier
/// one. Coming back restores that place. Within the stick-to-bottom
/// slack, the chat still opens at the latest. A new tail while parked
/// shows Jump to latest. Send, Regenerate, and Jump still snap to the
/// bottom. Session memory only. No HTTP.
///
/// v1.30: the parked place also stores how far into that row the
/// viewport started, as a fraction of the row height. Coming back
/// lands on that fraction. A zero fraction still aligns the row top.
/// An explicit jump to a message, or Home/End, wins over the saved
/// place. The restore assigns an offset. No animation. Still session
/// memory only. No HTTP.
/// Keep in lockstep with `desktop/src/readingPlace.ts`.
enum ReadingPlace {
    static let coordinateSpace = "reading"

    struct Place: Equatable {
        var nearBottom: Bool
        var anchorId: String?
        /// Fraction of the anchor row above the viewport. 0 aligns the top.
        var anchorOffset: CGFloat
        var tailId: String?
    }

    enum Mode: Equatable {
        case bottom
        case anchor
    }

    /// What an explicit scroll was aiming at after the place was scheduled.
    enum TargetedKind: Equatable {
        case top
        case bottom
        case message
    }

    /// `place` restores the anchor. `keep` leaves a message-target scroll.
    enum Decision: Equatable {
        case place
        case top
        case bottom
        case keep
    }

    struct Frame: Equatable {
        var id: String
        var minY: CGFloat
        var maxY: CGFloat
    }

    /// One chat, including a channel thread. Empty thread is the timeline.
    static func key(agentId: String, threadId: String?) -> String {
        "\(agentId)\n\(threadId ?? "")"
    }

    static func capture(
        nearBottom: Bool,
        anchorId: String?,
        tailId: String?,
        anchorOffset: CGFloat = 0
    ) -> Place {
        let parked = !nearBottom && anchorId != nil
        let offset = parked && anchorOffset.isFinite ? anchorOffset : 0
        return Place(
            nearBottom: nearBottom,
            anchorId: nearBottom ? nil : anchorId,
            anchorOffset: offset,
            tailId: tailId
        )
    }

    /// How far into the anchor the viewport starts, as a fraction of its height.
    static func fraction(minY: CGFloat, maxY: CGFloat, viewportTop: CGFloat) -> CGFloat {
        let height = maxY - minY
        guard height > 0 else { return 0 }
        return (viewportTop - minY) / height
    }

    /// Fraction for the saved anchor, or 0 when that row is not measured.
    static func anchorOffset(rows: [Frame], anchorId: String?, viewportTop: CGFloat) -> CGFloat {
        guard let anchorId, let row = rows.first(where: { $0.id == anchorId }) else { return 0 }
        return fraction(minY: row.minY, maxY: row.maxY, viewportTop: viewportTop)
    }

    /// Content offset that puts `fraction` of the row above the viewport.
    /// A zero fraction, or a row with no height, meets the row top.
    static func restoredContentOffset(minY: CGFloat, maxY: CGFloat, fraction: CGFloat) -> CGFloat {
        let height = maxY - minY
        let shift = height > 0 && fraction.isFinite ? fraction * height : 0
        return max(0, minY + shift)
    }

    /// An explicit scroll claimed after the place was scheduled wins.
    static func decision(scheduled: Int, current: Int, kind: TargetedKind) -> Decision {
        if scheduled == current { return .place }
        switch kind {
        case .top: return .top
        case .bottom: return .bottom
        case .message: return .keep
        }
    }

    /// First row whose bottom is still inside the viewport, in visual order.
    static func topVisibleAnchor(rows: [Frame], viewportTop: CGFloat) -> String? {
        let ordered = rows
            .filter { !$0.id.isEmpty }
            .sorted { lhs, rhs in
                if lhs.minY == rhs.minY { return lhs.maxY < rhs.maxY }
                return lhs.minY < rhs.minY
            }
        var fallback: String?
        for row in ordered {
            fallback = row.id
            if row.maxY > viewportTop + 1 { return row.id }
        }
        return fallback
    }

    /// Missing place, near the bottom, or an anchor that is gone: open at the latest.
    static func restore(saved: Place?, anchorIds: [String]) -> Mode {
        guard let saved, !saved.nearBottom, let anchorId = saved.anchorId else {
            return .bottom
        }
        if !anchorIds.contains(anchorId) { return .bottom }
        return .anchor
    }

    static func tailGrew(saved: Place?, tailId: String?) -> Bool {
        guard let saved, let tailId else { return false }
        guard let previous = saved.tailId else { return true }
        return previous != tailId
    }

    /// Near-bottom opens stay armed. A parked place stays put.
    /// Jump shows only when the tail grew while the chat was away.
    static func stick(mode: Mode, tailGrew: Bool) -> StickToBottom.State {
        if mode == .bottom { return .armed }
        return StickToBottom.State(armed: false, showJump: tailGrew)
    }
}

struct ReadingFramesKey: PreferenceKey {
    static var defaultValue: [ReadingPlace.Frame] = []

    static func reduce(
        value: inout [ReadingPlace.Frame],
        nextValue: () -> [ReadingPlace.Frame]
    ) {
        value.append(contentsOf: nextValue())
    }
}

extension View {
    /// Reports this row's frame in the transcript coordinate space.
    func readingAnchor(_ id: String) -> some View {
        background {
            GeometryReader { geo in
                let frame = geo.frame(in: .named(ReadingPlace.coordinateSpace))
                Color.clear.preference(
                    key: ReadingFramesKey.self,
                    value: [ReadingPlace.Frame(id: id, minY: frame.minY, maxY: frame.maxY)]
                )
            }
        }
    }
}
