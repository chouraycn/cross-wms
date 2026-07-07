import Foundation
import Testing
@testable import CDFKnowIPC

@Suite("CDFKnowIPC - Request Encoding/Decoding")
struct CDFKnowIPCTests {

    // MARK: - Notify Request

    @Test("Notify request encodes and decodes correctly")
    func notifyRequestRoundTrip() throws {
        let original = Request.notify(
            title: "Test Title",
            body: "Test Body",
            sound: "ping",
            priority: .active,
            delivery: .system
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .notify(title, body, sound, priority, delivery):
            #expect(title == "Test Title")
            #expect(body == "Test Body")
            #expect(sound == "ping")
            #expect(priority == .active)
            #expect(delivery == .system)
        default:
            Issue.record("Expected notify request, got \(decoded)")
        }
    }

    @Test("Notify request with optional nil values")
    func notifyRequestWithNilOptionals() throws {
        let original = Request.notify(
            title: "Minimal",
            body: "Body",
            sound: nil,
            priority: nil,
            delivery: nil
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .notify(title, body, sound, priority, delivery):
            #expect(title == "Minimal")
            #expect(body == "Body")
            #expect(sound == nil)
            #expect(priority == nil)
            #expect(delivery == nil)
        default:
            Issue.record("Expected notify request")
        }
    }

    // MARK: - PlaySound Request

    @Test("PlaySound request encodes and decodes correctly")
    func playSoundRequestRoundTrip() throws {
        let original = Request.playSound(name: "glass")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .playSound(name):
            #expect(name == "glass")
        default:
            Issue.record("Expected playSound request")
        }
    }

    // MARK: - Status Request

    @Test("Status request encodes and decodes correctly")
    func statusRequestRoundTrip() throws {
        let original = Request.status

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case .status:
            break
        default:
            Issue.record("Expected status request")
        }
    }

    // MARK: - CheckForUpdates Request

    @Test("CheckForUpdates request encodes and decodes correctly")
    func checkForUpdatesRequestRoundTrip() throws {
        let original = Request.checkForUpdates

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case .checkForUpdates:
            break
        default:
            Issue.record("Expected checkForUpdates request")
        }
    }

    // MARK: - OpenURL Request

    @Test("OpenURL request encodes and decodes correctly")
    func openURLRequestRoundTrip() throws {
        let url = "https://example.com/path?query=1"
        let original = Request.openURL(url: url)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case let .openURL(decodedURL):
            #expect(decodedURL == url)
        default:
            Issue.record("Expected openURL request")
        }
    }

    // MARK: - Quit Request

    @Test("Quit request encodes and decodes correctly")
    func quitRequestRoundTrip() throws {
        let original = Request.quit

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Request.self, from: data)

        switch decoded {
        case .quit:
            break
        default:
            Issue.record("Expected quit request")
        }
    }

    // MARK: - Response

    @Test("Response with ok true encodes and decodes correctly")
    func responseOkRoundTrip() throws {
        let original = Response(ok: true, message: "Success")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Response.self, from: data)

        #expect(decoded.ok == true)
        #expect(decoded.message == "Success")
        #expect(decoded.payload == nil)
    }

    @Test("Response with ok false encodes and decodes correctly")
    func responseErrorRoundTrip() throws {
        let original = Response(ok: false, message: "Something went wrong")

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Response.self, from: data)

        #expect(decoded.ok == false)
        #expect(decoded.message == "Something went wrong")
    }

    @Test("Response with payload data encodes and decodes correctly")
    func responseWithPayloadRoundTrip() throws {
        let payloadData = "test payload".data(using: .utf8)!
        let original = Response(ok: true, message: nil, payload: payloadData)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Response.self, from: data)

        #expect(decoded.ok == true)
        #expect(decoded.payload == payloadData)
    }

    // MARK: - Enums

    @Test("NotificationPriority all cases are codable")
    func notificationPriorityCodable() throws {
        let priorities: [NotificationPriority] = [.passive, .active, .timeSensitive]

        for priority in priorities {
            let data = try JSONEncoder().encode(priority)
            let decoded = try JSONDecoder().decode(NotificationPriority.self, from: data)
            #expect(decoded == priority)
        }
    }

    @Test("NotificationDelivery all cases are codable")
    func notificationDeliveryCodable() throws {
        let deliveries: [NotificationDelivery] = [.system, .overlay, .auto]

        for delivery in deliveries {
            let data = try JSONEncoder().encode(delivery)
            let decoded = try JSONDecoder().decode(NotificationDelivery.self, from: data)
            #expect(decoded == delivery)
        }
    }

    @Test("SoundEffectType all cases are codable")
    func soundEffectTypeCodable() throws {
        for sound in SoundEffectType.allCases {
            let data = try JSONEncoder().encode(sound)
            let decoded = try JSONDecoder().decode(SoundEffectType.self, from: data)
            #expect(decoded == sound)
        }
    }

    @Test("Capability all cases are codable")
    func capabilityCodable() throws {
        for capability in Capability.allCases {
            let data = try JSONEncoder().encode(capability)
            let decoded = try JSONDecoder().decode(Capability.self, from: data)
            #expect(decoded == capability)
        }
    }

    // MARK: - Invalid JSON

    @Test("Decoding invalid type throws error")
    func decodingInvalidTypeThrows() {
        let invalidJSON = #"{"type": "invalidType"}"#.data(using: .utf8)!

        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(Request.self, from: invalidJSON)
        }
    }

    @Test("Decoding notify without title throws")
    func decodingNotifyWithoutTitleThrows() {
        let invalidJSON = #"{"type": "notify", "body": "body"}"#.data(using: .utf8)!

        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(Request.self, from: invalidJSON)
        }
    }

    // MARK: - Control Socket Path

    @Test("Control socket path is in Application Support")
    func controlSocketPathTest() {
        #expect(CDFKnowIPC.controlSocketPath.contains("Library/Application Support/CDFKnow/control.sock"))
        #expect(CDFKnowIPC.controlSocketPath.hasSuffix("control.sock"))
    }
}
