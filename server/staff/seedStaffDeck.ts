/**
 * seedStaffDeck.ts
 *
 * 把 `scripts/seed-staffdeck-agents.mjs` 的 seed 能力移植进服务器运行时，
 * 使数字员工（精选 5 个：财务/法务/人事/IT/行政 + 仓库专员）及其完整资源图在软件服务器
 * 启动时自动写入主库 —— 不再需要手动跑脚本。
 *
 * 设计要点：
 *  - 复用 server 的 getDb()（即 AppPaths.chatDbFile 的同一连接），避免双开连接。
 *  - 幂等：所有插入用 INSERT OR IGNORE（按主键 id），可重复运行不重复。
 *  - fixture 路径优先从仓库根的 StaffDeck-main 读取；若打包后不存在则跳过（不致命）。
 *  - tenant_id / owner 统一改写为 default / default-user，与 seed 脚本一致。
 *  - 完成后把默认精选员工 status 置为 active（保证「随服务器启动即上线」）。
 *  - 全程非阻塞、异常被调用方吞掉，绝不拖垮主服务启动。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { logger } from '../logger.js';
import { getDb } from '../db-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TENANT_ID = 'default';
const OWNER_ID = 'default-user';
const OWNER_NAME = 'default-user';

// 默认本地 Ollama 模型配置 id：铁律要求「id 必须与 ollama tag 一致（用 llama3.1，非 ollama-llama3.1）」，
// 故 id 直接取 'llama3.1'（同时它也是 models.json 的 ollama 条目 id），使前端发来的 model 字段
// 能被 staffChatExecutor 在 models.json 中直接按 id 命中，避免落入 mock 兜底。
const DEFAULT_MODEL_CONFIG_ID = 'llama3.1';

/** seed 完成标记（防每次启动重复扫描 fixture），存于内存即可（进程级幂等已靠 INSERT OR IGNORE） */
let seededThisProcess = false;

/** 解析 fixture 路径：优先仓库根 StaffDeck-main；其次本模块上层回溯。 */
function resolveFixturePath(): string | null {
  const candidates = [
    resolve(__dirname, '../../StaffDeck-main/backend/app/db/seed_fixtures/staffdeck_admin_gallery_seed.json'),
    resolve(process.cwd(), 'StaffDeck-main/backend/app/db/seed_fixtures/staffdeck_admin_gallery_seed.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// fixture key -> 目标 sd_* 表（按外键依赖顺序，父表在前）
const TABLE_MAP: Array<[string, string]> = [
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

// 数字员工随服务器启动即「上线」：把库中所有已 seed 的员工统一置为 active。
// 不依赖 fixture 内部的具体 id（不同来源 seed 的 id 不固定）。
function toUnixSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value.trim());
    if (!Number.isNaN(t)) return Math.floor(t / 1000);
  }
  return null;
}

function normalizeMetadata(meta: unknown): Record<string, unknown> {
  const m: Record<string, unknown> = (meta && typeof meta === 'object' ? { ...(meta as object) } : {}) as Record<string, unknown>;
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

function buildRow(dbCols: string[], row: Record<string, any>, tableName: string): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
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

function migrateTable(db: Database.Database, fixtureKey: string, tableName: string, rows: any[]): number {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all().map((c: any) => c.name);
  if (cols.length === 0) {
    logger.warn(`[SeedStaffDeck] 表 ${tableName} 不存在，跳过 ${fixtureKey}`);
    return 0;
  }
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const entries = buildRow(cols, row, tableName);
      const colNames = entries.map(([c]) => `"${c}"`);
      const params = entries.map(([, v]) => v);
      if (!colNames.length) continue;
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO ${tableName} (${colNames.join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
      );
      const info = stmt.run(...params);
      if (info.changes > 0) inserted += 1;
    }
  });
  tx();
  logger.info(`[SeedStaffDeck] ${tableName} <- ${fixtureKey} ${inserted} 行`);
  return inserted;
}

function migrateKnowledgeBranches(db: Database.Database, data: any): number {
  const bindRows = data.agent_resource_bindings || [];
  const kbVersions = new Map<string, any[]>();
  for (const v of data.knowledge_base_versions || []) {
    const kbId = String(v.knowledge_base_id || '');
    if (!kbVersions.has(kbId)) kbVersions.set(kbId, []);
    kbVersions.get(kbId)!.push(v);
  }
  const resolveVersion = (kbId: string, agentId: string): string => {
    const versions = kbVersions.get(kbId) || [];
    for (const v of versions) {
      const meta = v.metadata_json;
      const owner = typeof meta === 'object' && meta ? (meta as any).owner_agent_id : undefined;
      if (owner === agentId) return String(v.version || '1.0.0');
    }
    for (const v of versions) {
      const ver = String(v.version || '');
      if (ver.startsWith(`branch.${agentId}.`)) return ver;
    }
    if (versions.length) return String(versions[0].version || '1.0.0');
    return '1.0.0';
  };

  const cols = db.prepare('PRAGMA table_info(sd_agent_knowledge_branches)').all().map((c: any) => c.name);
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
      if (!colNames.length) continue;
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO sd_agent_knowledge_branches (${colNames.join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
      );
      const info = stmt.run(...params);
      if (info.changes > 0) inserted += 1;
    }
  });
  tx();
  logger.info(`[SeedStaffDeck] sd_agent_knowledge_branches <- (派生自 bindings) ${inserted} 行`);
  return inserted;
}

/** 将所有已 seed 的数字员工 status 置为 active，保证「随服务器启动即上线」 */
function ensureDefaultAgentsActive(db: Database.Database): number {
  const info = db
    .prepare(`UPDATE sd_agent_profiles SET status = 'active', updated_at = strftime('%s','now') WHERE tenant_id = ? AND status != 'active'`)
    .run(TENANT_ID);
  return info.changes;
}

/**
 * 确保租户存在一条「本地 Ollama」模型配置（id = 'llama3.1'，与铁律及 models.json 对齐）。
 * 使数字员工对话闸门（前端 useChatSession.ensureModelAvailable）与后端模型解析都至少有一条
 * 可用配置，无需手动跑 scripts/seed-staffdeck-model-config.mjs。幂等：按固定 id INSERT OR IGNORE。
 *
 * 注意：本地模型无需 API Key（api_key_encrypted 传空串；该列 NOT NULL）。is_default=1 受
 * 部分唯一索引 uq_sd_model_configs_tenant_default 约束——若库中已存在其它 default 配置（如
 * 本机已初始化的 llama3.1 行），本 INSERT OR IGNORE 会因唯一索引冲突被静默忽略（0 写入），
 * 不影响既有配置；fresh install 时则写入正确的 llama3.1 默认配置。
 */
function ensureDefaultModelConfig(db: Database.Database): number {
  const existing = db.prepare('SELECT id FROM sd_model_configs WHERE id = ?').get(DEFAULT_MODEL_CONFIG_ID);
  if (existing) return 0;
  db.prepare(
    `INSERT OR IGNORE INTO sd_model_configs (
      id, tenant_id, name, provider, api_protocol, base_url, api_key_encrypted,
      model, temperature, max_output_tokens, trust_status, is_default, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    DEFAULT_MODEL_CONFIG_ID,
    TENANT_ID,
    'Llama 3.1 (本地 Ollama)',
    'ollama',
    'openai_chat_completions',
    'http://localhost:11434/v1',
    '', // 本地模型无需 API Key（api_key_encrypted NOT NULL，传空串）
    'llama3.1',
    0.2,
    4096,
    'legacy_trusted', // 本地模型视为可信，绕过验证门槛
    1, // is_default
    1, // enabled
  );
  return 1;
}

/**
 * 幂等插入一条「定时任务」样本，让定时调度能力从 0 变有数据、且能被 initScheduledTaskScheduler 真实注册。
 * 仅当 sd_scheduled_tasks 为空、且存在至少一个 active 员工时插入；绑定第一个 active 员工。
 * 任务为 daily 每日 09:00 触发一次员工「运营播报」，复用 runStaffChatTurn（含人格/SOP/RAG）。
 */
function ensureSampleScheduledTask(db: Database.Database): number {
  const existing = (db.prepare('SELECT COUNT(*) c FROM sd_scheduled_tasks').get() as { c: number }).c;
  if (existing > 0) return 0;
  const agent = db
    .prepare(`SELECT id FROM sd_agent_profiles WHERE tenant_id = ? AND status = 'active' ORDER BY is_overall DESC, updated_at DESC LIMIT 1`)
    .get(TENANT_ID) as { id: string } | undefined;
  if (!agent) return 0;
  const id = `stask-seed-${Date.now().toString(36)}`;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO sd_scheduled_tasks (
      id, tenant_id, agent_id, created_by_user_id, title, prompt, description,
      schedule_type, schedule_json, timezone, rrule, status,
      concurrency_policy, misfire_policy, max_runs, end_at, next_run_at,
      run_count, source_session_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    TENANT_ID,
    agent.id,
    'system-seed',
    '每日数字员工运营播报',
    '请基于你的角色设定与已绑定知识库，生成今日一份简洁的运营要点播报（不超过 200 字）。',
    '由系统自动播种的示例定时任务，用于验证调度链路；可在员工后台删除或编辑。',
    'daily',
    JSON.stringify({ hour: 9, minute: 0 }),
    'Asia/Shanghai',
    null,
    'active',
    'forbid',
    'coalesce',
    null,
    null,
    null,
    0,
    null,
    JSON.stringify({ seeded: true }),
  );
  // next_run_at 由调度器注册时计算；此处留 null 不影响（initScheduledTaskScheduler 会用 computeNextRunAt）
  void now;
  return 1;
}

/**
 * 幂等注入「仓库专员」数字员工（不依赖 fixture JSON，直接写入主库）。
 *
 * 背景：fixture（staffdeck_admin_gallery_seed.json）仅含 5 个精选员工（财务/法务/人事/IT/行政），
 * 仓储能力需要第 6 个「仓库专员」员工。为避免修改 3.9MB 单行 JSON fixture，此处通过固定 id
 * 的 INSERT OR IGNORE 直接注入，与 fixture 迁移幂等共存。
 */
function ensureWarehouseSpecialistAgent(db: Database.Database): number {
  const agentId = 'seed-agent-warehouse-specialist';
  const existing = db.prepare('SELECT id FROM sd_agent_profiles WHERE id = ?').get(agentId);
  if (existing) return 0;

  const metadata = normalizeMetadata({
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

  const personaPrompt = [
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
    agentId,
    TENANT_ID,
    '仓库专员',
    '负责入库收货、出库拣货、库存盘点、补货建议和仓储报表分析。',
    personaPrompt,
    0,
    'active',
    JSON.stringify(metadata),
  );
  return 1;
}

/**
 * 在服务器启动时调用：自动 seed 数字员工并把默认员工置为 active。
 * 非阻塞友好：任何异常都抛出，由调用方 try/catch 吞掉。
 */
export function seedStaffDeckOnBoot(): void {
  if (seededThisProcess) return;
  seededThisProcess = true;

  const fixturePath = resolveFixturePath();
  if (!fixturePath) {
    logger.warn('[SeedStaffDeck] 未找到 seed fixture（打包环境可能不含 StaffDeck-main），跳过自动 seed');
    return;
  }

  const db = getDb();
  let data: any;
  try {
    data = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  } catch (err) {
    logger.error('[SeedStaffDeck] 读取 fixture 失败:', err instanceof Error ? err.message : String(err));
    return;
  }

  try {
    let total = 0;
    for (const [fixtureKey, tableName] of TABLE_MAP) {
      const rows = data[fixtureKey] || [];
      if (!rows.length) continue;
      total += migrateTable(db, fixtureKey, tableName, rows);
    }
    total += migrateKnowledgeBranches(db, data);

    const warehouseAgent = ensureWarehouseSpecialistAgent(db);
    const activated = ensureDefaultAgentsActive(db);
    const sampleTask = ensureSampleScheduledTask(db);
    const modelConfig = ensureDefaultModelConfig(db);

    const agentCount = (db.prepare('SELECT COUNT(*) c FROM sd_agent_profiles').get() as { c: number }).c;
    logger.info(
      `[SeedStaffDeck] 自动 seed 完成：本次新写入 ${total} 行，仓库专员注入 ${warehouseAgent} 条，默认员工置 active ${activated} 个，示例定时任务 ${sampleTask} 条，默认模型配置 ${modelConfig} 条，当前库数字员工 ${agentCount} 个`,
    );
  } catch (err) {
    logger.error('[SeedStaffDeck] seed 执行失败:', err instanceof Error ? err.message : String(err));
  }
}
