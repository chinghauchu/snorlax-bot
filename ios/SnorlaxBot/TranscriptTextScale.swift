// SPDX-License-Identifier: Apache-2.0

import SwiftUI
import UIKit

/// v1.24: adjustable transcript text size.
/// Hardware ⌘= / ⌃= and ⌘+ / ⌃+ step the chat transcript text larger.
/// ⌘- / ⌃- step it smaller. ⌘0 / ⌃0 returns to 100%. The steps are
/// 85, 92, 100, 110, 120, and 130 percent. Message bubble text, code
/// blocks, and tool traces share that scale. Dynamic Type is the
/// base: the percent multiplies the body-scaled point size, so a
/// larger content size stays larger. Padding and images stay put.
/// The choice persists in UserDefaults. The composer does not own
/// the chord and does not insert the character. A key repeat is
/// swallowed and does not step again. IME marked text keeps it, and
/// so does any other text field (find, rename, search, settings, a
/// widget, approve, or connect card). Alt stays put. Shift is
/// allowed on = / + and - because + is shifted =. ⌘0 does not take
/// Shift, so ⌘1–⌘9 still jump. No HTTP. Keep in lockstep with
/// `desktop/src/transcriptTextScale.ts`.
enum TranscriptTextScale {
    static let storageKey = "snorlax.transcriptTextScale"
    static let steps = [85, 92, 100, 110, 120, 130]
    static let defaultPercent = 100
    static let keysLabel = "⌘= / ⌘+ / ⌘- / ⌘0"
    static let action = "Larger, smaller, or default text"
    static let sectionTitle = "Text size"
    static let smallerLabel = "Smaller"
    static let largerLabel = "Larger"
    static let resetLabel = "Default"

    enum Step: String {
        case larger
        case smaller
        case reset
    }

    struct Metrics: Equatable {
        var body: CGFloat
        var heading: CGFloat
        var code: CGFloat
        var fence: CGFloat
        var trace: CGFloat
        var chevron: CGFloat

        var bodyFont: UIFont { .systemFont(ofSize: body) }
        var bodySemibold: Font { .system(size: body, weight: .semibold) }
        var headingFont: Font { .system(size: heading, weight: .semibold) }
        var codeFont: Font { .system(size: code, weight: .regular, design: .monospaced) }
        var fenceFont: UIFont { .monospacedSystemFont(ofSize: fence, weight: .regular) }
        var mathFont: UIFont { .monospacedSystemFont(ofSize: code, weight: .regular) }
        var traceFont: Font { .system(size: trace) }
        var chevronFont: Font { .system(size: chevron, weight: .semibold) }
    }

    static func percentLabel(_ percent: Int) -> String {
        "\(normalize(percent))%"
    }

    static func normalize(_ percent: Int) -> Int {
        steps.contains(percent) ? percent : defaultPercent
    }

    /// One step, or back to 100%. The ends do not wrap.
    static func apply(_ percent: Int, _ step: Step) -> Int {
        let current = normalize(percent)
        if step == .reset { return defaultPercent }
        guard let index = steps.firstIndex(of: current) else { return defaultPercent }
        if step == .larger {
            return steps[min(index + 1, steps.count - 1)]
        }
        return steps[max(index - 1, 0)]
    }

    static func canApply(_ percent: Int, _ step: Step) -> Bool {
        apply(percent, step) != normalize(percent)
    }

    static func read(defaults: UserDefaults = .standard) -> Int {
        guard defaults.object(forKey: storageKey) != nil else { return defaultPercent }
        return normalize(defaults.integer(forKey: storageKey))
    }

    static func write(_ percent: Int, defaults: UserDefaults = .standard) {
        defaults.set(normalize(percent), forKey: storageKey)
    }

    /// Dynamic Type scales `base` for the body style, then the
    /// preference multiplies. 100% at the default content size is `base`.
    static func points(base: CGFloat, percent: Int, dynamicType: DynamicTypeSize) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: contentCategory(dynamicType))
        let dynamicBase = UIFontMetrics(forTextStyle: .body).scaledValue(for: base, compatibleWith: traits)
        return dynamicBase * CGFloat(normalize(percent)) / 100
    }

    static func metrics(percent: Int, dynamicType: DynamicTypeSize) -> Metrics {
        Metrics(
            body: points(base: 14, percent: percent, dynamicType: dynamicType),
            heading: points(base: 16, percent: percent, dynamicType: dynamicType),
            code: points(base: 13, percent: percent, dynamicType: dynamicType),
            fence: points(base: 12, percent: percent, dynamicType: dynamicType),
            trace: points(base: 12, percent: percent, dynamicType: dynamicType),
            chevron: points(base: 10, percent: percent, dynamicType: dynamicType)
        )
    }

    static func contentCategory(_ size: DynamicTypeSize) -> UIContentSizeCategory {
        switch size {
        case .xSmall: return .extraSmall
        case .small: return .small
        case .medium: return .medium
        case .large: return .large
        case .xLarge: return .extraLarge
        case .xxLarge: return .extraExtraLarge
        case .xxxLarge: return .extraExtraExtraLarge
        case .accessibility1: return .accessibilityMedium
        case .accessibility2: return .accessibilityLarge
        case .accessibility3: return .accessibilityExtraLarge
        case .accessibility4: return .accessibilityExtraExtraLarge
        case .accessibility5: return .accessibilityExtraExtraExtraLarge
        @unknown default: return .large
        }
    }

    /// Exactly one of Command or Control. Option stays put. "=" and
    /// "+" grow, including Shift-+. "-" and "_" shrink. "0" resets
    /// only without Shift. Repeat is not part of the match: the
    /// caller swallows a held key without stepping again.
    static func step(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Step? {
        if option { return nil }
        if command == control { return nil }
        let tokens = [String(key), characters]
        if tokens.contains("=") || tokens.contains("+") { return .larger }
        if tokens.contains("-") || tokens.contains("_") { return .smaller }
        if shift { return nil }
        if tokens.contains("0") { return .reset }
        return nil
    }

    /// The first press steps. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own this chord.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}

private struct TranscriptTextPercentKey: EnvironmentKey {
    static let defaultValue = TranscriptTextScale.defaultPercent
}

extension EnvironmentValues {
    /// v1.24 preference percent. 100 is the Dynamic Type base with no extra scale.
    var transcriptTextPercent: Int {
        get { self[TranscriptTextPercentKey.self] }
        set { self[TranscriptTextPercentKey.self] = newValue }
    }
}

private struct TranscriptScaledFont: ViewModifier {
    var base: CGFloat
    var weight: Font.Weight = .regular
    var design: Font.Design = .default
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.transcriptTextPercent) private var percent

    func body(content: Content) -> some View {
        content.font(
            .system(
                size: TranscriptTextScale.points(
                    base: base,
                    percent: percent,
                    dynamicType: dynamicTypeSize
                ),
                weight: weight,
                design: design
            )
        )
    }
}

extension View {
    /// Transcript text. Dynamic Type is the base, then the preference multiplies.
    func transcriptFont(
        _ base: CGFloat,
        weight: Font.Weight = .regular,
        design: Font.Design = .default
    ) -> some View {
        modifier(TranscriptScaledFont(base: base, weight: weight, design: design))
    }
}
