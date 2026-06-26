import AppKit
import Foundation
import CrossWMSIPC
import Logging

@main
struct CrossWMSApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let logger = Logger(label: "com.crosswms.app")

    private var mainWindowController: MainWindowController?
    private var nodeManager: NodeProcessManager?
    private var ipcServer: IPCServer?
    private var notificationManager = NotificationManager()
    private var updateManager: UpdateManager?

    private let appName = "CDF Know Clow"
    private let serverPort = 3001

    func applicationDidFinishLaunching(_ notification: Notification) {
        logger.info("application did finish launching")

        Task {
            await setup()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        logger.info("application will terminate")
        nodeManager?.stop()
        Task {
            await ipcServer?.stop()
        }
    }

    private func setup() async {
        let dataDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/CrossWMS")
            .path

        do {
            try FileManager.default.createDirectory(
                atPath: dataDir,
                withIntermediateDirectories: true
            )
        } catch {
            logger.error("failed to create data directory: \(error.localizedDescription)")
        }

        ipcServer = IPCServer()
        await ipcServer?.setRequestHandler { [weak self] request in
            await self?.handleIPCRequest(request) ?? Response(ok: false, message: "App not ready")
        }

        do {
            try await ipcServer?.start()
        } catch {
            logger.error("failed to start IPC server: \(error.localizedDescription)")
        }

        updateManager = UpdateManager()
        updateManager?.onUpdateAvailable = { version, info in
            Task { @MainActor in
                self.logger.info("update available: \(version)")
            }
        }

        await startNodeBackend(dataDir: dataDir)
        await startMainWindow()
    }

    private func startNodeBackend(dataDir: String) async {
        let nodePath = findNodePath()
        let scriptPath = findServerScriptPath()

        guard let nodePath = nodePath else {
            logger.error("node.js not found")
            return
        }

        guard let scriptPath = scriptPath else {
            logger.error("server script not found")
            return
        }

        logger.info("node path: \(nodePath)")
        logger.info("server script: \(scriptPath)")

        nodeManager = NodeProcessManager(
            port: serverPort,
            nodePath: nodePath,
            scriptPath: scriptPath,
            dataDir: dataDir
        )

        nodeManager?.onProcessExit = { [weak self] code in
            Task { @MainActor in
                guard let self = self else { return }
                if code != 0 {
                    self.logger.warning("node process exited unexpectedly with code \(code)")
                }
            }
        }

        do {
            try await nodeManager?.start()
            let ready = await nodeManager?.waitForReady(timeout: 30) ?? false
            if ready {
                logger.info("node backend is ready")
            } else {
                logger.warning("node backend may not be ready")
            }
        } catch {
            logger.error("failed to start node backend: \(error.localizedDescription)")
        }
    }

    private func startMainWindow() async {
        let frontendURL = URL(string: "http://localhost:\(serverPort)/")!

        let controller = MainWindowController(
            url: frontendURL,
            title: appName
        )

        controller.onWindowWillClose = { [weak self] in
            Task { @MainActor in
                NSApp.terminate(nil)
            }
        }

        self.mainWindowController = controller
        controller.showWindow(nil)
        controller.load()

        NSApp.activate(ignoringOtherApps: true)
    }

    private func handleIPCRequest(_ request: Request) async -> Response {
        switch request {
        case let .notify(title, body, sound, priority, _):
            let success = await notificationManager.send(
                title: title,
                body: body,
                sound: sound,
                priority: priority
            )
            return Response(ok: success, message: success ? "Notification sent" : "Notification failed")

        case let .playSound(name):
            SoundEffectPlayer.play(name)
            return Response(ok: true, message: "Sound played")

        case .status:
            let info: [String: String] = [
                "app": appName,
                "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0",
                "nodeRunning": nodeManager != nil ? "true" : "false",
            ]
            let data = try? JSONSerialization.data(withJSONObject: info)
            return Response(ok: true, payload: data)

        case .checkForUpdates:
            updateManager?.checkForUpdates()
            return Response(ok: true, message: "Update check initiated")

        case let .openURL(url):
            if let url = URL(string: url) {
                NSWorkspace.shared.open(url)
                return Response(ok: true)
            }
            return Response(ok: false, message: "Invalid URL")

        case .quit:
            Task { @MainActor in
                NSApp.terminate(nil)
            }
            return Response(ok: true, message: "Quitting...")
        }
    }

    private func findNodePath() -> String? {
        let candidates = [
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node",
        ]

        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }

        if let path = ProcessInfo.processInfo.environment["PATH"] {
            let paths = path.components(separatedBy: ":")
            for dir in paths {
                let nodePath = (dir as NSString).appendingPathComponent("node")
                if FileManager.default.isExecutableFile(atPath: nodePath) {
                    return nodePath
                }
            }
        }

        return nil
    }

    private func findServerScriptPath() -> String? {
        let bundlePath = Bundle.main.bundlePath
        let resourcePath = Bundle.main.resourcePath ?? bundlePath

        let candidates = [
            (resourcePath as NSString).appendingPathComponent("server_dist/index.cjs"),
            (resourcePath as NSString).appendingPathComponent("server/index.cjs"),
            (bundlePath as NSString).appendingPathComponent("Contents/Resources/server_dist/index.cjs"),
            (bundlePath as NSString).appendingPathComponent("Contents/Resources/server/index.cjs"),
        ]

        for path in candidates {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }

        return nil
    }
}
