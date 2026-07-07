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

    // MARK: - 内存压力响应

    /// 系统内存吃紧时清理 WKWebView 缓存，释放内存
    func handleMemoryPressure() {
        webViewLogger.info("Memory pressure received, clearing WebView cache...")

        // 1. 清理 WKWebsiteDataStore 的缓存数据（不清理 cookies 和 localStorage）
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

        // 2. 通过 JS 主动触发前端 GC（如果可用）
        webView.evaluateJavaScript("if (window.gc) { window.gc(); }") { _, error in
            if let error = error {
                webViewLogger.debug("JS gc() not available: \(error.localizedDescription, privacy: .public)")
            }
        }

        // 3. 通知前端清理内存（通过 postMessage）
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
    /// v1.9.0-fix: 移除同步 checkURL 避免主线程死锁，直接加载主 URL
    private func detectMainAppURL() -> URL {
        let port = ConfigStore.shared.config.serverPort
        // 直接加载主服务器 index.html
        return URL(string: "http://localhost:\(port)/index.html")!
    }

    /// v1.9.0-fix: 移除同步 checkURL 避免主线程死锁，直接加载 splash URL
    private func detectSplashURL() -> URL {
        let port = ConfigStore.shared.config.serverPort
        // 直接加载主服务器 splash.html
        return URL(string: "http://localhost:\(port)/splash.html")!
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
                },
                // 选择文件夹（异步，返回 Promise<string|null>）
                pickFolder: () => new Promise((resolve) => {
                    const cbId = 'pf_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
                    window.__cdfFolderCallbacks = window.__cdfFolderCallbacks || {};
                    window.__cdfFolderCallbacks[cbId] = resolve;
                    window.webkit.messageHandlers.cdfApp.postMessage({action: 'pickFolder', payload: {cbId}});
                }),
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

    // v1.9.0-fix: 已删除 checkURL 方法（同步网络请求导致主线程死锁）

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
                await handleAction(action, payload: body["payload"], webView: message.webView)
            }
        }
    }

    private func handleAction(_ action: String, payload: Any?, webView: WKWebView?) async {
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
        case "pickFolder":
            // 选择文件夹，通过 NSOpenPanel，结果通过 evaluateJavaScript 回传
            let cbId: String
            if let payloadDict = payload as? [String: Any], let id = payloadDict["cbId"] as? String {
                cbId = id
            } else {
                webViewLogger.warning("pickFolder: missing cbId")
                return
            }
            await MainActor.run {
                let panel = NSOpenPanel()
                panel.canChooseDirectories = true
                panel.canChooseFiles = false
                panel.allowsMultipleSelection = false
                panel.prompt = "选择文件夹"
                panel.level = .floating
                let response = panel.runModal()
                let folderPath: String?
                if response == .OK, let url = panel.url {
                    folderPath = url.path
                } else {
                    folderPath = nil
                }
                // 回传结果给前端
                let escapedPath = folderPath?.replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "'", with: "\\'")
                let js: String
                if let path = escapedPath {
                    js = "window.__cdfFolderCallbacks['\(cbId)'] && (window.__cdfFolderCallbacks['\(cbId)']('\(path)'), delete window.__cdfFolderCallbacks['\(cbId)']);"
                } else {
                    js = "window.__cdfFolderCallbacks['\(cbId)'] && (window.__cdfFolderCallbacks['\(cbId)'](null), delete window.__cdfFolderCallbacks['\(cbId)']);"
                }
                webView?.evaluateJavaScript(js, completionHandler: nil)
            }
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


