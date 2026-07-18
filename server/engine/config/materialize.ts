/**
 * 配置物化 — 将 schema 默认值、环境变量覆盖、用户配置合并成最终运行时配置
 *
 * 参考 openclaw/src/config/materialize.ts，实现 cross-wms 的配置物化流程：
 *   1. 从 zod schema 提取默认值（通过解析空对象）
 *   2. 合并用户输入（使用 RFC 7386 JSON Merge Patch）
 *   3. 应用环境变量覆盖（来自 env-vars.ts 的绑定）
 *   4. 重新校验并返回最终配置
 */

import { z } from 'zod';
import { applyMergePatch } from './merge-patch.js';
import { resolveEnvVars } from './env-vars.js';

/** 物化模式 — 控制默认值和环境变量的应用范围 */
export type MaterializationMode = 'load' | 'missing' | 'snapshot';

/** 物化配置选项 */
export interface MaterializeOptions {
  /** 物化模式，默认为 'load' */
  mode?: MaterializationMode;
  /** 自定义环境变量覆盖映射（覆盖默认的 env-vars 绑定） */
  envOverrides?: Record<string, unknown>;
  /** 是否跳过环境变量覆盖 */
  skipEnvVars?: boolean;
}

/** 物化结果 */
export interface MaterializeResult<T> {
  /** 物化后的配置 */
  config: T;
  /** 物化过程中是否产生了降级（如回退到默认值） */
  degraded: boolean;
  /** 降级原因（若有） */
  degradationReason?: string;
}

/** 各模式对应的物化策略 */
const MATERIALIZATION_PROFILES: Record<
  MaterializationMode,
  { includeDefaults: boolean; includeEnvVars: boolean }
> = {
  // 正常加载：应用全部默认值 + 环境变量
  load: { includeDefaults: true, includeEnvVars: true },
  // 配置文件缺失：应用默认值，不应用环境变量（保持最小可用状态）
  missing: { includeDefaults: true, includeEnvVars: false },
  // 快照模式：不应用默认值，应用环境变量（用于运行时快照）
  snapshot: { includeDefaults: false, includeEnvVars: true },
};

/**
 * 从 zod schema 提取默认值
 *
 * 通过解析空对象来触发 schema 中所有带 .default() 的字段，
 * 从而获得完整的默认配置对象。
 */
function extractSchemaDefaults<T>(schema: z.ZodType<T>): Partial<T> | null {
  try {
    const result = schema.safeParse({});
    if (result.success) {
      return result.data as Partial<T>;
    }
    // 如果空对象解析失败，尝试用 undefined 解析（部分 schema 可能支持）
    return null;
  } catch {
    return null;
  }
}

/**
 * 将环境变量覆盖映射转换为 merge patch 格式
 *
 * env-vars.ts 返回的是扁平的 dot-path → value 映射，
 * 需要转换为嵌套对象才能用 applyMergePatch 合并。
 */
function envOverridesToPatch(envOverrides: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [dotPath, value] of Object.entries(envOverrides)) {
    if (value === undefined || value === null) {
      continue;
    }
    setNestedValue(patch, dotPath, value);
  }
  return patch;
}

/** 按 dot-path 在对象中设置嵌套值 */
function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (current[segment] === undefined || current[segment] === null) {
      current[segment] = {};
    } else if (typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      // 遇到非对象值，覆盖为对象
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

/**
 * 物化配置 — 将用户输入、默认值、环境变量合并为最终运行时配置
 *
 * 流程：
 *   1. 根据 mode 决定是否提取 schema 默认值
 *   2. 将默认值与用户输入通过 merge patch 合并（用户输入优先）
 *   3. 根据 mode 决定是否应用环境变量覆盖（环境变量优先级最高）
 *   4. 用 schema 重新校验合并结果，确保类型安全
 *
 * @param input - 用户原始配置输入
 * @param schema - zod schema（用于提取默认值和最终校验）
 * @param options - 物化选项
 * @returns 物化结果，包含最终配置和降级信息
 */
export function materializeConfig<T>(
  input: unknown,
  schema: z.ZodType<T>,
  options: MaterializeOptions = {},
): MaterializeResult<T> {
  const mode = options.mode ?? 'load';
  const profile = MATERIALIZATION_PROFILES[mode];
  let degraded = false;
  let degradationReason: string | undefined;

  // 1) 提取默认值
  let base: unknown = {};
  if (profile.includeDefaults) {
    const defaults = extractSchemaDefaults(schema);
    if (defaults) {
      base = defaults;
    } else {
      degraded = true;
      degradationReason = 'schema 默认值提取失败，使用空对象作为基础';
    }
  }

  // 2) 合并用户输入（用户输入优先于默认值）
  const mergedWithInput = applyMergePatch(base, input);

  // 3) 应用环境变量覆盖
  let mergedWithEnv = mergedWithInput;
  if (profile.includeEnvVars && !options.skipEnvVars) {
    const envOverrides = options.envOverrides ?? resolveEnvVarOverrides();
    const envPatch = envOverridesToPatch(envOverrides);
    if (Object.keys(envPatch).length > 0) {
      mergedWithEnv = applyMergePatch(mergedWithEnv, envPatch);
    }
  }

  // 4) 最终校验
  const result = schema.safeParse(mergedWithEnv);
  if (result.success) {
    return {
      config: result.data,
      degraded,
      degradationReason,
    };
  }

  // 校验失败：尝试只解析用户输入（不带默认值和环境变量）
  const fallback = schema.safeParse(input);
  if (fallback.success) {
    return {
      config: fallback.data,
      degraded: true,
      degradationReason: '合并后校验失败，回退到原始用户输入',
    };
  }

  // 最终回退：抛出校验错误
  throw new MaterializeError(
    '配置物化失败：合并后的配置无法通过 schema 校验',
    result.error,
  );
}

/**
 * 获取环境变量覆盖映射
 *
 * 封装 env-vars.ts 的 resolveEnvVars，便于测试时 mock。
 */
function resolveEnvVarOverrides(): Record<string, unknown> {
  try {
    const envVars = resolveEnvVars();
    // resolveEnvVars 返回 Record<string, string | undefined>，转换为 Record<string, unknown>
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** 配置物化错误 */
export class MaterializeError extends Error {
  constructor(
    message: string,
    readonly zodError: z.ZodError,
  ) {
    super(message);
    this.name = 'MaterializeError';
  }
}

/**
 * 快捷方法：直接物化并返回配置（不包含降级信息）
 *
 * 适用于不需要关注降级状态的场景。
 */
export function materializeConfigOrThrow<T>(
  input: unknown,
  schema: z.ZodType<T>,
  options?: MaterializeOptions,
): T {
  return materializeConfig(input, schema, options).config;
}
