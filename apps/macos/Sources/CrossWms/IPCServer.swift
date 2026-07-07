import Foundation
import CDFKnowIPC
import Logging

actor IPCServer {
    private let logger = Logger(label: "com.crosswms.ipc")
    private let socketPath: String
    private var listener: Int32?
    private var isRunning = false
    private var onRequest: ((Request) async -> Response)?

    private var eventClients: [Int32: EventClient] = [:]
    private let keychainManager = KeychainManager.shared
    private let fileWatcherManager = FileWatcherManager()
    private let embeddingManager = EmbeddingManager.shared
    private let databaseManager = DatabaseManager.shared

    private struct EventClient {
        let fd: Int32
    }

    init(socketPath: String = controlSocketPath) {
        self.socketPath = socketPath
    }

    func setRequestHandler(_ handler: @escaping (Request) async -> Response) {
        self.onRequest = handler
    }

    func start() async throws {
        try? FileManager.default.removeItem(atPath: socketPath)

        let sockfd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard sockfd >= 0 else {
            throw NSError(domain: "IPCServer", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create socket"])
        }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathArray = Array(socketPath.utf8)
        _ = pathArray.withUnsafeBufferPointer { ptr in
            memcpy(&addr.sun_path, ptr.baseAddress, min(pathArray.count, MemoryLayout.size(ofValue: addr.sun_path)))
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { saPtr in
                Darwin.bind(sockfd, saPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }

        guard bindResult >= 0 else {
            close(sockfd)
            throw NSError(domain: "IPCServer", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to bind socket: \(errno)"])
        }

        guard Darwin.listen(sockfd, 5) >= 0 else {
            close(sockfd)
            throw NSError(domain: "IPCServer", code: -3, userInfo: [NSLocalizedDescriptionKey: "Failed to listen on socket"])
        }

        self.listener = sockfd
        self.isRunning = true

        logger.info("IPC server listening at \(socketPath)")

        Task {
            await self.acceptLoop()
        }
    }

    func stop() {
        isRunning = false
        if let listener = listener {
            close(listener)
            self.listener = nil
        }
        for (fd, _) in eventClients {
            close(fd)
        }
        eventClients.removeAll()
        try? FileManager.default.removeItem(atPath: socketPath)
        logger.info("IPC server stopped")
    }

    private func acceptLoop() async {
        guard let listener = listener else { return }

        while isRunning {
            let clientFd = accept(listener, nil, nil)
            guard clientFd >= 0 else {
                if isRunning {
                    logger.error("accept failed: \(errno)")
                }
                continue
            }

            Task {
                await self.handleClient(clientFd)
            }
        }
    }

    private func handleClient(_ clientFd: Int32) async {
        defer {
            close(clientFd)
            eventClients.removeValue(forKey: clientFd)
        }
        logger.debug("client connected")

        var buffer = Data()
        let chunkSize = 4096

        while true {
            var chunk = Data(count: chunkSize)
            let bytesRead = chunk.withUnsafeMutableBytes { ptr in
                recv(clientFd, ptr.baseAddress, chunkSize, 0)
            }

            guard bytesRead > 0 else {
                break
            }

            buffer.append(chunk.prefix(bytesRead))

            while let newlineRange = buffer.firstRange(of: Data([0x0A])) {
                let lineData = buffer.subdata(in: buffer.startIndex..<newlineRange.lowerBound)
                buffer.removeSubrange(buffer.startIndex..<newlineRange.upperBound)

                if lineData.isEmpty { continue }

                do {
                    let request = try JSONDecoder().decode(Request.self, from: lineData)
                    let response = await handleRequest(request)
                    try sendResponse(clientFd, response: response)
                } catch {
                    logger.error("failed to decode request: \(error.localizedDescription)")
                    let errorResponse = Response(ok: false, message: "Invalid request: \(error.localizedDescription)")
                    try? sendResponse(clientFd, response: errorResponse)
                }
            }
        }

        logger.debug("client disconnected")
    }

    private func handleRequest(_ request: Request) async -> Response {
        switch request {
        case .notify, .playSound, .status, .checkForUpdates, .openURL, .quit, .openPermissionManager:
            guard let handler = onRequest else {
                return Response(ok: false, message: "No request handler")
            }
            return await handler(request)

        case .keychainSave(let item):
            let success = await keychainManager.save(
                service: item.service,
                account: item.account,
                value: item.value,
                label: item.label,
                comment: item.comment
            )
            return Response(ok: success, message: success ? "Saved" : "Failed to save")

        case .keychainLoad(let service, let account):
            if let value = await keychainManager.load(service: service, account: account) {
                let item = KeychainItem(service: service, account: account, value: value)
                if let payload = try? JSONEncoder().encode(item) {
                    return Response(ok: true, payload: payload)
                }
            }
            return Response(ok: false, message: "Not found")

        case .keychainDelete(let service, let account):
            let success = await keychainManager.delete(service: service, account: account)
            return Response(ok: success, message: success ? "Deleted" : "Failed to delete")

        case .keychainList(let service):
            let items = await keychainManager.list(service: service)
            if let payload = try? JSONEncoder().encode(items) {
                return Response(ok: true, payload: payload)
            }
            return Response(ok: false, message: "Failed to encode")

        case .fileWatchStart(let config):
            let success = await fileWatcherManager.startWatch(config: config) { [weak self] event in
                Task { [weak self] in
                    await self?.broadcastEvent(.fileChanged(event: event))
                }
            }
            return Response(ok: success, message: success ? "Watch started" : "Failed to start watch")

        case .fileWatchStop(let watchID):
            let success = await fileWatcherManager.stopWatch(watchID: watchID)
            return Response(ok: success, message: success ? "Watch stopped" : "Watch not found")

        case .fileWatchList:
            let watches = await fileWatcherManager.listWatches()
            if let payload = try? JSONEncoder().encode(watches) {
                return Response(ok: true, payload: payload)
            }
            return Response(ok: false, message: "Failed to encode")

        case .embeddingCompute(let request):
            let result = await embeddingManager.computeEmbeddings(
                texts: request.texts,
                model: request.model,
                dimensions: request.dimensions
            )
            if let payload = try? JSONEncoder().encode(result) {
                return Response(ok: true, payload: payload)
            }
            return Response(ok: false, message: "Failed to encode")

        case .databaseExecute(let query):
            let result = await databaseManager.execute(
                dbName: query.dbName,
                sql: query.sql,
                params: query.params
            )
            if let payload = try? JSONEncoder().encode(result) {
                return Response(ok: true, payload: payload)
            }
            return Response(ok: false, message: "Failed to encode")

        case .databaseQuery(let query):
            let result = await databaseManager.query(
                dbName: query.dbName,
                sql: query.sql,
                params: query.params
            )
            if let payload = try? JSONEncoder().encode(result) {
                return Response(ok: true, payload: payload)
            }
            return Response(ok: false, message: "Failed to encode")

        case .permissionCheck(let capabilities):
            let caps = capabilities?.compactMap { Capability(rawValue: $0) } ?? Capability.allCases
            let status = await PermissionManager.status(caps)
            var permStatus: [PermissionStatus] = []
            var allGranted = true
            for (cap, granted) in status {
                permStatus.append(PermissionStatus(capability: cap.rawValue, granted: granted))
                if !granted { allGranted = false }
            }
            let result = PermissionCheckResult(permissions: permStatus, allGranted: allGranted)
            if let payload = try? JSONEncoder().encode(result) {
                return Response(ok: true, payload: payload)
            }
            return Response(ok: false, message: "Failed to encode permission status")

        case .permissionRequest(let capability):
            guard let cap = Capability(rawValue: capability) else {
                return Response(ok: false, message: "Unknown capability: \(capability)")
            }
            let results = await PermissionManager.ensure([cap], interactive: true)
            if let granted = results[cap] {
                return Response(ok: granted, message: granted ? "Permission granted" : "Permission denied")
            }
            return Response(ok: false, message: "Failed to request permission")

        case .permissionOpenSettings(let capability):
            guard let cap = Capability(rawValue: capability) else {
                return Response(ok: false, message: "Unknown capability: \(capability)")
            }
            await MainActor.run {
                switch cap {
                case .notifications:
                    NotificationPermissionHelper.openSettings()
                case .microphone:
                    MicrophonePermissionHelper.openSettings()
                case .camera:
                    CameraPermissionHelper.openSettings()
                case .location:
                    LocationPermissionHelper.openSettings()
                default:
                    SystemSettingsURLSupport.openFirst([
                        "x-apple.systempreferences:com.apple.preference.security",
                    ])
                }
            }
            return Response(ok: true, message: "Opened settings")
        }
    }

    private func sendResponse(_ clientFd: Int32, response: Response) throws {
        let data = try JSONEncoder().encode(response)
        var dataWithNewline = data
        dataWithNewline.append(0x0A)

        let bytesSent = dataWithNewline.withUnsafeBytes { ptr in
            send(clientFd, ptr.baseAddress, dataWithNewline.count, 0)
        }

        if bytesSent < 0 {
            logger.error("failed to send response: \(errno)")
        }
    }

    private func broadcastEvent(_ event: IPCEvent) {
        guard let data = try? JSONEncoder().encode(event) else { return }
        var dataWithNewline = data
        dataWithNewline.append(0x0A)

        for (fd, _) in eventClients {
            dataWithNewline.withUnsafeBytes { ptr in
                _ = send(fd, ptr.baseAddress, dataWithNewline.count, 0)
            }
        }
    }

    func registerEventClient(_ fd: Int32) {
        eventClients[fd] = EventClient(fd: fd)
        logger.debug("Registered event client: \(fd)")
    }
}
