import Foundation
import CDFKnowIPC
import Security
import UserNotifications
import Logging

@MainActor
struct NotificationManager {
    private let logger = Logger(label: "com.crosswms.notifications")

    private static let hasTimeSensitiveEntitlement: Bool = {
        guard let task = SecTaskCreateFromSelf(nil) else { return false }
        let key = "com.apple.developer.usernotifications.time-sensitive" as CFString
        guard let val = SecTaskCopyValueForEntitlement(task, key, nil) else { return false }
        return (val as? Bool) == true
    }()

    func send(
        title: String,
        body: String,
        sound: String?,
        priority: NotificationPriority? = nil
    ) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()

        if settings.authorizationStatus == .notDetermined {
            let granted = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            if granted != true {
                self.logger.warning("notification permission denied (request)")
                return false
            }
        } else if settings.authorizationStatus != .authorized {
            self.logger.warning("notification permission denied status=\(settings.authorizationStatus.rawValue)")
            return false
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body

        if let soundName = sound, !soundName.isEmpty {
            content.sound = UNNotificationSound(named: UNNotificationSoundName(soundName))
        } else {
            content.sound = .default
        }

        if let priority {
            switch priority {
            case .passive:
                content.interruptionLevel = .passive
            case .active:
                content.interruptionLevel = .active
            case .timeSensitive:
                if Self.hasTimeSensitiveEntitlement {
                    content.interruptionLevel = .timeSensitive
                } else {
                    self.logger.debug(
                        "time-sensitive notification requested without entitlement; falling back to active")
                    content.interruptionLevel = .active
                }
            }
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        do {
            try await center.add(request)
            self.logger.debug("notification queued")
            return true
        } catch {
            self.logger.error("notification send failed: \(error.localizedDescription)")
            return false
        }
    }
}
