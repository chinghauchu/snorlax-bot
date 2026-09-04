// SPDX-License-Identifier: Apache-2.0
import AVFoundation
import Foundation

/// Local TTS Speak on completed LEFT kind=message. Never autoplay.
enum Speak {
    static let startLabel = "Speak"
    static let stopLabel = "Stop speaking"

    static func label(_ speaking: Bool) -> String {
        speaking ? stopLabel : startLabel
    }

    static func pressed(_ speaking: Bool) -> Bool {
        speaking
    }

    /// Strip markdown to spoken text. Do not invent UI chrome.
    /// Mermaid fences are treated like other fences (source, not narrated).
    /// Math is spoken as plain TeX source (not narrated as an image).
    static func spokenText(_ src: String) -> String {
        var text = dropFences(src)
        text = replace(text, "\\$\\$([\\s\\S]*?)\\$\\$", "$1")
        text = replace(text, "\\\\\\(([\\s\\S]*?)\\\\\\)", "$1")
        text = replace(text, "\\$\\$", "")
        text = replace(text, "\\\\\\(", "")
        text = replace(text, "\\\\\\)", "")
        text = replace(text, "`([^`]+)`", "$1")
        text = replace(text, "!\\[([^\\]]*)\\]\\([^)]+\\)", "$1")
        text = replace(text, "\\[([^\\]]+)\\]\\([^)]+\\)", "$1")
        text = replace(text, "^#{1,6}\\s+", "", lines: true)
        text = replace(text, "^\\s{0,3}>\\s?", "", lines: true)
        text = replace(text, "^\\s*[-*+]\\s+", "", lines: true)
        text = replace(text, "^\\s*\\d+\\.\\s+", "", lines: true)
        text = replace(text, "(\\*\\*|__)(.*?)\\1", "$2")
        text = replace(text, "(\\*|_)(.*?)\\1", "$2")
        text = replace(text, "~~(.*?)~~", "$1")
        text = replace(text, "[ \\t]+\\n", "\n")
        text = replace(text, "\\n{3,}", "\n\n")
        text = replace(text, "[ \\t]{2,}", " ")
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func dropFences(_ src: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: "```[^\\n]*\\n?([\\s\\S]*?)```") else {
            return src
        }
        let ns = src as NSString
        let range = NSRange(location: 0, length: ns.length)
        return regex.stringByReplacingMatches(in: src, range: range, withTemplate: "$1")
    }

    private static func replace(_ src: String, _ pattern: String, _ template: String, lines: Bool = false) -> String {
        var options: NSRegularExpression.Options = []
        if lines { options.insert(.anchorsMatchLines) }
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else {
            return src
        }
        let ns = src as NSString
        let range = NSRange(location: 0, length: ns.length)
        return regex.stringByReplacingMatches(in: src, range: range, withTemplate: template)
    }
}

/// Plays WAV bytes from POST /v1/speak. Local runtime audio only.
final class SpeakPlayback: NSObject, AVAudioPlayerDelegate {
    private var player: AVAudioPlayer?
    var onEnd: (() -> Void)?

    func play(_ data: Data) throws {
        stop()
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try AVAudioSession.sharedInstance().setActive(true)
        let next = try AVAudioPlayer(data: data)
        next.delegate = self
        player = next
        next.play()
    }

    func stop() {
        player?.delegate = nil
        player?.stop()
        player = nil
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        self.player = nil
        onEnd?()
    }
}
