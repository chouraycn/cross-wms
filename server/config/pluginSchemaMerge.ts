/**
 * 插件 Schema 合并与配置校验
 *
 * 将多个插件的 zod config schema 合并到基础 schema 中，并提供单插件配置校验能力
 */

import { z } from 'zod';

/**
 * 把多个插件的 config schema 合并到基础 schema 中
 *
 * 策略：
 * - 若基础 schema 与插件 schema 均为 ZodObject，使用 .extend() 合并 shape
 * - 若类型不兼容，以后一个插件 schema 为准（覆盖）
 */
export function mergePluginSchema(
  baseSchema: z.ZodObject<any>,
  pluginSchemas: z.ZodObject<any>[],
): z.ZodObject<any> {
  if (pluginSchemas.length === 0) {
    return baseSchema;
  }

  let merged = baseSchema;
  for (const pluginSchema of pluginSchemas) {
    merged = mergeTwoObjectSchemas(merged, pluginSchema);
  }
  return merged;
}

function mergeTwoObjectSchemas(
  a: z.ZodObject<any>,
  b: z.ZodObject<any>,
): z.ZodObject<any> {
  const aShape = getShape(a);
  const bShape = getShape(b);

  // 优先使用 extend：保留 a 的字段，并用 b 的字段覆盖/补充
  const combinedShape: Record<string, z.ZodTypeAny> = { ...aShape, ...bShape };

  // 处理两个 schema 均存在的同名字段：若均为 object，递归合并
  for (const key of Object.keys(combinedShape)) {
    if (key in aShape && key in bShape) {
      const aField = aShape[key];
      const bField = bShape[key];
      if (isZodObject(aField) && isZodObject(bField)) {
        combinedShape[key] = mergeTwoObjectSchemas(aField, bField);
      } else {
        combinedShape[key] = bField;
      }
    }
  }

  // 保持 a 的 strict / passthrough / catchall 行为（若 b 未显式覆盖）
  const aDef = (a as any)._zod?.def ?? (a as any)._def;
  const bDef = (b as any)._zod?.def ?? (b as any)._def;

  let result = z.object(combinedShape);

  // 若任一方为 strict，则结果也为 strict
  const aCatchall = aDef?.catchall;
  const bCatchall = bDef?.catchall;
  const aIsStrict = aCatchall && isNeverSchema(aCatchall);
  const bIsStrict = bCatchall && isNeverSchema(bCatchall);

  if (aIsStrict || bIsStrict) {
    result = result.strict();
  } else if (aCatchall && !bCatchall) {
    // a 有 catchall 而 b 没有，保留 a 的 passthrough
    result = result.passthrough();
  } else if (bCatchall && !aCatchall) {
    result = result.passthrough();
  }

  return result;
}

function getShape(schema: z.ZodObject<any>): Record<string, z.ZodTypeAny> {
  const def = (schema as any)._zod?.def ?? (schema as any)._def;
  return def?.shape ?? (schema as any).shape ?? {};
}

function isZodObject(schema: unknown): schema is z.ZodObject<any> {
  if (!schema || typeof schema !== 'object') return false;
  const def = (schema as any)._zod?.def ?? (schema as any)._def;
  return def?.type === 'object';
}

function isNeverSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const def = (schema as any)._zod?.def ?? (schema as any)._def;
  return def?.type === 'never';
}

// ===================== 插件配置校验 =====================

export type PluginValidationResult = {
  valid: boolean;
  errors?: string[];
};

/**
 * 校验单个插件的配置是否符合其声明的 schema
 *
 * @param pluginId - 插件标识（用于错误信息）
 * @param config - 待校验的配置对象
 * @param schema - 插件声明的 zod schema
 */
export function validatePluginConfig(
  pluginId: string,
  config: unknown,
  schema: z.ZodTypeAny,
): PluginValidationResult {
  const result = schema.safeParse(config);

  if (result.success) {
    return { valid: true };
  }

  // zod v4 的 error 结构兼容：result.error.issues
  const issues = (result.error as any).issues ?? [];
  const errors: string[] = issues.map((issue: any) => {
    const path = issue.path?.join('.') ?? 'root';
    const message = issue.message ?? '未知错误';
    return `[${pluginId}] ${path}: ${message}`;
  });

  return { valid: false, errors };
}
