/**
 * 从 zod schema 生成 JSON Schema 与 UI hints
 *
 * 支持 string/number/boolean/array/object/enum/union/optional/default/literal/nullable
 * 参考 openclaw/src/config/schema.ts 中 ConfigSchema + ConfigUiHints 的设计
 */

import { z } from 'zod';

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface UiHint {
  title?: string;
  description?: string;
  type: JsonSchemaType | string;
  default?: unknown;
  enum?: unknown[];
  ui?: {
    widget?: string;
    placeholder?: string;
  };
}

export type UiHints = Record<string, UiHint>;

// ===================== zodToJsonSchema =====================

/**
 * 将任意 zod schema 递归转换为 JSON Schema（Draft 7 简化版）
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convertSchema(schema);
}

function convertSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  // zod v4 使用 _zod.def 存储类型定义
  const def = (schema as any)._zod?.def ?? (schema as any)._def;
  const type = def?.type;

  switch (type) {
    case 'string':
      return convertStringSchema(schema, def);
    case 'number':
      return convertNumberSchema(def);
    case 'boolean':
      return { type: 'boolean' };
    case 'array':
      return convertArraySchema(schema, def);
    case 'object':
      return convertObjectSchema(schema, def);
    case 'enum':
      return convertEnumSchema(schema, def);
    case 'literal':
      return { const: def.values?.[0] };
    case 'union':
      return convertUnionSchema(schema, def);
    case 'optional':
      return convertSchema(def.innerType as z.ZodTypeAny);
    case 'nullable':
      return { anyOf: [{ type: 'null' }, convertSchema(def.innerType as z.ZodTypeAny)] };
    case 'default':
      return { ...convertSchema(def.innerType as z.ZodTypeAny), default: def.defaultValue };
    case 'exactOptional':
      return convertSchema(def.innerType as z.ZodTypeAny);
    case 'nonoptional':
      return convertSchema(def.innerType as z.ZodTypeAny);
    case 'catch':
      return convertSchema(def.innerType as z.ZodTypeAny);
    case 'readonly':
      return convertSchema(def.innerType as z.ZodTypeAny);
    case 'transform':
      return convertSchema(def.innerType as z.ZodTypeAny);
    case 'pipe':
      // pipe 取输出端（右侧）schema
      return convertSchema(def.out ?? def.right ?? def.innerType);
    case 'record':
      return convertRecordSchema(schema, def);
    case 'tuple':
      return convertTupleSchema(schema, def);
    case 'any':
    case 'unknown':
      return {};
    case 'null':
      return { type: 'null' };
    case 'undefined':
    case 'void':
      return { type: 'null' };
    case 'never':
      return { not: {} };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'bigint':
      return { type: 'integer' };
    default:
      // 兜底：若 schema 自带 toJSONSchema（zod v4 原生方法），优先使用
      if (typeof (schema as any).toJSONSchema === 'function') {
        try {
          return (schema as any).toJSONSchema() as Record<string, unknown>;
        } catch {
          // fallthrough
        }
      }
      return {};
  }
}

function convertStringSchema(_schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const json: Record<string, unknown> = { type: 'string' };
  const checks = def.checks ?? [];
  for (const check of checks) {
    if (!check || typeof check !== 'object') continue;
    const cdef = check._zod?.def ?? check;
    const kind = cdef.check;
    if (kind === 'min_length') json.minLength = cdef.minimum;
    if (kind === 'max_length') json.maxLength = cdef.maximum;
    if (kind === 'string_format') {
      const fmt = cdef.format;
      if (fmt === 'email') json.format = 'email';
      if (fmt === 'url') json.format = 'uri';
      if (fmt === 'uuid') json.format = 'uuid';
    }
    if (kind === 'regex') json.pattern = cdef.pattern?.source ?? cdef.pattern;
  }
  // zod v4 中 .email() / .url() 有时直接放在 def.format
  if (def.format === 'email') json.format = 'email';
  if (def.format === 'url') json.format = 'uri';
  if (def.format === 'uuid') json.format = 'uuid';
  return json;
}

function convertNumberSchema(def: any): Record<string, unknown> {
  // zod v4: z.int() 的 def 为 { type: 'number', check: 'number_format', format: 'safeint' }
  if (def.check === 'number_format' && def.format === 'safeint') {
    return { type: 'integer' };
  }
  const checks = def.checks ?? [];
  for (const check of checks) {
    const cdef = check._zod?.def ?? check;
    if (cdef.check === 'number_format' && cdef.format === 'safeint') {
      return { type: 'integer' };
    }
  }
  return { type: 'number' };
}

function convertArraySchema(_schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const element = def.element ?? (def.innerType as z.ZodTypeAny);
  const json: Record<string, unknown> = {
    type: 'array',
    items: element ? convertSchema(element as z.ZodTypeAny) : {},
  };
  const checks = def.checks ?? [];
  for (const check of checks) {
    const cdef = check._zod?.def ?? check;
    const kind = cdef.check;
    if (kind === 'min_length') json.minItems = cdef.minimum;
    if (kind === 'max_length') json.maxItems = cdef.maximum;
    if (kind === 'length') {
      const len = cdef.minimum ?? cdef.value;
      json.minItems = len;
      json.maxItems = len;
    }
  }
  return json;
}

function convertObjectSchema(schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const shape = def.shape ?? (schema as any).shape;
  if (!shape || typeof shape !== 'object') {
    return { type: 'object' };
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    if (value === undefined) continue;
    properties[key] = convertSchema(value as z.ZodTypeAny);

    // 判断字段是否 required：非 optional 且非有默认值
    if (!isOptionalField(value as z.ZodTypeAny)) {
      required.push(key);
    }
  }

  const json: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) {
    json.required = required;
  }

  // catchall / additionalProperties
  const catchall = def.catchall;
  if (catchall) {
    const catchType = (catchall as any)._zod?.def?.type ?? (catchall as any)._def?.type;
    if (catchType === 'never') {
      json.additionalProperties = false;
    } else if (catchType !== 'undefined') {
      json.additionalProperties = convertSchema(catchall as z.ZodTypeAny);
    }
  }

  return json;
}

function convertEnumSchema(_schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const entries = def.entries;
  if (entries && typeof entries === 'object') {
    const values = Object.values(entries);
    return { type: typeof values[0] === 'number' ? 'number' : 'string', enum: values };
  }
  // fallback for options array
  const options = def.options ?? (def.values ? Object.values(def.values) : []);
  return { type: 'string', enum: options };
}

function convertUnionSchema(_schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const options = def.options ?? [];
  const anyOf = (options as z.ZodTypeAny[]).map((opt: z.ZodTypeAny) => convertSchema(opt));
  return { anyOf };
}

function convertRecordSchema(_schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const valueSchema = def.valueType;
  return {
    type: 'object',
    additionalProperties: valueSchema ? convertSchema(valueSchema as z.ZodTypeAny) : true,
  };
}

function convertTupleSchema(_schema: z.ZodTypeAny, def: any): Record<string, unknown> {
  const items = def.items ?? [];
  return {
    type: 'array',
    items: (items as z.ZodTypeAny[]).map((item: z.ZodTypeAny) => convertSchema(item)),
    minItems: items.length,
    maxItems: items.length,
  };
}

function isOptionalField(field: z.ZodTypeAny): boolean {
  const def = (field as any)._zod?.def ?? (field as any)._def;
  const type = def?.type;
  if (type === 'optional' || type === 'exactOptional' || type === 'default' || type === 'catch') {
    return true;
  }
  return false;
}

// ===================== generateUiHints =====================

/**
 * 基于 JSON Schema 为每个字段路径生成 UI hint
 *
 * @param schema - zod schema 或已生成的 JSON Schema
 * @param basePath - 递归用的基础路径（内部使用）
 */
export function generateUiHints(
  schema: z.ZodTypeAny | Record<string, unknown>,
  basePath = '',
): UiHints {
  const json = isZodSchema(schema) ? zodToJsonSchema(schema as z.ZodTypeAny) : schema;
  const hints: UiHints = {};
  walkJsonSchema(json, basePath, hints);
  return hints;
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('_zod' in value || '_def' in value || typeof (value as any).safeParse === 'function')
  );
}

function walkJsonSchema(
  node: unknown,
  path: string,
  hints: UiHints,
): void {
  if (!node || typeof node !== 'object') return;

  const schemaNode = node as Record<string, unknown>;

  // 收集当前节点的 UI hint
  const hint = buildUiHint(schemaNode);
  if (path) {
    hints[path] = hint;
  }

  // 遍历 properties
  const properties = schemaNode.properties as Record<string, unknown> | undefined;
  if (properties) {
    for (const [key, child] of Object.entries(properties)) {
      const childPath = path ? `${path}.${key}` : key;
      walkJsonSchema(child, childPath, hints);
    }
  }

  // 遍历 additionalProperties（若 object）
  const additionalProperties = schemaNode.additionalProperties;
  if (additionalProperties && typeof additionalProperties === 'object') {
    walkJsonSchema(additionalProperties, path ? `${path}.*` : '*', hints);
  }

  // 遍历 items（若 array）
  const items = schemaNode.items as unknown;
  if (Array.isArray(items)) {
    items.forEach((item, index) => {
      walkJsonSchema(item, path ? `${path}[${index}]` : `[${index}]`, hints);
    });
  } else if (items && typeof items === 'object') {
    walkJsonSchema(items, path ? `${path}[]` : '[]', hints);
  }

  // 遍历 anyOf / oneOf / allOf
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const variants = schemaNode[key] as unknown[] | undefined;
    if (Array.isArray(variants)) {
      variants.forEach((variant, index) => {
        walkJsonSchema(variant, path ? `${path}.${key}[${index}]` : `${key}[${index}]`, hints);
      });
    }
  }
}

function buildUiHint(node: Record<string, unknown>): UiHint {
  const type = inferType(node);
  const hint: UiHint = {
    title: typeof node.title === 'string' ? node.title : undefined,
    description: typeof node.description === 'string' ? node.description : undefined,
    type,
  };

  if ('default' in node) {
    hint.default = node.default;
  }
  if (Array.isArray(node.enum)) {
    hint.enum = node.enum;
  }

  // 根据类型推断 widget / placeholder
  hint.ui = inferUiWidget(node, type);

  return hint;
}

function inferType(node: Record<string, unknown>): string {
  if (typeof node.type === 'string') return node.type;
  if (Array.isArray(node.type)) return node.type.join(' | ');
  if ('const' in node) return typeof node.const === 'string' ? 'string' : typeof node.const as string;
  if (node.anyOf || node.oneOf) return 'union';
  if (node.properties || node.additionalProperties) return 'object';
  if (node.items) return 'array';
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return typeof node.enum[0] === 'number' ? 'number' : 'string';
  }
  return 'unknown';
}

function inferUiWidget(
  node: Record<string, unknown>,
  type: string,
): { widget?: string; placeholder?: string } {
  const ui: { widget?: string; placeholder?: string } = {};

  if (type === 'boolean') {
    ui.widget = 'switch';
  } else if (type === 'number' || type === 'integer') {
    ui.widget = 'number';
    if (typeof node.minimum === 'number' && typeof node.maximum === 'number') {
      ui.widget = 'slider';
    }
  } else if (type === 'string') {
    if (node.format === 'email') {
      ui.widget = 'email';
    } else if (node.format === 'uri' || node.format === 'url') {
      ui.widget = 'url';
    } else if (Array.isArray(node.enum)) {
      ui.widget = 'select';
    } else if (typeof node.maxLength === 'number' && (node.maxLength as number) > 200) {
      ui.widget = 'textarea';
    } else {
      ui.widget = 'text';
    }
  } else if (type === 'array') {
    ui.widget = 'list';
  } else if (type === 'object') {
    ui.widget = 'group';
  }

  if (typeof node.description === 'string') {
    ui.placeholder = String(node.description).slice(0, 80);
  }

  return ui;
}
