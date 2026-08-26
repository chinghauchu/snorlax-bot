// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct WidgetCardView: View {
    let messageId: String
    let widget: Widget
    @Environment(AppModel.self) private var model
    @State private var checked: Set<String> = []
    @State private var custom = ""

    private var pending: Bool { widget.status == .pending }
    private var resolved: Bool { widget.status == .resolved }
    private var dismissed: Bool { widget.status == .dismissed }
    private var multi: Bool { widget.multiSelect == true }
    private var interactive: Bool { pending && !model.isSending }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(widget.prompt)
                        .font(.system(size: 14))
                        .lineSpacing(1.4 * 14 - 14)
                        .fixedSize(horizontal: false, vertical: true)
                    if let help = widget.helpText, !help.isEmpty {
                        Text(help)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    if dismissed {
                        Text("Dismissed")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, interactive ? 22 : 0)
                if interactive {
                    Button {
                        Task { await model.dismissWidget() }
                    } label: {
                        Text("×")
                            .font(.system(size: 16))
                            .foregroundStyle(.secondary)
                            .frame(width: 20, height: 20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Dismiss")
                }
            }
            VStack(spacing: 6) {
                ForEach(Array(widget.options.prefix(6).enumerated()), id: \.offset) { _, option in
                    optionRow(option)
                }
            }
            if widget.allowCustom == true, interactive {
                TextField("Or type your own", text: $custom)
                    .font(.system(size: 13))
                    .padding(.horizontal, 10)
                    .frame(height: 44)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(uiColor: .separator), lineWidth: 1)
                    )
                    .onSubmit { submitCustom() }
            }
            if multi, interactive {
                Button {
                    submitMulti()
                } label: {
                    Text("Done")
                        .font(.system(size: 13, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.plain)
                .background(Color.accentColor.opacity(0.28), in: RoundedRectangle(cornerRadius: 8))
                .disabled(checked.isEmpty && custom.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(12)
        .frame(minWidth: 240, maxWidth: 320, alignment: .leading)
        .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(uiColor: .separator), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func optionRow(_ option: WidgetOption) -> some View {
        let value = option.resolvedValue
        let picked = resolved && (widget.values ?? []).contains(value)
        let muted = resolved && !picked
        if multi, interactive {
            Button {
                if checked.contains(value) { checked.remove(value) } else { checked.insert(value) }
            } label: {
                HStack(alignment: .center, spacing: 8) {
                    Image(systemName: checked.contains(value) ? "checkmark.square.fill" : "square")
                        .font(.system(size: 16))
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 16, height: 16)
                    optionCopy(option)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.plain)
            .background(optionFill(option), in: RoundedRectangle(cornerRadius: 8))
            .overlay(optionStroke(option))
        } else {
            Button {
                guard interactive, !multi else { return }
                Task { await model.answerWidget(id: messageId, values: [value]) }
            } label: {
                HStack(alignment: .center, spacing: 8) {
                    optionCopy(option)
                    Spacer(minLength: 0)
                    if picked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color.accentColor)
                            .frame(width: 16, height: 16)
                    }
                }
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.plain)
            .disabled(!interactive || multi)
            .opacity(muted || dismissed ? 0.5 : 1)
            .background(optionFill(option), in: RoundedRectangle(cornerRadius: 8))
            .overlay(optionStroke(option))
        }
    }

    private func optionCopy(_ option: WidgetOption) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(option.label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(option.style == .danger ? Color.red : Color.primary)
            if let description = option.description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .multilineTextAlignment(.leading)
    }

    private func optionFill(_ option: WidgetOption) -> Color {
        option.style == .primary
            ? Color.accentColor.opacity(0.28)
            : Color.clear
    }

    private func optionStroke(_ option: WidgetOption) -> some View {
        RoundedRectangle(cornerRadius: 8)
            .stroke(option.style == .primary ? Color.clear : Color(uiColor: .separator), lineWidth: 1)
    }

    private func submitCustom() {
        let value = custom.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, interactive else { return }
        if multi {
            checked.insert(value)
            custom = ""
            return
        }
        Task { await model.answerWidget(id: messageId, values: [value]) }
    }

    private func submitMulti() {
        var values = widget.options.compactMap { option -> String? in
            let value = option.resolvedValue
            return checked.contains(value) ? value : nil
        }
        let extra = custom.trimmingCharacters(in: .whitespacesAndNewlines)
        if !extra.isEmpty, !values.contains(extra) { values.append(extra) }
        guard !values.isEmpty else { return }
        Task { await model.answerWidget(id: messageId, values: values) }
    }
}

extension WidgetOption {
    var resolvedValue: String {
        let raw = (self.value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? label : raw
    }
}
