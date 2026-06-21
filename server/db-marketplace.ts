import type Database from 'better-sqlite3';
import { logger } from './logger.js';

// ============================================================================
// Marketplace & Embedding Interfaces
// ============================================================================

export interface MarketplaceSkillRow {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  sub_category: string;
  author: string;
  version: string;
  rating: number;
  download_count: number;
  tags: string;
  prompt_template: string;
  execution_mode: string;
  permissions: string;
  dependencies: string;
  detail: string;
  trigger: string;
  icon_url: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  cached_at: string;
  cache_expires_at: string;
}

export interface InstalledSkillVersionRow {
  id: string;
  skill_id: string;
  remote_id: string;
  installed_version: string;
  latest_version: string;
  auto_update: number;
  installed_at: string;
  updated_at: string;
}

export interface SkillEmbeddingRow {
  id: number;
  skill_id: string;
  content_hash: string;
  embedding: Buffer;
  model_name: string;
  dimensions: number;
  created_at: string;
  updated_at: string;
}

export interface MatchFeedbackRow {
  id: number;
  query: string;
  skill_id: string;
  match_mode: string;
  match_score: number;
  is_relevant: number;
  user_feedback: number | null;
  created_at: string;
}

export interface MatchEngineConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface SkillReviewRow {
  id: number;
  skill_id: string;
  remote_id: string;
  rating: number;
  review_text: string;
  reviewer: string;
  created_at: string;
}

// ============================================================================
// Marketplace & Embedding Tables Initialization
// ============================================================================

export function initMarketplaceTables(db: Database.Database): void {
  // v2.1: Marketplace & Embedding tables (migration 004)
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      category TEXT NOT NULL DEFAULT 'tool',
      sub_category TEXT DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      rating REAL NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      prompt_template TEXT DEFAULT '',
      execution_mode TEXT DEFAULT 'chat',
      permissions TEXT DEFAULT '[]',
      dependencies TEXT DEFAULT '[]',
      detail TEXT DEFAULT '',
      trigger TEXT DEFAULT '',
      icon_url TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      cache_expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS installed_skill_versions (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      remote_id TEXT DEFAULT '',
      installed_version TEXT NOT NULL DEFAULT '',
      latest_version TEXT NOT NULL DEFAULT '',
      auto_update INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, remote_id)
    );
    CREATE TABLE IF NOT EXISTS skill_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      embedding BLOB NOT NULL,
      model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      dimensions INTEGER NOT NULL DEFAULT 384,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, model_name)
    );
    CREATE TABLE IF NOT EXISTS match_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'hybrid',
      match_score REAL NOT NULL DEFAULT 0,
      is_relevant INTEGER NOT NULL DEFAULT 0,
      user_feedback INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS match_engine_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS skill_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      remote_id TEXT DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
      review_text TEXT DEFAULT '',
      reviewer TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_category ON marketplace_skills(category);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_author ON marketplace_skills(author);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_rating ON marketplace_skills(rating);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_downloads ON marketplace_skills(download_count);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_cache_expires ON marketplace_skills(cache_expires_at);
    CREATE INDEX IF NOT EXISTS idx_installed_skill_versions_skill_id ON installed_skill_versions(skill_id);
    CREATE INDEX IF NOT EXISTS idx_installed_skill_versions_remote_id ON installed_skill_versions(remote_id);
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_skill_id ON skill_embeddings(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_model ON skill_embeddings(model_name);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_skill_id ON match_feedback(skill_id);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_mode ON match_feedback(match_mode);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_created ON match_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_skill_id ON skill_reviews(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_remote_id ON skill_reviews(remote_id);
  `);

  // Initialize default match engine config if empty
  const configCount = db.prepare('SELECT COUNT(*) as cnt FROM match_engine_config').get() as { cnt: number };
  if (configCount.cnt === 0) {
    const now = new Date().toISOString();
    const defaults: Array<{ key: string; value: string }> = [
      { key: 'semantic_weight', value: '0.6' },
      { key: 'keyword_weight', value: '0.4' },
      { key: 'default_threshold', value: '0.3' },
      { key: 'default_top_k', value: '10' },
      { key: 'cache_ttl_ms', value: '300000' },
      { key: 'enable_feedback_learning', value: '1' },
      { key: 'context_window_size', value: '5' },
    ];
    const insertConfig = db.prepare(
      'INSERT OR IGNORE INTO match_engine_config (key, value, updated_at) VALUES (?, ?, ?)'
    );
    for (const { key, value } of defaults) {
      insertConfig.run(key, value, now);
    }
    logger.info('[Marketplace] 已初始化默认 match_engine_config');
  }
}
