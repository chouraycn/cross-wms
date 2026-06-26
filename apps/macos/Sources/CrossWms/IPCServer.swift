import Foundation
import CrossWMSIPC
import Logging

actor IPCServer {
    private let logger = Logger(label: "com.crosswms.ipc")
    private let socketPath: String
    private var listener: Int32?
    private var isRunning = false
    private var onRequest: ((Request) async -> Response)?

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
        defer { close(clientFd) }
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
        guard let handler = onRequest else {
            return Response(ok: false, message: "No request handler")
        }
        return await handler(request)
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
}
