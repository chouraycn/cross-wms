/**
 * StaffDeck 数据库表结构 — 完整移植自 StaffDeck-main/backend/app/db/models.py
 *
 * 设计原则：
 * 1. 所有表名以 `sd_` 前缀命名，与现有 cross-wms 表完全隔离
 * 2. 保留 tenant_id 字段以维持多租户结构兼容性（默认值 'default'）
 * 3. 所有 JSON 字段在 SQLite 中存为 TEXT，应用层负责序列化
 * 4. 所有时间字段使用 INTEGER（Unix 秒），通过 strftime('%s','now') 默认值
 * 5. 索引和唯一约束保持与原 SQLModel 模型一致
 *
 * 表清单（35 张）：
 *   租户与用户：sd_tenants, sd_users
 *   Agent 与绑定：sd_agent_profiles, sd_agent_usages, sd_agent_model_bindings, sd_agent_resource_bindings
 *   Skills：sd_skills, sd_skill_versions, sd_agent_skill_branches, sd_agent_skill_branch_versions, sd_general_skills
 *   知识库：sd_knowledge_bases, sd_knowledge_base_versions, sd_agent_knowledge_branches
 *   知识文档：sd_knowledge_documents, sd_knowledge_buckets, sd_knowledge_chunks, sd_knowledge_concepts, sd_knowledge_discovery_suggestions, sd_knowledge_ingest_jobs
 *   模型与工具：sd_model_configs, sd_tools（MCP server 已并入核心 mcp_servers 表，按 tenant_id 隔离）
 *   定时任务：sd_scheduled_tasks, sd_scheduled_task_runs
 *   会话与消息：sd_sessions, sd_messages, sd_human_handoff_requests, sd_message_feedback, sd_skill_feedback
 *   记忆与事件：sd_memories, sd_agent_events
 *   配置：sd_persona_configs, sd_ui_configs
 *   Mock：sd_mock_orders
 */

import type Database from 'better-sqlite3';
import { logger } from './logger.js';

/** 默认租户 ID — StaffDeck 的多租户结构在 cross-wms 中简化为单租户 */
export const DEFAULT_TENANT_ID = 'default';

/**
 * 初始化所有 StaffDeck 表 — 幂等，CREATE TABLE IF NOT EXISTS
 * 在 server/db-core.ts 的 initDb 流程中调用
 */
export function initStaffTables(db: Database.Database): void {
  logger.info('[StaffDB] 开始初始化 StaffDeck 表结构...');

  // ============================ 租户与用户 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS sd_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, username)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_users_tenant ON sd_users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_users_username ON sd_users(username);
    CREATE INDEX IF NOT EXISTS idx_sd_users_role ON sd_users(role);
  `);

  // ============================ Agent Profiles ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_agent_profiles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      persona_prompt TEXT,
      is_overall INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_agent_profiles_tenant ON sd_agent_profiles(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_profiles_is_overall ON sd_agent_profiles(is_overall);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_profiles_status ON sd_agent_profiles(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_agent_usages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, user_id, agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_agent_usages_tenant ON sd_agent_usages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_usages_user ON sd_agent_usages(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_usages_agent ON sd_agent_usages(agent_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_agent_model_bindings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'default',
      model_config_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, agent_id, role)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_agent_model_bindings_tenant ON sd_agent_model_bindings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_model_bindings_agent ON sd_agent_model_bindings(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_model_bindings_role ON sd_agent_model_bindings(role);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_agent_resource_bindings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, agent_id, resource_type, resource_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_agent_resource_bindings_tenant ON sd_agent_resource_bindings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_resource_bindings_agent ON sd_agent_resource_bindings(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_resource_bindings_type ON sd_agent_resource_bindings(resource_type);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_resource_bindings_resource ON sd_agent_resource_bindings(resource_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_resource_bindings_status ON sd_agent_resource_bindings(status);
  `);

  // ============================ Skills ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_skills (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      name TEXT NOT NULL,
      business_domain TEXT,
      description TEXT,
      content_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, skill_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_skills_tenant ON sd_skills(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skills_skill_id ON sd_skills(skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skills_status ON sd_skills(status);

    CREATE TABLE IF NOT EXISTS sd_skill_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      business_domain TEXT,
      description TEXT,
      content_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, skill_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_skill_versions_tenant ON sd_skill_versions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_versions_skill_id ON sd_skill_versions(skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_versions_version ON sd_skill_versions(version);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_versions_status ON sd_skill_versions(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_agent_skill_branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      source_skill_id TEXT NOT NULL,
      base_version TEXT NOT NULL DEFAULT '1.0.0',
      head_version TEXT NOT NULL DEFAULT '1.0.0',
      content_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      sync_state TEXT NOT NULL DEFAULT 'synced',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, agent_id, skill_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_agent_skill_branches_tenant ON sd_agent_skill_branches(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_skill_branches_agent ON sd_agent_skill_branches(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_skill_branches_skill ON sd_agent_skill_branches(skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_skill_branches_source ON sd_agent_skill_branches(source_skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_skill_branches_status ON sd_agent_skill_branches(status);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_skill_branches_sync ON sd_agent_skill_branches(sync_state);

    CREATE TABLE IF NOT EXISTS sd_agent_skill_branch_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      source_skill_id TEXT NOT NULL,
      version TEXT NOT NULL,
      base_version TEXT NOT NULL DEFAULT '1.0.0',
      content_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      sync_state TEXT NOT NULL DEFAULT 'diverged',
      change_summary TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, agent_id, skill_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_tenant ON sd_agent_skill_branch_versions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_agent ON sd_agent_skill_branch_versions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_skill ON sd_agent_skill_branch_versions(skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_source ON sd_agent_skill_branch_versions(source_skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_version ON sd_agent_skill_branch_versions(version);
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_status ON sd_agent_skill_branch_versions(status);
    CREATE INDEX IF NOT EXISTS idx_sd_asbv_sync ON sd_agent_skill_branch_versions(sync_state);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_general_skills (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      homepage TEXT,
      skill_markdown TEXT NOT NULL,
      skill_files_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      runtime_config_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, slug)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_general_skills_tenant ON sd_general_skills(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_general_skills_slug ON sd_general_skills(slug);
    CREATE INDEX IF NOT EXISTS idx_sd_general_skills_status ON sd_general_skills(status);
  `);

  // ============================ 知识库 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_knowledge_bases (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_knowledge_bases_tenant ON sd_knowledge_bases(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_knowledge_bases_status ON sd_knowledge_bases(status);

    CREATE TABLE IF NOT EXISTS sd_knowledge_base_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, knowledge_base_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kb_versions_tenant ON sd_knowledge_base_versions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kb_versions_kb ON sd_knowledge_base_versions(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kb_versions_version ON sd_knowledge_base_versions(version);
    CREATE INDEX IF NOT EXISTS idx_sd_kb_versions_status ON sd_knowledge_base_versions(status);

    CREATE TABLE IF NOT EXISTS sd_agent_knowledge_branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      base_version TEXT NOT NULL DEFAULT '1.0.0',
      head_version TEXT NOT NULL DEFAULT '1.0.0',
      status TEXT NOT NULL DEFAULT 'active',
      sync_state TEXT NOT NULL DEFAULT 'synced',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, agent_id, knowledge_base_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_akb_tenant ON sd_agent_knowledge_branches(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_akb_agent ON sd_agent_knowledge_branches(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_akb_kb ON sd_agent_knowledge_branches(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_akb_status ON sd_agent_knowledge_branches(status);
    CREATE INDEX IF NOT EXISTS idx_sd_akb_sync ON sd_agent_knowledge_branches(sync_state);
  `);

  // ============================ 知识文档与切片 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_knowledge_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      knowledge_base_version_id TEXT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      bucket_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kdocs_tenant ON sd_knowledge_documents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdocs_kb ON sd_knowledge_documents(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdocs_kb_version ON sd_knowledge_documents(knowledge_base_version_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdocs_file_type ON sd_knowledge_documents(file_type);
    CREATE INDEX IF NOT EXISTS idx_sd_kdocs_status ON sd_knowledge_documents(status);

    CREATE TABLE IF NOT EXISTS sd_knowledge_buckets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      bucket_id TEXT NOT NULL,
      knowledge_base_version_id TEXT,
      bucket_key TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kbuckets_tenant ON sd_knowledge_buckets(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kbuckets_kb ON sd_knowledge_buckets(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kbuckets_doc ON sd_knowledge_buckets(document_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kbuckets_bucket_id ON sd_knowledge_buckets(bucket_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kbuckets_kb_version ON sd_knowledge_buckets(knowledge_base_version_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kbuckets_bucket_key ON sd_knowledge_buckets(bucket_key);

    CREATE TABLE IF NOT EXISTS sd_knowledge_chunks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      bucket_id TEXT NOT NULL,
      knowledge_base_version_id TEXT,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      source_ref TEXT,
      embedding TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kchunks_tenant ON sd_knowledge_chunks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kchunks_kb ON sd_knowledge_chunks(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kchunks_doc ON sd_knowledge_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kchunks_bucket ON sd_knowledge_chunks(bucket_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kchunks_kb_version ON sd_knowledge_chunks(knowledge_base_version_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kchunks_idx ON sd_knowledge_chunks(chunk_index);
  `);

  // 向量检索列：幂等补充（旧库可能缺少 embedding 列，避免 ALTER 重复执行报错）
  const kcColumns = db.prepare(`PRAGMA table_info(sd_knowledge_chunks)`).all() as { name: string }[];
  if (!kcColumns.some((c) => c.name === 'embedding')) {
    db.exec(`ALTER TABLE sd_knowledge_chunks ADD COLUMN embedding TEXT`);
    logger.info('[StaffDB] sd_knowledge_chunks.embedding 列已补充（向量检索支持）');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_knowledge_concepts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      concept_id TEXT NOT NULL,
      concept_type TEXT NOT NULL,
      knowledge_base_version_id TEXT,
      document_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      content_md TEXT NOT NULL,
      frontmatter_json TEXT NOT NULL DEFAULT '{}',
      links_json TEXT NOT NULL DEFAULT '[]',
      citations_json TEXT NOT NULL DEFAULT '[]',
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, knowledge_base_version_id, concept_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_tenant ON sd_knowledge_concepts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_kb ON sd_knowledge_concepts(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_concept_id ON sd_knowledge_concepts(concept_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_type ON sd_knowledge_concepts(concept_type);
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_kb_version ON sd_knowledge_concepts(knowledge_base_version_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_doc ON sd_knowledge_concepts(document_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kconcepts_status ON sd_knowledge_concepts(status);

    CREATE TABLE IF NOT EXISTS sd_knowledge_discovery_suggestions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      suggestion_type TEXT NOT NULL,
      knowledge_base_version_id TEXT,
      bucket_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload_json TEXT NOT NULL DEFAULT '{}',
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_tenant ON sd_knowledge_discovery_suggestions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_kb ON sd_knowledge_discovery_suggestions(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_doc ON sd_knowledge_discovery_suggestions(document_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_type ON sd_knowledge_discovery_suggestions(suggestion_type);
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_kb_version ON sd_knowledge_discovery_suggestions(knowledge_base_version_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_bucket ON sd_knowledge_discovery_suggestions(bucket_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kdisc_status ON sd_knowledge_discovery_suggestions(status);

    CREATE TABLE IF NOT EXISTS sd_knowledge_ingest_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      knowledge_base_version_id TEXT,
      document_id TEXT,
      filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0.0,
      error TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_kjobs_tenant ON sd_knowledge_ingest_jobs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kjobs_kb ON sd_knowledge_ingest_jobs(knowledge_base_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kjobs_kb_version ON sd_knowledge_ingest_jobs(knowledge_base_version_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kjobs_doc ON sd_knowledge_ingest_jobs(document_id);
    CREATE INDEX IF NOT EXISTS idx_sd_kjobs_status ON sd_knowledge_ingest_jobs(status);
  `);

  // ============================ 模型配置 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_model_configs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'openai_compatible',
      api_protocol TEXT NOT NULL DEFAULT 'openai_chat_completions',
      base_url TEXT,
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL,
      temperature REAL NOT NULL DEFAULT 0.2,
      max_output_tokens INTEGER NOT NULL DEFAULT 8192,
      extra_body_json TEXT NOT NULL DEFAULT '{}',
      protocol_options_json TEXT NOT NULL DEFAULT '{}',
      legacy_unmapped_options_json TEXT NOT NULL DEFAULT '{}',
      trust_status TEXT NOT NULL DEFAULT 'unverified',
      verified_at INTEGER,
      verified_fingerprint TEXT,
      verification_attempt_id TEXT,
      verification_started_at INTEGER,
      verification_attempt_status TEXT NOT NULL DEFAULT 'idle',
      verification_attempt_error_code TEXT,
      config_revision INTEGER NOT NULL DEFAULT 1,
      security_revision INTEGER NOT NULL DEFAULT 1,
      key_revision INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_model_configs_tenant ON sd_model_configs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_model_configs_protocol ON sd_model_configs(api_protocol);
    CREATE INDEX IF NOT EXISTS idx_sd_model_configs_trust ON sd_model_configs(trust_status);
    CREATE INDEX IF NOT EXISTS idx_sd_model_configs_verification ON sd_model_configs(verification_attempt_status);
    -- 部分唯一索引：每个租户只能有一个 is_default=1 的配置
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sd_model_configs_tenant_default
      ON sd_model_configs(tenant_id) WHERE is_default = 1;
  `);

  // ============================ 工具与 MCP 服务器 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_tools (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT,
      description TEXT,
      bucket TEXT NOT NULL DEFAULT '未分桶',
      tool_type TEXT NOT NULL DEFAULT 'http',
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      headers_json TEXT NOT NULL DEFAULT '{}',
      auth_json TEXT NOT NULL DEFAULT '{}',
      config_json TEXT NOT NULL DEFAULT '{}',
      input_schema TEXT NOT NULL DEFAULT '{}',
      output_schema TEXT NOT NULL DEFAULT '{}',
      allowed_skills_json TEXT NOT NULL DEFAULT '[]',
      mcp_server_id TEXT,
      mcp_tool_name TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_tools_tenant ON sd_tools(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_tools_name ON sd_tools(name);
    CREATE INDEX IF NOT EXISTS idx_sd_tools_bucket ON sd_tools(bucket);
    CREATE INDEX IF NOT EXISTS idx_sd_tools_type ON sd_tools(tool_type);
    CREATE INDEX IF NOT EXISTS idx_sd_tools_mcp_server ON sd_tools(mcp_server_id);
    CREATE INDEX IF NOT EXISTS idx_sd_tools_enabled ON sd_tools(enabled);
  `);

  // MCP 工具叶子名：幂等补充（旧库可能缺少 mcp_tool_name 列）
  const toolsColumns = db.prepare(`PRAGMA table_info(sd_tools)`).all() as { name: string }[];
  if (!toolsColumns.some((c) => c.name === 'mcp_tool_name')) {
    db.exec(`ALTER TABLE sd_tools ADD COLUMN mcp_tool_name TEXT`);
    logger.info('[StaffDB] sd_tools.mcp_tool_name 列已补充（MCP 工具映射支持）');
  }

  // ============================ 定时任务 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_scheduled_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      created_by_user_id TEXT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      description TEXT,
      schedule_type TEXT NOT NULL DEFAULT 'daily',
      schedule_json TEXT NOT NULL DEFAULT '{}',
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      rrule TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      concurrency_policy TEXT NOT NULL DEFAULT 'forbid',
      misfire_policy TEXT NOT NULL DEFAULT 'coalesce',
      max_runs INTEGER,
      end_at INTEGER,
      next_run_at INTEGER,
      last_run_at INTEGER,
      last_status TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      lease_owner TEXT,
      lease_until INTEGER,
      source_session_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_tenant ON sd_scheduled_tasks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_agent ON sd_scheduled_tasks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_user ON sd_scheduled_tasks(created_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_type ON sd_scheduled_tasks(schedule_type);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_tz ON sd_scheduled_tasks(timezone);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_status ON sd_scheduled_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_end ON sd_scheduled_tasks(end_at);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_next_run ON sd_scheduled_tasks(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_last_run ON sd_scheduled_tasks(last_run_at);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_last_status ON sd_scheduled_tasks(last_status);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_lease_owner ON sd_scheduled_tasks(lease_owner);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_lease_until ON sd_scheduled_tasks(lease_until);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_tasks_source_session ON sd_scheduled_tasks(source_session_id);

    CREATE TABLE IF NOT EXISTS sd_scheduled_task_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      scheduled_task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      scheduled_for INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      started_at INTEGER,
      finished_at INTEGER,
      result_summary TEXT,
      error TEXT,
      trace_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(scheduled_task_id, scheduled_for)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_tenant ON sd_scheduled_task_runs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_task ON sd_scheduled_task_runs(scheduled_task_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_agent ON sd_scheduled_task_runs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_user ON sd_scheduled_task_runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_session ON sd_scheduled_task_runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_for ON sd_scheduled_task_runs(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_status ON sd_scheduled_task_runs(status);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_started ON sd_scheduled_task_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_sd_sched_runs_finished ON sd_scheduled_task_runs(finished_at);
  `);

  // ============================ 会话与消息 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      agent_id TEXT,
      title TEXT,
      active_skill_id TEXT,
      active_step_id TEXT,
      slots_json TEXT NOT NULL DEFAULT '{}',
      skill_stack_json TEXT NOT NULL DEFAULT '[]',
      pending_tasks_json TEXT NOT NULL DEFAULT '[]',
      resume_after_answer_json TEXT,
      awaiting_input_json TEXT,
      knowledge_context_json TEXT NOT NULL DEFAULT '[]',
      context_state_json TEXT NOT NULL DEFAULT '{}',
      summary TEXT,
      last_agent_question TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_sessions_tenant ON sd_sessions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sessions_user ON sd_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sessions_agent ON sd_sessions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_sessions_status ON sd_sessions(status);

    CREATE TABLE IF NOT EXISTS sd_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_messages_tenant ON sd_messages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_messages_session ON sd_messages(session_id);

    CREATE TABLE IF NOT EXISTS sd_human_handoff_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      requester_user_id TEXT,
      assignee_user_id TEXT,
      trigger_skill_id TEXT,
      trigger_step_id TEXT,
      context_summary TEXT,
      pending_question TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      human_reply TEXT,
      resume_payload_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      answered_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_tenant ON sd_human_handoff_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_session ON sd_human_handoff_requests(session_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_agent ON sd_human_handoff_requests(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_requester ON sd_human_handoff_requests(requester_user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_assignee ON sd_human_handoff_requests(assignee_user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_trigger_skill ON sd_human_handoff_requests(trigger_skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_trigger_step ON sd_human_handoff_requests(trigger_step_id);
    CREATE INDEX IF NOT EXISTS idx_sd_handoffs_status ON sd_human_handoff_requests(status);

    CREATE TABLE IF NOT EXISTS sd_message_feedback (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      analysis_bucket TEXT,
      analysis_reason TEXT,
      analysis_summary TEXT,
      analysis_confidence REAL,
      analysis_json TEXT NOT NULL DEFAULT '{}',
      analyzed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_tenant ON sd_message_feedback(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_session ON sd_message_feedback(session_id);
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_message ON sd_message_feedback(message_id);
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_user ON sd_message_feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_rating ON sd_message_feedback(rating);
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_analysis_status ON sd_message_feedback(analysis_status);
    CREATE INDEX IF NOT EXISTS idx_sd_msg_feedback_analysis_bucket ON sd_message_feedback(analysis_bucket);

    CREATE TABLE IF NOT EXISTS sd_skill_feedback (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      skill_version TEXT,
      step_id TEXT,
      rating TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(tenant_id, message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_tenant ON sd_skill_feedback(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_skill ON sd_skill_feedback(skill_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_session ON sd_skill_feedback(session_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_message ON sd_skill_feedback(message_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_user ON sd_skill_feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_version ON sd_skill_feedback(skill_version);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_step ON sd_skill_feedback(step_id);
    CREATE INDEX IF NOT EXISTS idx_sd_skill_feedback_rating ON sd_skill_feedback(rating);
  `);

  // ============================ 记忆与事件 ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_memories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      session_id TEXT,
      kind TEXT NOT NULL DEFAULT 'conversation',
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_memories_tenant ON sd_memories(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_memories_user ON sd_memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_memories_username ON sd_memories(username);
    CREATE INDEX IF NOT EXISTS idx_sd_memories_session ON sd_memories(session_id);
    CREATE INDEX IF NOT EXISTS idx_sd_memories_kind ON sd_memories(kind);

    CREATE TABLE IF NOT EXISTS sd_agent_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_agent_events_tenant ON sd_agent_events(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_events_session ON sd_agent_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_sd_agent_events_type ON sd_agent_events(event_type);
  `);

  // ============================ 配置（Persona / UI Config） ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_persona_configs (
      tenant_id TEXT PRIMARY KEY,
      system_prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS sd_ui_configs (
      tenant_id TEXT PRIMARY KEY,
      show_thinking_trace INTEGER NOT NULL DEFAULT 1,
      show_skill_trace INTEGER NOT NULL DEFAULT 1,
      show_tool_trace INTEGER NOT NULL DEFAULT 1,
      reflection_max_rounds INTEGER NOT NULL DEFAULT 1,
      agent_loop_max_actions INTEGER NOT NULL DEFAULT 6,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // ============================ Mock Orders ============================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_mock_orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT,
      product_id TEXT,
      sku_id TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'created',
      payment_status TEXT,
      order_status TEXT,
      signed_days INTEGER NOT NULL DEFAULT 0,
      refundable INTEGER NOT NULL DEFAULT 1,
      total_amount REAL NOT NULL DEFAULT 0.0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_mock_orders_user ON sd_mock_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_sd_mock_orders_product ON sd_mock_orders(product_id);
    CREATE INDEX IF NOT EXISTS idx_sd_mock_orders_status ON sd_mock_orders(status);
  `);

  // ============================ 流式蒸馏/重写任务（持久化元数据） ============================
  // 说明：实时 SSE 事件仍存于进程内存（见 server/staff/streamJobs.ts），此处仅持久化任务元数据，
  // 使任务状态/历史在进程重启后不丢失，并支撑前端任务列表查询。

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_stream_jobs (
      job_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sd_stream_jobs_status ON sd_stream_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_sd_stream_jobs_created ON sd_stream_jobs(created_at);
  `);

  // ============================ 渠道接入（数字员工对外接入） ============================
  // 移植自 StaffDeck-main/backend/app/api/channels.py：渠道绑定 / 挂载员工 / 身份绑定。
  // 投递日志与对话记录(ChannelDelivery/ChannelConvState)在前端按绑定查询时返回空，
  // 这里不建表，避免无外部渠道服务时的空表负担。

  db.exec(`
    CREATE TABLE IF NOT EXISTS sd_channel_bindings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      connected INTEGER NOT NULL DEFAULT 0,
      credentials_enc TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      external_account_key TEXT,
      identity_scope_key TEXT,
      config_revision INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT,
      created_by_name TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_channel_bindings_tenant ON sd_channel_bindings(tenant_id);

    CREATE TABLE IF NOT EXISTS sd_channel_binding_agents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      name TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sd_channel_binding_agents_binding ON sd_channel_binding_agents(binding_id);

    CREATE TABLE IF NOT EXISTS sd_channel_identities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      staffdeck_user_id TEXT NOT NULL,
      external_user_id TEXT,
      display_name TEXT,
      external_account_scope TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_channel_identities_tenant_user
      ON sd_channel_identities(tenant_id, staffdeck_user_id);

    CREATE TABLE IF NOT EXISTS sd_channel_deliveries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      binding_id TEXT,
      channel TEXT NOT NULL,
      agent_id TEXT,
      title TEXT,
      content TEXT,
      type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL DEFAULT 'delivered',
      delivered_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sd_channel_deliveries_tenant ON sd_channel_deliveries(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sd_channel_deliveries_binding ON sd_channel_deliveries(binding_id);
    CREATE INDEX IF NOT EXISTS idx_sd_channel_deliveries_channel ON sd_channel_deliveries(channel);
  `);

  // ============================ 默认租户与 UI 配置初始化 ============================

  const existingTenant = db.prepare('SELECT id FROM sd_tenants WHERE id = ?').get(DEFAULT_TENANT_ID);
  if (!existingTenant) {
    db.prepare('INSERT INTO sd_tenants (id, name) VALUES (?, ?)').run(DEFAULT_TENANT_ID, 'Default Tenant');
    logger.info(`[StaffDB] 已创建默认租户: ${DEFAULT_TENANT_ID}`);
  }

  const existingUiConfig = db.prepare('SELECT tenant_id FROM sd_ui_configs WHERE tenant_id = ?').get(DEFAULT_TENANT_ID);
  if (!existingUiConfig) {
    db.prepare('INSERT INTO sd_ui_configs (tenant_id) VALUES (?)').run(DEFAULT_TENANT_ID);
    logger.info('[StaffDB] 已创建默认 UI 配置');
  }

  const existingPersona = db.prepare('SELECT tenant_id FROM sd_persona_configs WHERE tenant_id = ?').get(DEFAULT_TENANT_ID);
  if (!existingPersona) {
    db.prepare('INSERT INTO sd_persona_configs (tenant_id, system_prompt) VALUES (?, ?)').run(
      DEFAULT_TENANT_ID,
      'You are a helpful assistant.',
    );
    logger.info('[StaffDB] 已创建默认 Persona 配置');
  }

  logger.info('[StaffDB] StaffDeck 表结构初始化完成');

  // 合并遗留 sd_mcp_servers 数据到核心 mcp_servers（一次性迁移，完成后删表）
  migrateSdMcpServersToCore(db);
}

/**
 * 一次性迁移：将历史 sd_mcp_servers 记录并入核心 mcp_servers 表（按 tenant_id 隔离）。
 * 迁移后删除 sd_mcp_servers 表，避免重复存储。对全新库（无 sd_mcp_servers）为 no-op。
 */
function migrateSdMcpServersToCore(db: Database.Database): void {
  try {
    const hasSd = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sd_mcp_servers'")
      .get();
    if (!hasSd) return;

    // 确保核心 mcp_servers 表与列存在（与 mcpConfigStore.initSchema 互补，保证迁移时序无关）
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        command TEXT NOT NULL DEFAULT '',
        args TEXT,
        env TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        url TEXT,
        headers TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tenant_id TEXT,
        display_name TEXT,
        description TEXT,
        bucket TEXT,
        cwd TEXT,
        discovered_tools TEXT,
        last_synced_at INTEGER
      )
    `);
    const cols = (db.pragma('table_info(mcp_servers)') as Array<{ name: string }>).map((c) => c.name);
    const extraCols: Array<[string, string]> = [
      ['tenant_id', 'TEXT'],
      ['display_name', 'TEXT'],
      ['description', 'TEXT'],
      ['bucket', 'TEXT'],
      ['cwd', 'TEXT'],
      ['discovered_tools', 'TEXT'],
      ['last_synced_at', 'INTEGER'],
    ];
    for (const [col, typ] of extraCols) {
      if (!cols.includes(col)) db.exec(`ALTER TABLE mcp_servers ADD COLUMN ${col} ${typ}`);
    }

    const rows = db.prepare('SELECT * FROM sd_mcp_servers').all() as Record<string, any>[];
    const insert = db.prepare(
      `INSERT OR IGNORE INTO mcp_servers (
        id, tenant_id, name, command, args, env, enabled, transport_type, url, headers,
        created_at, updated_at, display_name, description, bucket, cwd, discovered_tools, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of rows) {
      insert.run(
        r.id,
        r.tenant_id ?? DEFAULT_TENANT_ID,
        r.name,
        r.command ?? '',
        r.args_json ?? '[]',
        r.env_json ?? '{}',
        r.enabled ?? 1,
        r.transport ?? 'streamable_http',
        r.url ?? null,
        r.headers_json ?? '{}',
        (Number(r.created_at) || 0) * 1000,
        (Number(r.updated_at) || 0) * 1000,
        r.display_name ?? null,
        r.description ?? null,
        r.bucket ?? 'MCP 工具',
        r.cwd ?? null,
        r.discovered_tools_json ?? '[]',
        r.last_synced_at ?? null,
      );
    }
    db.exec('DROP TABLE IF EXISTS sd_mcp_servers');
    logger.info(`[StaffDB] 已将 ${rows.length} 条 sd_mcp_servers 记录合并进核心 mcp_servers 表`);
  } catch (e) {
    logger.warn('[StaffDB] sd_mcp_servers 合并迁移跳过:', e);
  }
}

/**
 * 生成 StaffDeck 风格的 ID — 与原 Python `new_id(prefix)` 等价
 * 格式：`{prefix}_{16hex}`，例如 `agent_a1b2c3d4e5f67890`
 */
export function newStaffId(prefix: string): string {
  // 使用 crypto.randomUUID() 的前 16 位 hex（去连字符）
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${hex}`;
}

/** 常用 ID 前缀工厂 — 与 StaffDeck Python `new_id` 调用保持一致 */
export const StaffIdPrefix = {
  agent: 'agent',
  agentUsage: 'agentuse',
  agentModelBinding: 'agentmodel',
  agentResourceBinding: 'agentres',
  agentSkillBranch: 'agentbranch',
  agentSkillBranchVersion: 'agentbranchver',
  agentKnowledgeBranch: 'agentkb',
  skill: 'skill',
  skillVersion: 'skillver',
  generalSkill: 'genskill',
  knowledgeBase: 'kb',
  knowledgeBaseVersion: 'kbver',
  knowledgeDocument: 'kdoc',
  knowledgeBucket: 'kbucket',
  knowledgeChunk: 'kchunk',
  knowledgeConcept: 'kconcept',
  knowledgeDiscovery: 'kdisc',
  knowledgeIngestJob: 'kjob',
  modelConfig: 'model',
  tool: 'tool',
  mcpServer: 'mcpsrv',
  scheduledTask: 'sched',
  scheduledTaskRun: 'schedrun',
  session: 'sess',
  message: 'msg',
  handoff: 'handoff',
  feedback: 'fb',
  skillFeedback: 'skillfb',
  memory: 'mem',
  event: 'evt',
  user: 'user',
  tenant: 'tenant',
  channelBinding: 'chbind',
  channelIdentity: 'chident',
  channelDelivery: 'chdlv',
} as const;
