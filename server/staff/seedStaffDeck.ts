// @ts-nocheck
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

/** 解析 fixture 路径：优先仓库根 StaffDeck-main；其次打包后 Resources/seed_fixtures/。 */
function resolveFixturePath(): string | null {
  const candidates = [
    resolve(__dirname, '../../StaffDeck-main/backend/app/db/seed_fixtures/staffdeck_admin_gallery_seed.json'),
    resolve(__dirname, '../seed_fixtures/staffdeck_admin_gallery_seed.json'),
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
function toUnixSeconds(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value.trim());
    if (!Number.isNaN(t)) return Math.floor(t / 1000);
  }
  return null;
}

function normalizeMetadata(meta: any): Record<string, any> {
  const m: Record<string, any> = (meta && typeof meta === 'object' ? { ...(meta as object) } : {}) as Record<string, any>;
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

function buildRow(dbCols: string[], row: Record<string, any>, tableName: string): Array<[string, any]> {
  const entries: Array<[string, any]> = [];
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
 *
 * v2（2026-08-09）：将仓库专员设为默认员工（is_default_employee=true），并将 WMS 系统
 * 中「免仓伧」agent 的完整能力（SOUL persona + 6 项核心能力 + 7 个 SKILL.md 技能 SOP）
 * 整合为知识文档和技能定义注入到仓库专员名下，使其成为具备全链路仓储能力的默认数字员工。
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
    work_styles: ['数据准确', '流程规范', '异常预警', '全局视野', '效率至上'],
    expertise_tags: [
      '库存全景查询', '出入库分析', '调拨优化', '补货预测', '预警管理', '数据导出',
      '入库管理', '出库管理', '库存盘点', '仓储报表',
    ],
    work_modes: ['收货上架', '拣货发运', '盘点核对', '库存查询', '调拨优化', '报表分析'],
    published_to_gallery: true,
    gallery_published_by: 'admin',
    seed_source: 'cross-wms-warehouse-specialist',
    managed_by_seed: true,
    is_default_employee: true,
    system_prompt_summary: '仓储运营全链路管理：入库→库存→调拨→出库→盘点→补货→预警→报表',
  });

  // 整合免仓伧（SOUL_mian_cang_cang.md）完整 persona + WMS 专家/分析师能力
  const personaPrompt = [
    '你是「仓库专员」，CDF Know Clow 仓库管理系统的专业数字员工，由 CDFKnow 调度。',
    '你精通仓储管理的每一个环节：库存监控、出入库分析、调拨优化、补货预测、预警处理。',
    '你的核心使命：让仓库数据说话，让库存管理从容不迫。',
    '',
    '## 价值观',
    '1. 数据准确第一：所有结论必须基于实时库存数据，绝不猜测',
    '2. 主动预警：发现低库存、呆滞、临期等问题时立即提醒',
    '3. 效率至上：查询结果直接、actionable，不给冗余信息',
    '4. 全局视野：分析时考虑在途、调拨、多仓联动',
    '',
    '## 核心职责',
    '- 入库管理：收货验收、上架归位、入库单据核对、质检结果录入',
    '- 出库管理：拣货发运、出库复核、物流跟踪、波次创建与路径优化',
    '- 库存盘点：库存核对、差异分析、账实相符、ABC 分类与库龄分析',
    '- 补货计划：安全库存监控、补货建议、呆滞料预警、EMA 消耗预测',
    '- 调拨优化：多仓库存平衡、调拨路径推荐、在途跟踪',
    '- 预警管理：低库存、临期、呆滞库存的扫描与报告',
    '- 数据导出：库存报表、出入库明细的 CSV/Excel 导出',
    '',
    '## 禁区',
    '- 不执行未经确认的库存修改操作',
    '- 不猜测不存在的数据',
    '- 不给出与实时数据矛盾的结论',
    '- 不忽略在途库存对可用库存的影响',
    '',
    '## 回答要求',
    '1. 涉及库存数据时优先核对，给出准确数字与单位',
    '2. 涉及流程时按 WMS 标准作业流程（SOP）分步骤说明',
    '3. 发现异常（库存差异、缺料、超期等）主动预警并给出建议',
    '4. 补货建议需结合安全库存、周转率、前置时间综合判断',
    '5. 数据呈现用表格，趋势用简洁描述，使用仓储行业术语（SKU、批次、安全库存、周转率等）',
    '6. 分析时考虑在途库存、调拨在途对可用库存的影响',
  ].join('\n');

  db.prepare(
    `INSERT OR IGNORE INTO sd_agent_profiles (
      id, tenant_id, name, description, persona_prompt, is_overall, status, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    agentId,
    TENANT_ID,
    '仓库专员',
    '仓储运营全链路管理：入库收货、出库拣货、库存盘点、补货预测、调拨优化、预警管理、报表分析。',
    personaPrompt,
    0,
    'active',
    JSON.stringify(metadata),
  );

  // 注入 WMS 知识文档和技能
  ensureWarehouseKnowledgeAndSkills(db, agentId);

  return 1;
}

/**
 * 为仓库专员注入 WMS 知识文档和技能定义。
 *
 * 知识文档来源：skills/builtin-xxx 下的 SKILL.md（7 个仓库技能 SOP）+ 免仓伧 SOUL persona
 * 技能定义来源：shared/data/builtin-skills.json 中的仓库相关技能
 *
 * 幂等：所有插入用 INSERT OR IGNORE（按固定 id 前缀 whs-）。
 */
function ensureWarehouseKnowledgeAndSkills(db: Database.Database, agentId: string): void {
  const now = Math.floor(Date.now() / 1000);

  // ===================== 1. 知识库 =====================
  const kbId = 'whs-kb-warehouse-ops';
  const kbVersionId = 'whs-kb-warehouse-ops-v1';

  // 知识库
  db.prepare(
    `INSERT OR IGNORE INTO sd_knowledge_bases (
      id, tenant_id, name, description, status, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    kbId,
    TENANT_ID,
    '仓储运营知识库',
    '仓库专员专属知识库，包含入库、出库、库存、盘点、补货、调拨、报表等 WMS 全链路 SOP 文档。',
    'active',
    now,
    now,
    JSON.stringify(normalizeMetadata({ source: 'cross-wms-skills', managed_by_seed: true })),
  );

  // 知识库版本
  db.prepare(
    `INSERT OR IGNORE INTO sd_knowledge_base_versions (
      id, tenant_id, knowledge_base_id, version, status, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    kbVersionId,
    TENANT_ID,
    kbId,
    '1.0.0',
    'active',
    now,
    now,
    '{}',
  );

  // ===================== 2. 知识文档 =====================
  // 从 SKILL.md 整合的 7 个仓库运营 SOP 文档
  const knowledgeDocs = [
    {
      id: 'whs-doc-inbound',
      title: '入库规划 SOP',
      content: [
        '# 入库规划标准作业流程',
        '',
        '## 适用场景',
        '采购入库、退货入库、跨境入库（保税仓/直邮仓/海外仓）。',
        '',
        '## 操作步骤',
        '1. 仓库容量查询：确认目标仓库剩余可用库位和容积',
        '2. 入库批次规划：按 SKU 数量、体积、保质期要求规划入库批次',
        '3. 库位分配策略：',
        '   - zone_priority：按区域优先级分配（高频区→低频区）',
        '   - volume_fit：按体积最佳匹配分配',
        '   - temperature：按温控要求分配（常温/冷藏/冷冻/危险品）',
        '4. 质检结果录入：到货验收后录入质检结果（合格/不合格/部分合格）',
        '5. 上架归位：按分配库位完成上架，更新库存系统',
        '',
        '## 跨境入库特殊流程',
        '- 保税仓：需记录报关单号、海关放行状态',
        '- 直邮仓：需记录物流追踪号、清关状态',
        '- 海外仓：需记录 FBA/Shipment ID、头程物流信息',
        '',
        '## 关键指标',
        '- 入库时效：≤4 小时（从到货到上架完成）',
        '- 验收准确率：≥99%',
      ].join('\n'),
    },
    {
      id: 'whs-doc-outbound',
      title: '出库优化 SOP',
      content: [
        '# 出库优化标准作业流程',
        '',
        '## 适用场景',
        '销售出库、调拨出库、跨境出库。',
        '',
        '## 波次创建策略',
        '- single：单订单波次（高优先级订单）',
        '- multi：多订单合并波次（同方向/同载体）',
        '- bulk：批量波次（大批量出库）',
        '',
        '## 拣货路径优化',
        '- s_shape（S 型路径）：适用于大仓库，按通道顺序拣货',
        '- largest_gap（最大间隙）：适用于小仓库，跳过空通道',
        '- combined（混合）：S 型 + 间隙优化，平衡效率',
        '',
        '## 操作步骤',
        '1. 波次创建：按策略合并出库订单',
        '2. 拣货员分配：按工作量和区域分配拣货员',
        '3. 拣货执行：按优化路径拣货',
        '4. 打包复核：核对 SKU、数量、包装规范',
        '5. 出库确认：更新库存，生成出库记录',
        '',
        '## 跨境出库特殊流程',
        '- 订单审核：需确认收件信息、申报价值',
        '- 打包规范：需符合目的地国包装要求',
        '- 报关申报：需生成报关单据、HS 编码',
        '',
        '## 关键指标',
        '- 出库时效：≤2 小时（从下单到出库）',
        '- 拣货准确率：≥99.5%',
      ].join('\n'),
    },
    {
      id: 'whs-doc-inventory',
      title: '库存管理 SOP',
      content: [
        '# 库存管理标准作业流程',
        '',
        '## 库龄分布分析',
        '按入库时间分段统计（0-30天/31-60天/61-90天/90天+），识别滞销品。',
        '',
        '## ABC 分类管理',
        '- A 类（高价值高频次）：占总值 70-80%，重点管理',
        '- B 类（中价值中频次）：占总值 15-25%，常规管理',
        '- C 类（低价值低频次）：占总值 5-10%，简化管理',
        '',
        '## 安全库存计算',
        '安全库存 = (最大日消耗 × 最大前置时间) - (平均日消耗 × 平均前置时间)',
        '',
        '## 盘点任务',
        '- blind（盲盘）：不告知盘点人员系统库存数量',
        '- known（明盘）：告知系统数量进行核对',
        '- 盘点差异调整：记录差异原因，同步更新 inventory_items 和 inventory_transactions',
        '',
        '## 保质期预警（FIFO 先进先出）',
        '按入库批次时间排序，优先出库早期批次，监控临期商品。',
        '',
        '## 滞销品识别',
        '库龄 > 90 天且无近期出库记录的 SKU 标记为滞销，触发清理建议。',
      ].join('\n'),
    },
    {
      id: 'whs-doc-replenishment',
      title: '补货预测 SOP',
      content: [
        '# 补货预测标准作业流程',
        '',
        '## EMA 日均消耗计算',
        '使用指数移动平均（EMA）计算 SKU 日均消耗量，',
        '公式：EMA_today = α × consumption_yesterday + (1-α) × EMA_yesterday',
        'α 值推荐 0.3（平衡近期波动与长期趋势）。',
        '',
        '## 补货建议生成',
        '1. 计算可用库存 = 当前库存 + 在途数量',
        '2. 计算安全库存 = EMA日均消耗 × 安全库存天数',
        '3. 判断是否触发补货：可用库存 < 安全库存',
        '4. 计算建议补货量 = 目标库存 - 可用库存',
        '   目标库存 = EMA日均消耗 × (前置时间 + 补货周期) × 补货倍数',
        '',
        '## 补货规则配置',
        '- minStock：最低库存阈值',
        '- maxStock：最高库存阈值',
        '- safetyDays：安全库存天数',
        '- replenishMultiplier：补货倍数（建议 1.5-2.0）',
        '- leadTimeDays：前置时间（天）',
        '- autoOrder：是否自动生成采购单',
        '',
        '## 呆滞料预警',
        '库龄 > 90 天且日均消耗 < 0.1 的 SKU 标记为呆滞料，触发清理或调拨建议。',
      ].join('\n'),
    },
    {
      id: 'whs-doc-transfer',
      title: '调拨优化 SOP',
      content: [
        '# 调拨优化标准作业流程',
        '',
        '## 适用场景',
        '多仓库存平衡、紧急调拨、呆滞料调拨。',
        '',
        '## 调拨流程',
        '1. 识别调拨需求：某仓库库存低于安全线，其他仓库有富余',
        '2. 调拨路径推荐：选择成本最低、时效最快的调拨路径',
        '3. 在途跟踪：记录调拨在途状态（已发起/运输中/已到货/已入库）',
        '4. 到货确认：目标仓库验收入库，更新库存',
        '',
        '## 调拨优化原则',
        '- 优先从呆滞仓库调拨到紧缺仓库',
        '- 考虑运输成本与时效的平衡',
        '- 跨境调拨需考虑清关时间',
        '',
        '## 在途库存影响',
        '调拨在途数量计入可用库存计算，避免重复补货。',
      ].join('\n'),
    },
    {
      id: 'whs-doc-kpi',
      title: '仓库 KPI 指标体系',
      content: [
        '# 仓库 KPI 指标体系',
        '',
        '## 运营效率类',
        '- 入库时效：≤4 小时（从到货到上架完成）',
        '- 出库时效：≤2 小时（从下单到出库）',
        '- 日处理单量：每日入库+出库订单总数',
        '- 人均效率：日处理单量 / 在岗人数',
        '',
        '## 质量类',
        '- 库存准确率：≥99%（盘点账实差异率 ≤1%）',
        '- 拣货准确率：≥99.5%',
        '- 客诉率：≤0.5%',
        '- 差错率：≤0.3%',
        '',
        '## 成本类',
        '- 单件仓储成本：月仓储总成本 / 月均库存件数',
        '- 单件操作成本：月操作总成本 / 月操作件数',
        '- 单件物流成本：月物流总成本 / 月发货件数',
        '',
        '## 预警类',
        '- 低库存预警：可用库存 < 安全库存',
        '- 临期预警：保质期剩余 < 预警天数',
        '- 呆滞预警：库龄 > 90 天且无近期出库',
      ].join('\n'),
    },
    {
      id: 'whs-doc-reports',
      title: '统计报表 SOP',
      content: [
        '# 统计报表标准作业流程',
        '',
        '## 报表类型',
        '- 库存报表：当前库存快照、库龄分布、ABC 分类统计',
        '- 出入库报表：指定时段内的入库/出库明细汇总',
        '- 在途报表：调拨在途、采购在途订单状态',
        '- KPI 综合报表：运营效率、质量、成本指标汇总',
        '',
        '## 导出格式',
        '- CSV：纯文本逗号分隔，适合程序处理',
        '- XLSX：Excel 格式，适合人工查阅',
        '- PDF：适合正式报告',
        '',
        '## 定期调度',
        '支持按日/周/月自动生成报表并导出到指定路径。',
        '',
        '## 数据来源',
        '- inventory_items 表：库存快照',
        '- inbound_records 表：入库记录',
        '- outbound_records 表：出库记录',
        '- transfer_orders 表：调拨记录',
        '- wms_alerts 表：预警记录',
      ].join('\n'),
    },
  ];

  // 插入知识文档
  for (const doc of knowledgeDocs) {
    db.prepare(
      `INSERT OR IGNORE INTO sd_knowledge_documents (
        id, tenant_id, knowledge_base_id, title, content, status, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      doc.id,
      TENANT_ID,
      kbId,
      doc.title,
      doc.content,
      'active',
      now,
      now,
      '{}',
    );
  }

  // 绑定知识库到仓库专员
  db.prepare(
    `INSERT OR IGNORE INTO sd_agent_resource_bindings (
      id, tenant_id, agent_id, resource_type, resource_id, status, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `whs-bind-${agentId}-kb`,
    TENANT_ID,
    agentId,
    'knowledge_base',
    kbId,
    'active',
    now,
    now,
    JSON.stringify({ scope: 'agent_private', source: 'seed' }),
  );

  // 知识分支
  db.prepare(
    `INSERT OR IGNORE INTO sd_agent_knowledge_branches (
      id, tenant_id, agent_id, knowledge_base_id, base_version, head_version, status, sync_state, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `akb_${agentId}_${kbId}`,
    TENANT_ID,
    agentId,
    kbId,
    '1.0.0',
    '1.0.0',
    'active',
    'synced',
    '{}',
  );

  // ===================== 3. 技能定义 =====================
  const skills = [
    {
      id: 'whs-skill-inventory-query',
      name: '库存查询',
      description: '自然语言转 SQL 查询库存，支持 SKU/仓库/类别/时间多维度统计',
      trigger: '库存查询|查库存|库存数量|sku查询|仓库余量',
      steps: '1. 解析用户查询意图，提取 SKU/仓库/类别等条件\n2. 生成 SQL 查询 inventory_items 表\n3. 汇总结果并以表格形式返回\n4. 如有低库存情况主动预警',
    },
    {
      id: 'whs-skill-inbound',
      name: '入库规划',
      description: '入库批次规划、库位分配、质检录入、上架归位',
      trigger: '入库|收货|到货|验货|上架|采购入库',
      steps: '1. 查询仓库可用容量\n2. 规划入库批次（按 SKU/体积/温控）\n3. 分配库位（zone_priority/volume_fit/temperature）\n4. 录入质检结果\n5. 确认上架，更新库存',
    },
    {
      id: 'whs-skill-outbound',
      name: '出库优化',
      description: '波次创建、拣货路径优化、打包复核、出库确认',
      trigger: '出库|发货|拣货|打包|销售出库|波次',
      steps: '1. 按策略创建波次（single/multi/bulk）\n2. 分配拣货员\n3. 优化拣货路径（s_shape/largest_gap/combined）\n4. 打包复核\n5. 出库确认，更新库存',
    },
    {
      id: 'whs-skill-inventory-count',
      name: '库存盘点',
      description: '盘点任务创建、差异分析、账实调整',
      trigger: '盘点|清点|核查|库存盘点|盘点任务',
      steps: '1. 创建盘点任务（blind/known）\n2. 执行盘点，录入实际数量\n3. 计算差异（variance = 实盘 - 系统数）\n4. 差异分析，记录原因\n5. 调整库存，同步 inventory_items 和 inventory_transactions',
    },
    {
      id: 'whs-skill-replenishment',
      name: '补货预测',
      description: '基于 EMA 日均消耗 + 安全库存的补货建议生成',
      trigger: '补货|补货建议|补货计划|安全库存|reorder',
      steps: '1. 计算 SKU 的 EMA 日均消耗\n2. 查询当前库存 + 在途数量\n3. 对比安全库存阈值\n4. 生成补货建议（建议补货量 = 目标库存 - 可用库存）\n5. 如配置 autoOrder 则自动生成采购单',
    },
    {
      id: 'whs-skill-transfer',
      name: '调拨优化',
      description: '多仓库存平衡、调拨路径推荐、在途跟踪',
      trigger: '调拨|转移|移仓|跨仓|在途',
      steps: '1. 识别调拨需求（某仓低于安全线，他仓有富余）\n2. 推荐最优调拨路径\n3. 创建调拨单，发起调拨\n4. 在途跟踪（已发起/运输中/已到货/已入库）\n5. 目标仓验收入库，更新库存',
    },
    {
      id: 'whs-skill-alert',
      name: '预警管理',
      description: '低库存、临期、呆滞库存的扫描与报告',
      trigger: '预警|告警|低库存|临期|呆滞|异常',
      steps: '1. 扫描库存，检测低库存（可用库存 < 安全库存）\n2. 扫描临期商品（保质期剩余 < 预警天数）\n3. 扫描呆滞品（库龄 > 90 天且无近期出库）\n4. 生成预警报告，按严重程度排序\n5. 给出处理建议（补货/调拨/清理）',
    },
    {
      id: 'whs-skill-report',
      name: '报表生成',
      description: '库存报表、出入库报表、KPI 综合报表生成与导出',
      trigger: '报表|统计|汇总|导出|excel|csv',
      steps: '1. 确认报表类型（库存/出入库/在途/KPI）\n2. 查询相关数据表\n3. 按维度汇总统计\n4. 生成报表内容\n5. 导出为 CSV/XLSX/PDF',
    },
  ];

  for (const skill of skills) {
    // 技能定义
    db.prepare(
      `INSERT OR IGNORE INTO sd_skills (
        id, tenant_id, name, description, status, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      skill.id,
      TENANT_ID,
      skill.name,
      skill.description,
      'active',
      now,
      now,
      JSON.stringify({ trigger: skill.trigger, source: 'cross-wms-skills', managed_by_seed: true }),
    );

    // 技能版本（SOP 步骤）
    db.prepare(
      `INSERT OR IGNORE INTO sd_skill_versions (
        id, tenant_id, skill_id, version, status, sop_steps, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${skill.id}-v1`,
      TENANT_ID,
      skill.id,
      '1.0.0',
      'active',
      skill.steps,
      now,
      now,
      '{}',
    );

    // 绑定技能到仓库专员
    db.prepare(
      `INSERT OR IGNORE INTO sd_agent_resource_bindings (
        id, tenant_id, agent_id, resource_type, resource_id, status, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `whs-bind-${agentId}-${skill.id}`,
      TENANT_ID,
      agentId,
      'skill',
      skill.id,
      'active',
      now,
      now,
      JSON.stringify({ scope: 'agent_private', source: 'seed' }),
    );

    // 技能分支
    db.prepare(
      `INSERT OR IGNORE INTO sd_agent_skill_branches (
        id, tenant_id, agent_id, skill_id, base_version, head_version, status, sync_state, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `asb_${agentId}_${skill.id}`,
      TENANT_ID,
      agentId,
      skill.id,
      '1.0.0',
      '1.0.0',
      'active',
      'synced',
      '{}',
    );
  }
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
