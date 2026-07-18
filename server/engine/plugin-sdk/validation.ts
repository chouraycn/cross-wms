import type {
  PluginDefinition,
  PluginSdkToolRegistration,
  PluginCommandDefinition,
  SdkValidationResult,
  SdkValidationError,
  PluginManifest,
} from './types.js';
import { isValidPluginId } from './decorators.js';

/**
 * SDK 验证工具 — 插件定义 / manifest / 工具 / 命令的运行时校验
 *
 * 与 plugins/loader.ts 的 validateManifest 互补：
 * - loader.ts 在宿主侧校验 manifest（来自 plugin.json）
 * - 本模块在 SDK 侧校验插件作者通过 definePlugin / defineTool 写出的对象
 */

const PLUGIN_ID_PATTERN = /^[a-z0-9_-]+$/;
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * 校验插件定义。
 */
export function validatePluginDefinition(def: PluginDefinition): SdkValidationResult {
  const errors: SdkValidationError[] = [];
  if (!def.id) {
    errors.push({ field: 'id', message: 'id 不能为空' });
  } else if (!PLUGIN_ID_PATTERN.test(def.id)) {
    errors.push({
      field: 'id',
      message: `id '${def.id}' 不合法（仅允许小写字母、数字、下划线、连字符）`,
    });
  }
  if (!def.name) {
    errors.push({ field: 'name', message: 'name 不能为空' });
  }
  if (typeof def.register !== 'function') {
    errors.push({ field: 'register', message: 'register 必须是函数' });
  }
  if (def.version && !VERSION_PATTERN.test(def.version)) {
    errors.push({ field: 'version', message: `version '${def.version}' 非法` });
  }
  if (def.configSchema && typeof def.configSchema !== 'object') {
    errors.push({ field: 'configSchema', message: 'configSchema 必须为对象' });
  }
  if (def.capabilities && !Array.isArray(def.capabilities)) {
    errors.push({ field: 'capabilities', message: 'capabilities 必须为数组' });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 校验工具注册。
 */
export function validateToolRegistration(tool: PluginSdkToolRegistration): SdkValidationResult {
  const errors: SdkValidationError[] = [];
  if (!tool.name || !TOOL_NAME_PATTERN.test(tool.name)) {
    errors.push({ field: 'name', message: `工具名 '${tool.name}' 非法` });
  }
  if (!tool.description) {
    errors.push({ field: 'description', message: 'description 不能为空' });
  }
  if (!tool.parameters || tool.parameters.type !== 'object') {
    errors.push({ field: 'parameters', message: 'parameters.type 必须为 object' });
  }
  if (typeof tool.handler !== 'function') {
    errors.push({ field: 'handler', message: 'handler 必须为函数' });
  }
  if (tool.riskLevel && !['auto', 'confirm', 'high-risk'].includes(tool.riskLevel)) {
    errors.push({ field: 'riskLevel', message: `riskLevel '${tool.riskLevel}' 非法` });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 校验命令定义。
 */
export function validateCommandDefinition(cmd: PluginCommandDefinition): SdkValidationResult {
  const errors: SdkValidationError[] = [];
  if (!cmd.name || typeof cmd.name !== 'string') {
    errors.push({ field: 'name', message: 'name 不能为空' });
  }
  if (!cmd.description) {
    errors.push({ field: 'description', message: 'description 不能为空' });
  }
  if (typeof cmd.handler !== 'function') {
    errors.push({ field: 'handler', message: 'handler 必须为函数' });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 校验 manifest 对象（SDK 侧简单校验，详细校验在 loader.ts 中）。
 */
export function validateManifest(manifest: PluginManifest): SdkValidationResult {
  const errors: SdkValidationError[] = [];
  if (!manifest.id) {
    errors.push({ field: 'id', message: 'id 不能为空' });
  } else if (!PLUGIN_ID_PATTERN.test(manifest.id)) {
    errors.push({ field: 'id', message: `id '${manifest.id}' 不合法` });
  }
  if (!manifest.name) {
    errors.push({ field: 'name', message: 'name 不能为空' });
  }
  if (!manifest.version) {
    errors.push({ field: 'version', message: 'version 不能为空' });
  } else if (!VERSION_PATTERN.test(manifest.version)) {
    errors.push({ field: 'version', message: `version '${manifest.version}' 非法` });
  }
  if (manifest.apiVersion && !VERSION_PATTERN.test(manifest.apiVersion)) {
    errors.push({ field: 'apiVersion', message: `apiVersion '${manifest.apiVersion}' 非法` });
  }
  if (manifest.tools) {
    for (const tool of manifest.tools) {
      const sub = validateToolRegistration({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        handler: () => undefined,
      });
      if (!sub.valid) {
        errors.push({ field: `tools.${tool.name}`, message: sub.errors.map((e) => e.message).join('; ') });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 抛出错误（如果校验失败）。
 */
export function assertValid<T extends { valid: boolean; errors: SdkValidationError[] }>(
  result: T,
  prefix: string,
): void {
  if (!result.valid) {
    const msg = result.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
    throw new Error(`${prefix}: ${msg}`);
  }
}

export { isValidPluginId };
