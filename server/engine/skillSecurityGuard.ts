/**
 * Skill Security Guard — Skill 安全拦截器
 *
 * 三层安全校验机制，在 Skill 执行前进行拦截：
 * 1. 权限分组校验 — 检查 Skill group 是否在 allow/deny 列表中
 * 2. 沙箱拦截 — 路径/网络/命令黑名单检测
 * 3. 参数重校验 — 防注入超长恶意参数
 *
 * 使用方式：
 *   const result = await performSecurityChecks(skill, params, config, ctx);
 *   if (!result.allowed) { ... }
 */

import type {
  SkillDefinition,
  SkillPermissionConfig,
  SkillContext,
} from '../types/skill-runtime.js';

// ===================== 安全校验结果类型 =====================

/** 单层校验结果 */
export interface SecurityCheckDetail {
  passed: boolean;
  detail: string;
}

/** 完整安全校验结果 */
export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  checks: {
    permission: SecurityCheckDetail;
    sandbox: SecurityCheckDetail;
    params: SecurityCheckDetail;
  };
}

// ===================== 安全阈值常量 =====================

/** 参数总大小上限（100KB） */
const MAX_PARAMS_TOTAL_SIZE = 100 * 1024;

/** 单个字符串字段长度上限（10KB） */
const MAX_STRING_FIELD_LENGTH = 10 * 1024;

/** 对象嵌套深度上限 */
const MAX_NESTING_DEPTH = 10;

// ===================== 第 1 层：权限分组校验 =====================

/**
 * 检查 Skill 权限是否允许执行
 *
 * 匹配规则：
 * - deny 列表优先（deny 匹配则直接拒绝，即使 allow 也匹配）
 * - `*` 通配符匹配所有 group 和 skill id
 * - `group:*` 匹配组内所有 skill（如 `wms:*` 匹配所有 wms 组的 skill）
 * - 精确匹配 skill id 或 group
 *
 * @param skill - Skill 定义
 * @param config - 权限配置
 * @returns 校验结果
 */
export function checkSkillPermission(
  skill: SkillDefinition,
  config: SkillPermissionConfig,
): SecurityCheckDetail {
  const { id, group } = skill;

  // 1. deny 列表优先检查
  for (const pattern of config.deny) {
    if (matchPattern(pattern, id, group)) {
      return {
        passed: false,
        detail: `Skill '${id}' (group: ${group}) 被 deny 规则 '${pattern}' 拒绝`,
      };
    }
  }

  // 2. allow 列表检查（空 allow = 全部允许）
  if (config.allow.length > 0) {
    const allowed = config.allow.some((pattern) => matchPattern(pattern, id, group));
    if (!allowed) {
      return {
        passed: false,
        detail: `Skill '${id}' (group: ${group}) 不在 allow 列表中`,
      };
    }
  }

  return {
    passed: true,
    detail: `Skill '${id}' (group: ${group}) 权限校验通过`,
  };
}

/**
 * 匹配权限模式
 *
 * @param pattern - 权限模式（`*`, `group:*`, `skill_id`, `group`）
 * @param skillId - Skill ID
 * @param group - Skill 权限分组
 */
function matchPattern(pattern: string, skillId: string, group: string): boolean {
  // 通配符匹配所有
  if (pattern === '*') {
    return true;
  }

  // 精确匹配 skill id
  if (pattern === skillId) {
    return true;
  }

  // 精确匹配 group
  if (pattern === group) {
    return true;
  }

  // group:* 通配符（如 wms:* 匹配所有 wms 组的 skill）
  if (pattern.endsWith(':*')) {
    const groupPrefix = pattern.slice(0, -2);
    if (group === groupPrefix) {
      return true;
    }
  }

  return false;
}

// ===================== 第 2 层：沙箱拦截 =====================

/**
 * 检查 Skill 参数中的路径/网络/命令是否在沙箱允许范围内
 *
 * 遍历 params 中的所有字段，对以下字段名进行沙箱校验：
 * - path / filePath / file / dir / directory / output → checkPath
 * - url / uri / endpoint / link / href → checkNetwork
 * - command / cmd / exec / script / run → checkCommand
 *
 * @param skill - Skill 定义
 * @param params - 调用参数
 * @param ctx - Skill 执行上下文（含 sandbox 接口）
 * @returns 校验结果
 */
export async function checkSandboxAccess(
  skill: SkillDefinition,
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SecurityCheckDetail> {
  // 沙箱范围 none 表示不限制
  if (skill.sandboxScope === 'none') {
    return {
      passed: true,
      detail: `Skill '${skill.id}' 沙箱范围为 none，跳过沙箱校验`,
    };
  }

  let checkCount = 0;

  // 路径相关字段名
  const pathFieldNames = ['path', 'filePath', 'file', 'dir', 'directory', 'output', 'input', 'src', 'dest'];
  // 网络相关字段名
  const networkFieldNames = ['url', 'uri', 'endpoint', 'link', 'href', 'host', 'baseUrl'];
  // 命令相关字段名
  const commandFieldNames = ['command', 'cmd', 'exec', 'script', 'run', 'shell'];

  // 递归遍历参数对象，收集所有需要校验的值
  const valuesToCheck = collectValuesByCategory(params, pathFieldNames, networkFieldNames, commandFieldNames);

  // 校验路径
  for (const value of valuesToCheck.paths) {
    if (typeof value !== 'string') continue;
    checkCount++;
    const result = ctx.sandbox.checkPath(value);
    if (!result.allowed) {
      return {
        passed: false,
        detail: `沙箱路径校验失败: ${result.reason}`,
      };
    }
  }

  // 校验网络
  for (const value of valuesToCheck.networks) {
    if (typeof value !== 'string') continue;
    checkCount++;
    const result = ctx.sandbox.checkNetwork(value);
    if (!result.allowed) {
      return {
        passed: false,
        detail: `沙箱网络校验失败: ${result.reason}`,
      };
    }
  }

  // 校验命令
  for (const value of valuesToCheck.commands) {
    if (typeof value !== 'string') continue;
    checkCount++;
    const result = ctx.sandbox.checkCommand(value);
    if (!result.allowed) {
      return {
        passed: false,
        detail: `沙箱命令校验失败: ${result.reason}`,
      };
    }
  }

  return {
    passed: true,
    detail: `沙箱校验通过（共检查 ${checkCount} 项）`,
  };
}

/**
 * 按类别收集参数值
 *
 * 递归遍历参数对象，根据字段名将值分类到 paths / networks / commands。
 * 仅遍历一层嵌套（params 和 params.options 等常见嵌套）。
 */
function collectValuesByCategory(
  params: Record<string, unknown>,
  pathFieldNames: string[],
  networkFieldNames: string[],
  commandFieldNames: string[],
): { paths: unknown[]; networks: unknown[]; commands: unknown[] } {
  const paths: unknown[] = [];
  const networks: unknown[] = [];
  const commands: unknown[] = [];

  function traverse(obj: unknown, depth: number): void {
    if (depth > 3) return; // 最多遍历 3 层，防止深层递归
    if (obj === null || obj === undefined) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        traverse(item, depth + 1);
      }
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();

        if (pathFieldNames.includes(lowerKey)) {
          paths.push(value);
        } else if (networkFieldNames.includes(lowerKey)) {
          networks.push(value);
        } else if (commandFieldNames.includes(lowerKey)) {
          commands.push(value);
        }

        // 继续遍历嵌套对象
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          traverse(value, depth + 1);
        }
      }
    }
  }

  traverse(params, 0);
  return { paths, networks, commands };
}

// ===================== 第 3 层：参数安全校验 =====================

/**
 * 检查参数安全性（防注入超长恶意参数）
 *
 * 校验规则：
 * 1. 参数总大小 < 100KB（JSON 序列化后）
 * 2. 单个字符串字段长度 < 10KB
 * 3. 对象嵌套深度 < 10 层
 * 4. 无 prototype pollution 风险（__proto__ / constructor / prototype 字段）
 *
 * @param params - 调用参数
 * @param schema - 可选的 JSON Schema（用于额外校验）
 * @returns 校验结果
 */
export function checkParamsSafety(
  params: Record<string, unknown>,
  schema?: Record<string, unknown>,
): SecurityCheckDetail {
  // 1. 检查参数总大小
  const serialized = JSON.stringify(params);
  if (serialized.length > MAX_PARAMS_TOTAL_SIZE) {
    return {
      passed: false,
      detail: `参数总大小 ${serialized.length} 字节超过上限 ${MAX_PARAMS_TOTAL_SIZE} 字节`,
    };
  }

  // 2. 检查 prototype pollution 风险
  const pollutionCheck = checkPrototypePollution(params);
  if (!pollutionCheck.passed) {
    return pollutionCheck;
  }

  // 3. 递归检查每个字段
  const fieldCheck = checkFieldLimits(params, 0);
  if (!fieldCheck.passed) {
    return fieldCheck;
  }

  // 4. 如果有 schema，检查必填字段（轻量级校验）
  if (schema) {
    const schemaCheck = checkAgainstSchema(params, schema);
    if (!schemaCheck.passed) {
      return schemaCheck;
    }
  }

  return {
    passed: true,
    detail: '参数安全校验通过',
  };
}

/**
 * 检查 prototype pollution 风险
 */
function checkPrototypePollution(params: Record<string, unknown>): SecurityCheckDetail {
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

  function traverse(obj: unknown, depth: number): SecurityCheckDetail | null {
    if (depth > MAX_NESTING_DEPTH) {
      return {
        passed: false,
        detail: `对象嵌套深度超过上限 ${MAX_NESTING_DEPTH}`,
      };
    }

    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return null;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = traverse(item, depth + 1);
        if (result) return result;
      }
      return null;
    }

    for (const key of Object.keys(obj)) {
      // 检查危险键名
      if (dangerousKeys.includes(key)) {
        return {
          passed: false,
          detail: `检测到危险字段名 '${key}'，疑似 prototype pollution 攻击`,
        };
      }

      const result = traverse((obj as Record<string, unknown>)[key], depth + 1);
      if (result) return result;
    }

    return null;
  }

  const result = traverse(params, 0);
  return result ?? { passed: true, detail: '无 prototype pollution 风险' };
}

/**
 * 递归检查字段长度限制
 */
function checkFieldLimits(value: unknown, depth: number): SecurityCheckDetail {
  if (depth > MAX_NESTING_DEPTH) {
    return {
      passed: false,
      detail: `对象嵌套深度 ${depth} 超过上限 ${MAX_NESTING_DEPTH}`,
    };
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_FIELD_LENGTH) {
      return {
        passed: false,
        detail: `字符串字段长度 ${value.length} 超过上限 ${MAX_STRING_FIELD_LENGTH}`,
      };
    }
    return { passed: true, detail: '' };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = checkFieldLimits(item, depth + 1);
      if (!result.passed) return result;
    }
    return { passed: true, detail: '' };
  }

  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const result = checkFieldLimits(v, depth + 1);
      if (!result.passed) return result;
    }
    return { passed: true, detail: '' };
  }

  // 基本类型（number, boolean, null, undefined）直接通过
  return { passed: true, detail: '' };
}

/**
 * 轻量级 Schema 校验
 *
 * 仅检查 required 字段是否存在，不进行完整的 JSON Schema 校验
 * （完整的 Schema 校验在 SkillHandler 内部进行）。
 */
function checkAgainstSchema(
  params: Record<string, unknown>,
  schema: Record<string, unknown>,
): SecurityCheckDetail {
  const required = schema.required as string[] | undefined;
  if (!Array.isArray(required)) {
    return { passed: true, detail: '' };
  }

  for (const field of required) {
    if (!(field in params)) {
      return {
        passed: false,
        detail: `缺少必填参数 '${field}'`,
      };
    }
  }

  return { passed: true, detail: '' };
}

// ===================== 串联校验入口 =====================

/**
 * 执行完整的三层安全校验
 *
 * 执行顺序：权限分组 → 沙箱拦截 → 参数安全
 * 任一校验失败则立即返回拒绝结果，不继续后续校验。
 *
 * @param skill - Skill 定义
 * @param params - 调用参数
 * @param config - 权限配置
 * @param ctx - Skill 执行上下文
 * @returns 完整安全校验结果
 */
export async function performSecurityChecks(
  skill: SkillDefinition,
  params: Record<string, unknown>,
  config: SkillPermissionConfig,
  ctx: SkillContext,
): Promise<SecurityCheckResult> {
  // 第 1 层：权限分组校验
  const permissionResult = checkSkillPermission(skill, config);
  if (!permissionResult.passed) {
    return {
      allowed: false,
      reason: permissionResult.detail,
      checks: {
        permission: permissionResult,
        sandbox: { passed: true, detail: '未执行（权限校验失败）' },
        params: { passed: true, detail: '未执行（权限校验失败）' },
      },
    };
  }

  // 第 2 层：沙箱拦截
  const sandboxResult = await checkSandboxAccess(skill, params, ctx);
  if (!sandboxResult.passed) {
    return {
      allowed: false,
      reason: sandboxResult.detail,
      checks: {
        permission: permissionResult,
        sandbox: sandboxResult,
        params: { passed: true, detail: '未执行（沙箱校验失败）' },
      },
    };
  }

  // 第 3 层：参数安全校验
  const paramsResult = checkParamsSafety(params, skill.parameters);
  if (!paramsResult.passed) {
    return {
      allowed: false,
      reason: paramsResult.detail,
      checks: {
        permission: permissionResult,
        sandbox: sandboxResult,
        params: paramsResult,
      },
    };
  }

  // 全部通过
  return {
    allowed: true,
    checks: {
      permission: permissionResult,
      sandbox: sandboxResult,
      params: paramsResult,
    },
  };
}
