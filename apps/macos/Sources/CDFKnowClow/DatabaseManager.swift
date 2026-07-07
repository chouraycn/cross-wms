import Foundation
import OSLog
import CDFKnowIPC
import SQLite3

let dbLogger = Logger(subsystem: "com.cdf.knowclow", category: "database")

actor DatabaseManager {
    static let shared = DatabaseManager()

    private var connections: [String: OpaquePointer] = [:]

    private var databasesDirectory: URL {
        let fm = FileManager.default
        let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("CDFKnow/databases", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private init() {}

    func execute(dbName: String, sql: String, params: [String]?) -> DatabaseResult {
        guard let db = getOrOpenConnection(dbName: dbName) else {
            return DatabaseResult(rows: [], changes: 0, lastInsertRowID: 0)
        }

        var statement: OpaquePointer?
        let prepareResult = sqlite3_prepare_v2(db, sql, -1, &statement, nil)
        guard prepareResult == SQLITE_OK, let stmt = statement else {
            let errMsg = String(cString: sqlite3_errmsg(db))
            dbLogger.error("Prepare failed for execute: \(errMsg, privacy: .public)")
            return DatabaseResult(rows: [], changes: 0, lastInsertRowID: 0)
        }
        defer { sqlite3_finalize(stmt) }

        bindParameters(stmt: stmt, params: params)

        let stepResult = sqlite3_step(stmt)
        if stepResult != SQLITE_DONE {
            let errMsg = String(cString: sqlite3_errmsg(db))
            dbLogger.error("Execute step failed: \(errMsg, privacy: .public)")
            return DatabaseResult(rows: [], changes: 0, lastInsertRowID: 0)
        }

        let changes = Int(sqlite3_changes(db))
        let lastInsertRowID = sqlite3_last_insert_rowid(db)

        dbLogger.debug("Execute done: changes=\(changes), lastID=\(lastInsertRowID)")
        return DatabaseResult(rows: [], changes: changes, lastInsertRowID: lastInsertRowID)
    }

    func query(dbName: String, sql: String, params: [String]?) -> DatabaseResult {
        guard let db = getOrOpenConnection(dbName: dbName) else {
            return DatabaseResult(rows: [])
        }

        var statement: OpaquePointer?
        let prepareResult = sqlite3_prepare_v2(db, sql, -1, &statement, nil)
        guard prepareResult == SQLITE_OK, let stmt = statement else {
            let errMsg = String(cString: sqlite3_errmsg(db))
            dbLogger.error("Prepare failed for query: \(errMsg, privacy: .public)")
            return DatabaseResult(rows: [])
        }
        defer { sqlite3_finalize(stmt) }

        bindParameters(stmt: stmt, params: params)

        var rows: [[String: String]] = []
        let columnCount = Int(sqlite3_column_count(stmt))

        var columnNames: [String] = []
        for i in 0..<columnCount {
            if let name = sqlite3_column_name(stmt, Int32(i)) {
                columnNames.append(String(cString: name))
            } else {
                columnNames.append("col_\(i)")
            }
        }

        while sqlite3_step(stmt) == SQLITE_ROW {
            var row: [String: String] = [:]
            for i in 0..<columnCount {
                let name = columnNames[i]
                if let text = sqlite3_column_text(stmt, Int32(i)) {
                    row[name] = String(cString: text)
                } else {
                    row[name] = ""
                }
            }
            rows.append(row)
        }

        dbLogger.debug("Query returned \(rows.count) rows")
        return DatabaseResult(rows: rows)
    }

    func close(dbName: String) -> Bool {
        guard let db = connections.removeValue(forKey: dbName) else {
            dbLogger.debug("Close: no open connection for \(dbName, privacy: .public)")
            return true
        }

        let result = sqlite3_close(db)
        if result == SQLITE_OK {
            dbLogger.info("Closed database: \(dbName, privacy: .public)")
            return true
        } else {
            dbLogger.error("Failed to close database \(dbName, privacy: .public): code=\(result)")
            return false
        }
    }

    private func getOrOpenConnection(dbName: String) -> OpaquePointer? {
        if let existing = connections[dbName] {
            return existing
        }

        let dbURL = databasesDirectory.appendingPathComponent("\(dbName).db")
        let dbPath = dbURL.path

        var db: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
        let openResult = sqlite3_open_v2(dbPath, &db, flags, nil)

        guard openResult == SQLITE_OK, let database = db else {
            dbLogger.error("Failed to open database \(dbName, privacy: .public): code=\(openResult)")
            if let database = db {
                sqlite3_close(database)
            }
            return nil
        }

        sqlite3_exec(database, "PRAGMA journal_mode=WAL;", nil, nil, nil)
        sqlite3_exec(database, "PRAGMA foreign_keys=ON;", nil, nil, nil)

        connections[dbName] = database
        dbLogger.info("Opened database: \(dbName, privacy: .public) at \(dbPath, privacy: .public)")
        return database
    }

    private func bindParameters(stmt: OpaquePointer, params: [String]?) {
        guard let params = params else { return }

        for (index, param) in params.enumerated() {
            let paramIndex = Int32(index + 1)
            let cString = strdup(param)
            sqlite3_bind_text(stmt, paramIndex, cString, -1, { ptr in
                free(ptr)
            })
        }
    }
}
