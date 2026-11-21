import SwiftUI
import WebKit
import UIKit
import CoreHaptics

// The page is loaded from GitHub Pages, so web changes reach the app without reinstalling it.
let pageURL = URL(string: "https://ju12224.github.io/bad-trip-sensor/")!

// What the page can call: window.badTripNative.haptic(kind, intensity) and window.badTripNative.share(name, text).
private let bridgeScript = """
window.badTripNative = {
  available: true,
  version: 1,
  haptic: function (kind, intensity) {
    window.webkit.messageHandlers.native.postMessage({ cmd: 'haptic', kind: kind || 'tap', intensity: intensity || 1 });
  },
  share: function (name, text) {
    window.webkit.messageHandlers.native.postMessage({ cmd: 'share', name: String(name), text: String(text) });
  }
};
"""

struct WebContainer: UIViewRepresentable {
    func makeCoordinator() -> NativeBridge { NativeBridge() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "native")
        controller.addUserScript(WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = controller

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 21 / 255, green: 11 / 255, blue: 12 / 255, alpha: 1)
        if #available(iOS 16.4, *) { web.isInspectable = true }
        context.coordinator.webView = web
        web.load(URLRequest(url: pageURL, cachePolicy: .reloadRevalidatingCacheData))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class NativeBridge: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    weak var webView: WKWebView?
    private var engine: CHHapticEngine?
    private let impact = UIImpactFeedbackGenerator(style: .heavy)

    override init() {
        super.init()
        if CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            engine = try? CHHapticEngine()
            engine?.resetHandler = { [weak self] in try? self?.engine?.start() }
            engine?.stoppedHandler = { [weak self] _ in try? self?.engine?.start() }
            try? engine?.start()
        }
    }

    // MARK: Messages from the page

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "haptic":
            let kind = body["kind"] as? String ?? "tap"
            let intensity = (body["intensity"] as? NSNumber)?.floatValue ?? 1
            playHaptic(kind: kind, intensity: intensity)
        case "share":
            if let name = body["name"] as? String, let text = body["text"] as? String { share(name: name, text: text) }
        default:
            break
        }
    }

    // A single tap, or a heartbeat "lub-dub": a firm low thump, then a softer one 0.14 s later.
    private func playHaptic(kind: String, intensity: Float) {
        let level = max(0.1, min(1, intensity))
        guard let engine = engine else { impact.impactOccurred(intensity: CGFloat(level)); return }
        func thump(_ t: TimeInterval, _ i: Float, _ s: Float) -> CHHapticEvent {
            CHHapticEvent(eventType: .hapticTransient, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: i),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: s)
            ], relativeTime: t)
        }
        let events = kind == "beat" ? [thump(0, level, 0.15), thump(0.14, level * 0.6, 0.05)] : [thump(0, level, 0.6)]
        do {
            let pattern = try CHHapticPattern(events: events, parameters: [])
            try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
        } catch {
            impact.impactOccurred(intensity: CGFloat(level))
        }
    }

    // Saves text (a recording) to a file and opens the share sheet: AirDrop, Files, Drive, Mail...
    private func share(name: String, text: String) {
        let safe = name.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
        do { try text.write(to: url, atomically: true, encoding: .utf8) } catch { return }
        DispatchQueue.main.async {
            guard let web = self.webView, var top = web.window?.rootViewController else { return }
            while let next = top.presentedViewController { top = next }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = web
            top.present(sheet, animated: true)
        }
    }

    // MARK: Permissions: the app's own iOS prompts cover these, so the page is not asked again.

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // MARK: Load errors

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showError(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError(error) }

    private func showError(_ error: Error) {
        let html = """
        <html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>
        <body style='background:#150b0c;color:#f4e9e4;font:18px -apple-system;padding:40px'>
        <h2>Can't load Bad Trip</h2><p>\(error.localizedDescription)</p><p>Check the internet connection, then close and reopen the app.</p>
        </body></html>
        """
        webView?.loadHTMLString(html, baseURL: nil)
    }
}
