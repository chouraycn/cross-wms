/**
 * 策略性验证 — 对配置进行结构校验和业务策略检查
 *
 * 参考 openclaw/src/config/validation.ts，实现 cross-wms 的配置验证体系：
 *   1. 结构校验：使用 zod schema 验证配置结构和类型
 *   2. allowed-values 检查：确保枚举值在允许范围内
 *   3. cold-imports 检查：验证引用的外部路径/模块是否可达
 *
 * 返回 { valid, errors, warnings } 三元组，区分硬性错误和软性警告。
 */

import { z } from 'zod';
import { logger } from '../../logger.js';

/** 验证错误 */
export interface ValidationError {
  /** 配置字段路径（dot notation，如 gateway.port） */
  path: string;
  /** 错误消息 */
  message: string;
  /** 允许的值列表（若适用） */
  allowedValues?: unknown[];
  /** 错误代码 */
  code: string;
}

/** 验证警告 */
export interface ValidationWarning {
  /** 配置字段路径 */
  path: string;
  /** 警告消息 */
  message: string;
  /** 警告代码 */
  code: string;
}

/** 验证结果 */
export interface ValidationResult {
  /** 是否通过验证（无错误） */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
  /** 警告列表 */
  warnings: ValidationWarning[];
}

/** 验证策略选项 */
export interface ValidationPolicy {
  /** 是否执行 allowed-values 检查（默认 true） */
  checkAllowedValues?: boolean;
  /** 是否执行 cold-imports 检查（默认 true） */
  checkColdImports?: boolean;
  /** cold-imports 检查时要验证的路径前缀列表 */
  coldImportPaths?: readonly string[];
  /** 允许的额外字段路径（不被视为未知字段错误） */
  allowedUnknownPaths?: readonly string[];
}

/** 默认验证策略 */
const DEFAULT_POLICY: Required<ValidationPolicy> = {
  checkAllowedValues: true,
  checkColdImports: true,
  coldImportPaths: ['plugins.directories', 'skills.extraDirs', 'hooks.path'],
  allowedUnknownPaths: [],
};

/**
 * 验证配置 — 对配置进行结构校验和策略检查
 *
 * @param config - 待验证的配置对象
 * @param schema - zod schema（用于结构校验）
 * @param policy - 验证策略选项
 * @returns 验证结果，包含 valid 标志、错误列表和警告列表
 */
export function validateConfig<T>(
  config: unknown,
  schema: z.ZodType<T>,
  policy?: ValidationPolicy,
): ValidationResult {
  const mergedPolicy = { ...DEFAULT_POLICY, ...policy };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1) 结构校验（zod）
  const structResult = validateStructure(config, schema);
  errors.push(...structResult.errors);
  warnings.push(...structResult.warnings);

  // 结构校验通过后才执行策略检查
  const structValid = structResult.errors.length === 0;
  if (structValid) {
    // 2) allowed-values 检查
    if (mergedPolicy.checkAllowedValues) {
      const avResult = checkAllowedValues(config, schema);
      errors.push(...avResult.errors);
      warnings.push(...avResult.warnings);
    }

    // 3) cold-imports 检查
    if (mergedPolicy.checkColdImports) {
      const ciResult = checkColdImports(config, mergedPolicy.coldImportPaths);
      errors.push(...ciResult.errors);
      warnings.push(...ciResult.warnings);
    }
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn(`[ConfigValidation] 发现 ${errors.length} 个错误，${warnings.length} 个警告`);
  } else if (warnings.length > 0) {
    logger.debug(`[ConfigValidation] 通过验证，${warnings.length} 个警告`);
  }

  return { valid, errors, warnings };
}

// ===================== 结构校验 =====================

/** 使用 zod schema 进行结构校验 */
function validateStructure(
  config: unknown,
  schema: z.ZodType,
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const result = schema.safeParse(config);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const error = mapZodIssueToError(issue);
      errors.push(error);
    }
  }

  return { errors, warnings };
}

/** 将 zod issue 映射为 ValidationError */
function mapZodIssueToError(issue: z.ZodIssue): ValidationError {
  const path = issue.path.join('.') || '<root>';
  const message = issue.message || '校验失败';
  const code = issue.code;

  // 从 issue 中提取允许值信息
  // zod v4 中枚举值校验失败的 code 为 'invalid_value'
  let allowedValues: unknown[] | undefined;
  if (code === 'invalid_value') {
    const issueAny = issue as unknown as { values?: unknown[] };
    if (Array.isArray(issueAny.values)) {
      allowedValues = issueAny.values;
    }
  }

  return {
    path,
    message,
    code,
    ...(allowedValues ? { allowedValues } : {}),
  };
}

// ===================== allowed-values 检查 =====================

/**
 * 检查配置中的值是否在 schema 定义的允许范围内
 *
 * 主要检查枚举类型字段，确保用户配置的值在 schema 允许的枚举列表中。
 */
function checkAllowedValues(
  config: unknown,
  schema: z.ZodType,
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 递归遍历 config，对每个字段检查是否在 schema 的允许值范围内
  walkConfigWithPath(config, schema, '', (value, path, fieldSchema) => {
    const allowedValues = extractAllowedValues(fieldSchema);
    if (allowedValues && allowedValues.length > 0) {
      if (!allowedValues.includes(value)) {
        errors.push({
          path,
          message: `值 "${String(value)}" 不在允许范围内`,
          allowedValues,
          code: 'value_not_allowed',
        });
      }
    }
  });

  return { errors, warnings };
}

/** 从 zod schema 中提取允许值列表（枚举值） */
function extractAllowedValues(schema: z.ZodType): unknown[] | undefined {
  const def = (schema as any)?._zod?.def ?? (schema as any)?._def;
  if (!def) return undefined;

  // zod v4 枚举
  if (def.type === 'enum' || def.check === 'enum') {
    const entries = def.entries;
    if (entries && typeof entries === 'object') {
      return Object.values(entries);
    }
    const options = def.options ?? def.values;
    if (Array.isArray(options)) {
      return options;
    }
  }

  // zod v4 literal
  if (def.type === 'literal') {
    const values = def.values;
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
  }

  return undefined;
}

// ===================== cold-imports 检查 =====================

/**
 * 检查配置中引用的外部路径/模块是否可达
 *
 * 例如：plugins.directories 中的目录路径、hooks.path 中的模块路径等。
 * 这类检查属于"冷导入"检查 — 验证配置引用的资源在文件系统中是否存在。
 */
function checkColdImports(
  config: unknown,
  pathPrefixes: readonly string[],
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!config || typeof config !== 'object') {
    return { errors, warnings };
  }

  const configObj = config as Record<string, unknown>;

  for (const prefix of pathPrefixes) {
    const segments = prefix.split('.');
    const value = getNestedValue(configObj, segments);
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      // 数组类型：每个元素都是路径
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          const result = checkPathExists(item, `${prefix}[${i}]`);
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
      }
    } else if (typeof value === 'string') {
      const result = checkPathExists(value, prefix);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }

  return { errors, warnings };
}

/** 检查路径是否存在（延迟导入 fs 以避免循环依赖） */
function checkPathExists(
  filePath: string,
  configPath: string,
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!filePath || filePath.trim().length === 0) {
    return { errors, warnings };
  }

  // 跳过环境变量模板字符串（如 ${VAR}）
  if (/\$\{[^}]+\}/.test(filePath)) {
    return { errors, warnings };
  }

  try {
    // 动态导入 fs 进行路径检查
    // 使用 require 避免 ESM 顶层导入的循环依赖问题
    const fs = require('node:fs') as typeof import('node:fs');
    if (!fs.existsSync(filePath)) {
      warnings.push({
        path: configPath,
        message: `路径不存在: ${filePath}（配置引用的资源未找到，可能在运行时创建）`,
        code: 'path_not_found',
      });
    }
  } catch {
    // fs 模块不可用时跳过检查
    logger.debug(`[ConfigValidation] 无法执行路径检查: ${filePath}`);
  }

  return { errors, warnings };
}

// ===================== 辅助函数 =====================

/** 按 dot-path 获取嵌套值 */
function getNestedValue(obj: Record<string, unknown>, segments: string[]): unknown {
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** 递归遍历配置，对每个字段调用回调 */
function walkConfigWithPath(
  config: unknown,
  schema: z.ZodType,
  basePath: string,
  callback: (value: unknown, path: string, fieldSchema: z.ZodType) => void,
): void {
  if (config === null || config === undefined) {
    return;
  }

  callback(config, basePath, schema);

  if (typeof config !== 'object') {
    return;
  }

  // 获取 schema 的 shape（如果是对象类型）
  const shape = getObjectSchemaShape(schema);
  if (!shape) {
    return;
  }

  const configObj = config as Record<string, unknown>;
  for (const [key, value] of Object.entries(configObj)) {
    const childPath = basePath ? `${basePath}.${key}` : key;
    const childSchema = shape[key];
    if (childSchema) {
      walkConfigWithPath(value, childSchema as z.ZodType, childPath, callback);
    }
  }
}

/** 从 zod schema 中获取对象 shape（如果 schema 是对象类型） */
function getObjectSchemaShape(schema: z.ZodType): Record<string, unknown> | null {
  const def = (schema as any)?._zod?.def ?? (schema as any)?._def;
  if (!def) return null;

  // zod v4 对象类型
  if (def.type === 'object') {
    const shape = def.shape ?? (schema as any).shape;
    if (shape && typeof shape === 'object') {
      return shape as Record<string, unknown>;
    }
  }

  // 解包 optional / default / nullable 等 wrapper
  if (['optional', 'default', 'nullable', 'catch', 'readonly', 'nonoptional', 'exactOptional'].includes(def.type)) {
    const innerType = def.innerType;
    if (innerType) {
      return getObjectSchemaShape(innerType as z.ZodType);
    }
  }

  // pipe 类型取输出端
  if (def.type === 'pipe') {
    const out = def.out ?? def.right;
    if (out) {
      return getObjectSchemaShape(out as z.ZodType);
    }
  }

  return null;
}
