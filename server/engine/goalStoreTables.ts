// Leaf module extracted from goalStore.ts to break db-core.ts ↔ goalStore.ts cycle (#26).
// initGoalTables only needs the Database handle passed in — it does not call getDb(),
// so it can live in a leaf module without importing db-core.ts.
import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

export function initGoalTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal (
      id TEXT PRIMARY KEY,
      sessionKey TEXT NOT NULL UNIQUE,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tokenBudget INTEGER,
      usedTokens INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_goal_sessionKey ON goal(sessionKey);
    CREATE INDEX IF NOT EXISTS idx_goal_status ON goal(status);
  `);
  logger.info('[GoalStore] goal 表已初始化');
}
