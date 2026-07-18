import { satisfiesVersion, parseVersion, compareVersions } from './loader.js';
import type { PluginManifest, PluginContractResult } from './types.js';

/**
 * 插件契约 — 接口规范 / 版本兼容性
 *
 * - 定义宿主与插件之间的 API 版本契约
 * - 提供 contract 校验工具，让 loader / lifecycle 在启用插件前自动校验
 * - 与 plugin-sdk/contract 互补：SDK 侧重暴露给插件作者的类型，本模块侧重宿主运行时校验
 */

/** 宿主当前 API 版本 */
export const HOST_API_VERSION = '1.0.0';

/** 宿主兼容范围（默认支持 ^1.0） */
export const HOST_API_SUPPORTED_RANGE = '^1.0.0';

/** 必需的 manifest 字段 */
export const REQUIRED_MANIFEST_FIELDS: ReadonlyArray<keyof PluginManifest> = [
  'id',
  'name',
  'version',
];

/** 必需的工具字段 */
export const REQUIRED_TOOL_FIELDS: ReadonlyArray<keyof PluginManifest['tools'] extends Array<infer T> ? T : never> = [
  'name',
  'description',
  'parameters',
];

/**
 * 校验插件契约：
 * 1. 必需字段齐全
 * 2. apiVersion 在宿主支持范围内
 * 3. 工具定义合法
 * 4. 依赖声明合法
 */
export function checkPluginContract(
  manifest: PluginManifest,
  options: { hostApiVersion?: string; supportedRange?: string } = {},
): PluginContractResult {
  const hostApiVersion = options.hostApiVersion ?? HOST_API_VERSION;
  const supportedRange = options.supportedRange ?? HOST_API_SUPPORTED_RANGE;
  const reasons: string[] = [];

  // 1. 必需字段
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    const value = manifest[field];
    if (value === undefined || value === null || value === '') {
      reasons.push(`缺少必需字段: ${String(field)}`);
    }
  }

  // 2. apiVersion 兼容性
  const pluginApiVersion = manifest.apiVersion ?? '1.0.0';
  let pluginApiOk = true;
  try {
    parseVersion(pluginApiVersion);
  } catch {
    reasons.push(`apiVersion 非法: ${pluginApiVersion}`);
    pluginApiOk = false;
  }
  if (pluginApiOk && !satisfiesVersion(pluginApiVersion, supportedRange)) {
    reasons.push(
      `apiVersion ${pluginApiVersion} 不在宿主支持范围 ${supportedRange} 内`,
    );
  }

  // 3. 宿主版本自身校验（防止配置错误）
  try {
    parseVersion(hostApiVersion);
  } catch {
    reasons.push(`hostApiVersion 非法: ${hostApiVersion}`);
  }

  // 4. 工具定义
  if (manifest.tools) {
    for (const tool of manifest.tools) {
      if (!tool.name || typeof tool.name !== 'string') {
        reasons.push(`工具 name 缺失或非字符串: ${JSON.stringify(tool)}`);
        continue;
      }
      if (!tool.description) {
        reasons.push(`工具 ${tool.name} 缺少 description`);
      }
      if (!tool.parameters || tool.parameters.type !== 'object') {
        reasons.push(`工具 ${tool.name} parameters 必须为 object 类型`);
      }
    }
  }

  // 5. 依赖声明
  if (manifest.dependencies) {
    for (const dep of manifest.dependencies) {
      if (!dep.id || typeof dep.id !== 'string') {
        reasons.push(`依赖 id 非法: ${JSON.stringify(dep)}`);
      }
      if (!dep.versionRange || typeof dep.versionRange !== 'string') {
        reasons.push(`依赖 ${dep.id} 缺少 versionRange`);
      }
    }
  }

  return {
    compatible: reasons.length === 0,
    reasons,
    hostApiVersion,
    pluginApiVersion,
  };
}

/**
 * 比较两个插件的版本号，判断是否为升级。
 *
 * 返回：
 * - 'upgrade'：toVersion > fromVersion
 * - 'downgrade'：toVersion < fromVersion
 * - 'same'：版本相同
 */
export function comparePluginVersions(
  fromVersion: string,
  toVersion: string,
): 'upgrade' | 'downgrade' | 'same' {
  const from = parseVersion(fromVersion);
  const to = parseVersion(toVersion);
  const cmp = compareVersions(to, from);
  if (cmp > 0) return 'upgrade';
  if (cmp < 0) return 'downgrade';
  return 'same';
}

/**
 * 校验 manifest 是否符合最小契约（用于安装前快速拒绝）。
 */
export function isManifestContractValid(manifest: PluginManifest): boolean {
  return checkPluginContract(manifest).compatible;
}

/**
 * 生成契约报告（人类可读）。
 */
export function formatContractReport(result: PluginContractResult): string {
  const lines: string[] = [
    `Plugin Contract Report`,
    `  Compatible: ${result.compatible ? 'YES' : 'NO'}`,
    `  Host API: ${result.hostApiVersion}`,
    `  Plugin API: ${result.pluginApiVersion}`,
  ];
  if (result.reasons.length > 0) {
    lines.push('  Reasons:');
    for (const reason of result.reasons) {
      lines.push(`    - ${reason}`);
    }
  }
  return lines.join('\n');
}
