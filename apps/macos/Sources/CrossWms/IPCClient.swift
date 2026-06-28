import Foundation
import CrossWMSIPC

actor IPCClient {
    private let logger = Logger(label: "com.crosswms.ipc.client")
    private var socketFd: Int32 = -1
    private var isConnected = false
    private let socketPath = controlSocketPath

    func connect() async throws {
        guard socketFd < 0 else { return }

        socketFd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard socketFd >= 0 else {
            throw NSError(domain: "IPCClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create socket"])
        }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathArray = Array(socketPath.utf8)
        _ = pathArray.withUnsafeBufferPointer { ptr in
            memcpy(&addr.sun_path, ptr.baseAddress, min(pathArray.count, MemoryLayout.size(ofValue: addr.sun_path)))
        }

        let connectResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { saPtr in
                Darwin.connect(socketFd, saPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }

        guard connectResult >= 0 else {
            close(socketFd)
            socketFd = -1
            throw NSError(domain: "IPCClient", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to connect: \(errno)"])
        }

        isConnected = true
        logger.info("Connected to IPC server")
    }

    func disconnect() {
        guard socketFd >= 0 else { return }
        close(socketFd)
        socketFd = -1
        isConnected = false
        logger.info("Disconnected from IPC server")
    }

    func sendRequest(_ request: Request) async -> Response {
        guard socketFd >= 0, isConnected else {
            return Response(ok: false, message: "Not connected")
        }

        do {
            let data = try JSONEncoder().encode(request)
            var dataWithNewline = data
            dataWithNewline.append(0x0A)

            let bytesSent = dataWithNewline.withUnsafeBytes { ptr in
                send(socketFd, ptr.baseAddress, dataWithNewline.count, 0)
            }

            guard bytesSent > 0 else {
                return Response(ok: false, message: "Failed to send request")
            }

            return try await receiveResponse()
        } catch {
            logger.error("Request failed: \(error.localizedDescription)")
            return Response(ok: false, message: error.localizedDescription)
        }
    }

    func sendA2UIAction(_ action: A2UIAction) async -> A2UIResponse {
        let response = await sendRequest(.a2uiAction(action: action))
        if let payload = response.payload,
           let a2uiResponse = try? JSONDecoder().decode(A2UIResponse.self, from: payload) {
            return a2uiResponse
        }
        return A2UIResponse(ok: response.ok, error: response.message)
    }

    private func receiveResponse() async throws -> Response {
        var buffer = Data()
        let chunkSize = 4096

        while true {
            var chunk = Data(count: chunkSize)
            let bytesRead = chunk.withUnsafeMutableBytes { ptr in
                recv(socketFd, ptr.baseAddress, chunkSize, 0)
            }

            guard bytesRead > 0 else {
                if buffer.isEmpty {
                    throw NSError(domain: "IPCClient", code: -3, userInfo: [NSLocalizedDescriptionKey: "Connection closed"])
                }
                break
            }

            buffer.append(chunk.prefix(bytesRead))

            if let newlineRange = buffer.firstRange(of: Data([0x0A])) {
                let lineData = buffer.subdata(in: buffer.startIndex..<newlineRange.lowerBound)
                return try JSONDecoder().decode(Response.self, from: lineData)
            }
        }

        throw NSError(domain: "IPCClient", code: -4, userInfo: [NSLocalizedDescriptionKey: "No response received"])
    }
}
