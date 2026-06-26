import Foundation

// MARK: - Capabilities

public enum Capability: String, Codable, CaseIterable, Sendable {
    case notifications
    case sound
    case keychain
    case fileWatcher
    case embedding
    case database
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

// MARK: - Keychain

public struct KeychainItem: Codable, Sendable {
    public var service: String
    public var account: String
    public var value: String
    public var label: String?
    public var comment: String?

    public init(service: String, account: String, value: String, label: String? = nil, comment: String? = nil) {
        self.service = service
        self.account = account
        self.value = value
        self.label = label
        self.comment = comment
    }
}

// MARK: - File Watcher

public struct FileWatchEvent: Codable, Sendable {
    public var path: String
    public var flags: [String]
    public var itemID: UInt64?

    public init(path: String, flags: [String], itemID: UInt64? = nil) {
        self.path = path
        self.flags = flags
        self.itemID = itemID
    }
}

public struct FileWatchConfig: Codable, Sendable {
    public var paths: [String]
    public var watchID: String
    public var recursive: Bool
    public var latency: Double

    public init(paths: [String], watchID: String, recursive: Bool = true, latency: Double = 0.5) {
        self.paths = paths
        self.watchID = watchID
        self.recursive = recursive
        self.latency = latency
    }
}

// MARK: - Embedding

public struct EmbeddingRequest: Codable, Sendable {
    public var texts: [String]
    public var model: String?
    public var dimensions: Int?

    public init(texts: [String], model: String? = nil, dimensions: Int? = nil) {
        self.texts = texts
        self.model = model
        self.dimensions = dimensions
    }
}

public struct EmbeddingResult: Codable, Sendable {
    public var embeddings: [[Float]]
    public var model: String
    public var dimensions: Int

    public init(embeddings: [[Float]], model: String, dimensions: Int) {
        self.embeddings = embeddings
        self.model = model
        self.dimensions = dimensions
    }
}

// MARK: - Database

public struct DatabaseQuery: Codable, Sendable {
    public var dbName: String
    public var sql: String
    public var params: [String]?

    public init(dbName: String, sql: String, params: [String]? = nil) {
        self.dbName = dbName
        self.sql = sql
        self.params = params
    }
}

public struct DatabaseResult: Codable, Sendable {
    public var rows: [[String: String]]
    public var changes: Int?
    public var lastInsertRowID: Int64?

    public init(rows: [[String: String]], changes: Int? = nil, lastInsertRowID: Int64? = nil) {
        self.rows = rows
        self.changes = changes
        self.lastInsertRowID = lastInsertRowID
    }
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

    // MARK: Keychain
    case keychainSave(item: KeychainItem)
    case keychainLoad(service: String, account: String)
    case keychainDelete(service: String, account: String)
    case keychainList(service: String)

    // MARK: File Watcher
    case fileWatchStart(config: FileWatchConfig)
    case fileWatchStop(watchID: String)
    case fileWatchList

    // MARK: Embedding
    case embeddingCompute(request: EmbeddingRequest)

    // MARK: Database
    case databaseExecute(query: DatabaseQuery)
    case databaseQuery(query: DatabaseQuery)
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
    case fileChanged(event: FileWatchEvent)
    case custom(type: String, payload: Data?)
}

extension IPCEvent: Codable {
    private enum CodingKeys: String, CodingKey {
        case type
        case event
        case customType
        case payload
    }

    private enum Kind: String, Codable {
        case fileChanged
        case custom
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .fileChanged(event):
            try container.encode(Kind.fileChanged, forKey: .type)
            try container.encode(event, forKey: .event)
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
        case .fileChanged:
            let event = try container.decode(FileWatchEvent.self, forKey: .event)
            self = .fileChanged(event: event)
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
        case title, body, sound, priority, delivery
        case name
        case url
        case item
        case service, account
        case config
        case watchID
        case request
        case query
    }

    private enum Kind: String, Codable {
        case notify
        case playSound
        case status
        case checkForUpdates
        case openURL
        case quit
        case keychainSave
        case keychainLoad
        case keychainDelete
        case keychainList
        case fileWatchStart
        case fileWatchStop
        case fileWatchList
        case embeddingCompute
        case databaseExecute
        case databaseQuery
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

        case let .keychainSave(item):
            try container.encode(Kind.keychainSave, forKey: .type)
            try container.encode(item, forKey: .item)

        case let .keychainLoad(service, account):
            try container.encode(Kind.keychainLoad, forKey: .type)
            try container.encode(service, forKey: .service)
            try container.encode(account, forKey: .account)

        case let .keychainDelete(service, account):
            try container.encode(Kind.keychainDelete, forKey: .type)
            try container.encode(service, forKey: .service)
            try container.encode(account, forKey: .account)

        case let .keychainList(service):
            try container.encode(Kind.keychainList, forKey: .type)
            try container.encode(service, forKey: .service)

        case let .fileWatchStart(config):
            try container.encode(Kind.fileWatchStart, forKey: .type)
            try container.encode(config, forKey: .config)

        case let .fileWatchStop(watchID):
            try container.encode(Kind.fileWatchStop, forKey: .type)
            try container.encode(watchID, forKey: .watchID)

        case .fileWatchList:
            try container.encode(Kind.fileWatchList, forKey: .type)

        case let .embeddingCompute(request):
            try container.encode(Kind.embeddingCompute, forKey: .type)
            try container.encode(request, forKey: .request)

        case let .databaseExecute(query):
            try container.encode(Kind.databaseExecute, forKey: .type)
            try container.encode(query, forKey: .query)

        case let .databaseQuery(query):
            try container.encode(Kind.databaseQuery, forKey: .type)
            try container.encode(query, forKey: .query)
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

        case .keychainSave:
            let item = try container.decode(KeychainItem.self, forKey: .item)
            self = .keychainSave(item: item)

        case .keychainLoad:
            let service = try container.decode(String.self, forKey: .service)
            let account = try container.decode(String.self, forKey: .account)
            self = .keychainLoad(service: service, account: account)

        case .keychainDelete:
            let service = try container.decode(String.self, forKey: .service)
            let account = try container.decode(String.self, forKey: .account)
            self = .keychainDelete(service: service, account: account)

        case .keychainList:
            let service = try container.decode(String.self, forKey: .service)
            self = .keychainList(service: service)

        case .fileWatchStart:
            let config = try container.decode(FileWatchConfig.self, forKey: .config)
            self = .fileWatchStart(config: config)

        case .fileWatchStop:
            let watchID = try container.decode(String.self, forKey: .watchID)
            self = .fileWatchStop(watchID: watchID)

        case .fileWatchList:
            self = .fileWatchList

        case .embeddingCompute:
            let request = try container.decode(EmbeddingRequest.self, forKey: .request)
            self = .embeddingCompute(request: request)

        case .databaseExecute:
            let query = try container.decode(DatabaseQuery.self, forKey: .query)
            self = .databaseExecute(query: query)

        case .databaseQuery:
            let query = try container.decode(DatabaseQuery.self, forKey: .query)
            self = .databaseQuery(query: query)
        }
    }
}

public let controlSocketPath: String = {
    let home = FileManager().homeDirectoryForCurrentUser
    return home
        .appendingPathComponent("Library/Application Support/CrossWMS/control.sock")
        .path
}()
