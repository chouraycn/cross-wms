import AppKit
import CDFKnowIPC
import Logging

/// 系统授权管理窗口 — 原生 macOS 权限管理界面
/// 显示所有 TCC 权限状态，支持请求授权和打开系统设置
@MainActor
final class PermissionManagerWindow {
    private static let logger = Logger(label: "com.crosswms.permissionManagerWindow")

    private var window: NSWindow?
    private var statusLabels: [Capability: NSTextField] = [:]
    private var refreshTimer: Timer?

    /// 权限显示定义
    private struct PermissionDisplay {
        let capability: Capability
        let title: String
        let desc: String
        let settingsURL: String
    }

    private let permissions: [PermissionDisplay] = [
        .init(capability: .notifications, title: "通知",
              desc: "允许发送系统通知", settingsURL: "x-apple.systempreferences:com.apple.Notifications-Settings.extension"),
        .init(capability: .microphone, title: "麦克风",
              desc: "允许录音和语音输入", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"),
        .init(capability: .camera, title: "摄像头",
              desc: "允许拍照和视频通话", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"),
        .init(capability: .location, title: "位置",
              desc: "允许获取地理位置", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices"),
        .init(capability: .accessibility, title: "辅助功能",
              desc: "允许模拟鼠标和键盘操作", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"),
        .init(capability: .screenRecording, title: "屏幕录制",
              desc: "允许截屏和屏幕内容读取", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"),
        .init(capability: .speechRecognition, title: "语音识别",
              desc: "允许语音识别功能", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"),
        .init(capability: .appleScript, title: "自动化",
              desc: "允许 AppleScript 控制其他应用", settingsURL: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"),
    ]

    func show() {
        if let existing = window {
            existing.makeKeyAndOrderFront(nil)
            refreshStatus()
            return
        }

        let windowWidth: CGFloat = 520
        let rowHeight: CGFloat = 52
        let headerHeight: CGFloat = 40
        let footerHeight: CGFloat = 60
        let windowHeight = headerHeight + CGFloat(permissions.count) * rowHeight + footerHeight

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: windowWidth, height: windowHeight),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "系统授权管理"
        window.isReleasedWhenClosed = false
        window.center()
        window.minSize = NSSize(width: 480, height: windowHeight - 50)
        window.maxSize = NSSize(width: 600, height: windowHeight + 100)

        let containerView = NSView(frame: NSRect(x: 0, y: 0, width: windowWidth, height: windowHeight))
        containerView.translatesAutoresizingMaskIntoConstraints = false

        // 标题
        let titleLabel = NSTextField(labelWithString: "系统授权管理")
        titleLabel.font = NSFont.boldSystemFont(ofSize: 16)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(titleLabel)

        // 权限列表
        var rows: [NSView] = []
        for perm in permissions {
            let row = createPermissionRow(perm)
            rows.append(row)
            containerView.addSubview(row)
        }

        // 底部按钮
        let refreshButton = NSButton(title: "刷新状态", target: self, action: #selector(refreshAll))
        refreshButton.bezelStyle = .rounded
        refreshButton.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(refreshButton)

        let closeButton = NSButton(title: "关闭", target: self, action: #selector(closeWindow))
        closeButton.bezelStyle = .rounded
        closeButton.keyEquivalent = "\r"
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(closeButton)

        window.contentView = containerView

        // Auto Layout
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 16),
            titleLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),

            refreshButton.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -16),
            refreshButton.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),

            closeButton.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -16),
            closeButton.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20),
        ])

        // 手动布局权限行
        var prevTop: NSLayoutYAxisAnchor = titleLabel.bottomAnchor
        for row in rows {
            row.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                row.topAnchor.constraint(equalTo: prevTop, constant: 8),
                row.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),
                row.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20),
                row.heightAnchor.constraint(equalToConstant: rowHeight),
            ])
            prevTop = row.bottomAnchor
        }

        self.window = window
        window.makeKeyAndOrderFront(nil)

        // 初始加载状态
        refreshStatus()

        // 定时刷新（每 5 秒）
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refreshStatus()
            }
        }

        // 窗口关闭时清理
        window.delegate = WindowCloseDelegate { [weak self] in
            self?.refreshTimer?.invalidate()
            self?.refreshTimer = nil
            self?.window = nil
        }
    }

    // MARK: - Row Creation

    private func createPermissionRow(_ perm: PermissionDisplay) -> NSView {
        let row = NSView()
        row.wantsLayer = true
        row.layer?.cornerRadius = 8
        row.layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.5).cgColor

        // 权限名称
        let nameLabel = NSTextField(labelWithString: perm.title)
        nameLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(nameLabel)

        // 描述
        let descLabel = NSTextField(labelWithString: perm.desc)
        descLabel.font = NSFont.systemFont(ofSize: 11)
        descLabel.textColor = .secondaryLabelColor
        descLabel.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(descLabel)

        // 状态标签
        let statusLabel = NSTextField(labelWithString: "检查中…")
        statusLabel.font = NSFont.systemFont(ofSize: 11)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(statusLabel)
        statusLabels[perm.capability] = statusLabel

        // 打开设置按钮
        let settingsButton = NSButton(title: "设置", target: self, action: #selector(openSettingsForCapability(_:)))
        settingsButton.bezelStyle = .roundRect
        settingsButton.controlSize = .small
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        settingsButton.identifier = NSUserInterfaceItemIdentifier(perm.capability.rawValue)
        settingsButton.toolTip = perm.settingsURL
        row.addSubview(settingsButton)

        NSLayoutConstraint.activate([
            nameLabel.topAnchor.constraint(equalTo: row.topAnchor, constant: 8),
            nameLabel.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 12),

            descLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 2),
            descLabel.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 12),

            statusLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: settingsButton.leadingAnchor, constant: -8),

            settingsButton.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            settingsButton.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -12),
            settingsButton.widthAnchor.constraint(equalToConstant: 50),
        ])

        return row
    }

    // MARK: - Actions

    @objc private func refreshAll() {
        refreshStatus()
    }

    @objc private func closeWindow() {
        window?.close()
    }

    @objc private func openSettingsForCapability(_ sender: NSButton) {
        guard let id = sender.identifier?.rawValue,
              let cap = Capability(rawValue: id) else { return }

        Task {
            await PermissionManager.ensure([cap], interactive: true)
            await MainActor.run {
                self.refreshStatus()
            }
        }
    }

    // MARK: - Status Refresh

    private func refreshStatus() {
        let caps = permissions.map { $0.capability }
        Task {
            let status = await PermissionManager.status(caps)
            await MainActor.run {
                for (cap, granted) in status {
                    guard let label = self.statusLabels[cap] else { continue }
                    if granted {
                        label.stringValue = "✓ 已授权"
                        label.textColor = NSColor.systemGreen
                    } else {
                        label.stringValue = "✗ 未授权"
                        label.textColor = NSColor.systemRed
                    }
                }
            }
        }
    }
}

// MARK: - Window Close Delegate

private final class WindowCloseDelegate: NSObject, NSWindowDelegate {
    private let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func windowWillClose(_ notification: Notification) {
        onClose()
    }
}
