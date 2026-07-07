import Foundation
import WebKit
import OSLog

let webViewLogger = Logger(subsystem: "com.cdf.knowclow", category: "webview")

@MainActor
final class WebViewManager: NSObject {
    static let shared = WebViewManager()

    private(set) var webView: WKWebView!
    private var configuration: WKWebViewConfiguration!
    private let ipcHandler = IPCHandler()

    override init() {
        super.init()
        self.configuration = makeConfiguration()
        self.webView = WKWebView(frame: .zero, configuration: self.configuration)
        self.webView.navigationDelegate = self
        self.webView.uiDelegate = self
    }

    func getWebView() -> WKWebView {
        return webView
    }

    func handleMemoryPressure() {
        webViewLogger.info("Memory pressure received, clearing WebView cache...")

        let dataTypes: Set<String> = [
            WKWebsiteDataTypeDiskCache,
            WKWebsiteDataTypeMemoryCache,
            WKWebsiteDataTypeOfflineWebApplicationCache,
            WKWebsiteDataTypeFetchCache,
        ]
        let date = Date.distantPast
        WKWebsiteDataStore.default().removeData(ofTypes: dataTypes, modifiedSince: date) {
            webViewLogger.info("WKWebsiteDataStore cache cleared")
        }

        webView.evaluateJavaScript("if (window.gc) { window.gc(); }") { _, error in
            if let error = error {
                webViewLogger.debug("JS gc() not available: \(error.localizedDescription, privacy: .public)")
            }
        }

        webView.evaluateJavaScript("""
        if (window.cdfApp && window.cdfApp.onMemoryPressure) {
            window.cdfApp.onMemoryPressure();
        }
        """) { _, _ in }
    }

    private func makeConfiguration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true

        let contentController = WKUserContentController()
        contentController.add(
            ipcHandler,
            name: "cdfApp"
        )
        config.userContentController = contentController

        return config
    }

    func loadMainApp() {
        let splashURL = detectSplashURL()
        webViewLogger.info("Loading splash animation from: \(splashURL.absoluteString, privacy: .public)")

        var request = URLRequest(url: splashURL)
        request.timeoutInterval = 30
        webView.load(request)
    }

    func loadMainAppDirect() {
        let mainURL = detectMainAppURL()
        webViewLogger.info("Loading main app directly from: \(mainURL.absoluteString, privacy: .public)")

        var request = URLRequest(url: mainURL)
        request.timeoutInterval = 30
        webView.load(request)
    }

    private func detectMainAppURL() -> URL {
        let port = ConfigStore.shared.config.serverPort
        return URL(string: "http://localhost:\(port)/index.html")!
    }

    private func detectSplashURL() -> URL {
        let port = ConfigStore.shared.config.serverPort
        return URL(string: "http://localhost:\(port)/splash.html")!
    }

    private func injectNativeBridge() {
        let script = """
        (function() {
            if (window.__cdfIPC) return;

            window.__cdfIPC = {
                _callbacks: {},
                _listeners: [],
                _seq: 0,

                request: function(type, payload) {
                    return new Promise((resolve, reject) => {
                        const requestId = 'req_' + (++this._seq) + '_' + Date.now();
                        this._callbacks[requestId] = { resolve, reject };
                        const msg = Object.assign({ requestId, type }, payload || {});
                        window.webkit.messageHandlers.cdfApp.postMessage(msg);
                    });
                },

                resolve: function(requestId, responseJson) {
                    const cb = this._callbacks[requestId];
                    if (!cb) return;
                    delete this._callbacks[requestId];
                    try {
                        const resp = JSON.parse(responseJson);
                        if (resp.ok) {
                            cb.resolve(resp.payload ? JSON.parse(atob(resp.payload)) : undefined);
                        } else {
                            cb.reject(new Error(resp.message || 'IPC request failed'));
                        }
                    } catch (e) {
                        cb.reject(e);
                    }
                },

                emit: function(eventJson) {
                    try {
                        const evt = JSON.parse(eventJson);
                        this._listeners.forEach(fn => {
                            try { fn(evt); } catch (_) {}
                        });
                    } catch (_) {}
                },

                addEventListener: function(fn) {
                    this._listeners.push(fn);
                    return () => {
                        this._listeners = this._listeners.filter(f => f !== fn);
                    };
                }
            };

            window.cdfAppNative = {
                platform: 'macos',
                version: '1.0.0',
                isNative: true,
                api: {
                    window_close: () => window.__cdfIPC.request('window', { action: 'close' }),
                    window_minimize: () => window.__cdfIPC.request('window', { action: 'minimize' }),
                    window_maximize: () => window.__cdfIPC.request('window', { action: 'maximize' }),
                },
                pickFolder: () => window.__cdfIPC.request('pickFolder').then(r => r ? r.path : null),
            };

            Object.defineProperty(window, 'pywebview', {
                get: () => ({ api: window.cdfAppNative.api, _isNative: true })
            });

            document.documentElement.style.setProperty('--pw-top', '28px');
            console.log('[CDFKnowClow] Native bridge injected, --pw-top=28px');
        })();
        """
        webView.evaluateJavaScript(script) { result, error in
            if let error = error {
                webViewLogger.error("Failed to inject native bridge: \(error.localizedDescription, privacy: .public)")
            } else {
                webViewLogger.info("Native bridge injected successfully")
            }
        }
    }

    func reload() {
        webView.reload()
    }
}

extension WebViewManager: WKNavigationDelegate {
    nonisolated func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        Task { @MainActor in
            webViewLogger.info("Navigation started")
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            webViewLogger.info("Navigation finished")
            self.injectNativeBridge()
        }
    }

    nonisolated func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        Task { @MainActor in
            webViewLogger.error("Navigation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    nonisolated func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        Task { @MainActor in
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            let isLocal = url.host == "localhost" || url.host == "127.0.0.1" || url.isFileURL
            if !isLocal && navigationAction.navigationType == .linkActivated {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}

extension WebViewManager: WKUIDelegate {
    nonisolated func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        Task { @MainActor in
            if let url = navigationAction.request.url {
                NSWorkspace.shared.open(url)
            }
        }
        return nil
    }
}
