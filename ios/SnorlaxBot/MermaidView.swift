// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import WebKit

/// Local mermaid render for completed LEFT kind=message fences.
/// WKWebView + bundled mermaid.min.js. No cloud API.
struct MermaidWebView: UIViewRepresentable {
    let source: String
    var background: String
    var text: String
    var muted: String
    var border: String
    var accent: String
    var dark: Bool
    @Binding var failed: Bool
    @Binding var size: CGSize

    func makeCoordinator() -> Coordinator {
        Coordinator(failed: $failed, size: $size)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(context.coordinator, name: "snorlax")
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.navigationDelegate = context.coordinator
        context.coordinator.load(source: source, in: view, parent: self)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if context.coordinator.lastSource != source {
            context.coordinator.load(source: source, in: view, parent: self)
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "snorlax")
        view.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var failed: Binding<Bool>
        var size: Binding<CGSize>
        var lastSource = ""

        init(failed: Binding<Bool>, size: Binding<CGSize>) {
            self.failed = failed
            self.size = size
        }

        func load(source: String, in view: WKWebView, parent: MermaidWebView) {
            lastSource = source
            failed.wrappedValue = false
            let html = MermaidHTML.document(
                source: source,
                background: parent.background,
                text: parent.text,
                muted: parent.muted,
                border: parent.border,
                accent: parent.accent,
                dark: parent.dark
            )
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

enum MermaidHTML {
    static func document(
        source: String,
        background: String,
        text: String,
        muted: String,
        border: String,
        accent: String,
        dark: Bool
    ) -> String {
        let payload = jsonString(source)
        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <style>
          html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
          #d { display: inline-block; }
          svg { display: block; max-width: none; }
        </style>
        <script src="mermaid.min.js"></script>
        </head>
        <body>
        <div id="d"></div>
        <script>
        (function () {
          var source = \(payload);
          function fail() {
            if (window.webkit && window.webkit.messageHandlers.snorlax) {
              window.webkit.messageHandlers.snorlax.postMessage({ ok: false });
            }
          }
          function ok(w, h) {
            if (window.webkit && window.webkit.messageHandlers.snorlax) {
              window.webkit.messageHandlers.snorlax.postMessage({ ok: true, width: w, height: h });
            }
          }
          try {
            if (!window.mermaid) { fail(); return; }
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: "strict",
              theme: "base",
              themeVariables: {
                darkMode: \(dark ? "true" : "false"),
                background: "\(background)",
                primaryColor: "\(accent)",
                primaryTextColor: "\(text)",
                primaryBorderColor: "\(border)",
                lineColor: "\(muted)",
                secondaryColor: "\(background)",
                tertiaryColor: "\(background)",
                textColor: "\(text)",
                nodeTextColor: "\(text)",
                mainBkg: "\(background)",
                titleColor: "\(text)",
                fontFamily: "-apple-system, system-ui, sans-serif"
              },
              flowchart: { useMaxWidth: false, htmlLabels: false },
              sequence: { useMaxWidth: false },
              class: { useMaxWidth: false },
              state: { useMaxWidth: false },
              er: { useMaxWidth: false },
              pie: { useMaxWidth: false },
              gantt: { useMaxWidth: false }
            });
            mermaid.render("snorlaxMermaid" + Date.now() + Math.random().toString(16).slice(2), source).then(function (out) {
              var host = document.getElementById("d");
              host.innerHTML = out.svg || "";
              var svg = host.querySelector("svg");
              if (!svg) { fail(); return; }
              var box = svg.getBoundingClientRect();
              var w = Math.ceil(box.width || svg.scrollWidth || 1);
              var h = Math.ceil(box.height || svg.scrollHeight || 1);
              ok(w, h);
            }).catch(function () { fail(); });
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

enum MermaidColors {
    static func hex(_ color: UIColor) -> String {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}
