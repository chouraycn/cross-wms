import AppKit

@MainActor
final class AnimatedSplashView: NSView {
    private var logoContainer: NSView!
    private var logoImageView: NSImageView!
    private var productLabel: NSTextField!
    private var headlineLabel: NSTextField!
    private var statusLabel: NSTextField!
    private var progressBar: NSProgressIndicator!

    // 布局常量（基准窗口 1280×800）
    private let logoSize: CGFloat = 128
    private let logoTopOffset: CGFloat = 180
    private let productLabelTopGap: CGFloat = 40
    private let headlineTopGap: CGFloat = 16
    private let headlineStatusGap: CGFloat = 180
    private let statusProgressGap: CGFloat = 16
    private let progressWidth: CGFloat = 180

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    override func layout() {
        super.layout()
        layoutSubviews()
    }

    private func setupView() {
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedWhite: 0.97, alpha: 1.0).cgColor

        setupLogo()
        setupProductLabel()
        setupHeadlineLabel()
        setupStatusLabel()
        setupProgressBar()

        layoutSubviews()
    }

    private func layoutSubviews() {
        let cx = bounds.midX

        // Logo 容器（圆角矩形 + 阴影背景）
        let logoX = cx - logoSize / 2
        let logoY = bounds.height - logoTopOffset - logoSize
        logoContainer.frame = NSRect(x: logoX, y: logoY, width: logoSize, height: logoSize)
        logoContainer.layer?.cornerRadius = logoSize * 0.22
        logoContainer.layer?.shadowColor = NSColor.black.withAlphaComponent(0.12).cgColor
        logoContainer.layer?.shadowOpacity = 1
        logoContainer.layer?.shadowOffset = CGSize(width: 0, height: 8)
        logoContainer.layer?.shadowRadius = 20

        logoImageView.frame = NSRect(x: 16, y: 16, width: logoSize - 32, height: logoSize - 32)

        // 产品标签
        productLabel.frame = NSRect(
            x: 0, y: logoY - productLabelTopGap - 22,
            width: bounds.width, height: 22
        )

        // 大标题
        headlineLabel.frame = NSRect(
            x: 0, y: productLabel.frame.minY - headlineTopGap - 120,
            width: bounds.width, height: 120
        )

        // 状态文字（底部上方）
        statusLabel.frame = NSRect(
            x: 0, y: headlineLabel.frame.minY - headlineStatusGap - 18,
            width: bounds.width, height: 18
        )

        // 进度条
        progressBar.frame = NSRect(
            x: cx - progressWidth / 2, y: statusLabel.frame.minY - statusProgressGap - 3,
            width: progressWidth, height: 3
        )
    }

    private func setupLogo() {
        logoContainer = NSView()
        logoContainer.wantsLayer = true
        logoContainer.layer?.backgroundColor = NSColor(calibratedWhite: 1.0, alpha: 1.0).cgColor

        if let appIcon = NSImage(named: "AppIcon") {
            logoImageView = NSImageView(image: appIcon)
        } else {
            let defaultIcon = NSImage(size: NSSize(width: 96, height: 96), flipped: false) { rect in
                NSColor(calibratedWhite: 0.15, alpha: 1.0).setFill()
                NSBezierPath(ovalIn: rect.insetBy(dx: 4, dy: 4)).fill()
                return true
            }
            logoImageView = NSImageView(image: defaultIcon)
        }
        logoImageView.imageScaling = .scaleProportionallyUpOrDown

        logoContainer.addSubview(logoImageView)
        addSubview(logoContainer)
    }

    private func setupProductLabel() {
        productLabel = NSTextField()
        productLabel.stringValue = "CDF Know Clow"
        productLabel.font = NSFont.systemFont(ofSize: 15, weight: .medium)
        productLabel.alignment = .center
        productLabel.textColor = NSColor(calibratedWhite: 0.1, alpha: 0.7)
        productLabel.backgroundColor = .clear
        productLabel.isBezeled = false
        productLabel.isEditable = false
        productLabel.isSelectable = false

        addSubview(productLabel)
    }

    private func setupHeadlineLabel() {
        headlineLabel = NSTextField()
        headlineLabel.stringValue = "Your AI Workspace.\nSee anytime, know anytime."
        headlineLabel.font = NSFont.systemFont(ofSize: 44, weight: .bold)
        headlineLabel.alignment = .center
        headlineLabel.textColor = NSColor(calibratedWhite: 0.08, alpha: 1.0)
        headlineLabel.backgroundColor = .clear
        headlineLabel.isBezeled = false
        headlineLabel.isEditable = false
        headlineLabel.isSelectable = false
        headlineLabel.lineBreakMode = .byWordWrapping
        headlineLabel.maximumNumberOfLines = 2
        headlineLabel.cell?.usesSingleLineMode = false
        (headlineLabel.cell as? NSTextFieldCell)?.wraps = true

        addSubview(headlineLabel)
    }

    private func setupStatusLabel() {
        statusLabel = NSTextField()
        statusLabel.stringValue = "正在启动服务器..."
        statusLabel.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        statusLabel.alignment = .center
        statusLabel.textColor = NSColor(calibratedWhite: 0.4, alpha: 1.0)
        statusLabel.backgroundColor = .clear
        statusLabel.isBezeled = false
        statusLabel.isEditable = false
        statusLabel.isSelectable = false

        addSubview(statusLabel)
    }

    private func setupProgressBar() {
        progressBar = NSProgressIndicator()
        progressBar.style = .bar
        progressBar.isIndeterminate = false
        progressBar.controlSize = .regular
        progressBar.wantsLayer = true
        progressBar.minValue = 0
        progressBar.maxValue = 100
        progressBar.doubleValue = 0

        progressBar.layer?.cornerRadius = 1.5
        progressBar.layer?.backgroundColor = NSColor(calibratedWhite: 0.88, alpha: 1.0).cgColor

        if let controlsFilter = CIFilter(name: "CIColorControls", parameters: [
            "inputSaturation": 0.0,
            "inputBrightness": -0.3,
            "inputContrast": 1.2
        ]) {
            progressBar.contentFilters = [controlsFilter]
        }

        addSubview(progressBar)
    }

    func updateStatus(_ text: String) {
        statusLabel.stringValue = text
    }

    /// 设置进度条到指定百分比（0-100），带平滑动画
    func setProgress(_ value: Double) {
        let clamped = max(0, min(100, value))
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.3
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            progressBar.animator().doubleValue = clamped
        })
    }

    func stopProgress() {
        setProgress(100)
    }

    func showError(_ message: String) {
        statusLabel.stringValue = message
        statusLabel.textColor = NSColor.systemRed
    }
}
