import AppKit
import SwiftUI
import WebKit
import OSLog

let logger = Logger(subsystem: "com.cdf.knowclow", category: "app")

@main
struct CDFKnowClowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var serverManager: ServerProcessManager!
    var splashController: SplashScreenController!
    var webViewManager: WebViewManager!

    nonisolated func applicationDidFinishLaunching(_ notification: Notification) {
        Task { @MainActor in
            logger.info("CDF Know Clow starting...")

            // 初始化 WebViewManager
            self.webViewManager = WebViewManager.shared
            logger.info("WebViewManager initialized")

            // 初始化服务器管理器
            self.serverManager = ServerProcessManager()
            logger.info("ServerProcessManager initialized")

            // 初始化 Splash Screen 控制器（单窗口模式）
            self.splashController = SplashScreenController()
            logger.info("SplashScreenController initialized (single window mode)")

            let config = ConfigStore.shared.config
            logger.info("Config loaded: port=\(config.serverPort), autoStart=\(config.autoStartServer)")

            setupMenu()
            NSApp.setActivationPolicy(.regular)

            // v1.7.9: 刷新应用图标缓存，确保 Finder 显示最新图标
            refreshAppIcon()

            // v1.7.16: 单窗口模式 - 使用 160x160 尺寸的原生动画启动画面
            // 服务器就绪后在此窗口加载 WebView，无需切换窗口
            if config.autoStartServer {
                logger.info("Starting server with single-window splash mode...")

                // 设置服务器就绪后的回调
                splashController.onServerReady = { [weak self] mainWindow in
                    guard let self else { return }
                    Task { @MainActor in
                        logger.info("Server ready, main window active")
                        self.window = mainWindow
                        self.window.delegate = self
                        self.adjustTrafficLightPosition(horizontalOffset: 4, verticalOffset: 9)
                        NSApp.activate(ignoringOtherApps: true)
                    }
                }

                // 显示启动画面并启动服务器
                splashController.showAndStartServer(
                    serverManager: self.serverManager,
                    webViewManager: self.webViewManager,
                    config: config
                )
            } else {
                // 不自动启动服务器：显示主窗口
                logger.info("Auto-start disabled, showing main window")
                createMainWindow(config: config)
                window.makeKeyAndOrderFront(nil)
                window.center()
                NSApp.activate(ignoringOtherApps: true)
                webViewManager.loadMainAppDirect()
            }
        }
    }

    /// 创建主窗口
    private func createMainWindow(config: AppConfig) {
        let windowSize = NSSize(width: config.windowWidth, height: config.windowHeight)
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let windowRect = NSRect(
            x: screenFrame.midX - windowSize.width / 2,
            y: screenFrame.midY - windowSize.height / 2,
            width: windowSize.width,
            height: windowSize.height
        )

        window = NSWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "CDF Know Clow"
        window.minSize = NSSize(width: 900, height: 600)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true

        let containerView = WindowContainerView(webView: webViewManager.webView)
        window.contentView = containerView

        adjustTrafficLightPosition(horizontalOffset: 4, verticalOffset: 9)
        window.delegate = self
    }

    nonisolated func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    nonisolated func applicationWillTerminate(_ notification: Notification) {
        logger.info("CDF Know Clow terminating...")
    }

    // MARK: - 图标刷新

    /// 刷新应用图标缓存，确保 Finder 显示最新图标
    /// macOS 会缓存应用图标，安装新版本后可能显示旧图标
    /// 此方法在应用启动时调用，通知 Finder 刷新图标
    private func refreshAppIcon() {
        let appURL = Bundle.main.bundleURL
        let appPath = appURL.path

        logger.info("Refreshing app icon cache for: \(appPath, privacy: .public)")

        // 方法1: 通知 Finder 文件系统变化 - 递归通知整个 .app 包
        NSWorkspace.shared.noteFileSystemChanged(appPath)
        // 额外通知 Contents 目录和 Info.plist
        let contentsPath = (appPath as NSString).appendingPathComponent("Contents")
        let infoPlistPath = (contentsPath as NSString).appendingPathComponent("Info.plist")
        let resourcesPath = (contentsPath as NSString).appendingPathComponent("Resources")
        NSWorkspace.shared.noteFileSystemChanged(contentsPath)
        NSWorkspace.shared.noteFileSystemChanged(infoPlistPath)
        NSWorkspace.shared.noteFileSystemChanged(resourcesPath)

        // 方法2: touch .app 包及其关键文件（更新修改时间）
        let fm = FileManager.default
        let now = Date()
        do {
            var attrs = try fm.attributesOfItem(atPath: appPath)
            attrs[.modificationDate] = now
            try fm.setAttributes(attrs, ofItemAtPath: appPath)

            // 同时更新 Contents 和 Info.plist 的修改时间
            if fm.fileExists(atPath: contentsPath) {
                var contentsAttrs = try fm.attributesOfItem(atPath: contentsPath)
                contentsAttrs[.modificationDate] = now
                try fm.setAttributes(contentsAttrs, ofItemAtPath: contentsPath)
            }
            if fm.fileExists(atPath: infoPlistPath) {
                var plistAttrs = try fm.attributesOfItem(atPath: infoPlistPath)
                plistAttrs[.modificationDate] = now
                try fm.setAttributes(plistAttrs, ofItemAtPath: infoPlistPath)
            }
        } catch {
            logger.warning("Failed to touch app bundle: \(error.localizedDescription, privacy: .public)")
        }

        // 方法3: 使用 touch 命令行工具（更强力的刷新）
        let task = Process()
        task.launchPath = "/usr/bin/touch"
        task.arguments = ["-h", appPath]
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            logger.warning("Failed to run touch command: \(error.localizedDescription, privacy: .public)")
        }

        // 方法4: 刷新 Dock 图标缓存
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            // 重置应用图标
            NSApp.applicationIconImage = nil
            
            // 重新设置 Dock 徽章以触发刷新
            if let bundleIdentifier = Bundle.main.bundleIdentifier {
                NSWorkspace.shared.runningApplications
                    .filter { $0.bundleIdentifier == bundleIdentifier }
                    .forEach { app in
                        _ = app.bundleIdentifier
                    }
            }
        }

        // 方法5: 延迟后再次通知 Finder 变化（双重保险）
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NSWorkspace.shared.noteFileSystemChanged(appPath)
            logger.info("Second icon cache refresh sent")
        }

        // 方法6: 尝试清除 LaunchServices 缓存（需要用户权限，仅尝试）
        let lsTask = Process()
        lsTask.launchPath = "/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"
        lsTask.arguments = ["-f", "-v", appPath]
        lsTask.standardOutput = FileHandle.nullDevice
        lsTask.standardError = FileHandle.nullDevice
        do {
            try lsTask.run()
            lsTask.waitUntilExit()
            logger.info("LaunchServices cache refresh attempted")
        } catch {
            logger.info("lsregister not available or failed, skipping LaunchServices refresh")
        }
    }

    private func setupMenu() {
        let mainMenu = NSMenu()

        // MARK: - 应用菜单
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)

        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu

        appMenu.addItem(withTitle: "关于 CDF Know Clow", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "设置...", action: #selector(openSettings), keyEquivalent: ",")
        appMenu.addItem(NSMenuItem.separator())

        // 服务状态（动态显示）
        let serverStatusItem = NSMenuItem(
            title: serverStatusMenuTitle(),
            action: nil,
            keyEquivalent: ""
        )
        serverStatusItem.isEnabled = false
        appMenu.addItem(serverStatusItem)
        appMenu.addItem(NSMenuItem.separator())

        // 权限检查菜单
        appMenu.addItem(withTitle: "检查权限状态...", action: #selector(checkPermissions), keyEquivalent: "p")
        appMenu.addItem(NSMenuItem.separator())

        appMenu.addItem(
            withTitle: "隐藏 CDF Know Clow",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )

        let hideOthersItem = NSMenuItem(
            title: "隐藏其他应用",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            keyEquivalent: "h"
        )
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthersItem)

        appMenu.addItem(
            withTitle: "显示全部",
            action: #selector(NSApplication.unhideAllApplications(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(
            withTitle: "退出 CDF Know Clow",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )

        // MARK: - 编辑菜单
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "编辑")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        // MARK: - 服务菜单
        let servicesMenuItem = NSMenuItem()
        mainMenu.addItem(servicesMenuItem)
        let servicesMenu = NSMenu(title: "服务")
        servicesMenuItem.submenu = servicesMenu

        servicesMenu.addItem(withTitle: "启动服务器", action: #selector(startServer), keyEquivalent: "s")
        servicesMenu.addItem(withTitle: "停止服务器", action: #selector(stopServer), keyEquivalent: "k")
        servicesMenu.addItem(withTitle: "重启服务器", action: #selector(restartServer), keyEquivalent: "r")
        servicesMenu.addItem(NSMenuItem.separator())

        servicesMenu.addItem(withTitle: "查看服务器状态", action: #selector(showServerStatus), keyEquivalent: "")
        servicesMenu.addItem(withTitle: "在浏览器中打开前端", action: #selector(openFrontendInBrowser), keyEquivalent: "b")
        servicesMenu.addItem(NSMenuItem.separator())

        servicesMenu.addItem(withTitle: "复制服务器地址", action: #selector(copyServerURL), keyEquivalent: "c")

        // MARK: - 显示菜单
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "显示")
        viewMenuItem.submenu = viewMenu
        viewMenu.addItem(withTitle: "重新加载", action: #selector(reloadWebView), keyEquivalent: "r")
        viewMenu.addItem(NSMenuItem.separator())

        let fullScreenItem = NSMenuItem(
            title: "进入全屏",
            action: #selector(NSWindow.toggleFullScreen(_:)),
            keyEquivalent: "f"
        )
        fullScreenItem.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fullScreenItem)

        // MARK: - 窗口菜单
        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "窗口")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        windowMenu.addItem(NSMenuItem.separator())
        windowMenu.addItem(withTitle: "前置全部窗口", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")

        // MARK: - 帮助菜单
        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)
        let helpMenu = NSMenu(title: "帮助")
        helpMenuItem.submenu = helpMenu
        helpMenu.addItem(withTitle: "CDF Know Clow 帮助", action: #selector(showHelp), keyEquivalent: "?")

        NSApp.mainMenu = mainMenu
    }

    private func serverStatusMenuTitle() -> String {
        let port = ConfigStore.shared.config.serverPort
        return "服务状态：端口 \(port) - 运行中"
    }

    /// v1.5.220: 调整系统红黄绿按钮位置（使用 NSWindow 标准方法）
    /// - horizontalOffset: 水平偏移（正值右移）
    /// - verticalOffset: 垂直偏移（正值下移）
    private func adjustTrafficLightPosition(horizontalOffset: CGFloat, verticalOffset: CGFloat) {
        DispatchQueue.main.async { [weak self] in
            self?.applyOffsetToTrafficLights(horizontalOffset: horizontalOffset, verticalOffset: verticalOffset)
        }
    }

    /// v1.5.220: 调整红黄绿按钮的位置（使用 NSWindow 标准方法）
    private func applyOffsetToTrafficLights(horizontalOffset: CGFloat, verticalOffset: CGFloat) {
        let buttons: [NSButton?] = [
            window.standardWindowButton(.closeButton),
            window.standardWindowButton(.miniaturizeButton),
            window.standardWindowButton(.zoomButton)
        ]
        let validButtons = buttons.compactMap({ $0 })
        print("[CDFKnowClow] Found \(validButtons.count) traffic light buttons, applying offset: +\(horizontalOffset)px right, +\(verticalOffset)px down")
        for button in validButtons {
            var frame = button.frame
            let oldX = frame.origin.x
            let oldY = frame.origin.y
            frame.origin.x += horizontalOffset
            frame.origin.y -= verticalOffset
            button.frame = frame
            print("[CDFKnowClow] Traffic light button: (\(oldX), \(oldY)) -> (\(frame.origin.x), \(frame.origin.y))")
        }
    }

    @objc private func showAbout() {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let alert = NSAlert()
        alert.messageText = "CDF Know Clow"
        alert.informativeText = "版本 \(version)\n中免CLow端系统桌面应用"
        alert.addButton(withTitle: "确定")
        alert.runModal()
    }

    @objc private func openSettings() {
        WebViewManager.shared.webView.evaluateJavaScript("window.location.hash = '/settings'") { _, _ in }
    }

    @objc private func reloadWebView() {
        WebViewManager.shared.reload()
    }

    @objc private func showHelp() {
        if let url = URL(string: "https://github.com/cdf/cross-wms") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func checkPermissions() {
        Task { @MainActor in
            let status = await PermissionManager.status()
            let statusText = status
                .sorted(by: { $0.key.rawValue < $1.key.rawValue })
                .map { "\($0.key.rawValue): \($0.value ? "✅ 已授权" : "❌ 未授权")" }
                .joined(separator: "\n")

            let alert = NSAlert()
            alert.messageText = "权限状态"
            alert.informativeText = statusText
            alert.addButton(withTitle: "请求所有权限")
            alert.addButton(withTitle: "关闭")

            let response = alert.runModal()
            if response == .alertFirstButtonReturn {
                _ = await PermissionManager.ensure(
                    [.notifications, .microphone, .camera, .screenRecording, .accessibility],
                    interactive: true
                )
                // 刷新状态
                checkPermissions()
            }
        }
    }

    // MARK: - 服务菜单操作

    @objc private func startServer() {
        Task {
            await serverManager.start()
        }
    }

    @objc private func stopServer() {
        Task {
            await serverManager.stop()
        }
    }

    @objc private func restartServer() {
        Task {
            await serverManager.stop()
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            await serverManager.start()
        }
    }

    @objc private func showServerStatus() {
        let port = ConfigStore.shared.config.serverPort
        Task { @MainActor in
            let status = await serverManager.status
            let statusText: String
            switch status {
            case .stopped:
                statusText = "已停止"
            case .starting:
                statusText = "启动中..."
            case .running(let pid):
                statusText = "运行中 (PID: \(pid))"
            case .failed(let message):
                statusText = "失败: \(message)"
            }

            let alert = NSAlert()
            alert.messageText = "服务器状态"
            alert.informativeText = """
            状态：\(statusText)
            端口：\(port)
            地址：http://localhost:\(port)
            """
            alert.addButton(withTitle: "确定")
            alert.runModal()
        }
    }

    @objc private func openFrontendInBrowser() {
        let port = ConfigStore.shared.config.serverPort
        if let url = URL(string: "http://localhost:\(port)") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func copyServerURL() {
        let port = ConfigStore.shared.config.serverPort
        let url = "http://localhost:\(port)"
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(url, forType: .string)
    }
}

extension AppDelegate: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        let frame = window.frame
        ConfigStore.shared.update { config in
            config.windowWidth = frame.width
            config.windowHeight = frame.height
        }
        Task {
            await serverManager?.stop()
        }
    }
}
