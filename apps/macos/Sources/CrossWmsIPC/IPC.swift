import Foundation

// MARK: - Capabilities

public enum Capability: String, Codable, CaseIterable, Sendable {
    case notifications
    case sound
    case keychain
    case fileWatcher
    case embedding
    case database
    case appleScript
    case accessibility
    case screenRecording
    case microphone
    case speechRecognition
    case camera
    case location
}

// MARK: - Window Commands

public enum WindowAction: String, Codable, Sendable {
    case close
    case minimize
    case maximize
}

// MARK: - Folder Picker

public struct FolderPickerResult: Codable, Sendable {
    public var path: String?

    public init(path: String?) {
        self.path = path
    }
}

// MARK: - Permission

public struct PermissionStatus: Codable, Sendable {
    public var capability: String
    public var granted: Bool

    public init(capability: String, granted: Bool) {
        self.capability = capability
        self.granted = granted
    }
}

public struct PermissionCheckResult: Codable, Sendable {
    public var permissions: [PermissionStatus]
    public var allGranted: Bool

    public init(permissions: [PermissionStatus], allGranted: Bool) {
        self.permissions = permissions
        self.allGranted = allGranted
    }
}

// MARK: - Requests

public enum Request: Sendable {
    case window(action: WindowAction)
    case openExternal(url: String)
    case pickFolder
}

// MARK: - Responses

public struct Response: Codable, Sendable {
    public var ok: Bool
    public var message: String?
    public var payload: Data?

    public init(ok: Bool, message: String? = nil, payload: Data? = nil) {
        self.ok = ok
        self.message = message
        self.payload = payload
    }
}

// MARK: - Event Stream (Server Push)

public enum IPCEvent: Sendable {
    case custom(type: String, payload: Data?)
}

extension IPCEvent: Codable {
    private enum CodingKeys: String, CodingKey {
        case type
        case customType
        case payload
    }

    private enum Kind: String, Codable {
        case custom
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .custom(type, payload):
            try container.encode(Kind.custom, forKey: .type)
            try container.encode(type, forKey: .customType)
            try container.encodeIfPresent(payload, forKey: .payload)
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(Kind.self, forKey: .type)
        switch kind {
        case .custom:
            let type = try container.decode(String.self, forKey: .customType)
            let payload = try container.decodeIfPresent(Data.self, forKey: .payload)
            self = .custom(type: type, payload: payload)
        }
    }
}

// MARK: - Codable conformance for Request

extension Request: Codable {
    private enum CodingKeys: String, CodingKey {
        case type
        case action
        case url
    }

    private enum Kind: String, Codable {
        case window
        case openExternal
        case pickFolder
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .window(action):
            try container.encode(Kind.window, forKey: .type)
            try container.encode(action, forKey: .action)

        case let .openExternal(url):
            try container.encode(Kind.openExternal, forKey: .type)
            try container.encode(url, forKey: .url)

        case .pickFolder:
            try container.encode(Kind.pickFolder, forKey: .type)
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(Kind.self, forKey: .type)
        switch kind {
        case .window:
            let action = try container.decode(WindowAction.self, forKey: .action)
            self = .window(action: action)

        case .openExternal:
            let url = try container.decode(String.self, forKey: .url)
            self = .openExternal(url: url)

        case .pickFolder:
            self = .pickFolder
        }
    }
}

public let controlSocketPath: String = {
    let home = FileManager().homeDirectoryForCurrentUser
    return home
        .appendingPathComponent("Library/Application Support/CDFKnow/control.sock")
        .path
}()
