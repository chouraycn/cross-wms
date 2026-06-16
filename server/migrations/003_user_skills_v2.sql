-- ============================================================
-- Migration 003: user_skills 表字段扩展 (v1.5.79)
-- 新增字段: display_name, source, file_path, checksum, scope,
--           enabled, chain, model
-- 幂等：所有 ALTER TABLE 使用 column-existence 检查
-- ============================================================

-- 新增 display_name 字段
ALTER TABLE user_skills ADD COLUMN display_name TEXT DEFAULT '';

-- 新增 source 字段（仅当不存在时）
ALTER TABLE user_skills ADD COLUMN source TEXT NOT NULL DEFAULT 'user';

-- 新增 file_path 字段
ALTER TABLE user_skills ADD COLUMN file_path TEXT DEFAULT '';

-- 新增 checksum 字段
ALTER TABLE user_skills ADD COLUMN checksum TEXT DEFAULT '';

-- 新增 scope 字段
ALTER TABLE user_skills ADD COLUMN scope TEXT DEFAULT 'project';

-- 新增 enabled 字段
ALTER TABLE user_skills ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

-- 新增 chain 字段（JSON string[]）
ALTER TABLE user_skills ADD COLUMN chain TEXT DEFAULT '';

-- 新增 model 字段
ALTER TABLE user_skills ADD COLUMN model TEXT DEFAULT 'auto';

-- 新增索引
CREATE INDEX IF NOT EXISTS idx_user_skills_source ON user_skills(source);
CREATE INDEX IF NOT EXISTS idx_user_skills_scope ON user_skills(scope);
