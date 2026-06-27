import AppKit
import Foundation
import WebKit
import Logging

@MainActor
final class MainWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    private let logger = Logger(label: "com.crosswms.window")
    let webView: WKWebView
    private var initialURL: URL
    private let messageHandler = WebViewMessageHandler()

    var onWindowWillClose: (() -> Void)?

    init(url: URL, title: String, frame: NSRect = NSRect(x: 0, y: 0, width: 1280, height: 800)) {
        self.initialURL = url

        let config = WKWebViewConfiguration()
        let userContent = WKUserContentController()
        config.userContentController = userContent
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.preferences.isElementFullscreenEnabled = true

        self.webView = WKWebView(frame: frame, configuration: config)

        let window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = title
        window.minSize = NSSize(width: 900, height: 600)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = false

        super.init(window: window)

        window.delegate = self
        webView.navigationDelegate = self
        webView.uiDelegate = self

        setupContent()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupContent() {
        guard let window = window else { return }

        let containerView = WindowDragContainerView(webView: webView)
        containerView.translatesAutoresizingMaskIntoConstraints = false
        window.contentView = containerView
    }

    func load() {
        webView.load(URLRequest(url: initialURL))
    }

    func navigate(to url: URL) {
        webView.load(URLRequest(url: url))
    }

    func evaluateJavaScript(_ javaScript: String) async throws -> Any? {
        try await withCheckedThrowingContinuation { continuation in
            webView.evaluateJavaScript(javaScript) { result, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: result)
                }
            }
        }
    }

    // MARK: - WKNavigationDelegate

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            logger.info("web view finished loading")
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in
            logger.error("web view navigation failed: \(error.localizedDescription)")
        }
    }

    // MARK: - WKUIDelegate

    nonisolated func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url,
           navigationAction.targetFrame == nil {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: - NSWindowDelegate

    nonisolated func windowWillClose(_ notification: Notification) {
        Task { @MainActor in
            logger.info("window will close")
            onWindowWillClose?()
        }
    }
}

@MainActor
final class WebViewMessageHandler: NSObject, WKScriptMessageHandler {
    private let logger = Logger(label: "com.crosswms.webview.bridge")

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        logger.debug("received message from web view: \(message.name)")
    }
}
