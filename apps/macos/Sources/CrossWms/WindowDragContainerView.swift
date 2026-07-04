import AppKit
import Foundation

/// 自定义窗口内容容器 - 仅顶部区域支持长按拖动
///
/// 问题：WKWebView 会拦截所有鼠标事件，导致 NSWindow.isMovableByWindowBackground 在 WebView 区域不生效。
///
/// 解决方案：
/// 1. 用 NSView 作为 contentView
/// 2. WKWebView 作为子视图放在容器内
/// 3. 在容器上添加 NSPressGestureRecognizer（长按 0.2s 才触发）
/// 4. 仅当长按位置在顶部 30px 区域内时，才允许手势识别成功
/// 5. 短按（单击）事件不会触发 gesture，自然透传给 WebView
/// 6. 非顶部区域的长按也会让手势失败，事件透传给 WebView
/// 7. 双击顶部区域可缩放/最大化窗口（macOS 标准行为）
@MainActor
final class WindowDragContainerView: NSView {

    // MARK: - 常量

    /// 顶部拖动区域高度（符合 macOS 惯例，约 28-32px）
    static let dragAreaHeight: CGFloat = 30.0

    /// 长按触发时间（秒）— 0.1s 几乎无感，兼顾点击与拖动
    static let pressDuration: TimeInterval = 0.1

    // MARK: - 属性

    /// WebView 子视图
    let webView: NSView

    /// 长按手势识别器
    private var pressGesture: NSPressGestureRecognizer?

    /// 双击手势识别器
    private var doubleClickGesture: NSClickGestureRecognizer?

    /// 拖动起始屏幕位置
    private var dragStartScreenLocation: NSPoint = .zero

    /// 拖动起始窗口位置
    private var dragStartWindowOrigin: NSPoint = .zero

    /// 是否正在拖动
    private var isDragging = false

    // MARK: - 初始化

    init(webView: NSView) {
        self.webView = webView
        super.init(frame: .zero)

        wantsLayer = true
        layer?.backgroundColor = .clear

        setupWebView()
        setupPressGesture()
        setupDoubleClickGesture()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    // MARK: - 设置

    private func setupWebView() {
        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: trailingAnchor),
            webView.topAnchor.constraint(equalTo: topAnchor),
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func setupPressGesture() {
        let gesture = NSPressGestureRecognizer(
            target: self,
            action: #selector(handlePressGesture(_:))
        )
        gesture.minimumPressDuration = Self.pressDuration
        gesture.allowedTouchTypes = [.direct]
        gesture.delegate = self
        addGestureRecognizer(gesture)
        pressGesture = gesture
    }

    private func setupDoubleClickGesture() {
        let gesture = NSClickGestureRecognizer(
            target: self,
            action: #selector(handleDoubleClick(_:))
        )
        gesture.numberOfClicksRequired = 2
        gesture.delegate = self
        addGestureRecognizer(gesture)
        doubleClickGesture = gesture
    }

    // MARK: - 拖动区域判断

    /// 判断点是否在顶部拖动区域内
    private func isInDragArea(_ point: NSPoint) -> Bool {
        let dragAreaY = bounds.height - Self.dragAreaHeight
        return point.y >= dragAreaY
    }

    // MARK: - 手势处理

    @objc private func handlePressGesture(_ recognizer: NSPressGestureRecognizer) {
        guard let window = window else { return }

        let location = recognizer.location(in: self)

        switch recognizer.state {
        case .began:
            guard isInDragArea(location) else {
                recognizer.state = .failed
                return
            }
            isDragging = true
            dragStartScreenLocation = NSEvent.mouseLocation
            dragStartWindowOrigin = window.frame.origin

        case .changed:
            guard isDragging else { return }

            let currentScreenLocation = NSEvent.mouseLocation
            let dx = currentScreenLocation.x - dragStartScreenLocation.x
            let dy = currentScreenLocation.y - dragStartScreenLocation.y

            var newOrigin = dragStartWindowOrigin
            newOrigin.x += dx
            newOrigin.y += dy
            window.setFrameOrigin(newOrigin)

        case .ended, .cancelled, .failed:
            isDragging = false

        default:
            break
        }
    }

    @objc private func handleDoubleClick(_ recognizer: NSClickGestureRecognizer) {
        guard let window = window else { return }

        let location = recognizer.location(in: self)
        guard isInDragArea(location) else { return }

        window.zoom(nil)
    }
}

// MARK: - NSGestureRecognizerDelegate

extension WindowDragContainerView: NSGestureRecognizerDelegate {
    nonisolated func gestureRecognizer(
        _ gestureRecognizer: NSGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: NSGestureRecognizer
    ) -> Bool {
        false
    }

    nonisolated func gestureRecognizer(
        _ gestureRecognizer: NSGestureRecognizer,
        shouldRequireFailureOf otherGestureRecognizer: NSGestureRecognizer
    ) -> Bool {
        false
    }

    nonisolated func gestureRecognizer(
        _ gestureRecognizer: NSGestureRecognizer,
        shouldBeRequiredToFailBy otherGestureRecognizer: NSGestureRecognizer
    ) -> Bool {
        false
    }
}
