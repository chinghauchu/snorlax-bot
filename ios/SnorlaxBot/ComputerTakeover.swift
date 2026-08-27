// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// Full-screen iOS Open (not a sheet). Composer is covered, not used.
/// Record lives on this bar only (v0.16 HTTP). Preview has no Record.
struct ComputerTakeoverView: View {
    @Environment(AppModel.self) private var model
    let agent: Agent
    @State private var keyboardOn = false
    @State private var recording = false
    @State private var saveOpen = false
    @State private var skillName = ""
    @State private var saving = false
    @State private var showSaved = false

    var body: some View {
        VStack(spacing: 0) {
            bar
                .frame(height: ComputerTakeoverChrome.barHeight)
            stage
        }
        .background(Color.black)
        .ignoresSafeArea(edges: .bottom)
        .interactiveDismissDisabled(true)
        .navigationBarBackButtonHidden(true) // Swipe-back disabled.
        .onKeyPress(.escape) {
            // No Esc — Stop is the only way out of record.
            .handled
        }
        .task(id: agent.id) {
            while !Task.isCancelled, model.computerTakeoverOpen {
                await model.loadComputer(for: agent.id)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
        .sheet(isPresented: $saveOpen) {
            SaveAsSkillSheet(
                name: $skillName,
                saving: $saving,
                onCancel: discardSave,
                onSave: { Task { await saveSkill() } }
            )
        }
    }

    private var bar: some View {
        HStack(spacing: 8) {
            AgentAvatar(agent: agent, size: ComputerTakeoverChrome.avatarSize)
            Text(agent.name)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
            Text(ComputerTakeoverChrome.drivingLabel)
                .font(.system(size: ComputerTakeoverChrome.labelSize))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if showSaved {
                Text(ComputerTakeoverChrome.savedLabel)
                    .font(.system(size: ComputerTakeoverChrome.labelSize))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            // Keyboard stays trailing (v0.19). Record is 12pt muted left of Done.
            Button(ComputerTakeoverChrome.keyboardLabel) {
                keyboardOn.toggle()
            }
            .font(.system(size: ComputerTakeoverChrome.labelSize))
            .buttonStyle(.plain)
            recordControl
            Button(ComputerTakeoverChrome.doneLabel) {
                guard !ComputerTakeoverChrome.doneDisabled(recording: recording) else { return }
                Task { await model.closeComputer(agentId: agent.id) }
            }
            .font(.system(size: ComputerTakeoverChrome.labelSize, weight: .semibold))
            .frame(minHeight: ComputerTakeoverChrome.doneHeight)
            .buttonStyle(.borderedProminent)
            .disabled(ComputerTakeoverChrome.doneDisabled(recording: recording))
            HiddenKeyboardField(focused: $keyboardOn) { event in
                Task { await model.postComputerKey(agentId: agent.id, event: event) }
            }
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .background(Color(uiColor: .systemBackground))
    }

    /// 12pt muted Record left of primary Done. Recording: 12pt --danger Stop
    /// plus a 6pt danger dot (static if Reduce Motion).
    /// No Esc — Stop is the only way out of record.
    private var recordControl: some View {
        Button {
            if recording {
                Task { await stopCapture() }
            } else {
                Task { await startCapture() }
            }
        } label: {
            HStack(spacing: 6) {
                if recording {
                    RecordDot()
                }
                Text(ComputerTakeoverChrome.recordControlLabel(recording: recording))
            }
        }
        .font(.system(size: ComputerTakeoverChrome.labelSize))
        .foregroundStyle(recording ? ComputerTakeoverChrome.danger : Color.secondary)
        .buttonStyle(.plain)
        .accessibilityLabel(ComputerTakeoverChrome.recordControlLabel(recording: recording))
    }

    private var stage: some View {
        GeometryReader { geo in
            let box = ComputerTakeoverChrome.letterbox(
                containerWidth: geo.size.width,
                containerHeight: geo.size.height
            )
            ZStack {
                Color.black
                Group {
                    if let image = model.computerImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                    } else {
                        Color.black
                    }
                }
                .frame(width: box.width, height: box.height)
                .position(x: box.x + box.width / 2, y: box.y + box.height / 2)
            }
            .contentShape(Rectangle())
            .gesture(pointerGesture(in: geo.size))
            .simultaneousGesture(MagnificationGesture())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
    }

    private func pointerGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard let kind = ComputerTakeoverChrome.pointerType(
                    translation: value.translation,
                    ended: false
                ) else { return }
                sendPointer(value.location, in: size, type: kind)
            }
            .onEnded { value in
                guard let kind = ComputerTakeoverChrome.pointerType(
                    translation: value.translation,
                    ended: true
                ) else { return }
                sendPointer(value.location, in: size, type: kind)
            }
    }

    private func sendPointer(_ point: CGPoint, in size: CGSize, type: PointerEvent.`Type`) {
        guard let mapped = ComputerTakeoverChrome.mapPointer(
            localX: point.x,
            localY: point.y,
            containerWidth: size.width,
            containerHeight: size.height
        ) else { return }
        Task {
            await model.postComputerPointer(
                agentId: agent.id,
                event: PointerEvent(x: mapped.x, y: mapped.y, type: type)
            )
        }
    }

    private func startCapture() async {
        guard ComputerTakeoverChrome.recordOffered(sessionOpen: model.computerTakeoverOpen)
        else { return }
        if await model.startComputerRecord(agentId: agent.id) {
            recording = true
        }
    }

    private func stopCapture() async {
        await model.stopComputerRecord(agentId: agent.id)
        recording = false
        skillName = ""
        saveOpen = true
    }

    private func discardSave() {
        saveOpen = false
        skillName = ""
        // Discard is omit POST /skills — no SKILL.md.
    }

    private func saveSkill() async {
        let name = skillName
        guard !ComputerTakeoverChrome.saveDisabled(name: name), !saving else { return }
        saving = true
        defer { saving = false }
        let ok = await model.saveRecordedSkill(agentId: agent.id, name: name)
        guard ok else { return }
        saveOpen = false
        skillName = ""
        showSaved = true
        let ns = UInt64(ComputerTakeoverChrome.savedFeedbackMs) * 1_000_000
        try? await Task.sleep(nanoseconds: ns)
        showSaved = false
    }
}

/// 6pt --danger dot. Pulses unless Reduce Motion (then static).
private struct RecordDot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        Circle()
            .fill(ComputerTakeoverChrome.danger)
            .frame(
                width: ComputerTakeoverChrome.recordDotSize,
                height: ComputerTakeoverChrome.recordDotSize
            )
            .opacity(reduceMotion || !dim ? 1 : 0.35)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    dim = true
                }
            }
            .accessibilityHidden(true)
    }
}

/// Same family as Edit skill. × / Cancel discards — no SKILL.md.
private struct SaveAsSkillSheet: View {
    @Binding var name: String
    @Binding var saving: Bool
    var onCancel: () -> Void
    var onSave: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .font(.system(size: ComputerTakeoverChrome.skillNameSize))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button(ComputerTakeoverChrome.cancelLabel) {
                    onCancel()
                }
                Button(ComputerTakeoverChrome.saveLabel) {
                    onSave()
                }
                .frame(maxWidth: .infinity, minHeight: ComputerTakeoverChrome.saveButtonHeight)
                .disabled(saving || ComputerTakeoverChrome.saveDisabled(name: name))
            }
            .navigationTitle(ComputerTakeoverChrome.saveAsSkillTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
        }
    }
}

/// Hidden field so Keyboard maps the system keyboard to `POST …/key`.
private struct HiddenKeyboardField: UIViewRepresentable {
    @Binding var focused: Bool
    var onKey: (KeyEvent) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onKey: onKey, focused: $focused)
    }

    func makeUIView(context: Context) -> KeyboardCatcher {
        let view = KeyboardCatcher()
        view.coordinator = context.coordinator
        view.accessibilityIdentifier = "computer-keyboard"
        return view
    }

    func updateUIView(_ uiView: KeyboardCatcher, context: Context) {
        context.coordinator.onKey = onKey
        uiView.coordinator = context.coordinator
        if focused, !uiView.isFirstResponder {
            uiView.becomeFirstResponder()
        } else if !focused, uiView.isFirstResponder {
            uiView.resignFirstResponder()
        }
    }

    final class Coordinator {
        var onKey: (KeyEvent) -> Void
        var focused: Binding<Bool>

        init(onKey: @escaping (KeyEvent) -> Void, focused: Binding<Bool>) {
            self.onKey = onKey
            self.focused = focused
        }
    }
}

private final class KeyboardCatcher: UIView, UIKeyInput {
    weak var coordinator: HiddenKeyboardField.Coordinator?
    var hasText: Bool { false }
    override var canBecomeFirstResponder: Bool { true }
    override var canResignFirstResponder: Bool { true }

    func insertText(_ text: String) {
        for event in ComputerTakeoverChrome.keyEvents(inserting: text) {
            coordinator?.onKey(event)
        }
    }

    func deleteBackward() {
        for event in ComputerTakeoverChrome.keyEventsForDeleteBackward() {
            coordinator?.onKey(event)
        }
    }
}
