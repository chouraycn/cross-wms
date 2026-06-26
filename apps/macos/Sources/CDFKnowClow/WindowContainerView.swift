import AppKit
import Foundation

/// v1.5.220: 自定义窗口内容容器（参考 OpenClaw DashboardWindow）
///
/// 问题：WKWebView 作为 contentView 时，NSWindow.isMovableByWindowBackground 在 WebView 区域不生效
/// 因为 WKWebView 会拦截所有鼠标事件。
///
/// 解决方案（最终方案）：
/// 1. 用 NSView 作为 contentView（mouseDownCanMoveWindow = true）
/// 2. WKWebView 作为子视图放在容器内
/// 3. 在容器上添加 NSPressGestureRecognizer（长按 0.2s 才触发）
/// 4. 短按（单击）事件不会触发 gesture，自然透传给 WebView
@MainActor
final class WindowContainerView: NSView {

    /// WebView 子视图
    let webView: NSView

    /// 长按手势识别器
    private var pressGesture: NSPressGestureRecognizer?

    init(webView: NSView) {
        self.webView = webView
        super.init(frame: .zero)

        self.wantsLayer = true
        self.layer?.backgroundColor = .clear

        // 1. WebView 占满容器
        self.webView.translatesAutoresizingMaskIntoConstraints = false
        self.addSubview(self.webView)

        NSLayoutConstraint.activate([
            self.webView.leadingAnchor.constraint(equalTo: self.leadingAnchor),
            self.webView.trailingAnchor.constraint(equalTo: self.trailingAnchor),
            self.webView.topAnchor.constraint(equalTo: self.topAnchor),
            self.webView.bottomAnchor.constraint(equalTo: self.bottomAnchor),
        ])

        // 2. 添加长按手势（0.2s 才触发，不影响短按/单击）
        let gesture = NSPressGestureRecognizer(target: self, action: #selector(handlePressGesture(_:)))
        gesture.minimumPressDuration = 0.2
        gesture.allowedTouchTypes = [.direct]  // 仅响应鼠标（不响应触摸板）
        self.addGestureRecognizer(gesture)
        self.pressGesture = gesture
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    // 让容器本身也可拖动
    override var mouseDownCanMoveWindow: Bool {
        true
    }

    // MARK: - 长按手势

    @objc private func handlePressGesture(_ recognizer: NSPressGestureRecognizer) {
        guard let window = self.window else { return }
        let location = recognizer.location(in: self)
        let screenLocation = self.window?.convertPoint(toScreen: location) ?? .zero

        switch recognizer.state {
        case .began:
            // 长按开始：记录初始位置
            self.dragStartScreenLocation = screenLocation
            self.dragStartWindowOrigin = window.frame.origin
        case .changed:
            // 拖动中：移动窗口
            let currentScreenLocation = NSEvent.mouseLocation
            let dx = currentScreenLocation.x - self.dragStartScreenLocation.x
            let dy = currentScreenLocation.y - self.dragStartScreenLocation.y
            var newOrigin = self.dragStartWindowOrigin
            newOrigin.x += dx
            newOrigin.y += dy
            window.setFrameOrigin(newOrigin)
        case .ended, .cancelled, .failed:
            break
        default:
            break
        }
    }

    private var dragStartScreenLocation: NSPoint = .zero
    private var dragStartWindowOrigin: NSPoint = .zero
}
