import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(os.homedir(), '.crosswms', 'chat.db');

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
  toolCalls?: string;
}

let db: Database.Database | null = null;

export function initDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
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

export function getSessions(): Session[] {
  const db = initDb();
  return db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all() as Session[];
}

export function createSession(id: string, title: string, model: string, agentId?: string): Session {
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('INSERT INTO sessions (id, title, model, agentId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(
    id,
    title,
    model,
    agentId || null,
    now,
    now
  );
  return { id, title, model, agentId, createdAt: now, updatedAt: now };
}

export function getSessionMessages(sessionId: string): Message[] {
  const db = initDb();
  return db.prepare('SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC').all(sessionId) as Message[];
}

export function addMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string }): Message {
  const id = msg.id || uuidv4();
  const now = new Date().toISOString();
  const db = initDb();
  db.prepare('INSERT INTO messages (id, sessionId, role, content, model, timestamp, toolCalls) VALUES (?,?,?,?,?,?,?)').run(
    id,
    msg.sessionId,
    msg.role,
    msg.content,
    msg.model || null,
    now,
    msg.toolCalls || null
  );

  // 更新会话时间
  db.prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(now, msg.sessionId);
  return { ...msg, id, timestamp: now };
}

export function deleteSession(id: string): void {
  const db = initDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
