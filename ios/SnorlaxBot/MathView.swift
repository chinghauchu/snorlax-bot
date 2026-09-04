// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import WebKit

/// Local KaTeX render for completed LEFT kind=message math.
/// WKWebView + bundled katex.min.js. No cloud API.
struct MathWebView: UIViewRepresentable {
    let source: String
    var display: Bool
    var text: String
    @Binding var failed: Bool
    @Binding var size: CGSize

    func makeCoordinator() -> Coordinator {
        Coordinator(failed: $failed, size: $size)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(context.coordinator, name: "snorlaxMath")
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.navigationDelegate = context.coordinator
        context.coordinator.load(source: source, display: display, in: view, parent: self)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if context.coordinator.lastSource != source || context.coordinator.lastDisplay != display {
            context.coordinator.load(source: source, display: display, in: view, parent: self)
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "snorlaxMath")
        view.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var failed: Binding<Bool>
        var size: Binding<CGSize>
        var lastSource = ""
        var lastDisplay = false

        init(failed: Binding<Bool>, size: Binding<CGSize>) {
            self.failed = failed
            self.size = size
        }

        func load(source: String, display: Bool, in view: WKWebView, parent: MathWebView) {
            lastSource = source
            lastDisplay = display
            failed.wrappedValue = false
            let html = MathHTML.document(source: source, display: display, text: parent.text)
            let base = Bundle.main.resourceURL
            view.loadHTMLString(html, baseURL: base)
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any] else { return }
            if let ok = body["ok"] as? Bool, ok == false {
                failed.wrappedValue = true
                return
            }
            let width = (body["width"] as? Double) ?? 0
            let height = (body["height"] as? Double) ?? 0
            if width > 0, height > 0 {
                size.wrappedValue = CGSize(width: width, height: height)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            let scheme = navigationAction.request.url?.scheme?.lowercased()
            if scheme == "file" || scheme == "about" || navigationAction.request.url == nil {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}

enum MathHTML {
    static func document(source: String, display: Bool, text: String) -> String {
        let payload = jsonString(source)
        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <link rel="stylesheet" href="katex.min.css">
        <style>
          html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; color: \(text); }
          #d { display: inline-block; color: inherit; }
          .katex { color: inherit; }
          .katex-display { margin: 0; }
        </style>
        <script src="katex.min.js"></script>
        </head>
        <body>
        <div id="d"></div>
        <script>
        (function () {
          var source = \(payload);
          function fail() {
            if (window.webkit && window.webkit.messageHandlers.snorlaxMath) {
              window.webkit.messageHandlers.snorlaxMath.postMessage({ ok: false });
            }
          }
          function ok(w, h) {
            if (window.webkit && window.webkit.messageHandlers.snorlaxMath) {
              window.webkit.messageHandlers.snorlaxMath.postMessage({ ok: true, width: w, height: h });
            }
          }
          try {
            if (!window.katex) { fail(); return; }
            var html = katex.renderToString(source, {
              displayMode: \(display ? "true" : "false"),
              throwOnError: true,
              output: "html",
              trust: false,
              maxSize: 20,
              maxExpand: 1000
            });
            var host = document.getElementById("d");
            host.innerHTML = html;
            var box = host.getBoundingClientRect();
            var w = Math.ceil(box.width || host.scrollWidth || 1);
            var h = Math.ceil(box.height || host.scrollHeight || 1);
            ok(w, h);
          } catch (e) { fail(); }
        })();
        </script>
        </body>
        </html>
        """
    }

    static func jsonString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed),
              let encoded = String(data: data, encoding: .utf8)
        else {
            return "\"\""
        }
        return encoded
    }
}

/// Wrapping layout for inline math mixed with markdown text.
struct MathFlowLayout: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        var used: CGFloat = 0
        for view in subviews {
            let remaining = maxWidth.isFinite ? max(maxWidth - x, 0) : .infinity
            let size = view.sizeThatFits(ProposedViewSize(width: remaining, height: nil))
            if x > 0 && maxWidth.isFinite && x + size.width > maxWidth {
                x = 0
                y += rowH + lineSpacing
                rowH = 0
                let wrapped = view.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
                rowH = wrapped.height
                x = wrapped.width + spacing
                used = max(used, wrapped.width)
            } else {
                rowH = max(rowH, size.height)
                x += size.width + spacing
                used = max(used, x)
            }
        }
        let width = maxWidth.isFinite ? maxWidth : used
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x = bounds.minX
        var y = bounds.minY
        var rowH: CGFloat = 0
        for view in subviews {
            let remaining = max(bounds.maxX - x, 0)
            let size = view.sizeThatFits(ProposedViewSize(width: remaining, height: nil))
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowH + lineSpacing
                rowH = 0
                let wrapped = view.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
                view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(wrapped))
                rowH = wrapped.height
                x += wrapped.width + spacing
            } else {
                view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                rowH = max(rowH, size.height)
                x += size.width + spacing
            }
        }
    }
}
