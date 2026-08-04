#!/usr/bin/env node
/**
 * seed-staffdeck-agents.mjs
 *
 * 把 StaffDeck-main 中已配置（精选）的数字员工迁移进 cross-wms。
 *
 * 数据源：StaffDeck-main/backend/app/db/seed_fixtures/staffdeck_admin_gallery_seed.json
 *   —— 该 fixture 仅含 5 个精选数字员工（财务/法务/人事/IT/行政）及其完整资源图：
 *      agent_profiles(5) / skills(15) / skill_versions(15) / general_skills(9) / tools(11)
 *      knowledge_bases(14) + 版本/文档/切片/概念/建议/任务 / agent_resource_bindings(49)
 *      agent_skill_branches(15) + versions(15)
 *
 * 目标库：cross-wms 主 SQLite（AppPaths.chatDbFile，默认 .dev-data/config/chat.db）
 *   写入所有 sd_* 表，tenant_id 统一改为 'default'，owner 改为 'default-user'。
 *
 * 幂等：所有插入用 INSERT OR IGNORE（按主键 id），可重复运行不重复。
 *
 * 用法：
 *   node scripts/seed-staffdeck-agents.mjs
 *   STAFF_DB_PATH=/path/to/chat.db node scripts/seed-staffdeck-agents.mjs
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const TENANT_ID = 'default';
const OWNER_ID = 'default-user';
const OWNER_NAME = 'default-user';

/**
 * 解析目标数据库路径。
 * 重要：cross-wms 运行时的真实数据库是 AppPaths.chatDbFile，在本机解析为
 *   ~/Library/Application Support/CDFKnowClow/chat.db
 * 而不是仓库内的 .dev-data/config/chat.db（那个是早期/其它配置下的遗留文件，通常无人使用）。
 * 因此默认优先选用 AppSupport 下的库；可用 STAFF_DB_PATH 强制指定。
 */
function resolveDbPath() {
  if (process.env.STAFF_DB_PATH) return process.env.STAFF_DB_PATH;
  const candidates = [
    resolve(process.env.HOME || process.env.USERPROFILE || '', 'Library/Application Support/CDFKnowClow/chat.db'),
    resolve(REPO_ROOT, '.dev-data/config/chat.db'),
  ];
  for (const c of candidates) {
    try {
      if (require('node:fs').existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

const DB_PATH = resolveDbPath();
const FIXTURE_PATH = resolve(
  REPO_ROOT,
  'StaffDeck-main/backend/app/db/seed_fixtures/staffdeck_admin_gallery_seed.json',
);

// fixture key -> 目标 sd_* 表（按外键依赖顺序，父表在前）
const TABLE_MAP = [
  ['agent_profiles', 'sd_agent_profiles'],
  ['skills', 'sd_skills'],
  ['skill_versions', 'sd_skill_versions'],
  ['general_skills', 'sd_general_skills'],
  ['tools', 'sd_tools'],
  ['knowledge_bases', 'sd_knowledge_bases'],
  ['knowledge_base_versions', 'sd_knowledge_base_versions'],
  ['knowledge_documents', 'sd_knowledge_documents'],
  ['knowledge_buckets', 'sd_knowledge_buckets'],
  ['knowledge_chunks', 'sd_knowledge_chunks'],
  ['knowledge_concepts', 'sd_knowledge_concepts'],
  ['knowledge_discovery_suggestions', 'sd_knowledge_discovery_suggestions'],
  ['knowledge_ingest_jobs', 'sd_knowledge_ingest_jobs'],
  ['agent_resource_bindings', 'sd_agent_resource_bindings'],
  ['agent_skill_branches', 'sd_agent_skill_branches'],
  ['agent_skill_branch_versions', 'sd_agent_skill_branch_versions'],
];

function toUnixSeconds(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value.trim());
    if (!Number.isNaN(t)) return Math.floor(t / 1000);
  }
  return null;
}

function normalizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') meta = {};
  const m = { ...meta };
  m.owner_user_id = OWNER_ID;
  m.owner_username = OWNER_NAME;
  m.owner_display_name = OWNER_NAME;
  m.created_by_user_id = OWNER_ID;
  m.created_by_username = OWNER_NAME;
  m.created_by = OWNER_NAME;
  m.created_by_display_name = OWNER_NAME;
  m.creator_name = OWNER_NAME;
  return m;
}

/**
 * 将 fixture 行转换为目标表的一组成对 [列名, 值]。
 * 关键约束处理：
 *  - created_at/updated_at 仅在源提供可解析时间时显式写入，否则省略（用 DB 默认值）
 *  - sd_knowledge_buckets.bucket_id 源缺失时回退为行 id（对齐 Python seed 行为）
 *  - 其余列为 null 时直接省略（避免对 NOT NULL+默认值 列显式写 null 触发约束）
 */
function buildRow(dbCols, row, tableName) {
  const entries = [];
  for (const col of dbCols) {
    if (col === 'created_at' || col === 'updated_at') {
      const u = toUnixSeconds(row[col]);
      if (u !== null) entries.push([col, u]);
      continue;
    }
    if (col === 'bucket_id' && tableName === 'sd_knowledge_buckets') {
      const v = row.bucket_id != null ? row.bucket_id : row.id;
      entries.push([col, v]);
      continue;
    }
    if (col === 'tenant_id') {
      entries.push([col, TENANT_ID]);
      continue;
    }
    const raw = row[col];
    if (raw === null || raw === undefined) continue; // 省略，交 DB 默认/NULL
    if (typeof raw === 'boolean') {
      entries.push([col, raw ? 1 : 0]);
      continue;
    }
    if (typeof raw === 'object') {
      entries.push([col, col === 'metadata_json' ? JSON.stringify(normalizeMetadata(raw)) : JSON.stringify(raw)]);
      continue;
    }
    entries.push([col, raw]);
  }
  return entries;
}

function migrateTable(db, fixtureKey, tableName, rows) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name);
  if (cols.length === 0) {
    console.warn(`  ! 表 ${tableName} 不存在，跳过 ${fixtureKey}`);
    return 0;
  }
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${tableName} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols
      .map(() => '?')
      .join(',')})`,
  );
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const entries = buildRow(cols, row, tableName);
      const colNames = entries.map(([c]) => `"${c}"`);
      const params = entries.map(([, v]) => v);
      // 动态构建语句（因 created_at/updated_at 等可能省略）
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO ${tableName} (${colNames.join(',')}) VALUES (${entries
          .map(() => '?')
          .join(',')})`,
      );
      const info = stmt.run(...params);
      if (info.changes > 0) inserted += 1;
    }
  });
  tx();
  console.log(`  ${tableName.padEnd(34)} <- ${fixtureKey.padEnd(32)} ${inserted} 行`);
  return inserted;
}

/** 从 agent_resource_bindings 的 knowledge_base 绑定派生 sd_agent_knowledge_branches */
function migrateKnowledgeBranches(db, data) {
  const bindRows = data.agent_resource_bindings || [];
  const kbVersions = new Map();
  for (const v of data.knowledge_base_versions || []) {
    const kbId = String(v.knowledge_base_id || '');
    if (!kbVersions.has(kbId)) kbVersions.set(kbId, []);
    kbVersions.get(kbId).push(v);
  }
  const resolveVersion = (kbId, agentId) => {
    const versions = kbVersions.get(kbId) || [];
    for (const v of versions) {
      const meta = v.metadata_json;
      const owner = typeof meta === 'object' && meta ? meta.owner_agent_id : undefined;
      if (owner === agentId) return String(v.version || '1.0.0');
    }
    for (const v of versions) {
      const ver = String(v.version || '');
      if (ver.startsWith(`branch.${agentId}.`)) return ver;
    }
    if (versions.length) return String(versions[0].version || '1.0.0');
    return '1.0.0';
  };

  const cols = db.prepare('PRAGMA table_info(sd_agent_knowledge_branches)').all().map((c) => c.name);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const b of bindRows) {
      if (String(b.resource_type) !== 'knowledge_base') continue;
      const agentId = String(b.agent_id || '');
      const kbId = String(b.resource_id || '');
      if (!agentId || !kbId) continue;
      const version = resolveVersion(kbId, agentId);
      const row = {
        id: `akb_${agentId}_${kbId}`,
        tenant_id: TENANT_ID,
        agent_id: agentId,
        knowledge_base_id: kbId,
        base_version: version,
        head_version: version,
        status: 'active',
        sync_state: 'synced',
        metadata_json: '{}',
      };
      const entries = buildRow(cols, row, 'sd_agent_knowledge_branches');
      const colNames = entries.map(([c]) => `"${c}"`);
      const params = entries.map(([, v]) => v);
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO sd_agent_knowledge_branches (${colNames.join(',')}) VALUES (${entries
          .map(() => '?')
          .join(',')})`,
      );
      const info = stmt.run(...params);
      if (info.changes > 0) inserted += 1;
    }
  });
  tx();
  console.log(`  ${'sd_agent_knowledge_branches'.padEnd(34)} <- (派生自 bindings)        ${inserted} 行`);
  return inserted;
}

function main() {
  console.log(`读取 fixture: ${FIXTURE_PATH}`);
  const data = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  console.log(`打开数据库:   ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 15000');

  let total = 0;
  for (const [fixtureKey, tableName] of TABLE_MAP) {
    const rows = data[fixtureKey] || [];
    if (!rows.length) {
      console.log(`  ${tableName.padEnd(34)} <- ${fixtureKey.padEnd(32)} (无数据，跳过)`);
      continue;
    }
    total += migrateTable(db, fixtureKey, tableName, rows);
  }
  total += migrateKnowledgeBranches(db, data);

  // 幂等注入仓库专员（不依赖 fixture JSON，直接写入主库）
  const warehouseAgentId = 'seed-agent-warehouse-specialist';
  const existingWarehouse = db.prepare('SELECT id FROM sd_agent_profiles WHERE id = ?').get(warehouseAgentId);
  if (!existingWarehouse) {
    const warehouseMetadata = normalizeMetadata({
      role_key: 'warehouse-specialist',
      role_name: '仓库专员',
      avatar_text: '仓',
      avatar_tone: 'amber',
      avatar_kind: 'preset',
      avatar_preset: 'warehouse-grid',
      onboarded_at: new Date().toISOString().slice(0, 10),
      work_styles: ['数据准确', '流程规范', '异常预警'],
      expertise_tags: ['入库管理', '出库管理', '库存盘点', '补货计划'],
      work_modes: ['收货上架', '拣货发运', '盘点核对'],
      published_to_gallery: true,
      gallery_published_by: 'admin',
      seed_source: 'cross-wms-warehouse-specialist',
      managed_by_seed: true,
    });
    const warehousePersona = [
      '你是「仓库专员」，由 CDFKnow 调度的企业数字员工，专注于仓储运营管理。',
      '',
      '核心职责：',
      '- 入库管理：收货验收、上架归位、入库单据核对',
      '- 出库管理：拣货发运、出库复核、物流跟踪',
      '- 库存盘点：库存核对、差异分析、账实相符',
      '- 补货计划：安全库存监控、补货建议、呆滞料预警',
      '',
      '工作风格：数据准确、流程规范、异常预警。',
      '',
      '回答要求：',
      '1. 涉及库存数据时优先核对，给出准确数字与单位',
      '2. 涉及流程时按 WMS 标准作业流程（SOP）分步骤说明',
      '3. 发现异常（库存差异、缺料、超期等）主动预警并给出建议',
      '4. 补货建议需结合安全库存、周转率、前置时间综合判断',
    ].join('\n');
    db.prepare(
      `INSERT OR IGNORE INTO sd_agent_profiles (
        id, tenant_id, name, description, persona_prompt, is_overall, status, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      warehouseAgentId,
      TENANT_ID,
      '仓库专员',
      '负责入库收货、出库拣货、库存盘点、补货建议和仓储报表分析。',
      warehousePersona,
      0,
      'active',
      JSON.stringify(warehouseMetadata),
    );
    total += 1;
    console.log('  仓库专员注入完成（seed-agent-warehouse-specialist）');
  }

  // 校验
  const agentCount = db.prepare('SELECT COUNT(*) c FROM sd_agent_profiles').get().c;
  const skillCount = db.prepare('SELECT COUNT(*) c FROM sd_skills').get().c;
  const kbCount = db.prepare('SELECT COUNT(*) c FROM sd_knowledge_bases').get().c;
  const bindCount = db.prepare('SELECT COUNT(*) c FROM sd_agent_resource_bindings').get().c;
  const akbCount = db.prepare('SELECT COUNT(*) c FROM sd_agent_knowledge_branches').get().c;
  const bucketCount = db.prepare('SELECT COUNT(*) c FROM sd_knowledge_buckets').get().c;
  db.close();

  console.log('\n========== 迁移完成 ==========');
  console.log(`本次新写入 ${total} 行（INSERT OR IGNORE 幂等，已存在的行不计）`);
  console.log(
    `当前库：数字员工 ${agentCount} / 技能 ${skillCount} / 知识库 ${kbCount} / 资源绑定 ${bindCount} / 知识分支 ${akbCount} / 知识桶 ${bucketCount}`,
  );
  if (agentCount !== 6) {
    console.warn(`⚠️  数字员工数量异常（预期 6，实际 ${agentCount}），请检查 fixture 与表结构`);
    process.exitCode = 2;
  }
}

main();
