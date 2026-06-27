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

    var onServerReady: ((NSWindow) -> Void)?

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

        animatedSplashView = AnimatedSplashView(frame: NSRect(origin: .zero, size: windowSize))
        splashWindow?.contentView = animatedSplashView

        splashWindow?.makeKeyAndOrderFront(nil)
        splashWindow?.center()
        NSApp.activate(ignoringOtherApps: true)

        splashLogger.info("Splash screen shown (main window size)")

        Task {
            await startServerAndMonitor(config: config)
        }
    }

    private func startServerAndMonitor(config: AppConfig) async {
        guard let serverManager = serverManager else {
            splashLogger.error("ServerManager is nil")
            return
        }

        await serverManager.start()

        let deadline = Date().addingTimeInterval(30)
        var isReady = false
        var errorMessage: String?

        while Date() < deadline {
            let status = await serverManager.status
            switch status {
            case .running:
                isReady = true
                splashLogger.info("Server is ready")
                animatedSplashView?.updateStatus("服务器已就绪")
                animatedSplashView?.stopProgress()
                break
            case .failed(let message):
                splashLogger.error("Server failed: \(message)")
                errorMessage = message
                animatedSplashView?.showError("服务器启动失败")
            case .starting:
                animatedSplashView?.updateStatus("正在启动服务器...")
            case .stopped:
                animatedSplashView?.updateStatus("正在连接...")
            }

            if isReady || errorMessage != nil {
                break
            }

            try? await Task.sleep(nanoseconds: 500_000_000)
        }

        if !isReady && errorMessage == nil {
            splashLogger.warning("Server startup timeout after 30s, proceeding anyway")
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        await transitionToWebView()
    }

    private func transitionToWebView() async {
        guard let webViewManager = webViewManager,
              let splashWindow = splashWindow else {
            splashLogger.error("Missing required components for transition")
            return
        }

        let containerView = WindowContainerView(webView: webViewManager.getWebView())
        containerView.frame = splashWindow.contentView?.bounds ?? .zero

        splashWindow.contentView = containerView

        self.mainWindow = splashWindow

        webViewManager.loadMainAppDirect()

        splashLogger.info("Transitioned to WebView in main window")

        onServerReady?(splashWindow)
    }
}
