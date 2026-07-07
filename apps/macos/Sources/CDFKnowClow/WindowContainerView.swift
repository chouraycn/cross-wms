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
/// 5. 支持两种拖动模式：全屏拖动 / 仅顶部区域拖动
/// 6. 双击顶部区域可缩放/最大化窗口（macOS 标准行为）
@MainActor
final class WindowContainerView: NSView {

    // MARK: - 拖动模式

    /// 拖动区域模式
    enum DragMode {
        /// 全屏可拖动
        case fullScreen
        /// 仅顶部区域可拖动
        case topOnly(height: CGFloat)
    }

    // MARK: - 常量

    /// 默认长按触发时间（秒）— 0.1s 几乎无感，兼顾点击与拖动
    static let defaultPressDuration: TimeInterval = 0.1

    /// 默认顶部拖动区域高度
    static let defaultTopDragHeight: CGFloat = 30.0

    // MARK: - 属性

    /// 主 WebView 子视图
    let webView: NSView

    /// 拖动模式
    let dragMode: DragMode

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

    /// 创建窗口容器视图
    /// - Parameters:
    ///   - webView: 要嵌入的主 WebView
    ///   - dragMode: 拖动模式，默认为仅顶部 30px 区域拖动
    init(webView: NSView, dragMode: DragMode = .topOnly(height: defaultTopDragHeight)) {
        self.webView = webView
        self.dragMode = dragMode
        super.init(frame: .zero)

        wantsLayer = true
        layer?.backgroundColor = .clear

        setupSubviews()
        setupPressGesture()
        setupDoubleClickGesture()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    // MARK: - 设置

    private func setupSubviews() {
        // 添加主 WebView
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
        gesture.minimumPressDuration = Self.defaultPressDuration
        gesture.allowedTouchTypes = [.direct]
        addGestureRecognizer(gesture)
        pressGesture = gesture
    }

    private func setupDoubleClickGesture() {
        let gesture = NSClickGestureRecognizer(
            target: self,
            action: #selector(handleDoubleClick(_:))
        )
        gesture.numberOfClicksRequired = 2
        addGestureRecognizer(gesture)
        doubleClickGesture = gesture
    }

    // 让容器本身也可拖动
    override var mouseDownCanMoveWindow: Bool {
        true
    }

    // MARK: - 拖动区域判断

    /// 判断点是否在可拖动区域内
    private func isInDragArea(_ point: NSPoint) -> Bool {
        switch dragMode {
        case .fullScreen:
            return true
        case .topOnly(let height):
            let dragAreaY = bounds.height - height
            return point.y >= dragAreaY
        }
    }

    // MARK: - 长按手势

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

    // MARK: - 双击手势

    @objc private func handleDoubleClick(_ recognizer: NSClickGestureRecognizer) {
        guard let window = window else { return }

        let location = recognizer.location(in: self)
        guard isInDragArea(location) else { return }

        window.zoom(nil)
    }
}
