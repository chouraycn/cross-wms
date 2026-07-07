import Foundation
import Security
import OSLog
import CDFKnowIPC

let keychainLogger = Logger(subsystem: "com.cdf.knowclow", category: "keychain")

actor KeychainManager {
    static let shared = KeychainManager()

    var useICloud: Bool = false

    private init() {}

    @discardableResult
    func save(service: String, account: String, value: String, label: String? = nil, comment: String? = nil) -> Bool {
        guard let data = value.data(using: .utf8) else {
            keychainLogger.error("Failed to convert value to data for service: \(service, privacy: .public), account: \(account, privacy: .public)")
            return false
        }

        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecValueData: data
        ]

        if let label {
            query[kSecAttrLabel] = label
        }
        if let comment {
            query[kSecAttrComment] = comment
        }
        if useICloud {
            query[kSecAttrSynchronizable] = kCFBooleanTrue
        }

        let status = SecItemAdd(query as CFDictionary, nil)

        if status == errSecDuplicateItem {
            var updateQuery: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
                kSecAttrAccount: account
            ]
            if useICloud {
                updateQuery[kSecAttrSynchronizable] = kCFBooleanTrue
            }

            var updateAttributes: [CFString: Any] = [
                kSecValueData: data
            ]
            if let label {
                updateAttributes[kSecAttrLabel] = label
            }
            if let comment {
                updateAttributes[kSecAttrComment] = comment
            }

            let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updateAttributes as CFDictionary)
            if updateStatus != errSecSuccess {
                keychainLogger.error("Failed to update keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public), status: \(updateStatus)")
                return false
            }
            keychainLogger.debug("Updated keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public)")
            return true
        }

        if status != errSecSuccess {
            keychainLogger.error("Failed to save keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public), status: \(status)")
            return false
        }

        keychainLogger.debug("Saved keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public)")
        return true
    }

    func load(service: String, account: String) -> String? {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: kCFBooleanTrue!,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        if useICloud {
            query[kSecAttrSynchronizable] = kCFBooleanTrue
        }

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status != errSecItemNotFound {
                keychainLogger.error("Failed to load keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public), status: \(status)")
            }
            return nil
        }

        guard let data = result as? Data else {
            keychainLogger.error("Failed to cast keychain result to Data for service: \(service, privacy: .public), account: \(account, privacy: .public)")
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func delete(service: String, account: String) -> Bool {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        if useICloud {
            query[kSecAttrSynchronizable] = kCFBooleanTrue
        }

        let status = SecItemDelete(query as CFDictionary)

        if status != errSecSuccess && status != errSecItemNotFound {
            keychainLogger.error("Failed to delete keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public), status: \(status)")
            return false
        }

        if status == errSecItemNotFound {
            keychainLogger.debug("Keychain item not found for delete, service: \(service, privacy: .public), account: \(account, privacy: .public)")
        } else {
            keychainLogger.debug("Deleted keychain item for service: \(service, privacy: .public), account: \(account, privacy: .public)")
        }

        return true
    }

    func list(service: String) -> [KeychainItem] {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecReturnAttributes: kCFBooleanTrue!,
            kSecReturnData: kCFBooleanTrue!,
            kSecMatchLimit: kSecMatchLimitAll
        ]
        if useICloud {
            query[kSecAttrSynchronizable] = kCFBooleanTrue
        }

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status != errSecItemNotFound {
                keychainLogger.error("Failed to list keychain items for service: \(service, privacy: .public), status: \(status)")
            }
            return []
        }

        guard let items = result as? [[CFString: Any]] else {
            keychainLogger.error("Failed to cast keychain list result for service: \(service, privacy: .public)")
            return []
        }

        return items.compactMap { dict in
            guard let account = dict[kSecAttrAccount] as? String,
                  let data = dict[kSecValueData] as? Data,
                  let value = String(data: data, encoding: .utf8) else {
                return nil
            }

            let label = dict[kSecAttrLabel] as? String
            let comment = dict[kSecAttrComment] as? String

            return KeychainItem(
                service: service,
                account: account,
                value: value,
                label: label,
                comment: comment
            )
        }
    }
}
