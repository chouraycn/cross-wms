import Foundation
import CDFKnowProtocol

public final class AgentEventStore: @unchecked Sendable {
    private(set) public var events: [ControlAgentEvent] = []
    private let maxEvents = 400
    
    public init() {}
    
    public func append(_ event: ControlAgentEvent) {
        events.append(event)
        if events.count > maxEvents {
            events.removeFirst(events.count - maxEvents)
        }
    }
    
    public func clear() {
        events.removeAll()
    }
}

public final class AppState: @unchecked Sendable {
    public init() {}
    
    public static func _testUpdatedRemoteGatewayConfig(current: [String: Any], draft: RemoteGatewayConfig) -> [String: Any] {
        var result = current
        if !draft.remoteToken.trimmingCharacters(in: .whitespaces).isEmpty {
            result["token"] = draft.remoteToken.trimmingCharacters(in: .whitespaces)
        } else {
            result.removeValue(forKey: "token")
        }
        return result
    }
}