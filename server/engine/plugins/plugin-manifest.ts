/**
 * Plugin SDK 清单 — manifest 类型与校验
 *
 * 与现有 ./manifest.ts 与 ./loader.ts 的关系：
 * - ./manifest.ts 提供底层的 OpenClawPackageManifest 类型
 * - ./loader.ts 提供 parseVersion / validateManifest 等工具
 * - 本文件提供 SDK 层的 manifest 校验、规范化、序列化工具
 */

import type {
  PluginManifest,
  PluginToolDefinition,
  PluginTrigger,
  PluginConfigSchema,
  PluginDependency,
  PluginCapabilityKind,
} from './types.js';
import {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validateManifest as validateManifestBase,
} from './loader.js';
import { HOST_API_VERSION, HOST_API_SUPPORTED_RANGE, REQUIRED_MANIFEST_FIELDS } from './contract.js';
import { PluginManifestError } from './plugin-errors.js';
import { ALL_CAPABILITY_KINDS, ALL_RISK_LEVELS, RISK_LEVEL_AUTO } from './plugin-constants.js';

// ===================== 类型重新导出 =====================
// 注意：PluginManifest 不从此处重新导出，避免与 ./manifest.js 的 PluginManifest 冲突 (TS2308)。
// 下游可直接从 ./types.js 或 ./manifest.js 导入 PluginManifest。
export type {
  PluginToolDefinition,
  PluginTrigger,
  PluginConfigSchema,
  PluginDependency,
  PluginCapabilityKind,
};

// ===================== Manifest 校验 =====================

/** 校验结果 */
export interface ManifestValidationResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
}

/** 校验 manifest 字段完整性与合法性 */
export function validatePluginManifest(manifest: unknown): ManifestValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      violations: ['manifest 必须是对象'],
      warnings: [],
    };
  }

  const m = manifest as Record<string, unknown>;

  // 必需字段
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (m[field] === undefined || m[field] === null || m[field] === '') {
      violations.push(`缺少必需字段: ${String(field)}`);
    }
  }

  // id 格式校验
  if (typeof m.id === 'string') {
    if (!/^[a-z][a-z0-9_-]*$/.test(m.id)) {
      violations.push(`id 必须以小写字母开头，仅允许小写字母、数字、下划线、连字符: ${m.id}`);
    }
    if (m.id.length > 64) {
      violations.push('id 长度不能超过 64 字符');
    }
  }

  // version 格式校验
  if (typeof m.version === 'string') {
    try {
      parseVersion(m.version);
    } catch {
      violations.push(`version 必须是语义化版本号 (如 1.0.0): ${m.version}`);
    }
  }

  // apiVersion 兼容性
  if (m.apiVersion !== undefined && typeof m.apiVersion === 'string') {
    try {
      const hostVer = parseVersion(HOST_API_VERSION);
      const pluginVer = parseVersion(m.apiVersion);
      if (compareVersions(pluginVer, hostVer) > 0) {
        warnings.push(`插件 API 版本 ${m.apiVersion} 高于宿主 ${HOST_API_VERSION}，可能存在不兼容`);
      }
    } catch {
      violations.push(`apiVersion 格式无效: ${m.apiVersion}`);
    }
  }

  // 能力声明校验
  if (m.capabilities !== undefined) {
    if (!Array.isArray(m.capabilities)) {
      violations.push('capabilities 必须是数组');
    } else {
      for (const cap of m.capabilities) {
        if (!ALL_CAPABILITY_KINDS.includes(cap as PluginCapabilityKind)) {
          violations.push(`未知的能力种类: ${String(cap)}`);
        }
      }
    }
  }

  // 风险等级校验
  if (m.riskLevel !== undefined) {
    if (!ALL_RISK_LEVELS.includes(m.riskLevel as string)) {
      violations.push(`riskLevel 必须是 ${ALL_RISK_LEVELS.join(', ')} 之一: ${String(m.riskLevel)}`);
    }
  }

  // 工具定义校验
  if (m.tools !== undefined) {
    if (!Array.isArray(m.tools)) {
      violations.push('tools 必须是数组');
    } else {
      m.tools.forEach((tool, idx) => {
        if (!tool || typeof tool !== 'object') {
          violations.push(`tools[${idx}] 必须是对象`);
          return;
        }
        const t = tool as Record<string, unknown>;
        if (typeof t.name !== 'string' || t.name === '') {
          violations.push(`tools[${idx}].name 不能为空`);
        }
        if (typeof t.description !== 'string') {
          violations.push(`tools[${idx}].description 必须是字符串`);
        }
        if (!t.parameters || typeof t.parameters !== 'object') {
          violations.push(`tools[${idx}].parameters 必须是对象`);
        }
      });
    }
  }

  // 依赖校验
  if (m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies)) {
      violations.push('dependencies 必须是数组');
    } else {
      m.dependencies.forEach((dep, idx) => {
        if (!dep || typeof dep !== 'object') {
          violations.push(`dependencies[${idx}] 必须是对象`);
          return;
        }
        const d = dep as Record<string, unknown>;
        if (typeof d.id !== 'string' || d.id === '') {
          violations.push(`dependencies[${idx}].id 不能为空`);
        }
        if (typeof d.versionRange !== 'string') {
          violations.push(`dependencies[${idx}].versionRange 必须是字符串`);
        }
      });
    }
  }

  // entry / entrypoint 互斥校验
  if (m.entry !== undefined && m.entrypoint !== undefined && m.entry !== m.entrypoint) {
    warnings.push('同时声明了 entry 和 entrypoint 且值不同，将使用 entry');
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

/** 校验 manifest，失败时抛出 PluginManifestError */
export function assertValidManifest(manifest: unknown): asserts manifest is PluginManifest {
  const result = validatePluginManifest(manifest);
  if (!result.valid) {
    throw new PluginManifestError(
      `Manifest 校验失败: ${result.violations.join('; ')}`,
      result.violations,
    );
  }
}

// ===================== Manifest 规范化 =====================

/** 规范化 manifest（补全默认值、统一字段） */
export function normalizePluginManifest(input: unknown): PluginManifest {
  assertValidManifest(input);
  const m = { ...(input as PluginManifest) };

  // 补全默认值
  if (m.riskLevel === undefined) {
    m.riskLevel = RISK_LEVEL_AUTO;
  }
  if (m.entry === undefined && m.entrypoint !== undefined) {
    m.entry = m.entrypoint;
  }
  if (m.entry === undefined) {
    m.entry = 'index.js';
  }
  if (m.capabilities === undefined) {
    m.capabilities = [];
  }
  if (m.permissions === undefined) {
    m.permissions = [];
  }
  if (m.dependencies === undefined) {
    m.dependencies = [];
  }
  if (m.tools === undefined) {
    m.tools = [];
  }
  if (m.triggers === undefined) {
    m.triggers = [];
  }
  if (m.displayName === undefined) {
    m.displayName = m.name;
  }

  return m;
}

// ===================== Manifest 序列化 =====================

/** 将 manifest 序列化为 JSON 字符串（用于 DB 存储） */
export function serializeManifest(manifest: PluginManifest): string {
  return JSON.stringify(manifest);
}

/** 从 JSON 字符串解析 manifest（带校验） */
export function deserializeManifest(json: string): PluginManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new PluginManifestError(
      `Manifest JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return normalizePluginManifest(parsed);
}

// ===================== 版本工具重新导出 =====================

export {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validateManifestBase,
  HOST_API_VERSION,
  HOST_API_SUPPORTED_RANGE,
};

/** 检查 manifest 的 apiVersion 是否兼容宿主 */
export function isManifestApiVersionCompatible(manifest: PluginManifest): boolean {
  if (!manifest.apiVersion) {
    return true; // 未声明 apiVersion 视为兼容
  }
  try {
    const pluginVer = parseVersion(manifest.apiVersion);
    const hostVer = parseVersion(HOST_API_VERSION);
    return compareVersions(pluginVer, hostVer) <= 0;
  } catch {
    return false;
  }
}

/** 生成插件 ID（基于 name + version 的确定性哈希） */
export function generateDeterministicPluginId(name: string, version: string): string {
  const input = `${name}@${version}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `${safeName}-${Math.abs(hash).toString(36).slice(0, 6)}`;
}
