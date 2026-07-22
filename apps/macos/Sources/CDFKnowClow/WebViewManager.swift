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
    private var loadAttempts = 0
    private let maxLoadAttempts = 3

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
        loadAttempts = 0
        let mainURL = detectMainAppURL()
        webViewLogger.info("Loading main app directly from: \(mainURL.absoluteString, privacy: .public)")
        loadMainApp(url: mainURL)
    }

    private func loadMainApp(url: URL) {
        loadAttempts += 1
        webViewLogger.info("Loading attempt \(self.loadAttempts)/\(self.maxLoadAttempts): \(url.absoluteString, privacy: .public)")

        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        let navigation = webView.load(request)
        webViewLogger.info("Navigation started: \(navigation != nil ? "yes" : "no")")
    }

    private func loadFromLocalFallback() {
        webViewLogger.info("Loading from local fallback")
        
        if let localIndexPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "Resources/frontend_dist") {
            let localURL = URL(fileURLWithPath: localIndexPath)
            webViewLogger.info("Loading local index.html: \(localURL.path, privacy: .public)")
            webView.loadFileURL(localURL, allowingReadAccessTo: localURL.deletingLastPathComponent())
        } else if let splashPath = Bundle.main.path(forResource: "splash", ofType: "html", inDirectory: "Resources") {
            let splashURL = URL(fileURLWithPath: splashPath)
            webViewLogger.info("Loading local splash.html: \(splashURL.path, privacy: .public)")
            webView.loadFileURL(splashURL, allowingReadAccessTo: splashURL.deletingLastPathComponent())
        } else {
            webViewLogger.error("No local fallback available")
            showErrorPage()
        }
    }

    private func showErrorPage() {
        let errorHTML = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>CDF Know Clow - 加载失败</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px; background: #1a1a2e; color: #fff; }
                .error-icon { font-size: 64px; margin-bottom: 20px; }
                .error-title { font-size: 24px; margin-bottom: 10px; }
                .error-message { font-size: 14px; color: #aaa; margin-bottom: 30px; }
                .retry-button { padding: 12px 32px; background: #4a69bd; border: none; border-radius: 8px; color: white; font-size: 16px; cursor: pointer; }
                .retry-button:hover { background: #3a59ad; }
            </style>
        </head>
        <body>
            <div class="error-icon">⚠️</div>
            <div class="error-title">无法启动应用</div>
            <div class="error-message">服务器连接失败，请检查网络或重启应用</div>
            <button class="retry-button" onclick="window.location.reload()">重试</button>
        </body>
        </html>
        """
        webView.loadHTMLString(errorHTML, baseURL: nil)
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
            let nsError = error as NSError
            webViewLogger.error("Error domain=\(nsError.domain), code=\(nsError.code), userInfo=\(nsError.userInfo, privacy: .public)")
            handleLoadError()
        }
    }

    nonisolated func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        Task { @MainActor in
            webViewLogger.error("Provisional navigation failed: \(error.localizedDescription, privacy: .public)")
            let nsError = error as NSError
            webViewLogger.error("Error domain=\(nsError.domain), code=\(nsError.code), userInfo=\(nsError.userInfo, privacy: .public)")
            handleLoadError()
        }
    }

    @MainActor
    private func handleLoadError() {
        if self.loadAttempts < self.maxLoadAttempts {
            webViewLogger.info("Retrying load (\(self.loadAttempts)/\(self.maxLoadAttempts))...")
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(self.loadAttempts) * 3.0) { [weak self] in
                guard let self else { return }
                let mainURL = self.detectMainAppURL()
                self.loadMainApp(url: mainURL)
            }
        } else {
            webViewLogger.error("All \(self.maxLoadAttempts) load attempts failed, falling back to local files")
            loadFromLocalFallback()
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
