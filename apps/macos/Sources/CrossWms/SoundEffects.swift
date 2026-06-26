import AppKit
import Foundation
import Logging

enum SoundEffectCatalog {
    static let systemOptions: [String] = {
        var names = Set(Self.discoveredSoundMap.keys).union(Self.fallbackNames)
        names.remove("Glass")
        let sorted = names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
        return ["Glass"] + sorted
    }()

    static func displayName(for raw: String) -> String {
        raw
    }

    static func url(for name: String) -> URL? {
        self.discoveredSoundMap[name]
    }

    private static let allowedExtensions: Set<String> = [
        "aif", "aiff", "caf", "wav", "m4a", "mp3",
    ]

    private static let fallbackNames: [String] = [
        "Glass",
        "Ping",
        "Pop",
        "Frog",
        "Submarine",
        "Funk",
        "Tink",
        "Basso",
        "Blow",
        "Bottle",
        "Hero",
        "Morse",
        "Purr",
        "Sosumi",
    ]

    private static let searchRoots: [URL] = [
        FileManager().homeDirectoryForCurrentUser.appendingPathComponent("Library/Sounds"),
        URL(fileURLWithPath: "/Library/Sounds"),
        URL(fileURLWithPath: "/System/Library/Sounds"),
    ]

    private static let discoveredSoundMap: [String: URL] = {
        var map: [String: URL] = [:]
        for root in Self.searchRoots {
            guard let contents = try? FileManager().contentsOfDirectory(
                at: root,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles])
            else { continue }

            for url in contents where Self.allowedExtensions.contains(url.pathExtension.lowercased()) {
                let name = url.deletingPathExtension().lastPathComponent
                if map[name] == nil {
                    map[name] = url
                }
            }
        }
        return map
    }()
}

@MainActor
enum SoundEffectPlayer {
    private static let logger = Logger(label: "com.crosswms.sound")
    private static var lastSound: NSSound?

    static func sound(named name: String) -> NSSound? {
        if let named = NSSound(named: NSSound.Name(name)) {
            return named
        }
        if let url = SoundEffectCatalog.url(for: name) {
            return NSSound(contentsOf: url, byReference: false)
        }
        return nil
    }

    static func play(_ name: String) {
        guard let sound = sound(named: name) else {
            logger.warning("sound not found: \(name)")
            return
        }
        self.lastSound = sound
        sound.stop()
        sound.play()
        logger.debug("playing sound: \(name)")
    }
}
