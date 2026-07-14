import Foundation

enum AppPaths {
    static var configDirectory: URL {
        let fm = FileManager.default
        let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("CDFKnowClow", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    static var configFile: URL {
        configDirectory.appendingPathComponent("config.json")
    }

    static var logDirectory: URL {
        let fm = FileManager.default
        let logs = fm.urls(for: .libraryDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Logs")
            .appendingPathComponent("CDFKnowClow", isDirectory: true)
        if !fm.fileExists(atPath: logs.path) {
            try? fm.createDirectory(at: logs, withIntermediateDirectories: true)
        }
        return logs
    }

    static var dataDirectory: URL {
        let dir = configDirectory.appendingPathComponent("data", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }
}

struct AppConfig: Codable {
    var serverPort: Int
    var autoStartServer: Bool
    var windowWidth: CGFloat
    var windowHeight: CGFloat
    var theme: String

    static var `default`: AppConfig {
        AppConfig(
            serverPort: ProcessInfo.processInfo.environment["PORT"].flatMap(Int.init) ?? 3001,
            autoStartServer: true,
            windowWidth: 1280,
            windowHeight: 800,
            theme: "system"
        )
    }
}

@MainActor
final class ConfigStore {
    static let shared = ConfigStore()

    private(set) var config: AppConfig = .default

    init() {
        load()
    }

    func load() {
        let fm = FileManager.default
        guard fm.fileExists(atPath: AppPaths.configFile.path) else {
            config = .default
            return
        }

        do {
            let data = try Data(contentsOf: AppPaths.configFile)
            config = try JSONDecoder().decode(AppConfig.self, from: data)
        } catch {
            logger.error("Failed to load config: \(error.localizedDescription, privacy: .public)")
            config = .default
        }
    }

    func save() {
        do {
            let data = try JSONEncoder().encode(config)
            try data.write(to: AppPaths.configFile, options: .atomic)
        } catch {
            logger.error("Failed to save config: \(error.localizedDescription, privacy: .public)")
        }
    }

    func update(_ updater: (inout AppConfig) -> Void) {
        updater(&config)
        save()
    }
}
