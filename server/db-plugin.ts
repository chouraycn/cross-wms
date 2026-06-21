import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

// ===================== v3.0: Plugin & API Types =====================

export interface PluginRow {
  id: string;
  name: string;
  display_name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  manifest_json: string;
  entry_path: string;
  install_path: string;
  status: string;
  trigger_keywords: string;
  permissions: string;
  risk_level: string;
  size_bytes: number;
  metadata: string;
  installed_at: string;
  updated_at: string;
}

export interface ApiDomainWhitelistRow {
  id: string;
  hostname: string;
  description: string;
  category: string;
  is_deletable: number;
  created_at: string;
}

export interface ApiTemplateRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  method: string;
  path_template: string;
  headers_json: string;
  body_template: string;
  response_path: string;
  response_extractor: string;
  risk_level: string;
  is_builtin: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface ApiCredentialRow {
  id: string;
  name: string;
  credential_type: string;
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  domain: string;
  header_name: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiRequestHistoryRow {
  id: string;
  template_id: string | null;
  url: string;
  method: string;
  status_code: number | null;
  duration_ms: number | null;
  request_headers: string;
  request_body: string | null;
  response_headers: string;
  response_body: string | null;
  is_success: number;
  extracted_preview: string | null;
  error: string | null;
  session_id: string | null;
  automation_id: string | null;
  executed_at: string;
}

// ===================== v3.0: Browser Profile Types =====================

export interface BrowserProfileRow {
  id: string;
  name: string;
  user_data_dir: string;
  is_default: number; // 0 or 1
  created_at: string;
}

// ===================== v3.0: Tools v3 Plugin & HTTP Tables =====================

export function initPluginTables(db: Database.Database): void {
  db.exec(`
    -- 1. Plugins table
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      author TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      manifest_json TEXT NOT NULL DEFAULT '{}',
      entry_path TEXT NOT NULL DEFAULT 'index.js',
      install_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'installed' CHECK(status IN ('installed','enabled','disabled','error','uninstalled')),
      trigger_keywords TEXT DEFAULT '[]',
      permissions TEXT DEFAULT '[]',
      risk_level TEXT NOT NULL DEFAULT 'auto' CHECK(risk_level IN ('auto','confirm','high-risk')),
      size_bytes INTEGER NOT NULL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
    CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);

    -- 2. API Domain Whitelist
    CREATE TABLE IF NOT EXISTS api_domain_whitelist (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'user' CHECK(category IN ('system','user')),
      is_deletable INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_api_domain_whitelist_hostname ON api_domain_whitelist(hostname);
    CREATE INDEX IF NOT EXISTS idx_api_domain_whitelist_category ON api_domain_whitelist(category);

    -- 3. API Templates
    CREATE TABLE IF NOT EXISTS api_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT 'GET',
      path_template TEXT NOT NULL DEFAULT '/',
      headers_json TEXT DEFAULT '{}',
      body_template TEXT DEFAULT '',
      response_path TEXT DEFAULT '',
      response_extractor TEXT NOT NULL DEFAULT 'none' CHECK(response_extractor IN ('none','jsonpath','css','regex')),
      risk_level TEXT NOT NULL DEFAULT 'auto' CHECK(risk_level IN ('auto','confirm','high-risk')),
      is_builtin INTEGER NOT NULL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_api_templates_domain ON api_templates(domain);
    CREATE INDEX IF NOT EXISTS idx_api_templates_risk ON api_templates(risk_level);

    -- 4. API Credentials (encrypted at rest)
    CREATE TABLE IF NOT EXISTS api_credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      credential_type TEXT NOT NULL DEFAULT 'api_key' CHECK(credential_type IN ('api_key','bearer_token','basic_auth','oauth2','custom_header')),
      encrypted_value TEXT NOT NULL DEFAULT '',
      iv TEXT NOT NULL DEFAULT '',
      auth_tag TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      header_name TEXT NOT NULL DEFAULT 'Authorization',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_api_credentials_domain ON api_credentials(domain);

    -- 5. API Request History
    CREATE TABLE IF NOT EXISTS api_request_history (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      url TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      status_code INTEGER,
      duration_ms INTEGER,
      request_headers TEXT DEFAULT '{}',
      request_body TEXT,
      response_headers TEXT DEFAULT '{}',
      response_body TEXT,
      is_success INTEGER NOT NULL DEFAULT 0,
      extracted_preview TEXT,
      error TEXT,
      session_id TEXT,
      automation_id TEXT,
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES api_templates(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_req_history_executed ON api_request_history(executed_at);
    CREATE INDEX IF NOT EXISTS idx_api_req_history_template ON api_request_history(template_id);
  `);

  // v3.0: Add is_success / extracted_preview columns to api_request_history (idempotent)
  const apiReqHistoryColumns: Array<{ column: string; definition: string }> = [
    { column: 'is_success', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { column: 'extracted_preview', definition: 'TEXT' },
  ];
  for (const { column, definition } of apiReqHistoryColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('api_request_history') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE api_request_history ADD COLUMN ${column} ${definition}`);
      logger.info(`[Migrate v3.0] 添加 ${column} 列到 api_request_history`);
    }
  }

  // v3.0: Seed built-in API templates
  const v300SeedKey = 'migration_v3.0_seed_templates';
  const v300SeedExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v300SeedKey) as { value: string } | undefined;
  if (!v300SeedExists) {
    const now = new Date().toISOString();
    const builtinTemplates = [
      { id: 'github_list_repos', name: '列出仓库', description: '列出 GitHub 用户仓库', domain: 'api.github.com', method: 'GET', path_template: '/users/{username}/repos' },
      { id: 'github_create_issue', name: '创建 Issue', description: '在 GitHub 仓库创建 Issue', domain: 'api.github.com', method: 'POST', path_template: '/repos/{owner}/{repo}/issues' },
      { id: 'wechat_send_msg', name: '发送微信消息', description: '通过企业微信机器人发送消息', domain: 'qyapi.weixin.qq.com', method: 'POST', path_template: '/cgi-bin/webhook/send' },
      { id: 'tencent_doc_read', name: '读取腾讯文档', description: '读取指定腾讯文档内容', domain: 'docs.qq.com', method: 'GET', path_template: '/openapi/drive/v2/files/{fileId}' },
      { id: 'feishu_send_msg', name: '发送飞书消息', description: '通过飞书机器人发送消息', domain: 'open.feishu.cn', method: 'POST', path_template: '/open-apis/bot/v2/hook/{hookId}' },
    ];
    const insertTemplate = db.prepare(
      `INSERT OR IGNORE INTO api_templates (id, name, description, domain, method, path_template, is_builtin, risk_level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'confirm', ?, ?)`
    );
    for (const t of builtinTemplates) {
      insertTemplate.run(t.id, t.name, t.description, t.domain, t.method, t.path_template, now, now);
    }
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(v300SeedKey, JSON.stringify({ migratedAt: now, count: builtinTemplates.length }));
    logger.info(`[Migrate v3.0] 已植入 ${builtinTemplates.length} 个内置 API 模板`);
  }

  // v3.0: Seed built-in domain whitelist (11 hardcoded domains → DB)
  const v300DomainKey = 'migration_v3.0_seed_domains';
  const v300DomainExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v300DomainKey) as { value: string } | undefined;
  if (!v300DomainExists) {
    const now = new Date().toISOString();
    const builtinDomains = [
      { hostname: 'api.github.com', desc: 'GitHub API' },
      { hostname: 'api.openai.com', desc: 'OpenAI API' },
      { hostname: 'api.anthropic.com', desc: 'Anthropic API' },
      { hostname: 'generativelanguage.googleapis.com', desc: 'Google Gemini API' },
      { hostname: 'api.weixin.qq.com', desc: '微信 API' },
      { hostname: 'qyapi.weixin.qq.com', desc: '企业微信 API' },
      { hostname: 'docs.qq.com', desc: '腾讯文档' },
      { hostname: 'api.day.app', desc: 'Day One API' },
      { hostname: 'open.feishu.cn', desc: '飞书开放平台' },
      { hostname: 'api.money.126.net', desc: '网易财经 API' },
      { hostname: 'pushbear.ftqq.com', desc: 'PushBear 通知' },
    ];
    const insertDomain = db.prepare(
      `INSERT OR IGNORE INTO api_domain_whitelist (id, hostname, description, category, is_deletable, created_at)
       VALUES (?, ?, ?, 'system', 0, ?)`
    );
    for (const d of builtinDomains) {
      insertDomain.run(uuidv4(), d.hostname, d.desc, now);
    }
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(v300DomainKey, JSON.stringify({ migratedAt: now, count: builtinDomains.length }));
    logger.info(`[Migrate v3.0] 已植入 ${builtinDomains.length} 个内置域名白名单`);
  }

  logger.info('[Migrate v3.0] Tools v3 数据库迁移完成');

  // ===================== v3.0: Browser Profiles =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_data_dir TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default browser profile
  const v3BrowserProfilesKey = 'migration_v3.0_browser_profiles';
  const v3BrowserProfilesExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v3BrowserProfilesKey) as { value: string } | undefined;
  if (!v3BrowserProfilesExists) {
    db.prepare(
      "INSERT OR IGNORE INTO browser_profiles (id, name, user_data_dir, is_default) VALUES ('default', 'Default', '', 1)"
    ).run();
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      v3BrowserProfilesKey,
      JSON.stringify({ migratedAt: new Date().toISOString() })
    );
    logger.info('[Migrate v3.0] 已植入默认 browser_profile');
  }
}
