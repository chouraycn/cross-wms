import Foundation
import Logging

@MainActor
final class NodeProcessManager {
    private let logger = Logger(label: "com.crosswms.node")
    private var process: Process?
    private var isRunning = false
    private var shutdownInProgress = false

    let port: Int
    let nodePath: String
    let scriptPath: String
    let dataDir: String

    var onProcessExit: ((Int32) -> Void)?

    init(port: Int = 3001, nodePath: String, scriptPath: String, dataDir: String) {
        self.port = port
        self.nodePath = nodePath
        self.scriptPath = scriptPath
        self.dataDir = dataDir
    }

    func start() async throws {
        guard !isRunning else { return }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: nodePath)
        proc.arguments = [scriptPath]

        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port)
        env["CDF_KNOW_CLOW_DATA_DIR"] = dataDir
        env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
        env["CROSSWMS_IPC_SOCKET"] = controlSocketPath
        proc.environment = env

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        proc.standardOutput = stdoutPipe
        proc.standardError = stderrPipe

        proc.terminationHandler = { [weak self] process in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isRunning = false
                self.logger.info("node process exited with code \(process.terminationStatus)")
                self.onProcessExit?(process.terminationStatus)
            }
        }

        try proc.run()
        self.process = proc
        self.isRunning = true

        logger.info("node process started (PID: \(proc.processIdentifier))")

        monitorOutput(stdoutPipe, isStdout: true)
        monitorOutput(stderrPipe, isStdout: false)
    }

    func stop() {
        shutdownInProgress = true
        guard let process = process, isRunning else { return }

        process.terminate()
        isRunning = false
        logger.info("node process stopped")
    }

    func waitForReady(timeout: TimeInterval = 30) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        let healthURL = URL(string: "http://localhost:\(port)/api/health")!

        while Date() < deadline {
            do {
                let (_, response) = try await URLSession.shared.data(from: healthURL)
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    logger.info("node server is ready")
                    return true
                }
            } catch {
                // Server not ready yet, wait and retry
            }

            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s
        }

        logger.warning("node server did not become ready within \(timeout)s")
        return false
    }

    private func monitorOutput(_ pipe: Pipe, isStdout: Bool) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty,
                  let line = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .newlines) else { return }

            Task { @MainActor [weak self] in
                if isStdout {
                    self?.logger.debug("node stdout: \(line)")
                } else {
                    self?.logger.debug("node stderr: \(line)")
                }
            }
        }
    }
}
