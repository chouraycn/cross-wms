// Leaf module extracted from webhookDao.ts to break db-core.ts ↔ webhookDao.ts cycle (#25).
// initWebhookTables only needs the Database handle passed in — it does not call getDb(),
// so it can live in a leaf module without importing db-core.ts.
import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

export function initWebhookTables(db: Database.Database): void {
  logger.info('[DB] 初始化 Webhook 表');

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      headers TEXT DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      triggered_at TEXT NOT NULL,
      completed_at TEXT DEFAULT NULL,
      duration INTEGER DEFAULT NULL,
      status_code INTEGER DEFAULT NULL,
      request_body TEXT NOT NULL,
      response_body TEXT DEFAULT NULL,
      error TEXT DEFAULT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_triggered_at ON webhook_logs(triggered_at);
  `);
}
