import type Database from 'better-sqlite3';

// ===================== Skill Tables =====================

export interface UserSkillRow {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  path: string;
  trigger: string | null;
  detail: string | null;
  tags: string | null;
  status: string;
  version: string | null;
  featured: number;
  shortcut: string | null;
  installedAt: number;
  promptTemplate: string | null;
  executionMode: string | null;
}

export interface BuiltinStatusPatchRow {
  skillId: string;
  status: string;
}

export function initSkillTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      category TEXT NOT NULL DEFAULT 'tool',
      path TEXT NOT NULL DEFAULT '',
      trigger TEXT,
      detail TEXT,
      tags TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','available','coming')),
      version TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      shortcut TEXT,
      installedAt INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      promptTemplate TEXT,
      executionMode TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_skills_status ON user_skills(status);
    CREATE INDEX IF NOT EXISTS idx_user_skills_category ON user_skills(category);

    CREATE TABLE IF NOT EXISTS builtin_status_patches (
      skillId TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('active','available','coming'))
    );

    CREATE TABLE IF NOT EXISTS skill_audits (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      skill_version TEXT NOT NULL,
      score INTEGER NOT NULL,
      level TEXT NOT NULL,
      report_json TEXT NOT NULL DEFAULT '{}',
      report_markdown TEXT NOT NULL DEFAULT '',
      triggered_by TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f'))
    );
    CREATE INDEX IF NOT EXISTS idx_skill_audits_skill_id ON skill_audits(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_audits_version ON skill_audits(skill_id, skill_version);
  `);
}
