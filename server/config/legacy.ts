// 遗留配置迁移
// 参考 openclaw/src/config/legacy.ts 与 legacy.shared.ts 的设计，
// 检测旧版本配置、提供迁移路径（doctor --fix）、废弃配置项警告

import { logger } from '../logger.js';
import { LEGACY_CONFIG_VERSION } from './version.js';

// ============================================================================
// 类型定义
// ============================================================================

export type ConfigRecord = Record<string, unknown>;

// 遗留配置规则：描述一条废弃/重命名配置项的检测条件与提示信息
export interface LegacyConfigRule {
  // 配置路径（点分形式，用于 doctor 报告精确键名）
  path: string[];
  // 人类可读的问题描述
  message: string;
  // 可选的值匹配函数，进一步限定触发条件
  match?: (value: unknown, root: ConfigRecord) => boolean;
  // 若为 true，仅当原始解析源中存在该值时才报告（区分 include/env 注入）
  requireSourceLiteral?: boolean;
}

// 遗留配置迁移规约：描述一条 doctor --fix 可执行的迁移操作
export interface LegacyConfigMigrationSpec {
  // 迁移 id
  id: string;
  // 迁移描述
  describe: string;
  // 应用迁移：原地修改 raw，并向 changes 追加变更说明
  apply: (raw: ConfigRecord, changes: string[]) => void;
  // 关联的遗留检测规则
  legacyRules?: LegacyConfigRule[];
}

// 遗留配置检测结果
export interface LegacyConfigIssue {
  // 配置路径（点分字符串）
  path: string;
  // 问题描述
  message: string;
}

// ============================================================================
// 内置遗留检测规则
// ============================================================================

// 内置的遗留配置规则集合（随版本演进积累的废弃/重命名项）
export const LEGACY_CONFIG_RULES: readonly LegacyConfigRule[] = [
  {
    path: ['gateway', 'legacyAuth'],
    message: '已废弃，请改用 auth.profiles 配置鉴权',
  },
  {
    path: ['models', 'legacyDefault'],
    message: '已废弃，请改用 models.default',
  },
  {
    path: ['agents', 'legacyConcurrency'],
    message: '已废弃，请改用 agents.defaults.maxConcurrent',
  },
  {
    path: ['session', 'legacyMainKey'],
    message: '已废弃，主会话键固定为 "main"',
  },
];

// ============================================================================
// 内置迁移规约
// ============================================================================

// 内置的迁移规约集合（doctor --fix 可执行）
export const LEGACY_CONFIG_MIGRATION_RULES: readonly LegacyConfigMigrationSpec[] = [
  {
    id: 'gateway-legacy-auth-to-profiles',
    describe: '将 gateway.legacyAuth 迁移至 auth.profiles',
    apply: (raw, changes) => {
      const gateway = raw.gateway;
      if (!gateway || typeof gateway !== 'object') {
        return;
      }
      const legacyAuth = (gateway as ConfigRecord).legacyAuth;
      if (legacyAuth === undefined) {
        return;
      }
      const auth = (raw.auth && typeof raw.auth === 'object' ? raw.auth : {}) as ConfigRecord;
      const profiles = (auth.profiles && typeof auth.profiles === 'object'
        ? auth.profiles
        : {}) as ConfigRecord;
      profiles.legacy = legacyAuth;
      auth.profiles = profiles;
      raw.auth = auth;
      delete (gateway as ConfigRecord).legacyAuth;
      changes.push('gateway.legacyAuth -> auth.profiles.legacy');
    },
    legacyRules: [LEGACY_CONFIG_RULES[0]],
  },
  {
    id: 'models-legacy-default-to-default',
    describe: '将 models.legacyDefault 迁移至 models.default',
    apply: (raw, changes) => {
      const models = raw.models;
      if (!models || typeof models !== 'object') {
        return;
      }
      const modelsRecord = models as ConfigRecord;
      const legacyDefault = modelsRecord.legacyDefault;
      if (legacyDefault === undefined) {
        return;
      }
      if (modelsRecord.default === undefined) {
        modelsRecord.default = legacyDefault;
      }
      delete modelsRecord.legacyDefault;
      changes.push('models.legacyDefault -> models.default');
    },
    legacyRules: [LEGACY_CONFIG_RULES[1]],
  },
  {
    id: 'agents-legacy-concurrency-to-defaults',
    describe: '将 agents.legacyConcurrency 迁移至 agents.defaults.maxConcurrent',
    apply: (raw, changes) => {
      const agents = raw.agents;
      if (!agents || typeof agents !== 'object') {
        return;
      }
      const agentsRecord = agents as ConfigRecord;
      const legacyConcurrency = agentsRecord.legacyConcurrency;
      if (legacyConcurrency === undefined) {
        return;
      }
      const defaults = (agentsRecord.defaults && typeof agentsRecord.defaults === 'object'
        ? agentsRecord.defaults
        : {}) as ConfigRecord;
      if (defaults.maxConcurrent === undefined) {
        defaults.maxConcurrent = legacyConcurrency;
      }
      agentsRecord.defaults = defaults;
      delete agentsRecord.legacyConcurrency;
      changes.push('agents.legacyConcurrency -> agents.defaults.maxConcurrent');
    },
    legacyRules: [LEGACY_CONFIG_RULES[2]],
  },
];

// ============================================================================
// 路径访问工具
// ============================================================================

// 按点分路径数组读取配置值
function getPathValue(root: ConfigRecord, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as ConfigRecord)[key];
  }
  return cursor;
}

// 判断值是否为普通对象
function isRecord(value: unknown): value is ConfigRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ============================================================================
// 检测
// ============================================================================

// 检测遗留配置问题：基于内置规则 + 调用方提供的额外规则
export function detectLegacyConfig(
  raw: unknown,
  sourceRaw?: unknown,
  extraRules: LegacyConfigRule[] = [],
): LegacyConfigIssue[] {
  if (!isRecord(raw)) {
    return [];
  }
  const root = raw;
  const sourceRoot = isRecord(sourceRaw) ? sourceRaw : root;
  const issues: LegacyConfigIssue[] = [];

  for (const rule of [...LEGACY_CONFIG_RULES, ...extraRules]) {
    const cursor = getPathValue(root, rule.path);
    if (cursor === undefined) {
      continue;
    }
    if (rule.match && !rule.match(cursor, root)) {
      continue;
    }
    if (rule.requireSourceLiteral) {
      const sourceCursor = getPathValue(sourceRoot, rule.path);
      if (sourceCursor === undefined) {
        continue;
      }
      if (rule.match && !rule.match(sourceCursor, sourceRoot)) {
        continue;
      }
    }
    issues.push({ path: rule.path.join('.'), message: rule.message });
  }

  return issues;
}

// ============================================================================
// 迁移
// ============================================================================

export interface MigrateLegacyConfigResult {
  // 迁移后的配置（深拷贝，不修改入参）
  migrated: ConfigRecord;
  // 应用的迁移 id 列表
  appliedMigrations: string[];
  // 变更说明列表
  changes: string[];
  // 迁移后仍残留的遗留问题（未提供迁移规约的项）
  remainingIssues: LegacyConfigIssue[];
}

// 迁移遗留配置：依次应用所有内置迁移规约，返回迁移结果
// 原始入参不被修改；返回深拷贝后的迁移结果
export function migrateLegacyConfig(
  raw: unknown,
  options?: {
    extraMigrations?: LegacyConfigMigrationSpec[];
    fix?: boolean;
  },
): MigrateLegacyConfigResult {
  const fix = options?.fix ?? true;
  const sourceRecord = isRecord(raw) ? raw : {};
  // 深拷贝以避免修改入参
  const migrated: ConfigRecord = JSON.parse(JSON.stringify(sourceRecord));
  const appliedMigrations: string[] = [];
  const changes: string[] = [];

  if (fix) {
    const migrations = [...LEGACY_CONFIG_MIGRATION_RULES, ...(options?.extraMigrations ?? [])];
    for (const migration of migrations) {
      const beforeKeys = JSON.stringify(sortKeys(migrated));
      migration.apply(migrated, changes);
      const afterKeys = JSON.stringify(sortKeys(migrated));
      if (beforeKeys !== afterKeys || changes.length > appliedMigrations.length) {
        appliedMigrations.push(migration.id);
      }
    }
  }

  const remainingIssues = detectLegacyConfig(migrated, sourceRecord);

  if (appliedMigrations.length > 0) {
    logger.info(`[config] 已应用 ${appliedMigrations.length} 条遗留配置迁移: ${appliedMigrations.join(', ')}`);
  }
  if (remainingIssues.length > 0) {
    logger.warn(`[config] 仍存在 ${remainingIssues.length} 条遗留配置问题`);
  }

  return {
    migrated,
    appliedMigrations,
    changes,
    remainingIssues,
  };
}

// 递归收集对象的所有键（用于检测迁移是否实际改变了结构）
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isRecord(value)) {
    const sorted: ConfigRecord = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

// ============================================================================
// 版本检测
// ============================================================================

// 检测配置版本是否为遗留版本（低于 LEGACY_CONFIG_VERSION）
export function detectLegacyConfigVersion(cfg: unknown): {
  isLegacy: boolean;
  version: string | null;
} {
  if (!isRecord(cfg)) {
    return { isLegacy: false, version: null };
  }
  const meta = isRecord(cfg.meta) ? cfg.meta : undefined;
  const version =
    typeof meta?.configVersion === 'string'
      ? meta.configVersion
      : typeof meta?.lastTouchedVersion === 'string'
        ? meta.lastTouchedVersion
        : null;
  if (!version) {
    // 未声明版本号视为遗留配置
    return { isLegacy: true, version: null };
  }
  // 延迟引入版本比较以避免循环依赖
  // 这里通过简单的字符串前缀比较：低于 LEGACY_CONFIG_VERSION 主版本即视为遗留
  const legacyMajor = Number.parseInt(LEGACY_CONFIG_VERSION.split('.')[0], 10);
  const currentMajor = Number.parseInt(version.split('.')[0], 10);
  const isLegacy = Number.isFinite(currentMajor) && Number.isFinite(legacyMajor) && currentMajor < legacyMajor;
  return { isLegacy, version };
}

// 导出 LEGACY_CONFIG_VERSION 便于外部引用（与 version.ts 保持一致）
export { LEGACY_CONFIG_VERSION } from './version.js';
