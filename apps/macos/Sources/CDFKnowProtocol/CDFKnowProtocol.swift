import Foundation

public enum ControlTransport: String, Codable, Sendable {
    case direct
    case ssh
    case tailscale
    case local
}

public struct AnyCodable: Codable, @unchecked Sendable, Equatable {
    public let value: Any
    
    public init(_ value: Any) {
        self.value = value
    }
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            var result = [String: Any]()
            for (key, value) in dict {
                result[key] = value.value
            }
            self.value = result
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
        }
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            var result = [String: AnyCodable]()
            for (key, value) in dict {
                result[key] = AnyCodable(value)
            }
            try container.encode(result)
        default:
            throw EncodingError.invalidValue(value, EncodingError.Context(codingPath: [], debugDescription: "Unsupported type"))
        }
    }
    
    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        String(describing: lhs.value) == String(describing: rhs.value)
    }
}

public struct ControlAgentEvent: Codable, Sendable, Equatable {
    public let runId: String
    public let seq: Int
    public let stream: String
    public let ts: TimeInterval
    public let data: [String: AnyCodable]
    public let summary: String?
    
    public init(runId: String, seq: Int, stream: String, ts: TimeInterval, data: [String: AnyCodable], summary: String?) {
        self.runId = runId
        self.seq = seq
        self.stream = stream
        self.ts = ts
        self.data = data
        self.summary = summary
    }
}

public struct RemoteGatewayConfig: Codable, Sendable, Equatable {
    public let transport: ControlTransport
    public let remoteUrl: String
    public let remoteHost: String
    public let remoteTarget: String
    public let remoteIdentity: String
    public let remoteToken: String
    public let remoteTokenDirty: Bool
    
    public init(transport: ControlTransport, remoteUrl: String, remoteHost: String, remoteTarget: String, remoteIdentity: String, remoteToken: String, remoteTokenDirty: Bool) {
        self.transport = transport
        self.remoteUrl = remoteUrl
        self.remoteHost = remoteHost
        self.remoteTarget = remoteTarget
        self.remoteIdentity = remoteIdentity
        self.remoteToken = remoteToken
        self.remoteTokenDirty = remoteTokenDirty
    }
}