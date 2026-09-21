// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.50 Stop generating. Client abort of the in-flight stream.
/// Matches desktop `stopGenerating.ts`. Keep the partial LEFT text.
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
}
