import Foundation

// MARK: - Capabilities

public enum Capability: String, Codable, CaseIterable, Sendable {
    case notifications
    case sound
}

// MARK: - Notification

public enum NotificationPriority: String, Codable, Sendable {
    case passive
    case active
    case timeSensitive
}

public enum NotificationDelivery: String, Codable, Sendable {
    case system
    case overlay
    case auto
}

// MARK: - Sound Effect

public enum SoundEffectType: String, Codable, CaseIterable, Sendable {
    case glass
    case ping
    case pop
    case basso
    case blow
    case bottle
    case frog
    case funk
    case hero
    case morse
    case purr
    case sosumi
    case submarine
    case tink
    case none
}

// MARK: - Requests

public enum Request: Sendable {
    case notify(
        title: String,
        body: String,
        sound: String?,
        priority: NotificationPriority?,
        delivery: NotificationDelivery?)
    case playSound(name: String)
    case status
    case checkForUpdates
    case openURL(url: String)
    case quit
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

// MARK: - Codable conformance for Request

extension Request: Codable {
    private enum CodingKeys: String, CodingKey {
        case type
        case title, body, sound, priority, delivery
        case name
        case url
    }

    private enum Kind: String, Codable {
        case notify
        case playSound
        case status
        case checkForUpdates
        case openURL
        case quit
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .notify(title, body, sound, priority, delivery):
            try container.encode(Kind.notify, forKey: .type)
            try container.encode(title, forKey: .title)
            try container.encode(body, forKey: .body)
            try container.encodeIfPresent(sound, forKey: .sound)
            try container.encodeIfPresent(priority, forKey: .priority)
            try container.encodeIfPresent(delivery, forKey: .delivery)

        case let .playSound(name):
            try container.encode(Kind.playSound, forKey: .type)
            try container.encode(name, forKey: .name)

        case .status:
            try container.encode(Kind.status, forKey: .type)

        case .checkForUpdates:
            try container.encode(Kind.checkForUpdates, forKey: .type)

        case let .openURL(url):
            try container.encode(Kind.openURL, forKey: .type)
            try container.encode(url, forKey: .url)

        case .quit:
            try container.encode(Kind.quit, forKey: .type)
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(Kind.self, forKey: .type)
        switch kind {
        case .notify:
            let title = try container.decode(String.self, forKey: .title)
            let body = try container.decode(String.self, forKey: .body)
            let sound = try container.decodeIfPresent(String.self, forKey: .sound)
            let priority = try container.decodeIfPresent(NotificationPriority.self, forKey: .priority)
            let delivery = try container.decodeIfPresent(NotificationDelivery.self, forKey: .delivery)
            self = .notify(title: title, body: body, sound: sound, priority: priority, delivery: delivery)

        case .playSound:
            let name = try container.decode(String.self, forKey: .name)
            self = .playSound(name: name)

        case .status:
            self = .status

        case .checkForUpdates:
            self = .checkForUpdates

        case .openURL:
            let url = try container.decode(String.self, forKey: .url)
            self = .openURL(url: url)

        case .quit:
            self = .quit
        }
    }
}

public let controlSocketPath: String = {
    let home = FileManager().homeDirectoryForCurrentUser
    return home
        .appendingPathComponent("Library/Application Support/CrossWMS/control.sock")
        .path
}()
