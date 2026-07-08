import Foundation
import OSLog

let serverLogger = Logger(subsystem: "com.cdf.knowclow", category: "server")

actor ServerProcessManager {
    enum Status: Equatable {
        case stopped
        case starting
        case running(pid: Int32)
        case failed(String)
    }

    private(set) var status: Status = .stopped
    private var process: Process?
    private var desiredActive = false
    private var restartFailCount = 0
    private let maxRestartFails = 3
    private let startTimeout: TimeInterval = 60

    private func serverPort() async -> Int {
        if let raw = ProcessInfo.processInfo.environment["CDF_SERVER_PORT"],
           let port = Int(raw), port > 0 {
            return port
        }
        return await MainActor.run { ConfigStore.shared.config.serverPort }
    }

    private func healthCheckURL(_ port: Int) -> String {
        "http://localhost:\(port)/api/health"
    }

    private var isAppBundle: Bool {
        Bundle.main.bundleURL.pathExtension == "app"
    }

    private var resourcesDir: String {
        if isAppBundle {
            return Bundle.main.bundleURL.appendingPathComponent("Contents/Resources").path
        }
        return FileManager.default.currentDirectoryPath
    }

    private var projectRoot: String {
        if let envPath = ProcessInfo.processInfo.environment["CDF_KNOW_CLOW_PROJECT_ROOT"] {
            return envPath
        }
        if isAppBundle {
            return resourcesDir
        }
        let fm = FileManager.default
        let current = fm.currentDirectoryPath
        if fm.fileExists(atPath: "\(current)/package.json") {
            return current
        }
        return (current as NSString).deletingLastPathComponent
    }

    private var nodePath: String {
        if let envNode = ProcessInfo.processInfo.environment["CDF_KNOW_CLOW_NODE"] {
            return envNode
        }

        let bundleNodePath = "\(resourcesDir)/node/bin/node"
        var searchPaths = [
            bundleNodePath,
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node",
            "\(ProcessInfo.processInfo.environment["HOME"] ?? "")/.nvm/versions/node/*/bin/node",
        ]

        let fm = FileManager.default
        for path in searchPaths {
            if fm.isExecutableFile(atPath: path) {
                return path
            }
        }

        if let path = findExecutableInPATH("node") {
            return path
        }

        return "node"
    }

    private var serverEntry: String {
        let bundlePath = Bundle.main.bundleURL.path
        let candidates = [
            "\(bundlePath)/Contents/Resources/server/index.cjs",
            "\(bundlePath)/Contents/Resources/server/index.js",
            "\(bundlePath)/Contents/Resources/server_dist/index.cjs",
            "\(resourcesDir)/server/index.cjs",
            "\(resourcesDir)/server/index.js",
            "\(projectRoot)/server/index.js",
            "\(projectRoot)/server/index.ts",
        ]

        let fm = FileManager.default
        for candidate in candidates {
            if fm.fileExists(atPath: candidate) {
                return candidate
            }
        }
        return "server/index.ts"
    }

    private func findExecutableInPATH(_ name: String) -> String? {
        let pathEnv = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin"
        let paths = pathEnv.split(separator: ":").map(String.init)
        let fm = FileManager.default

        for dir in paths {
            let candidate = (dir as NSString).appendingPathComponent(name)
            if fm.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        return nil
    }

    func start() async {
        guard !self.desiredActive else { return }
        self.desiredActive = true

        switch self.status {
        case .starting, .running:
            return
        case .stopped, .failed:
            break
        }

        self.status = .starting
        let port = await self.serverPort()
        serverLogger.info("Starting Node.js server (port=\(port))")

        await self.spawnServer(port: port)
    }

    func stop() async {
        self.desiredActive = false
        guard let proc = self.process else {
            self.status = .stopped
            return
        }

        serverLogger.info("Stopping Node.js server (pid=\(proc.processIdentifier))")
        proc.terminate()

        do {
            try await Task.sleep(nanoseconds: 2_000_000_000)
        } catch {}

        if proc.isRunning {
            proc.terminate()
        }

        self.process = nil
        self.status = .stopped
        self.restartFailCount = 0
    }

    private func spawnServer(port: Int) async {
        guard self.desiredActive else { return }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: self.nodePath)

        let entry = self.serverEntry
        if entry.hasSuffix(".ts") {
            proc.arguments = [
                "--max-old-space-size=512",
                "--import", "tsx",
                entry
            ]
        } else {
            // .cjs or .js — run directly
            proc.arguments = [
                "--max-old-space-size=512",
                entry
            ]
        }

        proc.currentDirectoryURL = URL(fileURLWithPath: self.projectRoot)

        var env = ProcessInfo.processInfo.environment
        env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
        env["NODE_ENV"] = isAppBundle ? "production" : "development"
        env["PORT"] = String(port)
        env["CDF_DATA_DIR"] = AppPaths.dataDirectory.path
        env["FRONTEND_DIR"] = "\(resourcesDir)/frontend_dist"

        let sharedNodeModules = "\(resourcesDir)/shared_node_modules"
        let fm = FileManager.default
        if fm.fileExists(atPath: sharedNodeModules) {
            if let existingNodePath = env["NODE_PATH"], !existingNodePath.isEmpty {
                env["NODE_PATH"] = "\(sharedNodeModules):\(existingNodePath)"
            } else {
                env["NODE_PATH"] = sharedNodeModules
            }
        }

        proc.environment = env

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe

        // 使用串行队列处理日志输出，避免主线程阻塞和日志累积
        let logQueue = DispatchQueue(label: "com.cdfknowclow.serverlog", qos: .utility)
        var logBuffer = ""
        let maxLogLineLength = 500

        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }

            logQueue.async {
                logBuffer += text
                // 逐行处理，避免单条日志过大
                while let newlineIndex = logBuffer.firstIndex(of: "\n") {
                    let line = String(logBuffer[..<newlineIndex])
                    logBuffer = String(logBuffer[logBuffer.index(after: newlineIndex)...])

                    // 跳过空行
                    guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }

                    // 截断过长的行，避免 OSLog 内存膨胀
                    let trimmed: String
                    if line.count > maxLogLineLength {
                        trimmed = String(line.prefix(maxLogLineLength)) + "..."
                    } else {
                        trimmed = line
                    }

                    // 只记录警告和错误级别的日志到系统日志
                    // 普通日志不写入 OSLog，避免内存累积
                    let lowercased = trimmed.lowercased()
                    if lowercased.contains("error") || lowercased.contains("fatal") || lowercased.contains("crash") {
                        serverLogger.error("\(trimmed, privacy: .public)")
                    } else if lowercased.contains("warn") {
                        serverLogger.warning("\(trimmed, privacy: .public)")
                    }
                    // info/debug 级别日志不写入 OSLog，避免内存压力
                }

                // 限制缓冲区大小，防止单行超长导致内存暴涨
                if logBuffer.count > 4096 {
                    logBuffer = String(logBuffer.suffix(1024))
                }
            }
        }

        proc.terminationHandler = { [weak self] process in
            guard let self else { return }
            Task {
                await self.handleProcessExit(process)
            }
        }

        do {
            try proc.run()
            self.process = proc
            serverLogger.info("Server process started (pid=\(proc.processIdentifier), entry=\(entry))")

            let ready = await self.waitForServerReady(port: port)
            if ready {
                self.status = .running(pid: proc.processIdentifier)
                self.restartFailCount = 0
                serverLogger.info("Server is ready on port \(port)")
            } else {
                self.status = .failed("Server failed to become ready")
                serverLogger.error("Server failed to become ready within \(self.startTimeout)s - first start may need more time for DB init")
            }
        } catch {
            self.status = .failed("Failed to start server: \(error.localizedDescription)")
            serverLogger.error("Failed to start server: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func handleProcessExit(_ proc: Process) async {
        serverLogger.warning("Server process exited (pid=\(proc.processIdentifier), exit=\(proc.terminationStatus))")

        guard self.desiredActive else {
            self.status = .stopped
            return
        }

        if self.restartFailCount >= self.maxRestartFails {
            self.status = .failed("Server crashed too many times (\(self.maxRestartFails))")
            serverLogger.error("Server crashed too many times, giving up")
            return
        }

        self.restartFailCount += 1
        serverLogger.warning("Restarting server (attempt \(self.restartFailCount)/\(self.maxRestartFails))")

        try? await Task.sleep(nanoseconds: 2_000_000_000)

        guard self.desiredActive else { return }
        let port = await self.serverPort()
        await self.spawnServer(port: port)
    }

    private func waitForServerReady(port: Int) async -> Bool {
        let deadline = Date().addingTimeInterval(self.startTimeout)
        while Date() < deadline {
            if !self.desiredActive { return false }
            if await self.checkHealth(port: port) {
                return true
            }
            do {
                try await Task.sleep(nanoseconds: 500_000_000)
            } catch {
                return false
            }
        }
        return false
    }

    private func checkHealth(port: Int) async -> Bool {
        guard let url = URL(string: self.healthCheckURL(port)) else { return false }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 2
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                return httpResponse.statusCode == 200
            }
            return false
        } catch {
            return false
        }
    }
}
