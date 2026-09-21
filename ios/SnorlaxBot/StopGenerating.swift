// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.50 Stop generating. Client abort of the in-flight stream.
/// Matches desktop `stopGenerating.ts`. Keep the partial LEFT text.
/// v0.53: hardware Esc is the same abort (see `escapeStops`).
enum StopGenerating {
    static let label = "Stop"

    static func shouldOffer(busy: Bool) -> Bool {
        busy
    }

    static func isAbort(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled {
            return true
        }
        return false
    }

    static func shouldRefetchAfterStop() -> Bool {
        false
    }

    static func keepPartial<T>(_ messages: [T]) -> [T] {
        messages
    }

    static func composerUsable(busy: Bool) -> Bool {
        !busy
    }

    static func shouldRestart() -> Bool {
        false
    }

    /// v0.53: hardware Esc aborts the in-flight stream the same as Stop.
    /// Do not steal Esc while IME is composing, or while a pending
    /// widget / approve / connect card is up (those keep Esc/dismiss).
    static func escapeStops(
        busy: Bool,
        composing: Bool,
        pendingWidget: Bool,
        pendingApprove: Bool,
        pendingConnect: Bool
    ) -> Bool {
        shouldOffer(busy: busy)
            && !composing
            && !pendingWidget
            && !pendingApprove
            && !pendingConnect
    }

    static func pendingWidget(in messages: [Message]) -> Bool {
        messages.contains {
            $0.isWidget && ($0.widgetStatus == nil || $0.widgetStatus == .pending)
        }
    }

    static func pendingApprove(in messages: [Message]) -> Bool {
        messages.contains {
            $0.isApprove && ($0.approveStatus == nil || $0.approveStatus == .pending)
        }
    }

    static func pendingConnect(in messages: [Message]) -> Bool {
        messages.contains {
            $0.isConnect && ($0.connectStatus == nil || $0.connectStatus == .pending)
        }
    }
}
