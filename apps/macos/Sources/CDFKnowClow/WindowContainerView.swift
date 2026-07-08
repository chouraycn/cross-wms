import AppKit
import Foundation

/// v1.5.220: 自定义窗口内容容器
///
/// 拖动方案：完全依赖前端 -webkit-app-region CSS 属性
/// - 前端通过设置 -webkit-app-region: drag 标记可拖动区域
/// - 通过 -webkit-app-region: no-drag 标记可点击区域（按钮等）
/// - 这是 WKWebView/Electron 的标准做法，性能最优且最灵活
@MainActor
final class WindowContainerView: NSView {

    // MARK: - 属性

    let webView: NSView

    // MARK: - 初始化

    init(webView: NSView) {
        self.webView = webView
        super.init(frame: .zero)

        wantsLayer = true
        layer?.backgroundColor = .clear

        setupSubviews()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    // MARK: - 设置

    private func setupSubviews() {
        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: trailingAnchor),
            webView.topAnchor.constraint(equalTo: topAnchor),
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}
