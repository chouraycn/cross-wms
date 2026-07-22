/**
 * Plugin Validator — 插件校验器
 *
 * 对插件 manifest 进行全面校验：
 * - 基础字段校验（id/name/version）
 * - API 版本兼容性
 * - 工具定义校验
 * - 依赖声明校验
 * - 权限声明校验
 * - 安全风险检查
 *
 * 与 ./plugin-manifest.ts 互补：
 * - plugin-manifest.ts 提供 validatePluginManifest / assertValidManifest
 * - 本文件在 manifest 校验基础上增加契约校验、安全校验等
 */

import type { PluginManifest, PluginToolDefinition, PluginDependency } from './types.js';
import { HOST_API_VERSION, HOST_API_SUPPORTED_RANGE, checkPluginContract } from './contract.js';
import { parseVersion } from './loader.js';
import {
  HIGH_RISK_CAPABILITIES,
  RISK_LEVEL_HIGH_RISK,
  RISK_LEVEL_AUTO,
} from './plugin-constants.js';
import { validatePluginManifest, normalizePluginManifest } from './plugin-manifest.js';

/** 校验结果 */
export interface PluginValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 违规项 */
  violations: string[];
  /** 警告项 */
  warnings: string[];
  /** 校验的插件 ID */
  pluginId?: string;
}

/** 校验选项 */
export interface PluginValidationOptions {
  /** 宿主 API 版本 */
  hostApiVersion?: string;
  /** 宿主支持的 API 版本范围 */
  supportedRange?: string;
  /** 已安装的插件 ID 集合（用于依赖检查） */
  installedPlugins?: Set<string>;
  /** 是否检查安全风险 */
  checkSecurity?: boolean;
  /** 是否检查工具定义 */
  checkTools?: boolean;
}

const DEFAULT_OPTIONS: Required<PluginValidationOptions> = {
  hostApiVersion: HOST_API_VERSION,
  supportedRange: HOST_API_SUPPORTED_RANGE,
  installedPlugins: new Set(),
  checkSecurity: true,
  checkTools: true,
};

/** 校验插件（全面校验） */
export function validatePlugin(
  manifest: PluginManifest,
  options: PluginValidationOptions = {},
): PluginValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const violations: string[] = [];
  const warnings: string[] = [];

  // 1. 基础清单校验
  const manifestResult = validatePluginManifest(manifest);
  violations.push(...manifestResult.violations);
  warnings.push(...manifestResult.warnings);

  // 2. 契约校验（API 版本兼容性）
  const contract = checkPluginContract(manifest, {
    hostApiVersion: opts.hostApiVersion,
    supportedRange: opts.supportedRange,
  });
  if (!contract.compatible) {
    violations.push(...contract.reasons);
  }

  // 3. 工具定义校验
  if (opts.checkTools && manifest.tools) {
    const toolErrors = validateToolDefinitions(manifest.tools);
    violations.push(...toolErrors);
  }

  // 4. 依赖校验
  if (manifest.dependencies) {
    const depResult = validateDependencies(manifest.dependencies, opts.installedPlugins);
    violations.push(...depResult.violations);
    warnings.push(...depResult.warnings);
  }

  // 5. 安全风险检查
  if (opts.checkSecurity) {
    const secResult = checkSecurityRisks(manifest);
    violations.push(...secResult.violations);
    warnings.push(...secResult.warnings);
  }

  // 6. 入口文件检查
  if (!manifest.entry && !manifest.entrypoint) {
    warnings.push('未指定 entry 或 entrypoint，将使用默认值 index.js');
  }

  // 7. 能力声明检查
  if (manifest.capabilities) {
    for (const cap of manifest.capabilities) {
      if (HIGH_RISK_CAPABILITIES.includes(cap)) {
        warnings.push(`能力 ${cap} 属于高风险能力，需要显式权限确认`);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
    ...(manifest.id !== undefined ? { pluginId: manifest.id } : {}),
  };
}

/** 校验工具定义 */
export function validateToolDefinitions(tools: PluginToolDefinition[]): string[] {
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (const tool of tools) {
    // 名称校验
    if (!tool.name || typeof tool.name !== 'string') {
      errors.push(`工具 name 缺失或非字符串: ${JSON.stringify(tool)}`);
      continue;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(tool.name)) {
      errors.push(`工具名非法: ${tool.name}（仅允许字母、数字、下划线、点、连字符）`);
    }
    if (seenNames.has(tool.name)) {
      errors.push(`工具名重复: ${tool.name}`);
    }
    seenNames.add(tool.name);

    // 描述校验
    if (!tool.description || typeof tool.description !== 'string') {
      errors.push(`工具 ${tool.name} 缺少 description`);
    }

    // 参数校验
    if (!tool.parameters) {
      errors.push(`工具 ${tool.name} 缺少 parameters`);
    } else if (tool.parameters.type !== 'object') {
      errors.push(`工具 ${tool.name} parameters.type 必须为 'object'`);
    }
  }

  return errors;
}

/** 校验依赖声明 */
export function validateDependencies(
  dependencies: PluginDependency[],
  installedPlugins: Set<string>,
): { violations: string[]; warnings: string[] } {
  const violations: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const dep of dependencies) {
    // ID 校验
    if (!dep.id || typeof dep.id !== 'string') {
      violations.push(`依赖 id 非法: ${JSON.stringify(dep)}`);
      continue;
    }
    if (seenIds.has(dep.id)) {
      warnings.push(`依赖 ${dep.id} 被重复声明`);
    }
    seenIds.add(dep.id);

    // 版本范围校验
    if (!dep.versionRange || typeof dep.versionRange !== 'string') {
      violations.push(`依赖 ${dep.id} 缺少 versionRange`);
    } else {
      try {
        // 尝试解析版本范围中的版本号
        const range = dep.versionRange.trim();
        if (range !== '*' && range !== '') {
          const versionMatch = /\d+\.\d+\.\d+/.exec(range);
          if (versionMatch) {
            parseVersion(versionMatch[0]);
          }
        }
      } catch {
        violations.push(`依赖 ${dep.id} versionRange 非法: ${dep.versionRange}`);
      }
    }

    // 检查是否已安装
    if (installedPlugins.size > 0 && !installedPlugins.has(dep.id) && !dep.optional) {
      violations.push(`依赖 ${dep.id} 未安装且非可选`);
    }
  }

  return { violations, warnings };
}

/** 安全风险检查 */
export function checkSecurityRisks(manifest: PluginManifest): { violations: string[]; warnings: string[] } {
  const violations: string[] = [];
  const warnings: string[] = [];

  // 高风险能力需要 confirm 或 high-risk 等级
  if (manifest.capabilities) {
    const hasHighRiskCap = manifest.capabilities.some((c) => HIGH_RISK_CAPABILITIES.includes(c));
    if (hasHighRiskCap) {
      const riskLevel = manifest.riskLevel ?? RISK_LEVEL_AUTO;
      if (riskLevel === RISK_LEVEL_AUTO) {
        warnings.push('声明了高风险能力但风险等级为 auto，建议设置为 confirm 或 high-risk');
      }
    }
  }

  // 高风险等级需要显式声明权限
  if (manifest.riskLevel === RISK_LEVEL_HIGH_RISK) {
    if (!manifest.permissions || manifest.permissions.length === 0) {
      warnings.push('高风险插件未声明任何权限');
    }
  }

  // 检查入口文件路径
  const entry = manifest.entry ?? manifest.entrypoint;
  if (entry) {
    if (entry.includes('..')) {
      violations.push(`入口文件路径包含目录穿越: ${entry}`);
    }
    if (entry.startsWith('/')) {
      warnings.push(`入口文件路径使用了绝对路径: ${entry}`);
    }
  }

  // 检查工具数量
  if (manifest.tools && manifest.tools.length > 100) {
    warnings.push(`工具数量过多 (${manifest.tools.length})，可能影响性能`);
  }

  return { violations, warnings };
}

/** 快速校验（仅检查必需字段） */
export function quickValidate(manifest: PluginManifest): boolean {
  return validatePlugin(manifest, {
    checkSecurity: false,
    checkTools: false,
  }).valid;
}

/** 校验并规范化 */
export function validateAndNormalize(manifest: PluginManifest, options?: PluginValidationOptions): {
  manifest: PluginManifest;
  result: PluginValidationResult;
} {
  const result = validatePlugin(manifest, options);
  const normalized = normalizePluginManifest(manifest);
  return { manifest: normalized, result };
}
