-- 004_add_marketplace_and_embedding_tables.sql
-- 技能市场与语义嵌入相关表：市场技能、已安装版本、嵌入向量、匹配反馈、匹配引擎配置、技能评价

-- 市场技能缓存表
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

-- 已安装技能版本追踪表
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

-- 技能嵌入向量表
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

-- 匹配反馈表
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

-- 匹配引擎配置表
CREATE TABLE IF NOT EXISTS match_engine_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 技能评价表
CREATE TABLE IF NOT EXISTS skill_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL,
  remote_id TEXT DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0,
  review_text TEXT DEFAULT '',
  reviewer TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
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
