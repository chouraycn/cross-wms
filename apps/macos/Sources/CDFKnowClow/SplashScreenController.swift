import AppKit
import OSLog

let splashLogger = Logger(subsystem: "com.cdf.knowclow", category: "splash")

/// v1.6.0: 原生启动画面控制器
/// 在应用启动时立即显示，避免白屏等待
/// 同时启动 Node.js 服务器，服务器就绪后关闭启动画面并加载 WebView
@MainActor
final class SplashScreenController {
    private var splashWindow: NSWindow?
    private var splashView: SplashScreenView?
    private var serverManager: ServerProcessManager?
    private var mainWindow: NSWindow?
    private var onCloseCallback: (() -> Void)?

    /// 显示启动画面并开始后台启动服务器
    func showAndStartServer(
        serverManager: ServerProcessManager,
        config: AppConfig,
        onClose: @escaping () -> Void
    ) {
        self.serverManager = serverManager
        self.onCloseCallback = onClose

        // 创建启动画面窗口
        let splashSize = NSSize(width: 400, height: 300)
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let splashRect = NSRect(
            x: screenFrame.midX - splashSize.width / 2,
            y: screenFrame.midY - splashSize.height / 2,
            width: splashSize.width,
            height: splashSize.height
        )

        splashWindow = NSWindow(
            contentRect: splashRect,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        splashWindow?.level = .floating
        splashWindow?.backgroundColor = .clear
        splashWindow?.isOpaque = false
        splashWindow?.hasShadow = true
        splashWindow?.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        splashWindow?.hidesOnDeactivate = false

        // 创建启动画面视图
        splashView = SplashScreenView(frame: NSRect(origin: .zero, size: splashSize))
        splashWindow?.contentView = splashView

        splashWindow?.makeKeyAndOrderFront(nil)
        splashWindow?.center()
        NSApp.activate(ignoringOtherApps: true)

        splashLogger.info("Splash screen shown")

        // 启动服务器
        Task {
            await startServerAndMonitor(config: config)
        }
    }

    /// 后台启动服务器并监控状态
    private func startServerAndMonitor(config: AppConfig) async {
        guard let serverManager = serverManager else {
            // 没有服务器管理器，直接关闭启动画面
            splashLogger.error("ServerManager is nil, closing splash screen")
            await closeSplashScreen()
            return
        }

        // 启动服务器
        await serverManager.start()

        // 等待服务器就绪（最多 30 秒，避免长时间阻塞）
        let deadline = Date().addingTimeInterval(30)
        var isReady = false
        var errorMessage: String?

        while Date() < deadline {
            let status = await serverManager.status
            switch status {
            case .running:
                isReady = true
                splashLogger.info("Server is ready, closing splash screen")
                break
            case .failed(let message):
                splashLogger.error("Server failed: \(message)")
                errorMessage = message
                // 显示错误提示 3 秒后关闭
                await updateSplashMessage("服务器启动失败: \(message)")
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                break
            case .starting:
                // 继续等待，更新状态文字
                await updateSplashMessage("正在启动服务器...")
            case .stopped:
                // 继续等待
                try? await Task.sleep(nanoseconds: 500_000_000)
            }

            if isReady || errorMessage != nil {
                break
            }

            // 每次循环间隔 500ms
            try? await Task.sleep(nanoseconds: 500_000_000)
        }

        // 超时处理：如果服务器未就绪，也关闭启动画面并显示主窗口
        if !isReady && errorMessage == nil {
            splashLogger.warning("Server startup timeout after 30s, proceeding anyway")
            await updateSplashMessage("服务器启动超时，请检查日志")
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }

        // 关闭启动画面
        await closeSplashScreen()
    }

    /// 更新启动画面的状态文字
    private func updateSplashMessage(_ message: String) async {
        splashView?.updateStatus(message)
    }

    /// 关闭启动画面并通知回调
    private func closeSplashScreen() async {
        // 添加淡出动画
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.3
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            splashWindow?.animator().alphaValue = 0
        } completionHandler: {
            self.splashWindow?.close()
            self.splashWindow = nil
            self.splashView = nil
            splashLogger.info("Splash screen closed")

            // 触发回调
            self.onCloseCallback?()
        }
    }
}

/// 原生启动画面视图
@MainActor
final class SplashScreenView: NSView {
    private var statusLabel: NSTextField?
    private var progressIndicator: NSProgressIndicator?
    private var logoImageView: NSImageView?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        layer?.cornerRadius = 12
        layer?.borderWidth = 1
        layer?.borderColor = NSColor.separatorColor.cgColor

        // 应用图标
        let logoSize = NSSize(width: 96, height: 96)
        let logoRect = NSRect(
            x: (bounds.width - logoSize.width) / 2,
            y: bounds.height - logoSize.height - 40,
            width: logoSize.width,
            height: logoSize.height
        )

        logoImageView = NSImageView(frame: logoRect)
        logoImageView?.imageScaling = .scaleProportionallyUpOrDown
        logoImageView?.image = NSImage(named: "AppIcon") ?? NSImage(systemSymbolName: "app.fill", accessibilityDescription: nil)
        addSubview(logoImageView!)

        // 应用名称
        let titleLabel = NSTextField(frame: NSRect(
            x: 0,
            y: logoRect.origin.y - 35,
            width: bounds.width,
            height: 24
        ))
        titleLabel.stringValue = "CDF Know Clow"
        titleLabel.font = NSFont.systemFont(ofSize: 18, weight: .semibold)
        titleLabel.alignment = .center
        titleLabel.textColor = NSColor.labelColor
        titleLabel.backgroundColor = .clear
        titleLabel.isBezeled = false
        titleLabel.isEditable = false
        titleLabel.isSelectable = false
        addSubview(titleLabel)

        // 加载进度指示器
        let progressSize = NSSize(width: 200, height: 4)
        let progressRect = NSRect(
            x: (bounds.width - progressSize.width) / 2,
            y: titleLabel.frame.origin.y - 30,
            width: progressSize.width,
            height: progressSize.height
        )

        progressIndicator = NSProgressIndicator(frame: progressRect)
        progressIndicator?.style = .bar
        progressIndicator?.isIndeterminate = true
        progressIndicator?.controlSize = .small
        progressIndicator?.startAnimation(nil)
        addSubview(progressIndicator!)

        // 状态文字
        let statusRect = NSRect(
            x: 0,
            y: progressRect.origin.y - 25,
            width: bounds.width,
            height: 20
        )

        statusLabel = NSTextField(frame: statusRect)
        statusLabel?.stringValue = "正在启动服务器..."
        statusLabel?.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        statusLabel?.alignment = .center
        statusLabel?.textColor = NSColor.secondaryLabelColor
        statusLabel?.backgroundColor = .clear
        statusLabel?.isBezeled = false
        statusLabel?.isEditable = false
        statusLabel?.isSelectable = false
        addSubview(statusLabel!)
    }

    /// 更新状态文字
    func updateStatus(_ text: String) {
        statusLabel?.stringValue = text
    }

    /// 停止进度动画
    func stopProgress() {
        progressIndicator?.stopAnimation(nil)
        progressIndicator?.isIndeterminate = false
        progressIndicator?.doubleValue = 100
    }
}