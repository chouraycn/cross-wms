"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = initDb;
exports.getSessions = getSessions;
exports.createSession = createSession;
exports.getSessionMessages = getSessionMessages;
exports.addMessage = addMessage;
exports.deleteSession = deleteSession;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const DB_PATH = path_1.default.join(os_1.default.homedir(), '.crosswms', 'chat.db');
let db = null;
function initDb() {
    if (db)
        return db;
    const dir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    db = new better_sqlite3_1.default(DB_PATH);
    db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      agentId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      timestamp TEXT NOT NULL,
      toolCalls TEXT,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
    return db;
}
function getSessions() {
    const db = initDb();
    return db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all();
}
function createSession(id, title, model, agentId) {
    const now = new Date().toISOString();
    const db = initDb();
    db.prepare('INSERT INTO sessions (id, title, model, agentId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(id, title, model, agentId || null, now, now);
    return { id, title, model, agentId, createdAt: now, updatedAt: now };
}
function getSessionMessages(sessionId) {
    const db = initDb();
    return db.prepare('SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC').all(sessionId);
}
function addMessage(msg) {
    const id = msg.id || (0, uuid_1.v4)();
    const now = new Date().toISOString();
    const db = initDb();
    db.prepare('INSERT INTO messages (id, sessionId, role, content, model, timestamp, toolCalls) VALUES (?,?,?,?,?,?,?)').run(id, msg.sessionId, msg.role, msg.content, msg.model || null, now, msg.toolCalls || null);
    // 更新会话时间
    db.prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(now, msg.sessionId);
    return { ...msg, id, timestamp: now };
}
function deleteSession(id) {
    const db = initDb();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
