import Foundation
import Testing
@testable import CDFKnowIPC

@Suite("IPC - New Request Types Encoding/Decoding")
struct IPCNewTypesTests {

    // MARK: - Keychain Tests

    @Test("KeychainItem encodes and decodes correctly")
    func keychainItemRoundTrip() throws {
        let original = KeychainItem(
            service: "test-service",
            account: "test-account",
            value: "test-value",
            label: "Test Label",
            comment: "Test Comment"
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(KeychainItem.self, from: data)

        #expect(decoded.service == "test-service")
        #expect(decoded.account == "test-account")
        #expect(decoded.value == "test-value")
        #expect(decoded.label == "Test Label")
        #expect(decoded.comment == "Test Comment")
    }

    @Test("KeychainItem with optional nil values")
    func keychainItemWithNilOptionals() throws {
        let original = KeychainItem(
            service: "test-service",
            account: "test-account",
            value: "test-value"
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(KeychainItem.self, from: data)

        #expect(decoded.service == "test-service")
        #expect(decoded.account == "test-account")
        #expect(decoded.value == "test-value")
        #expect(decoded.label == nil)
        #expect(decoded.comment == nil)
    }

    @Test("KeychainSave request encodes and decodes correctly")
    func keychainSaveRequestRoundTrip() throws {
        let item = KeychainItem(
            service: "cdf-know-clow",
            account: "apikey:gpt-4",
            value: "sk-test123"
        )
        let original = Request.keychainSave(item: item)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .keychainSave(decodedItem):
            #expect(decodedItem.service == "cdf-know-clow")
            #expect(decodedItem.account == "apikey:gpt-4")
            #expect(decodedItem.value == "sk-test123")
        default:
            Issue.record("Expected keychainSave request")
        }
    }

    @Test("KeychainLoad request encodes and decodes correctly")
    func keychainLoadRequestRoundTrip() throws {
        let original = Request.keychainLoad(service: "test-service", account: "test-account")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .keychainLoad(service, account):
            #expect(service == "test-service")
            #expect(account == "test-account")
        default:
            Issue.record("Expected keychainLoad request")
        }
    }

    @Test("KeychainDelete request encodes and decodes correctly")
    func keychainDeleteRequestRoundTrip() throws {
        let original = Request.keychainDelete(service: "test-service", account: "test-account")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .keychainDelete(service, account):
            #expect(service == "test-service")
            #expect(account == "test-account")
        default:
            Issue.record("Expected keychainDelete request")
        }
    }

    @Test("KeychainList request encodes and decodes correctly")
    func keychainListRequestRoundTrip() throws {
        let original = Request.keychainList(service: "test-service")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .keychainList(service):
            #expect(service == "test-service")
        default:
            Issue.record("Expected keychainList request")
        }
    }

    // MARK: - File Watcher Tests

    @Test("FileWatchEvent encodes and decodes correctly")
    func fileWatchEventRoundTrip() throws {
        let original = FileWatchEvent(
            path: "/tmp/test.txt",
            flags: ["created", "modified"],
            itemID: 12345
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FileWatchEvent.self, from: data)

        #expect(decoded.path == "/tmp/test.txt")
        #expect(decoded.flags == ["created", "modified"])
        #expect(decoded.itemID == 12345)
    }

    @Test("FileWatchConfig encodes and decodes correctly")
    func fileWatchConfigRoundTrip() throws {
        let original = FileWatchConfig(
            paths: ["/tmp/dir1", "/tmp/dir2"],
            watchID: "test-watch",
            recursive: true,
            latency: 0.5
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FileWatchConfig.self, from: data)

        #expect(decoded.paths == ["/tmp/dir1", "/tmp/dir2"])
        #expect(decoded.watchID == "test-watch")
        #expect(decoded.recursive == true)
        #expect(decoded.latency == 0.5)
    }

    @Test("FileWatchStart request encodes and decodes correctly")
    func fileWatchStartRequestRoundTrip() throws {
        let config = FileWatchConfig(
            paths: ["/tmp/test"],
            watchID: "watch-1",
            recursive: false,
            latency: 1.0
        )
        let original = Request.fileWatchStart(config: config)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .fileWatchStart(decodedConfig):
            #expect(decodedConfig.watchID == "watch-1")
            #expect(decodedConfig.paths == ["/tmp/test"])
            #expect(decodedConfig.recursive == false)
            #expect(decodedConfig.latency == 1.0)
        default:
            Issue.record("Expected fileWatchStart request")
        }
    }

    @Test("FileWatchStop request encodes and decodes correctly")
    func fileWatchStopRequestRoundTrip() throws {
        let original = Request.fileWatchStop(watchID: "watch-1")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .fileWatchStop(watchID):
            #expect(watchID == "watch-1")
        default:
            Issue.record("Expected fileWatchStop request")
        }
    }

    @Test("FileWatchList request encodes and decodes correctly")
    func fileWatchListRequestRoundTrip() throws {
        let original = Request.fileWatchList

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case .fileWatchList:
            break
        default:
            Issue.record("Expected fileWatchList request")
        }
    }

    // MARK: - Embedding Tests

    @Test("EmbeddingRequest encodes and decodes correctly")
    func embeddingRequestRoundTrip() throws {
        let original = EmbeddingRequest(
            texts: ["hello world", "test text"],
            model: "text-embedding-3-small",
            dimensions: 1536
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(EmbeddingRequest.self, from: data)

        #expect(decoded.texts == ["hello world", "test text"])
        #expect(decoded.model == "text-embedding-3-small")
        #expect(decoded.dimensions == 1536)
    }

    @Test("EmbeddingResult encodes and decodes correctly")
    func embeddingResultRoundTrip() throws {
        let original = EmbeddingResult(
            embeddings: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
            model: "test-model",
            dimensions: 3
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(EmbeddingResult.self, from: data)

        #expect(decoded.embeddings == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        #expect(decoded.model == "test-model")
        #expect(decoded.dimensions == 3)
    }

    @Test("EmbeddingCompute request encodes and decodes correctly")
    func embeddingComputeRequestRoundTrip() throws {
        let request = EmbeddingRequest(
            texts: ["test"],
            model: nil,
            dimensions: nil
        )
        let original = Request.embeddingCompute(request: request)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .embeddingCompute(decodedRequest):
            #expect(decodedRequest.texts == ["test"])
            #expect(decodedRequest.model == nil)
            #expect(decodedRequest.dimensions == nil)
        default:
            Issue.record("Expected embeddingCompute request")
        }
    }

    // MARK: - Database Tests

    @Test("DatabaseQuery encodes and decodes correctly")
    func databaseQueryRoundTrip() throws {
        let original = DatabaseQuery(
            dbName: "testdb",
            sql: "SELECT * FROM users WHERE id = ?",
            params: ["1"]
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(DatabaseQuery.self, from: data)

        #expect(decoded.dbName == "testdb")
        #expect(decoded.sql == "SELECT * FROM users WHERE id = ?")
        #expect(decoded.params == ["1"])
    }

    @Test("DatabaseResult encodes and decodes correctly")
    func databaseResultRoundTrip() throws {
        let original = DatabaseResult(
            rows: [
                ["id": "1", "name": "Alice"],
                ["id": "2", "name": "Bob"]
            ],
            changes: 2,
            lastInsertRowID: 42
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(DatabaseResult.self, from: data)

        #expect(decoded.rows.count == 2)
        #expect(decoded.rows[0]["name"] == "Alice")
        #expect(decoded.changes == 2)
        #expect(decoded.lastInsertRowID == 42)
    }

    @Test("DatabaseExecute request encodes and decodes correctly")
    func databaseExecuteRequestRoundTrip() throws {
        let query = DatabaseQuery(
            dbName: "testdb",
            sql: "INSERT INTO users (name) VALUES (?)",
            params: ["Charlie"]
        )
        let original = Request.databaseExecute(query: query)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .databaseExecute(decodedQuery):
            #expect(decodedQuery.dbName == "testdb")
            #expect(decodedQuery.sql == "INSERT INTO users (name) VALUES (?)")
            #expect(decodedQuery.params == ["Charlie"])
        default:
            Issue.record("Expected databaseExecute request")
        }
    }

    @Test("DatabaseQuery request encodes and decodes correctly")
    func databaseQueryRequestRoundTrip() throws {
        let query = DatabaseQuery(
            dbName: "testdb",
            sql: "SELECT * FROM users",
            params: nil
        )
        let original = Request.databaseQuery(query: query)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .databaseQuery(decodedQuery):
            #expect(decodedQuery.dbName == "testdb")
            #expect(decodedQuery.sql == "SELECT * FROM users")
            #expect(decodedQuery.params == nil)
        default:
            Issue.record("Expected databaseQuery request")
        }
    }

    // MARK: - IPCEvent Tests

    @Test("IPCEvent fileChanged encodes and decodes correctly")
    func ipcEventFileChangedRoundTrip() throws {
        let event = FileWatchEvent(
            path: "/tmp/test.txt",
            flags: ["modified"],
            itemID: nil
        )
        let original = IPCEvent.fileChanged(event: event)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(IPCEvent.self, from: data)

        switch decoded {
        case let .fileChanged(decodedEvent):
            #expect(decodedEvent.path == "/tmp/test.txt")
            #expect(decodedEvent.flags == ["modified"])
        case .custom:
            Issue.record("Expected fileChanged event")
        }
    }

    @Test("IPCEvent custom encodes and decodes correctly")
    func ipcEventCustomRoundTrip() throws {
        let payloadData = "test payload".data(using: .utf8)
        let original = IPCEvent.custom(type: "test-event", payload: payloadData)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(IPCEvent.self, from: data)

        switch decoded {
        case let .custom(type, payload):
            #expect(type == "test-event")
            #expect(payload == payloadData)
        case .fileChanged:
            Issue.record("Expected custom event")
        }
    }

    // MARK: - Capability Tests

    @Test("New capabilities are codable")
    func newCapabilitiesCodable() throws {
        let newCapabilities: [Capability] = [.keychain, .fileWatcher, .embedding, .database]

        for cap in newCapabilities {
            let data = try JSONEncoder().encode(cap)
            let decoded = try JSONDecoder().decode(Capability.self, from: data)
            #expect(decoded == cap)
        }
    }

    @Test("All capability cases are present")
    func allCapabilityCases() {
        let allCases = Capability.allCases
        #expect(allCases.contains(.notifications))
        #expect(allCases.contains(.sound))
        #expect(allCases.contains(.keychain))
        #expect(allCases.contains(.fileWatcher))
        #expect(allCases.contains(.embedding))
        #expect(allCases.contains(.database))
        #expect(allCases.count == 6)
    }
}
