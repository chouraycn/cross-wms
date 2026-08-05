import AppKit
import OSLog

let splashLogger = Logger(subsystem: "com.cdf.knowclow", category: "splash")

@MainActor
final class SplashScreenController {
    private var splashWindow: NSWindow?
    private var animatedSplashView: AnimatedSplashView?
    private var serverManager: ServerProcessManager?
    private var webViewManager: WebViewManager?

    private(set) var mainWindow: NSWindow?

    /// 三个就绪信号（全部满足后切换 contentView 为 WebView）
    private var serverReady = false
    private var webViewLoaded = false
    private var reactReady = false
    private var transitionedToWebView = false

    /// 超时兜底：8 秒后即使 React 未通知也强制切换（dev 模式或 IPC 异常时）
    private var forceSwitchTask: Task<Void, Never>?

    var onServerReady: ((NSWindow) -> Void)?

    // MARK: - 启动入口

    /// 启动流程（整合为单一启动画面）：
    ///
    /// 1. 立即创建窗口，contentView = AnimatedSplashView（原生启动画面，唯一启动画面）
    /// 2. 同步启动 WebView 后台加载 index.html（不挂载到 contentView）
    /// 3. 并行启动 Node.js 服务器
    /// 4. 等待三个信号全部满足：
    ///    - 服务器就绪（健康检查通过）
    ///    - WebView 加载完成（didFinish navigation）
    ///    - React 渲染完成（main.tsx 通过 IPC reactReady 通知）
    /// 5. 三个信号都就绪后，淡入切换 contentView 为 WebView（无缝过渡，无白屏）
    /// 6. 超时兜底：8 秒后强制切换（避免 IPC 异常时卡死）
    func showAndStartServer(
        serverManager: ServerProcessManager,
        webViewManager: WebViewManager,
        config: AppConfig
    ) {
        self.serverManager = serverManager
        self.webViewManager = webViewManager

        let windowSize = NSSize(width: config.windowWidth, height: config.windowHeight)
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let windowRect = NSRect(
            x: screenFrame.midX - windowSize.width / 2,
            y: screenFrame.midY - windowSize.height / 2,
            width: windowSize.width,
            height: windowSize.height
        )

        splashWindow = NSWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        splashWindow?.title = "CDF Know Clow"
        splashWindow?.minSize = NSSize(width: 900, height: 600)
        splashWindow?.titlebarAppearsTransparent = true
        splashWindow?.titleVisibility = .hidden
        splashWindow?.isMovableByWindowBackground = true
        splashWindow?.backgroundColor = NSColor(calibratedWhite: 0.96, alpha: 1.0)

        // 唯一启动画面：AnimatedSplashView
        animatedSplashView = AnimatedSplashView(frame: NSRect(origin: .zero, size: windowSize))
        splashWindow?.contentView = animatedSplashView

        splashWindow?.makeKeyAndOrderFront(nil)
        splashWindow?.center()
        NSApp.activate(ignoringOtherApps: true)

        splashLogger.info("Splash screen shown (AnimatedSplashView as sole splash)")

        // 重置信号
        serverReady = false
        webViewLoaded = false
        reactReady = false
        transitionedToWebView = false

        // 设置 WebView 加载回调
        webViewManager.onFirstLoadFinished = { [weak self] in
            guard let self else { return }
            self.webViewLoaded = true
            splashLogger.info("WebView loaded, checking transition conditions")
            self.tryTransitionToWebView()
        }

        // 设置 React 渲染完成回调
        webViewManager.onReactReady = { [weak self] in
            guard let self else { return }
            self.reactReady = true
            splashLogger.info("React ready signal received, checking transition conditions")
            self.tryTransitionToWebView()
        }

        // v1.7.183: 不在启动时立即 loadMainAppDirect() —— 服务器尚未就绪，localhost 请求必然失败，
        // 失败后 handleLoadError 的重试策略（3s/6s 延时重试）会造成"服务器就绪后仍卡很久才跳转"。
        // 改为：在服务器状态变为 running 之后再触发 WebView 加载（见 startServerAndMonitor），
        // 保证第一次请求即命中可用端口，避免重试延时。

        // 超时兜底：8 秒后强制切换
        forceSwitchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard let self else { return }
            if !self.transitionedToWebView {
                splashLogger.warning("Force switching to WebView after 8s timeout (React ready may not have fired)")
                self.forceSwitchToWebView()
            }
        }

        // 并行启动服务器
        Task {
            await startServerAndMonitor(config: config)
        }
    }

    // MARK: - WebView 切换

    /// 检查三个信号是否全部满足，满足则切换 contentView 为 WebView
    private func tryTransitionToWebView() {
        guard !transitionedToWebView,
              serverReady,
              webViewLoaded,
              reactReady,
              webViewManager != nil,
              splashWindow != nil else {
            return
        }
        transitionToWebView()
    }

    /// 超时兜底强制切换
    private func forceSwitchToWebView() {
        guard !transitionedToWebView else { return }
        splashLogger.warning("Force switching: serverReady=\(self.serverReady), webViewLoaded=\(self.webViewLoaded), reactReady=\(self.reactReady)")
        transitionToWebView()
    }

    /// 执行 contentView 切换：AnimatedSplashView → WebView（淡入）
    private func transitionToWebView() {
        guard !transitionedToWebView,
              let webViewManager = webViewManager,
              let splashWindow = splashWindow else {
            return
        }
        transitionedToWebView = true
        forceSwitchTask?.cancel()

        let containerView = WindowContainerView(webView: webViewManager.getWebView())
        containerView.wantsLayer = true
        containerView.layer?.backgroundColor = .clear
        containerView.alphaValue = 0
        containerView.frame = splashWindow.contentView?.bounds ?? .zero

        splashWindow.contentView = containerView

        // 0.25s 淡入，无缝过渡
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.25
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            containerView.animator().alphaValue = 1
        }, completionHandler: {
            splashLogger.info("Switched contentView from AnimatedSplashView to WebView (transition complete)")
        })
    }

    // MARK: - 服务器启动与健康检查

    private func startServerAndMonitor(config: AppConfig) async {
        guard let serverManager = serverManager else {
            splashLogger.error("ServerManager is nil")
            return
        }

        splashLogger.info("Starting server (port=\(config.serverPort))...")
        animatedSplashView?.updateStatus("正在启动服务器...")
        await serverManager.start()
        splashLogger.info("ServerManager.start() returned")

        let deadline = Date().addingTimeInterval(90)
        var isReady = false
        var errorMessage: String?
        var checkCount = 0

        while Date() < deadline {
            checkCount += 1
            let status = await serverManager.status
            splashLogger.info("Health check #\(checkCount): status=\(String(describing: status))")
            switch status {
            case .running:
                isReady = true
                splashLogger.info("Server is ready")
                animatedSplashView?.updateStatus("服务器已就绪，正在加载界面...")
                animatedSplashView?.stopProgress()
                serverReady = true
                // v1.7.183: 服务器就绪后再加载 WebView 主页面，确保第一次请求即命中可用端口，
                // 避开 handleLoadError 中 3s/6s 的重试延时造成的卡顿感。
                if !webViewLoaded {
                    webViewManager?.loadMainAppDirect()
                }
                tryTransitionToWebView()
            case .failed(let message):
                splashLogger.error("Server failed: \(message)")
                errorMessage = message
                animatedSplashView?.showError("服务器启动失败")
            case .timeout:
                splashLogger.error("Server timeout")
                errorMessage = "服务器启动超时"
                animatedSplashView?.showError("服务器启动超时")
            case .starting:
                animatedSplashView?.updateStatus("正在启动服务器... (#\(checkCount))")
            case .stopped:
                animatedSplashView?.updateStatus("正在连接...")
            }

            if isReady || errorMessage != nil {
                break
            }

            try? await Task.sleep(nanoseconds: 500_000_000)
        }

        if !isReady && errorMessage == nil {
            splashLogger.warning("Server startup timeout after 90s, proceeding anyway")
            animatedSplashView?.showError("服务器启动超时，正在尝试加载...")
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            // 超时也标记 serverReady，让切换能继续，并确保 WebView 触发加载
            serverReady = true
            if !webViewLoaded {
                webViewManager?.loadMainAppDirect()
            }
            tryTransitionToWebView()
        }

        if let splashWindow = splashWindow {
            self.mainWindow = splashWindow
            splashLogger.info("Server startup phase complete")
            self.onServerReady?(splashWindow)
        }
    }
}
