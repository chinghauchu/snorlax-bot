// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// Full-screen iOS Open (not a sheet). Composer is covered, not used.
struct ComputerTakeoverView: View {
    @Environment(AppModel.self) private var model
    let agent: Agent
    @State private var keyboardOn = false

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
        .task(id: agent.id) {
            while !Task.isCancelled, model.computerTakeoverOpen {
                await model.loadComputer(for: agent.id)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
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
            Spacer(minLength: 8)
            Button(ComputerTakeoverChrome.keyboardLabel) {
                keyboardOn.toggle()
            }
            .font(.system(size: ComputerTakeoverChrome.labelSize))
            .buttonStyle(.plain)
            Button(ComputerTakeoverChrome.doneLabel) {
                Task { await model.closeComputer(agentId: agent.id) }
            }
            .font(.system(size: ComputerTakeoverChrome.labelSize, weight: .semibold))
            .frame(minHeight: ComputerTakeoverChrome.doneHeight)
            .buttonStyle(.borderedProminent)
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
