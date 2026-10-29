// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v2.14: load an earlier page of the open chat.
/// GET messages already returns the newest page (default 100,
/// oldest-first) and accepts `before` plus `limit`. A full page
/// offers Load earlier messages. The tap requests the next older
/// page and prepends it. A short page, or a page that adds nothing,
/// hides the control. Sending or regenerating keeps pages already
/// loaded above the latest window. No new HTTP.
/// Keep in lockstep with `desktop/src/earlierMessages.ts`.
enum EarlierMessages {
    static let pageSize = 100
    static let label = "Load earlier messages"
    static let loadingLabel = "Loading earlier messages"
    static let failedLabel = "Couldn't load earlier messages"
    static let controlID = "load-earlier"

    static func isServerID(_ id: String) -> Bool {
        !id.hasPrefix(OptimisticSend.idPrefix)
    }

    /// A full page may have older rows. A short page is the start.
    static func pageMayHaveEarlier(_ count: Int, pageSize: Int = pageSize) -> Bool {
        count >= pageSize
    }

    static func showControl(mayHaveEarlier: Bool, messageCount: Int) -> Bool {
        mayHaveEarlier && messageCount > 0
    }

    /// Oldest server id in an oldest-first transcript.
    static func cursor(ids: [String]) -> String? {
        ids.first(where: isServerID)
    }

    /// Prepend an older page. Ids already on screen stay put.
    static func mergeEarlier<T>(
        _ existing: [T],
        _ page: [T],
        id: (T) -> String
    ) -> (rows: [T], added: Int, revealID: String?) {
        var seen = Set(existing.map(id))
        var older: [T] = []
        for row in page {
            let key = id(row)
            if seen.contains(key) { continue }
            seen.insert(key)
            older.append(row)
        }
        return (older + existing, older.count, older.first.map(id))
    }

    /// True only when this page both added rows and filled the page.
    static func stillHasEarlier(pageCount: Int, added: Int, pageSize: Int = pageSize) -> Bool {
        added > 0 && pageCount >= pageSize
    }

    /// A refresh of the latest page keeps history already loaded
    /// above that window. Local bubbles are left for the failed-send
    /// paint. An empty latest page does not wipe what is on screen.
    static func mergeLatest<T>(
        _ existing: [T],
        _ latest: [T],
        id: (T) -> String,
        createdAt: (T) -> Date
    ) -> [T] {
        let serverLatest = latest.filter { isServerID(id($0)) }
        guard let boundary = serverLatest.first else {
            return existing.filter { isServerID(id($0)) }
        }
        let latestIDs = Set(serverLatest.map(id))
        let boundaryID = id(boundary)
        if let cut = existing.firstIndex(where: { id($0) == boundaryID }) {
            let older = existing[..<cut].filter {
                isServerID(id($0)) && !latestIDs.contains(id($0))
            }
            return Array(older) + serverLatest
        }
        let boundaryTime = createdAt(boundary)
        let older = existing.filter { row in
            guard isServerID(id(row)), !latestIDs.contains(id(row)) else { return false }
            return createdAt(row) < boundaryTime
        }
        return older + serverLatest
    }
}
