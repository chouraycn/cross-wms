import Foundation
import WebKit
import OSLog

let webViewLogger = Logger(subsystem: "com.cdf.knowclow", category: "webview")

@MainActor
final class WebViewManager: NSObject {
    static let shared = WebViewManager()

    private(set) var webView: WKWebView!
    private var configuration: WKWebViewConfiguration!

    override init() {
        super.init()
        self.configuration = makeConfiguration()
        self.webView = WKWebView(frame: .zero, configuration: self.configuration)
        self.webView.navigationDelegate = self
        self.webView.uiDelegate = self
    }

    /// 获取 WebView 引用（用于单窗口模式）
    func getWebView() -> WKWebView {
        return webView
    }

    private func makeConfiguration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true

        let contentController = WKUserContentController()
        contentController.add(
            ScriptMessageHandler(),
            name: "cdfApp"
        )
        config.userContentController = contentController

        return config
    }

    func loadMainApp() {
        // v1.5.220: 先加载 splash.html 开场动画，动画完成后自动跳转到 index.html
        let splashURL = detectSplashURL()
        webViewLogger.info("Loading splash animation from: \(splashURL.absoluteString, privacy: .public)")

        var request = URLRequest(url: splashURL)
        request.timeoutInterval = 30
        webView.load(request)

        // 注入原生 App 标识会在 didFinish 时触发（每次页面加载完成都会注入）
    }

    /// v1.6.0: 直接加载主应用（跳过 splash.html）
    /// 用于原生 Splash Screen 已完成动画的场景
    func loadMainAppDirect() {
        let mainURL = detectMainAppURL()
        webViewLogger.info("Loading main app directly from: \(mainURL.absoluteString, privacy: .public)")

        var request = URLRequest(url: mainURL)
        request.timeoutInterval = 30
        webView.load(request)
    }

    /// v1.6.0: 检测主应用 URL（直接加载 index.html，跳过 splash.html）
    private func detectMainAppURL() -> URL {
        let port = ConfigStore.shared.config.serverPort

        // 优先从服务器加载 index.html
        if let serverURL = checkURL("http://localhost:\(port)/index.html") {
            return serverURL
        }
        // 开发环境：vite 开发服务器
        if let viteURL = checkURL("http://localhost:5173/index.html") {
            return viteURL
        }
        // 兜底：直接加载根路径
        return URL(string: "http://localhost:\(port)/")!
    }

    private func detectSplashURL() -> URL {
        let port = ConfigStore.shared.config.serverPort

        // 优先从服务器加载 splash.html（服务器已配置静态文件服务）
        if let serverURL = checkURL("http://localhost:\(port)/splash.html") {
            return serverURL
        }
        // 开发环境：vite 开发服务器
        if let viteURL = checkURL("http://localhost:5173/splash.html") {
            return viteURL
        }
        // 兜底：直接加载主应用
        return URL(string: "http://localhost:\(port)/index.html")!
    }

    /// 注入原生 App 标识到 window.cdfAppNative，告知前端当前是 Swift 原生 App
    private func injectNativeBridge() {
        let script = """
        (function() {
            if (window.cdfAppNative) return;
            // 标记当前为 Swift 原生 App 桌面环境
            window.cdfAppNative = {
                platform: 'macos',
                version: '1.0.0',
                isNative: true,
                // 模拟 pywebview 接口（兼容现有代码）
                api: {
                    window_close: () => window.webkit.messageHandlers.cdfApp.postMessage({action: 'close'}),
                    window_minimize: () => window.webkit.messageHandlers.cdfApp.postMessage({action: 'minimize'}),
                    window_maximize: () => window.webkit.messageHandlers.cdfApp.postMessage({action: 'maximize'}),
                }
            };
            // 同时设置 pywebview 标识，让现有 isPyWebView() 返回 true
            // 这样前端会注入 --pw-top 变量，让侧边栏顶部让出红黄绿按钮位置
            Object.defineProperty(window, 'pywebview', {
                get: () => ({ api: window.cdfAppNative.api, _isNative: true })
            });
            // 注入 --pw-top CSS 变量（28px = 红黄绿按钮行高）
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

    private func checkURL(_ urlString: String) -> URL? {
        guard let url = URL(string: urlString) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1
        request.httpMethod = "HEAD"

        let semaphore = DispatchSemaphore(value: 0)
        var found = false

        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            if let httpResponse = response as? HTTPURLResponse,
               (200...299).contains(httpResponse.statusCode) || httpResponse.statusCode == 304 {
                found = true
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 1)

        return found ? url : nil
    }

    func reload() {
        webView.reload()
    }
}

@MainActor
final class ScriptMessageHandler: NSObject, WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "cdfApp" else { return }

        webViewLogger.info("Received message from web: \(String(describing: message.body), privacy: .public)")

        if let body = message.body as? [String: Any],
           let action = body["action"] as? String {
            Task {
                await handleAction(action, payload: body["payload"])
            }
        }
    }

    private func handleAction(_ action: String, payload: Any?) async {
        switch action {
        case "openExternal":
            if let url = payload as? String, let urlObj = URL(string: url) {
                NSWorkspace.shared.open(urlObj)
            }
        case "minimize":
            NSApp.keyWindow?.miniaturize(nil)
        case "maximize":
            NSApp.keyWindow?.zoom(nil)
        case "close":
            NSApp.keyWindow?.close()
        default:
            webViewLogger.warning("Unknown action: \(action, privacy: .public)")
        }
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
            // 每次页面加载完成后，重新注入 native bridge
            // 解决 SPA 路由切换后 --pw-top 失效的问题
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
