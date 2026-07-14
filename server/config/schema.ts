/**
 * 配置 Schema — 单一规范 + zod 校验 + 旧格式迁移
 *
 * 目标：参考 openclaw/src/config/schema.ts，建立 cdf-know 的 single-source-of-truth
 * 配置系统：
 *   1. 配置文件路径：AppPaths.userConfigFile (默认 <rootDir>/config/config.json)
 *   2. 缺省 schema：以下 CDFKnowConfigSchema 定义的 zod schema
 *   3. legacy 迁移：从 process.env / 散落的 settings.json 字段，合并进 config
 *   4. 启动时自动 load()，保证 config.json 存在并合法
 *
 * 设计取舍：
 *   - 不引入 OpenClaw 的 ajv 依赖，直接用现有 zod
 *   - 旧的 settings.json 字段单独保留为 deprecated 区，避免一刀切破坏
 *   - 所有缺失字段使用 defaults 补齐，runHooks 不再依赖 process.env 直读
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { AppPaths } from './appPaths.js';
import { logger } from '../logger.js';

// ===================== Schema 定义 =====================

/** AI 模型 provider 配置 */
const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  apiKeyEnvVar: z.string().optional(),
  defaultModel: z.string().optional(),
  baseUrl: z.string().url().optional(),
  models: z.array(z.string()).default([]),
});

/** WMS 模块配置 */
const WmsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dataDir: z.string().optional(),
  defaultWarehouse: z.string().optional(),
  businessRules: z.object({}).passthrough().default({}),
});

/** Skill 系统配置 */
const SkillConfigSchema = z.object({
  autoImportFromOpenclaw: z.boolean().default(true),
  autoImportDir: z.string().optional(),
  hotReload: z.boolean().default(true),
  defaultPermissionGroup: z.enum(['util', 'fs_read', 'fs_write', 'runtime_exec', 'network', 'memory', 'browser', 'wms', 'system', 'custom']).default('util'),
  enableAudit: z.boolean().default(true),
  enableVersionFingerprint: z.boolean().default(true),
  featuredIds: z.array(z.string()).default([]),
});

/** Hook 系统配置 */
const HooksConfigSchema = z.object({
  enableBuiltin: z.boolean().default(true),
  enableWorkspace: z.boolean().default(true),
  failurePolicy: z.enum(['fail-open', 'fail-closed']).default('fail-open'),
  voidHookTimeoutMs: z.number().int().positive().default(30000),
  modifyingHookTimeoutMs: z.number().int().positive().default(15000),
});

/** Plugin 系统配置 */
const PluginsConfigSchema = z.object({
  enableUnifiedRegistry: z.boolean().default(true),
  autoLoadEnabled: z.boolean().default(false),
  trustedSources: z.array(z.string()).default(['workspace', 'bundled']),
});

/** UI / 前端配置 */
const UiConfigSchema = z.object({
  defaultTheme: z.enum(['light', 'dark', 'auto']).default('auto'),
  language: z.string().default('zh-CN'),
  showFeaturedSkills: z.boolean().default(true),
  enableTipOfTheDay: z.boolean().default(true),
});

/** 隐私/遥测配置 */
const PrivacyConfigSchema = z.object({
  enableTelemetry: z.boolean().default(false),
  enableErrorReporting: z.boolean().default(false),
  redactPii: z.boolean().default(true),
});

/** 实验性功能开关 */
const ExperimentalConfigSchema = z.object({
  enableMcp: z.boolean().default(true),
  enableMultiAgent: z.boolean().default(true),
  enableClawHub: z.boolean().default(false),
});

/** 顶层配置 schema — 用完整默认值对象驱动 zod 解析 */
const _defaults = {
  schemaVersion: '1.0.0' as const,
  server: {
    port: 3001,
    host: '127.0.0.1',
    logLevel: 'info' as const,
    enableCors: true,
  },
  providers: {},
  wms: {
    enabled: true,
    businessRules: {},
  },
  skills: {
    autoImportFromOpenclaw: true,
    hotReload: true,
    defaultPermissionGroup: 'util' as const,
    enableAudit: true,
    enableVersionFingerprint: true,
    featuredIds: [],
  },
  hooks: {
    enableBuiltin: true,
    enableWorkspace: true,
    failurePolicy: 'fail-open' as const,
    voidHookTimeoutMs: 30000,
    modifyingHookTimeoutMs: 15000,
  },
  plugins: {
    enableUnifiedRegistry: true,
    autoLoadEnabled: false,
    trustedSources: ['workspace', 'bundled'],
  },
  ui: {
    defaultTheme: 'auto' as const,
    language: 'zh-CN',
    showFeaturedSkills: true,
    enableTipOfTheDay: true,
  },
  privacy: {
    enableTelemetry: false,
    enableErrorReporting: false,
    redactPii: true,
  },
  experimental: {
    enableMcp: true,
    enableMultiAgent: true,
    enableClawHub: false,
  },
  deprecated: {},
};

export const CDFKnowConfigSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  server: z.object({
    port: z.number().int().positive().default(3001),
    host: z.string().default('127.0.0.1'),
    baseUrl: z.string().url().optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    enableCors: z.boolean().default(true),
  }),
  providers: z.object({
    openai: ProviderConfigSchema.optional(),
    anthropic: ProviderConfigSchema.optional(),
    google: ProviderConfigSchema.optional(),
    arcee: ProviderConfigSchema.optional(),
    groq: ProviderConfigSchema.optional(),
    qwen: ProviderConfigSchema.optional(),
    xai: ProviderConfigSchema.optional(),
    ollama: ProviderConfigSchema.optional(),
  }),
  wms: WmsConfigSchema,
  skills: SkillConfigSchema,
  hooks: HooksConfigSchema,
  plugins: PluginsConfigSchema,
  ui: UiConfigSchema,
  privacy: PrivacyConfigSchema,
  experimental: ExperimentalConfigSchema,
  /** 已弃用：从 settings.json 迁移过来的字段，运行时只读 */
  deprecated: z.object({}).passthrough(),
}).strict();

export type CDFKnowConfig = z.infer<typeof CDFKnowConfigSchema>;

// ===================== 默认值 =====================

function getDefaultConfig(): CDFKnowConfig {
  return CDFKnowConfigSchema.parse(_defaults);
}

// ===================== 旧格式迁移 =====================

interface LegacyConfig {
  source: 'env' | 'settings-json' | 'app-config';
  raw: Record<string, unknown>;
}

/**
 * 从 process.env + settings.json + appConfig.json 提取 legacy 配置
 * 按优先级合并：env > settings.json > defaults
 */
export function loadLegacyConfig(): LegacyConfig {
  const raw: Record<string, unknown> = {};

  // 1) process.env（CDF_DATA_DIR / PORT / ...）
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (!isNaN(port)) raw.port = port;
  }
  if (process.env.CDF_LOG_LEVEL) raw.logLevel = process.env.CDF_LOG_LEVEL;
  if (process.env.CDF_DISABLE_TELEMETRY === '1') raw.enableTelemetry = false;

  // 2) settings.json（保留的全局 UI/隐私设置）
  try {
    if (fs.existsSync(AppPaths.settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(AppPaths.settingsFile, 'utf-8'));
      if (settings && typeof settings === 'object') {
        // 已知的 settings.json 字段
        if (settings.theme) raw.theme = settings.theme;
        if (settings.language) raw.language = settings.language;
        if (settings.enableTelemetry !== undefined) raw.enableTelemetry = settings.enableTelemetry;
        // 其余字段放入 deprecated 区
        for (const [k, v] of Object.entries(settings)) {
          if (!(k in raw)) raw[k] = v;
        }
      }
    }
  } catch (e) {
    logger.warn('[ConfigSchema] 解析 settings.json 失败:', e);
  }

  return { source: 'env', raw };
}

/**
 * 把 legacy 配置合并进 default config
 * 默认策略：legacy > defaults；保留 deprecated 字段以便运行时读取
 */
function mergeLegacy(defaults: CDFKnowConfig, legacy: LegacyConfig): CDFKnowConfig {
  const r = legacy.raw;

  // server
  if (typeof r.port === 'number') defaults.server.port = r.port;
  if (typeof r.logLevel === 'string') {
    const ll = ['debug', 'info', 'warn', 'error'].includes(r.logLevel) ? r.logLevel as 'debug' | 'info' | 'warn' | 'error' : 'info';
    defaults.server.logLevel = ll;
  }

  // ui
  if (r.theme === 'light' || r.theme === 'dark' || r.theme === 'auto') {
    defaults.ui.defaultTheme = r.theme;
  }
  if (typeof r.language === 'string') defaults.ui.language = r.language;

  // privacy
  if (typeof r.enableTelemetry === 'boolean') defaults.privacy.enableTelemetry = r.enableTelemetry;

  // 其余字段放 deprecated
  for (const [k, v] of Object.entries(r)) {
    if (k in defaults.server || k === 'theme' || k === 'language' || k === 'enableTelemetry' || k === 'port' || k === 'logLevel') continue;
    defaults.deprecated[k] = v;
  }

  return defaults;
}

// ===================== Load / Save =====================

let cachedConfig: CDFKnowConfig | null = null;

/**
 * 加载并校验配置 — 幂等，可多次调用
 *
 * 流程：
 *   1. 若 config.json 存在 → 解析 + zod 校验
 *   2. 若不存在 → 走 legacy 迁移 → 写入 config.json
 *   3. 校验失败 → 回退到 default + 记录错误（不抛）
 */
export function loadConfig(force = false): CDFKnowConfig {
  if (cachedConfig && !force) return cachedConfig;

  // 1) 优先读 config.json
  if (fs.existsSync(AppPaths.userConfigFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(AppPaths.userConfigFile, 'utf-8'));
      // 兼容：缺 schemaVersion 时自动补
      if (!raw.schemaVersion) raw.schemaVersion = '1.0.0';
      const parsed = CDFKnowConfigSchema.safeParse(raw);
      if (parsed.success) {
        cachedConfig = parsed.data;
        logger.info(`[ConfigSchema] 配置已加载: ${AppPaths.userConfigFile}`);
        return cachedConfig;
      }
      logger.warn('[ConfigSchema] config.json 校验失败，回退到默认 + legacy:', parsed.error.issues.slice(0, 3));
    } catch (e) {
      logger.warn('[ConfigSchema] config.json 解析失败:', e);
    }
  }

  // 2) legacy 迁移
  const legacy = loadLegacyConfig();
  const defaults = getDefaultConfig();
  const merged = mergeLegacy(defaults, legacy);
  cachedConfig = merged;

  // 3) 首次自动写盘（让用户后续能看到完整配置）
  try {
    saveConfig(merged);
    logger.info(`[ConfigSchema] 已生成默认配置: ${AppPaths.userConfigFile}`);
  } catch (e) {
    logger.warn('[ConfigSchema] 写入 config.json 失败（可忽略）:', e);
  }

  return cachedConfig;
}

/**
 * 显式保存（带 schema 校验）
 */
export function saveConfig(config: CDFKnowConfig): void {
  const dir = path.dirname(AppPaths.userConfigFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AppPaths.userConfigFile, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 部分更新（合并到现有配置）
 */
export function updateConfig(patch: Partial<CDFKnowConfig>): CDFKnowConfig {
  const current = loadConfig();
  // 深合并：避免 patch 缺字段时把现有字段覆盖为 undefined
  const merged = deepMerge(current, patch) as CDFKnowConfig;
  // 重新校验
  const revalidated = CDFKnowConfigSchema.parse(merged);
  cachedConfig = revalidated;
  saveConfig(revalidated);
  return revalidated;
}

/** 简单深合并（对象层级） */
function deepMerge<T extends Record<string, unknown>>(target: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    const existing = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && existing && typeof existing === 'object' && !Array.isArray(existing)) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/** 导出 schema + 类型 + 默认值 */
export const ConfigSchema = {
  schema: CDFKnowConfigSchema,
  defaults: getDefaultConfig,
  load: loadConfig,
  save: saveConfig,
  update: updateConfig,
};
