import Foundation
import Sparkle
import Logging

@MainActor
final class UpdateManager: NSObject, SPUUpdaterDelegate {
    private let logger = Logger(label: "com.crosswms.updates")
    private let updater: SPUUpdater
    private let updaterController: SPUStandardUpdaterController

    var onUpdateAvailable: ((String, String) -> Void)?
    var onUpdateDownloaded: ((String) -> Void)?
    var onError: ((String) -> Void)?

    override init() {
        self.updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
        self.updater = updaterController.updater

        super.init()

        self.updater.delegate = self
    }

    func checkForUpdates() {
        logger.info("checking for updates...")
        updater.checkForUpdates(nil)
    }

    func checkForUpdatesInBackground() {
        logger.info("checking for updates in background...")
        updater.checkForUpdatesInBackground()
    }

    var automaticallyChecksForUpdates: Bool {
        get { updater.automaticallyChecksForUpdates }
        set { updater.automaticallyChecksForUpdates = newValue }
    }

    var lastUpdateCheckDate: Date? {
        updater.lastUpdateCheckDate
    }

    // MARK: - SPUUpdaterDelegate

    nonisolated func updater(
        _ updater: SPUUpdater,
        didFindValidUpdate item: SUAppcastItem
    ) {
        Task { @MainActor in
            let version = item.displayVersionString
            let info = item.description ?? ""
            logger.info("found update: \(version)")
            onUpdateAvailable?(version, info)
        }
    }

    nonisolated func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        Task { @MainActor in
            logger.info("no updates available")
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        didFinishLoading update: SUAppcastItem
    ) {
        Task { @MainActor in
            logger.info("update downloaded: \(update.displayVersionString)")
            onUpdateDownloaded?(update.displayVersionString)
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        didAbortWithError error: any Error
    ) {
        Task { @MainActor in
            logger.error("update error: \(error.localizedDescription)")
            onError?(error.localizedDescription)
        }
    }
}
