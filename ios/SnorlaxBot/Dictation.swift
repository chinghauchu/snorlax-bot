// SPDX-License-Identifier: Apache-2.0
import AVFoundation
import Foundation
import SwiftUI
import UIKit

/// iOS composer dictation. Transcript is editable plain text. No auto-send.
/// Cancel while recording does not POST /v1/transcribe and does not insert.
enum Dictation {
    enum State: String, Equatable, Sendable {
        case idle
        case recording
        case processing
    }

    static let startLabel = "Start dictation"
    static let stopLabel = "Stop dictation"
    static let hintTranscribing = "Transcribing…"
    static let hintNoSpeech = "No speech detected."
    static let hintMicOff = "Microphone is off."
    static let errTranscribe = "Couldn't transcribe that."
    /// Same `--danger` as desktop / takeover Record.
    static let danger = Color(red: 1, green: 107.0 / 255.0, blue: 107.0 / 255.0)
    static let listeningDotSize: CGFloat = 6
    /// Composer hint `role="status"` equivalent.
    static let hintRole = "status"

    static func label(_ state: State) -> String {
        if state == .recording { return stopLabel }
        return startLabel
    }

    static func pressed(_ state: State) -> Bool {
        state == .recording
    }

    static func busy(_ state: State) -> Bool {
        state == .processing
    }

    /// Cancel while listening/recording. No POST /v1/transcribe. No insert.
    static func cancelable(_ state: State) -> Bool {
        state == .recording
    }

    /// Composer status hint. Processing and the locked mic strings only.
    static func composerHint(state: State, error: String?) -> String? {
        if state == .processing { return hintTranscribing }
        if error == hintNoSpeech || error == hintMicOff { return error }
        return nil
    }

    /// Insert recognized text at the caret (replacing a selection). Surrounding spaces when needed.
    static func insertTranscript(
        text: String,
        caret: Int,
        selectionLength: Int = 0,
        transcript: String
    ) -> (text: String, caret: Int) {
        let piece = transcript
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if piece.isEmpty { return (text, caret) }
        let ns = text as NSString
        let start = max(0, min(caret, ns.length))
        let end = max(start, min(start + max(0, selectionLength), ns.length))
        let before = ns.substring(to: start)
        let after = ns.substring(from: end)
        let lead = (!before.isEmpty && before.range(of: "[\\s\\n]$", options: .regularExpression) == nil)
            ? " " : ""
        let trail = (!after.isEmpty && after.range(of: "^[\\s\\n]", options: .regularExpression) == nil)
            ? " " : ""
        let inserted = "\(before)\(lead)\(piece)\(trail)\(after)"
        let newCaret = (before as NSString).length
            + (lead as NSString).length
            + (piece as NSString).length
            + (trail as NSString).length
        return (inserted, newCaret)
    }

    static func audioFileName(mime: String) -> String {
        let type = mime.lowercased().split(separator: ";").first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? ""
        if type == "audio/mp4" || type == "video/mp4" { return "speech.m4a" }
        if type == "audio/ogg" { return "speech.ogg" }
        if type == "audio/wav" || type == "audio/x-wav" { return "speech.wav" }
        if type == "audio/webm" { return "speech.webm" }
        return "speech.m4a"
    }
}

/// Local-mic capture. Audio is never persisted past the transcribe POST or cancel.
@MainActor
final class DictationCapture {
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var cancelRequested = false

    func start() async throws {
        cancelRequested = false
        discard()
        let granted = await Self.requestMic()
        guard granted else { throw DictationCaptureError.microphoneOff }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            throw DictationCaptureError.microphoneOff
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-dictation-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let rec: AVAudioRecorder
        do {
            rec = try AVAudioRecorder(url: url, settings: settings)
        } catch {
            throw DictationCaptureError.microphoneOff
        }
        rec.prepareToRecord()
        guard rec.record() else { throw DictationCaptureError.microphoneOff }
        recorder = rec
        fileURL = url
    }

    /// Stop and return bytes for POST. Nil if empty. Does not POST.
    func stop() -> (data: Data, mime: String, name: String)? {
        recorder?.stop()
        recorder = nil
        defer { discardFile() }
        guard !cancelRequested, let url = fileURL else { return nil }
        guard let data = try? Data(contentsOf: url), !data.isEmpty else { return nil }
        return (data, "audio/mp4", Dictation.audioFileName(mime: "audio/mp4"))
    }

    /// Cancel listening. No POST /v1/transcribe. No insert. Deletes the take.
    func cancel() {
        cancelRequested = true
        recorder?.stop()
        recorder = nil
        discardFile()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func discard() {
        recorder?.stop()
        recorder = nil
        discardFile()
    }

    private func discardFile() {
        if let url = fileURL {
            try? FileManager.default.removeItem(at: url)
        }
        fileURL = nil
    }

    private static func requestMic() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}

enum DictationCaptureError: Error {
    case microphoneOff
}

/// 6px solid listening dot. No pulse.
struct DictationListeningDot: View {
    var body: some View {
        Circle()
            .fill(Dictation.danger)
            .frame(width: Dictation.listeningDotSize, height: Dictation.listeningDotSize)
            .accessibilityHidden(true)
    }
}
