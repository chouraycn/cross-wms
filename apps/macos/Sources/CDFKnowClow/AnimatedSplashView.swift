import AppKit

@MainActor
final class AnimatedSplashView: NSView {
    private var logoImageView: NSImageView!
    private var brandLabel: NSTextField!
    private var titleLabel: NSTextField!
    private var statusLabel: NSTextField!
    private var progressBar: NSProgressIndicator!

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
        layer?.backgroundColor = NSColor(calibratedWhite: 0.96, alpha: 1.0).cgColor

        setupLogo()
        setupBrandLabel()
        setupTitleLabel()
        setupStatusLabel()
        setupProgressBar()
    }

    private func setupLogo() {
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
        let logoSize: CGFloat = 96
        logoImageView.frame = NSRect(
            x: (bounds.width - logoSize) / 2,
            y: bounds.midY + 40,
            width: logoSize,
            height: logoSize
        )

        addSubview(logoImageView)
    }

    private func setupBrandLabel() {
        brandLabel = NSTextField()
        brandLabel.frame = NSRect(
            x: 0,
            y: bounds.midY + 10,
            width: bounds.width,
            height: 20
        )
        brandLabel.stringValue = "CDF Know Clow"
        brandLabel.font = NSFont.systemFont(ofSize: 14, weight: .light)
        brandLabel.alignment = .center
        brandLabel.textColor = NSColor(calibratedWhite: 0.1, alpha: 0.6)
        brandLabel.backgroundColor = .clear
        brandLabel.isBezeled = false
        brandLabel.isEditable = false
        brandLabel.isSelectable = false

        addSubview(brandLabel)
    }

    private func setupTitleLabel() {
        titleLabel = NSTextField()
        titleLabel.frame = NSRect(
            x: 0,
            y: bounds.midY - 20,
            width: bounds.width,
            height: 16
        )
        titleLabel.stringValue = "今天能帮你做些什么？"
        titleLabel.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        titleLabel.alignment = .center
        titleLabel.textColor = NSColor(calibratedWhite: 0.2, alpha: 1.0)
        titleLabel.backgroundColor = .clear
        titleLabel.isBezeled = false
        titleLabel.isEditable = false
        titleLabel.isSelectable = false

        addSubview(titleLabel)
    }

    private func setupStatusLabel() {
        statusLabel = NSTextField()
        statusLabel.frame = NSRect(
            x: 0,
            y: bounds.midY - 60,
            width: bounds.width,
            height: 14
        )
        statusLabel.stringValue = "正在启动服务器..."
        statusLabel.font = NSFont.systemFont(ofSize: 11, weight: .regular)
        statusLabel.alignment = .center
        statusLabel.textColor = NSColor.secondaryLabelColor
        statusLabel.backgroundColor = .clear
        statusLabel.isBezeled = false
        statusLabel.isEditable = false
        statusLabel.isSelectable = false

        addSubview(statusLabel)
    }

    private func setupProgressBar() {
        progressBar = NSProgressIndicator()
        let barWidth: CGFloat = 120
        progressBar.frame = NSRect(
            x: (bounds.width - barWidth) / 2,
            y: bounds.midY - 80,
            width: barWidth,
            height: 2
        )
        progressBar.style = .bar
        progressBar.isIndeterminate = true
        progressBar.controlSize = .mini
        progressBar.startAnimation(nil)

        progressBar.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.2).cgColor

        addSubview(progressBar)
    }

    func updateStatus(_ text: String) {
        statusLabel.stringValue = text
    }

    func stopProgress() {
        progressBar.stopAnimation(nil)
        progressBar.isIndeterminate = false
        progressBar.doubleValue = 100
    }

    func showError(_ message: String) {
        statusLabel.stringValue = message
        statusLabel.textColor = NSColor.systemRed
        progressBar.stopAnimation(nil)
    }
}
