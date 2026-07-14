import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';
import { AppPaths } from './config/appPaths.js';

import { initWmsTables } from './db-wms.js';
import { initChatTables } from './db-chat.js';
import { initAutomationTables } from './db-automation.js';
import { initMarketplaceTables } from './db-marketplace.js';
import { initProjectTables } from './db-project.js';
import { initPluginTables } from './db-plugin.js';
import { initSkillTables } from './db-skill.js';
import { initGoalTables } from './engine/goalStore.js';
import { initWebhookTables } from './dao/webhookDao.js';
import { initArchiveTables } from './engine/messageArchive.js';
import { initTaskMonitorTables } from './db-task-monitor.js';
import { initWorkboardTables } from './db-workboard.js';

import { SQLiteEngine } from './storage/SQLiteEngine.js';
import { FileStorage } from './storage/FileStorage.js';
import { migrateSessionsToJsonl } from './storage/migration.js';
import type { IStorageEngine } from './storage/StorageEngine.js';
import { configureSqliteConnectionPragmas } from './storage/sqliteWalMaintenance.js';
import type { SqliteWalMaintenance } from './storage/sqliteWalMaintenance.js';

export * from './db-wms.js';
export * from './db-chat.js';
export * from './db-automation.js';
export * from './db-marketplace.js';
export * from './db-project.js';
export * from './db-plugin.js';

// Legacy types used by dao/skills.ts (not tied to any SQL table)
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

// ===================== 老 builtin 技能迁入 user_skills =====================

interface BuiltinSkillJson {
  id: string;
  name: string;
  desc?: string;
  icon?: string;
  category?: string;
  path?: string;
  trigger?: string;
  detail?: string;
  tags?: string[];
  automationTaskType?: string;
  status?: string;
  version?: string;
  featured?: boolean;
  source?: string;
  executionMode?: string;
  promptTemplate?: string;
}

const BUILTIN_MIGRATION_KEY = 'builtin_skills_migrated_v1';

/** YAML 字符串最小转义：用双引号包裹并转义反斜杠/双引号/换行 */
function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** 由老 builtin 技能生成标准 SKILL.md 文本 */
function buildBuiltinSkillMd(skill: BuiltinSkillJson): string {
  const tags = Array.isArray(skill.tags) ? skill.tags : [];
  const lines: string[] = ['---'];
  lines.push(`name: ${yamlQuote(skill.name || skill.id)}`);
  lines.push(`description: ${yamlQuote(skill.desc || '')}`);
  if (skill.trigger) lines.push(`trigger: ${yamlQuote(skill.trigger)}`);
  if (skill.version) lines.push(`version: ${yamlQuote(skill.version)}`);
  lines.push(`category: ${yamlQuote(skill.category || 'tool')}`);
  lines.push(`icon: ${yamlQuote(skill.icon || 'Extension')}`);
  lines.push(`tags: ${JSON.stringify(tags)}`);
  if (skill.executionMode) lines.push(`executionMode: ${yamlQuote(skill.executionMode)}`);
  if (skill.automationTaskType) lines.push(`automationTaskType: ${yamlQuote(skill.automationTaskType)}`);
  lines.push('source: builtin');
  lines.push(`featured: ${skill.featured ? 'true' : 'false'}`);
  lines.push('---');
  lines.push('');
  lines.push(skill.promptTemplate || '');
  return lines.join('\n');
}

/** 在多个候选路径中寻找 shared/data/builtin-skills.json */
function resolveBuiltinSkillsJsonPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'shared/data/builtin-skills.json'),
    path.resolve(process.cwd(), '../shared/data/builtin-skills.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 把 shared/data/builtin-skills.json 中的老技能一次性迁入新 user_skills + SKILL.md
 * 幂等：通过 app_settings 中的 builtin_skills_migrated_v1 标记。
 */
function migrateBuiltinSkillsIntoUserSkills(db: Database.Database): void {
  // 确保 app_settings 表存在
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  // 已迁移则直接跳过
  const already = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(BUILTIN_MIGRATION_KEY) as { value: string } | undefined;
  if (already) {
    logger.info(`[MigrateBuiltin] 已迁移过（key=${BUILTIN_MIGRATION_KEY}），跳过`);
    return;
  }

  const jsonPath = resolveBuiltinSkillsJsonPath();
  if (!jsonPath) {
    // 没有 builtin 技能也要标记为已迁移，避免每次启动都尝试
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      BUILTIN_MIGRATION_KEY,
      JSON.stringify({ migratedAt: new Date().toISOString(), count: 0, note: 'builtin-skills.json not found' })
    );
    logger.info('[MigrateBuiltin] 找不到 shared/data/builtin-skills.json，已标记完成（0 个）');
    return;
  }

  let builtinSkills: BuiltinSkillJson[] = [];
  try {
    builtinSkills = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as BuiltinSkillJson[];
  } catch (e) {
    logger.warn(`[MigrateBuiltin] 解析 ${jsonPath} 失败:`, e);
    builtinSkills = [];
  }

  if (builtinSkills.length === 0) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      BUILTIN_MIGRATION_KEY,
      JSON.stringify({ migratedAt: new Date().toISOString(), count: 0, note: 'empty array' })
    );
    logger.info('[MigrateBuiltin] builtin-skills.json 为空，已标记完成');
    return;
  }

  // skills 根目录：尽量复用 AppPaths.skillsDir（避免硬编码）
  let skillsRoot: string;
  try {
    // 动态 require 避免循环依赖
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppPaths } = require('./config/appPaths.js') as { AppPaths: { skillsDir: string } };
    skillsRoot = AppPaths.skillsDir;
  } catch {
    skillsRoot = path.resolve(process.cwd(), 'skills');
  }
  if (!fs.existsSync(skillsRoot)) {
    fs.mkdirSync(skillsRoot, { recursive: true });
  }

  // 确保 user_skills 表存在
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
  `);

  const checkStmt = db.prepare('SELECT id FROM user_skills WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, installedAt, promptTemplate, executionMode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let inserted = 0;
  let skipped = 0;
  let filesWritten = 0;
  const errors: Array<{ id: string; message: string }> = [];

  for (const skill of builtinSkills) {
    try {
      // 1) 同步 SKILL.md 到磁盘（幂等：已存在则不覆盖）
      const skillDir = path.join(skillsRoot, skill.id);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }
      if (!fs.existsSync(skillMdPath)) {
        fs.writeFileSync(skillMdPath, buildBuiltinSkillMd(skill), 'utf-8');
        filesWritten++;
      }

      // 2) 写入 user_skills（已存在则跳过）
      const exists = checkStmt.get(skill.id) as { id: string } | undefined;
      if (exists) {
        skipped++;
      } else {
        insertStmt.run(
          skill.id,
          skill.name || skill.id,
          skill.desc || '',
          skill.icon || 'Extension',
          skill.category || 'tool',
          skill.path || '',
          skill.trigger || null,
          skill.detail || null,
          Array.isArray(skill.tags) ? JSON.stringify(skill.tags) : null,
          skill.status || 'active',
          skill.version || null,
          skill.featured ? 1 : 0,
          0, // installedAt=0 标记为"系统预装"
          skill.promptTemplate || null,
          skill.executionMode || null
        );
        inserted++;
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      errors.push({ id: skill.id, message: msg });
      logger.error(`[MigrateBuiltin] 迁入 ${skill.id} 失败:`, msg);
    }
  }

  // 标记完成
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    BUILTIN_MIGRATION_KEY,
    JSON.stringify({
      migratedAt: new Date().toISOString(),
      count: builtinSkills.length,
      inserted,
      skipped,
      filesWritten,
      errors: errors.length,
    })
  );

  logger.info(
    `[MigrateBuiltin] 完成 scanned=${builtinSkills.length} inserted=${inserted} skipped=${skipped} filesWritten=${filesWritten} errors=${errors.length}`
  );
}

// ===================== v2.11+: openclaw 通用技能 + 仓库顶层技能迁入 =====================

const OPENCLAW_MIGRATION_KEY = 'openclaw_skills_migrated_v2';
const OPENCLAW_SKILLS_DIR_REL = path.join('skills', '_imported', 'openclaw');
const REPO_SKILLS_DIR_REL = 'skills';

/**
 * 把仓库内 skills/ 和 skills/_imported/openclaw/ 下的 SKILL.md 一次性迁入
 * 生产 AppPaths.skillsDir/<id>/SKILL.md + user_skills 表。
 *
 * 幂等：通过 app_settings 中的 openclaw_skills_migrated_v2 标记；
 * 二次启动直接跳过整批导入。
 */
function migrateOpenclawSkillsIntoUserSkills(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  const already = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(OPENCLAW_MIGRATION_KEY) as { value: string } | undefined;
  if (already) {
    logger.info(`[MigrateOpenclaw] 已迁移过（key=${OPENCLAW_MIGRATION_KEY}），跳过`);
    return;
  }

  // 源：仓库的 skills/ 目录（包括顶层技能和 _imported/openclaw）
  // 兼容多路径：cwd/、cwd/../
  const candidates = [
    path.resolve(process.cwd(), REPO_SKILLS_DIR_REL),
    path.resolve(process.cwd(), '..', REPO_SKILLS_DIR_REL),
  ];
  let sourceDir: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) { sourceDir = p; break; }
  }

  if (!sourceDir) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      OPENCLAW_MIGRATION_KEY,
      JSON.stringify({ migratedAt: new Date().toISOString(), count: 0, note: 'skills dir not found' })
    );
    logger.info('[MigrateOpenclaw] 找不到 skills 目录，已标记完成');
    return;
  }

  // 目标：AppPaths.skillsDir/<id>/SKILL.md
  let skillsRoot: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppPaths } = require('./config/appPaths.js') as { AppPaths: { skillsDir: string } };
    skillsRoot = AppPaths.skillsDir;
  } catch {
    skillsRoot = path.resolve(process.cwd(), 'skills');
  }
  if (!fs.existsSync(skillsRoot)) fs.mkdirSync(skillsRoot, { recursive: true });

  // 确保 user_skills 表存在
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
  `);

  const checkStmt = db.prepare('SELECT id FROM user_skills WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, installedAt, promptTemplate, executionMode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let scanned = 0;
  let inserted = 0;
  let skipped = 0;
  let filesWritten = 0;
  const errors: Array<{ id: string; message: string }> = [];

  // 递归复制所有文件
  const copyDir = (src: string, dest: string): number => {
    let copied = 0;
    const items = fs.readdirSync(src, { withFileTypes: true });
    for (const item of items) {
      const srcPath = path.join(src, item.name);
      const destPath = path.join(dest, item.name);
      if (item.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        copied += copyDir(srcPath, destPath);
      } else {
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
          copied++;
        }
      }
    }
    return copied;
  };

  // 处理一个技能目录（全量复制 + 写入 user_skills）
  const processSkillDir = (skillId: string, srcDir: string) => {
    const skillMdSrc = path.join(srcDir, 'SKILL.md');
    const skillMdSrcLower = path.join(srcDir, 'skill.md');
    if (!fs.existsSync(skillMdSrc) && !fs.existsSync(skillMdSrcLower)) return;
    scanned++;
    try {
      const targetDir = path.join(skillsRoot, skillId);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const copiedFiles = copyDir(srcDir, targetDir);
      if (copiedFiles > 0) filesWritten++;

      const mdPath = fs.existsSync(skillMdSrc) ? skillMdSrc : skillMdSrcLower;
      const content = fs.readFileSync(mdPath, 'utf-8');
      const { frontmatter, body } = parseSkillMdLightweight(content);
      const exists = checkStmt.get(skillId) as { id: string } | undefined;
      if (exists) {
        skipped++;
      } else {
        insertStmt.run(
          skillId,
          frontmatter.name || skillId,
          frontmatter.description || '',
          frontmatter.icon || 'Extension',
          frontmatter.category || 'openclaw-imported',
          frontmatter.path || '',
          frontmatter.trigger || null,
          null,
          JSON.stringify(frontmatter.tags || []),
          frontmatter.status || 'available',
          frontmatter.version || '1.0.0',
          frontmatter.featured ? 1 : 0,
          Date.now(),
          body,
          frontmatter.executionMode || null
        );
        inserted++;
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      errors.push({ id: skillId, message: msg });
      logger.error(`[MigrateOpenclaw] 迁入 ${skillId} 失败:`, msg);
    }
  };

  // 1) 扫描顶层技能目录（hscode-assistant 等）
  const topEntries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === '_imported') continue;
    if (entry.name === '.archived') continue;
    processSkillDir(entry.name, path.join(sourceDir, entry.name));
  }

  // 2) 扫描 _imported/openclaw 子目录
  const openclawDir = path.join(sourceDir, '_imported', 'openclaw');
  if (fs.existsSync(openclawDir)) {
    const openclawEntries = fs.readdirSync(openclawDir, { withFileTypes: true });
    for (const entry of openclawEntries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      processSkillDir(entry.name, path.join(openclawDir, entry.name));
    }
  }

  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    OPENCLAW_MIGRATION_KEY,
    JSON.stringify({
      migratedAt: new Date().toISOString(),
      sourceDir,
      count: scanned,
      inserted,
      skipped,
      filesWritten,
      errors: errors.length,
    })
  );

  logger.info(
    `[MigrateOpenclaw] 完成 scanned=${scanned} inserted=${inserted} skipped=${skipped} filesWritten=${filesWritten} errors=${errors.length} (源=${sourceDir})`
  );
}

/**
 * 检测 SKILL.md 是否包含有效的 frontmatter
 */
function hasFrontmatter(content: string): boolean {
  return /^---\r?\n/.test(content.trimStart());
}

/**
 * 修复生产环境 skillsDir 下缺失 frontmatter 的 SKILL.md 文件。
 * 遍历源目录（openclaw/skills 和 skills/_imported/openclaw），
 * 如果目标文件的 SKILL.md 缺少 frontmatter，则从源目录重新复制。
 */
function repairSkillMdFrontmatter(): void {
  logger.info('[RepairSkillMd] 开始检查 frontmatter 完整性...');
  const skillsRoot = AppPaths.skillsDir;
  logger.info(`[RepairSkillMd] skillsDir = ${skillsRoot}`);
  if (!fs.existsSync(skillsRoot)) {
    logger.warn(`[RepairSkillMd] skillsDir 不存在，跳过: ${skillsRoot}`);
    return;
  }

  // 源目录候选（按优先级排序）
  const sourceCandidates = [
    path.resolve(process.cwd(), 'skills', '_imported', 'openclaw'),
    path.resolve(process.cwd(), 'openclaw', 'skills'),
    path.resolve(process.cwd(), 'skills'),
    path.resolve(process.cwd(), '..', 'openclaw', 'skills'),
  ];

  let repaired = 0;
  let skipped = 0;
  let errors = 0;

  const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const skillDir = path.join(skillsRoot, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const skillMdLowerPath = path.join(skillDir, 'skill.md');

    const targetMdPath = fs.existsSync(skillMdPath) ? skillMdPath : fs.existsSync(skillMdLowerPath) ? skillMdLowerPath : null;
    if (!targetMdPath) continue;

    try {
      const content = fs.readFileSync(targetMdPath, 'utf-8');
      if (hasFrontmatter(content)) {
        skipped++;
        continue; // frontmatter 完整，无需修复
      }

      // 缺少 frontmatter，尝试从源目录复制
      let sourceMdPath: string | null = null;
      for (const srcDir of sourceCandidates) {
        const candidate = path.join(srcDir, entry.name, 'SKILL.md');
        if (fs.existsSync(candidate)) {
          const srcContent = fs.readFileSync(candidate, 'utf-8');
          if (hasFrontmatter(srcContent)) {
            sourceMdPath = candidate;
            break;
          }
        }
      }

      if (sourceMdPath) {
        fs.copyFileSync(sourceMdPath, targetMdPath);
        repaired++;
        logger.info(`[RepairSkillMd] 修复 ${entry.name} frontmatter（源: ${sourceMdPath}）`);
      } else {
        skipped++;
      }
    } catch (e: any) {
      errors++;
      logger.warn(`[RepairSkillMd] 修复 ${entry.name} 失败:`, e?.message ?? String(e));
    }
  }

  if (repaired > 0 || errors > 0) {
    logger.info(`[RepairSkillMd] 完成 repaired=${repaired} skipped=${skipped} errors=${errors}`);
  }
}

/** 轻量 frontmatter 解析（不依赖 js-yaml，简单 key: value + tags JSON） */
function parseSkillMdLightweight(content: string): {
  frontmatter: Record<string, any>;
  body: string;
} {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const yamlBlock = m[1];
  const body = m[2];
  const fm: Record<string, any> = {};
  for (const line of yamlBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value: any = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value.startsWith('[') && value.endsWith(']')) {
      try { value = JSON.parse(value); } catch { /* ignore */ }
    }
    fm[key] = value;
  }
  return { frontmatter: fm, body };
}

const DB_PATH = AppPaths.chatDbFile;
const DB_BACKUP_PATH = AppPaths.chatDbFile + '.bak';
const DB_FIRST_RUN_MARKER = AppPaths.chatDbFile + '.initialized';

let db: Database.Database | null = null;
let walMaintenance: SqliteWalMaintenance | null = null;

/** v1.9.4: 检测是否首次启动（用于决定是否执行完整校验） */
function isFirstRun(): boolean {
  return !fs.existsSync(DB_FIRST_RUN_MARKER);
}

/** v1.9.4: 标记数据库已初始化完成 */
function markInitialized(): void {
  try {
    fs.writeFileSync(DB_FIRST_RUN_MARKER, new Date().toISOString());
    logger.info('[DB] 已标记数据库初始化完成');
  } catch (e) {
    logger.warn('[DB] 无法写入初始化标记:', e);
  }
}

/** v1.9.4: 备份数据库（异步执行，仅首次启动或间隔超过24小时才执行） */
function backupDatabase(): void {
  // 首次启动：必须备份
  // 后续启动：检查上次备份时间，超过24小时才备份
  const isFirst = isFirstRun();

  // 检查备份文件年龄
  let backupAgeMs = Infinity;
  if (fs.existsSync(DB_BACKUP_PATH)) {
    try {
      const stat = fs.statSync(DB_BACKUP_PATH);
      backupAgeMs = Date.now() - stat.mtimeMs;
    } catch (e) {
      logger.debug('[DB] 备份文件不存在或无法读取:', (e as Error).message);
    }
  }

  const shouldBackup = isFirst || backupAgeMs > 24 * 60 * 60 * 1000; // 24小时

  if (!shouldBackup) {
    logger.info('[DB] 跳过备份（上次备份不足24小时）');
    return;
  }

  // 异步执行备份，不阻塞启动
  setTimeout(() => {
    try {
      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
        logger.info('[DB] 数据库已备份到 chat.db.bak');
      }
    } catch (e) {
      logger.warn('[DB] 数据库备份失败:', e);
    }
  }, 2000);
}

/** v1.9.3: 从备份恢复数据库 */
function restoreDatabaseFromBackup(): boolean {
  try {
    // v2.3.3: 增强恢复逻辑 — 如果主 DB 文件损坏（0 字节）或 WAL 残留，从备份恢复
    if (fs.existsSync(DB_BACKUP_PATH)) {
      const mainExists = fs.existsSync(DB_PATH);
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';

      if (!mainExists) {
        // 主文件完全丢失，从备份恢复
        fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
        logger.info('[DB] 数据库已从备份恢复（主文件丢失）');
        return true;
      }

      // v2.3.3: WAL 崩溃残留检测 — 如果有 WAL 但没有 SHM，或 WAL 异常大
      if (fs.existsSync(walPath)) {
        const walSize = fs.statSync(walPath).size;
        const mainSize = fs.statSync(DB_PATH).size;
        // WAL 大于主 DB 的 50% 且没有 SHM → 可能是崩溃残留
        if (walSize > mainSize * 0.5 && !fs.existsSync(shmPath)) {
          logger.info('[DB] 检测到 WAL 崩溃残留，从备份恢复:', { walSize, mainSize });
          // 删除损坏的主文件和 WAL
          fs.unlinkSync(DB_PATH);
          fs.unlinkSync(walPath);
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 数据库已从备份恢复（WAL 崩溃残留）');
          return true;
        }
      }
    }
  } catch (e) {
    logger.warn('[DB] 从备份恢复失败:', e);
  }
  return false;
}

export function initDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // v1.9.3: 如果数据库文件丢失，尝试从备份恢复
  restoreDatabaseFromBackup();

  // v2.3.3: 启动前先做 WAL checkpoint，防止上次崩溃残留的 WAL 导致数据丢失
  if (fs.existsSync(DB_PATH)) {
    try {
      const tempDb = new Database(DB_PATH);
      tempDb.pragma('wal_checkpoint(TRUNCATE)');
      tempDb.close();
    } catch {
      logger.info('[DB] WAL checkpoint 失败，尝试恢复...');
      if (fs.existsSync(DB_BACKUP_PATH)) {
        try { fs.unlinkSync(DB_PATH); } catch {}
        try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
        try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
        try {
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 数据库已从备份恢复（WAL checkpoint 失败）');
        } catch (e: any) {
          logger.error('[DB] 从备份恢复失败:', e?.message ?? String(e));
        }
      }
    }
  }

  // v1.9.3: 如果数据库存在，先备份
  backupDatabase();

  try {
    db = new Database(DB_PATH);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    logger.error('[DB] 数据库初始化失败:', msg);
    if (/busy|locked|permission|cannot open/i.test(msg)) {
      logger.error('[DB] 数据库文件可能被其他进程占用或权限不足，请关闭所有可能访问 ~/.cdf-know-clow/chat.db 的程序');
      if (fs.existsSync(DB_BACKUP_PATH)) {
        try {
          fs.unlinkSync(DB_PATH);
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 已从备份恢复数据库，重试初始化...');
          db = new Database(DB_PATH);
        } catch (e2: any) {
          logger.error('[DB] 从备份恢复失败:', e2?.message ?? e2);
          throw e;
        }
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  // v2.10: 使用统一 PRAGMA 配置（WAL + foreign_keys + busy_timeout + cache_size + mmap_size）
  try {
    walMaintenance = configureSqliteConnectionPragmas(db, {
      profile: 'large',
      databaseLabel: 'chat.db',
      foreignKeys: true,
      busyTimeoutMs: 30_000,
      synchronous: 'NORMAL',
    });
  } catch {
    // readonly mode — fallback below
  }

  // v2.8.9: 检测数据库是否只读（macOS com.apple.provenance 安全限制）
  let isMemoryDb = false;
  try {
    db.pragma('wal_checkpoint(RESTART)');
  } catch {
    logger.warn('[DB] 数据库只读（可能是 macOS 安全限制），切换到内存数据库');
    try { db.close(); } catch {}
    db = new Database(':memory:');
    walMaintenance = configureSqliteConnectionPragmas(db, {
      profile: 'large',
      databaseLabel: 'chat.db:memory',
      foreignKeys: true,
      busyTimeoutMs: 30_000,
      synchronous: 'NORMAL',
      mmapSize: 0,
    });
    isMemoryDb = true;
    logger.info('[DB] 已切换到内存数据库（数据不会持久化）');
  }

  // v1.9.4: 完整性检查策略优化
  // - 首次启动：执行完整 integrity_check
  // - 后续启动：仅快速检查 WAL 残留 + quick_check
  // - 异常场景（WAL 残留、崩溃恢复）：完整检查
  const hasWalResidue = fs.existsSync(DB_PATH + '-wal');
  const isFirst = isFirstRun();
  const shouldFullCheck = isFirst || hasWalResidue || !fs.existsSync(DB_PATH);

  if (shouldFullCheck) {
    logger.info('[DB] 执行完整 integrity_check（首次启动或异常恢复）');
    try { db.pragma('wal_checkpoint(RESTART)'); } catch {
      logger.warn('[DB] WAL checkpoint 失败（可能是只读模式），跳过');
    }
    try {
      const integrityResult = db.pragma('integrity_check') as Array<{ integrity_check: string }> | string;
      let isOk = false;
      if (typeof integrityResult === 'string') {
        isOk = integrityResult === 'ok';
        if (!isOk) {
          logger.error('[DB] ❌ integrity_check 失败:', integrityResult);
        }
      } else if (Array.isArray(integrityResult) && integrityResult.length > 0) {
        const first = integrityResult[0]?.integrity_check;
        isOk = first === 'ok';
        if (!isOk) {
          logger.error('[DB] ❌ integrity_check 失败:', first);
        }
      }

      if (!isOk) {
        logger.warn('[ChatDB] 数据库完整性检查失败，尝试从 WAL 恢复...');
        db.pragma('wal_checkpoint(TRUNCATE)');
        const recheck = db.pragma('integrity_check') as Array<{ integrity_check: string }> | string;
        let recheckOk = false;
        if (typeof recheck === 'string') {
          recheckOk = recheck === 'ok';
        } else if (Array.isArray(recheck) && recheck.length > 0) {
          recheckOk = recheck[0]?.integrity_check === 'ok';
        }
        if (recheckOk) {
          logger.info('[DB] ✅ WAL 恶复成功，完整性检查通过');
        } else {
          logger.error('[ChatDB] 数据库无法恢复，需手动修复');
        }
      } else {
        logger.info('[DB] ✅ integrity_check 通过');
      }
    } catch (e) {
      logger.warn('[DB] integrity_check 异常:', e);
    }
  } else {
    // 后续正常启动：快速检查
    logger.info('[DB] 快速启动检查（非首次启动，无 WAL 残留）');
    try {
      // quick_check 比 integrity_check 快得多，仅检查关键结构
      const quickResult = db.pragma('quick_check') as Array<{ quick_check: string }> | string;
      let quickOk = false;
      if (typeof quickResult === 'string') {
        quickOk = quickResult === 'ok';
      } else if (Array.isArray(quickResult) && quickResult.length > 0) {
        quickOk = quickResult[0]?.quick_check === 'ok';
      }
      if (!quickOk) {
        logger.warn('[DB] quick_check 异常，降级为完整检查');
        // 降级为完整检查
        db.pragma('integrity_check');
      }
    } catch (e) {
      logger.warn('[DB] quick_check 异常:', e);
    }
  }

  // v2.10: 周期 checkpoint 已由 configureSqliteConnectionPragmas 内部定时器管理

  // Initialize all domain tables
  // v9.0: 从 SQLite 迁移会话到 JSONL（在重建表结构之前迁移，避免数据丢失）
  migrateSessionsToJsonl(db);
  initChatTables(db);
  initWmsTables(db);
  initAutomationTables(db);
  initMarketplaceTables(db);
  initProjectTables(db);
  initPluginTables(db);
  initSkillTables(db);
  initGoalTables(db);
  initWebhookTables(db);
  initArchiveTables(db);
  initTaskMonitorTables(db);
  initWorkboardTables(db);

  // v2.11+: 把 shared/data/builtin-skills.json 中的老技能一次性迁入新 user_skills + SKILL.md
  // 幂等：通过 app_settings 中的 builtin_skills_migrated_v1 标记。
  try {
    migrateBuiltinSkillsIntoUserSkills(db);
  } catch (e) {
    // 迁移失败不应该阻塞数据库初始化
    logger.warn('[DB] 老技能迁入失败（可忽略）:', e);
  }

  // v2.11+: 把仓库 skills/_imported/openclaw/*.json 风格的 SKILL.md 迁入 user_skills + 落盘到 home
  // 幂等：通过 app_settings 中的 openclaw_skills_migrated_v1 标记。
  try {
    migrateOpenclawSkillsIntoUserSkills(db);
  } catch (e) {
    logger.warn('[DB] openclaw 通用技能迁入失败（可忽略）:', e);
  }

  // v2.11+: 修复生产环境 skillsDir 下缺失 frontmatter 的 SKILL.md 文件
  // 某些场景下（如 syncSkillMdToDisk 覆盖），SKILL.md 可能丢失 frontmatter，
  // 这会导致 OpenClaw 元数据解析失败（requires/os 等字段为空）。
  try {
    repairSkillMdFrontmatter();
  } catch (e) {
    logger.warn('[DB] SKILL.md frontmatter 修复失败（可忽略）:', e);
  }

  // v1.9.4: 标记数据库已初始化完成（后续启动跳过完整检查）
  if (isFirst) {
    markInitialized();
  }

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    return initDb();
  }
  return db;
}

/** v2.10: 优雅关闭数据库（清理 WAL 定时器 + 最终 TRUNCATE checkpoint） */
export function closeDb(): void {
  // 先关闭 DatabaseManager 管理的连接（向量库等）
  try {
    const { DatabaseManager } = require('./storage/databaseManager.js') as { DatabaseManager: { closeAll: () => void } };
    DatabaseManager.closeAll();
  } catch { /* ignore */ }

  if (walMaintenance) {
    walMaintenance.close();
    walMaintenance = null;
    logger.info('[DB] WAL 维护已关闭，最终 checkpoint 完成');
  }
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }

}

// ===================== v2.9: Worker Thread Pool（异步 API） =====================

import { DbWorkerPool } from './dbWorkerPool.js';

let dbPool: DbWorkerPool | null = null;

/** 获取异步数据库连接池（用于高并发场景） */
export function getDbPool(): DbWorkerPool {
  if (!dbPool) {
    // v9.0: 确保 FileStorage 目录存在
    FileStorage.ensureDirectories();
    dbPool = new DbWorkerPool(DB_PATH);
    dbPool.init();
  }
  return dbPool;
}

/** 获取存储引擎实例（已废弃，使用 getDb() 获取原生 better-sqlite3 连接） */
export function getStorageEngine(): null {
  return null;
}

/** 获取 FileStorage 工具类 */
export function getFileStorage() { return FileStorage; }
