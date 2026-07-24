/**
 * Config Schema — JSON Schema 构建、合并、查找与校验
 *
 * 参考 openclaw/src/config/schema.ts，为 cross-wms 提供：
 *   1. resolveConfigSchema()  — 生成基础配置 schema（向后兼容）
 *   2. validateConfig()       — 递归校验配置值（增强版：数组/composition/min-max）
 *   3. mergeObjectSchema()    — 合并两个 object schema（base + extension）
 *   4. lookupConfigSchema()   — 按路径查找 schema 节点（支持通配符）
 *   5. buildConfigSchema()    — 构建带 UI hint 的完整 schema 响应
 *
 * 不引入 ajv 依赖，直接用 zod 做基础类型（见 schema-base.ts）。
 */

import { logger } from '../../logger.js';
import {
  asSchemaObject,
  cloneSchema,
  findWildcardHintMatch,
  schemaHasChildren,
} from './schema.shared.js';
import { schemaHelp, schemaHints, schemaTags } from './schema-meta.js';
import type { ConfigTag } from './schema-meta.js';

// ===================== 类型定义 =====================

export type ConfigValidationError = {
  path: string;
  message: string;
  severity: 'error' | 'warning';
};

/** 向后兼容的轻量 ConfigSchema 类型 */
export type ConfigSchema = {
  type: string;
  properties?: Record<string, ConfigSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  additionalProperties?: boolean | ConfigSchema;
  items?: ConfigSchema;
};

/** JSON Schema 节点（openclaw 风格，支持 composition） */
type JsonSchemaNode = Record<string, unknown>;

type JsonSchemaObject = JsonSchemaNode & {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: JsonSchemaObject | boolean;
  items?: JsonSchemaObject | JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
  allOf?: JsonSchemaObject[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

const asJsonSchemaObject = (value: unknown): JsonSchemaObject | null =>
  asSchemaObject(value) as JsonSchemaObject | null;

// ===================== UI Hint 类型（替换 unknown stub） =====================

/** 配置字段 UI 提示元数据 */
export type ConfigUiHint = {
  label?: string;
  help?: string;
  placeholder?: string;
  widget?: string;
  tags?: ConfigTag[];
  advanced?: boolean;
  sensitive?: boolean;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

/** 完整 schema 响应（schema + UI hints + 版本） */
export type ConfigSchemaResponse = {
  schema: JsonSchemaNode;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type ConfigSchemaReloadKind = 'restart' | 'hot' | 'none';

export type ConfigSchemaLookupChild = {
  key: string;
  path: string;
  type?: string | string[];
  required: boolean;
  hasChildren: boolean;
  reloadKind?: ConfigSchemaReloadKind;
  hint?: ConfigUiHint;
  hintPath?: string;
};

export type ConfigSchemaLookupResult = {
  path: string;
  schema: JsonSchemaNode;
  reloadKind?: ConfigSchemaReloadKind;
  hint?: ConfigUiHint;
  hintPath?: string;
  children: ConfigSchemaLookupChild[];
};

export type PluginUiMetadata = {
  id: string;
  name?: string;
  description?: string;
  configUiHints?: Record<string, Pick<ConfigUiHint, 'label' | 'help' | 'tags' | 'advanced' | 'sensitive' | 'placeholder'>>;
  configSchema?: JsonSchemaNode;
};

export type ChannelUiMetadata = {
  id: string;
  label?: string;
  description?: string;
  configSchema?: JsonSchemaNode;
  configUiHints?: Record<string, ConfigUiHint>;
};

// ===================== 基础 schema 生成（向后兼容） =====================

export function resolveConfigSchema(): ConfigSchema {
  return {
    type: 'object',
    properties: {
      gateway: {
        type: 'object',
        properties: {
          port: { type: 'number', default: 3000, description: 'Gateway server port' },
          host: { type: 'string', default: '127.0.0.1', description: 'Gateway bind host' },
          auth: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['none', 'token', 'password', 'trusted-proxy'], default: 'none' },
              token: { type: 'string', description: 'Shared secret token' },
              password: { type: 'string', description: 'Shared password' },
            },
          },
        },
      },
      models: {
        type: 'object',
        properties: {
          default: { type: 'string', description: 'Default model ID' },
          providers: { type: 'object', additionalProperties: true },
        },
      },
      plugins: {
        type: 'object',
        properties: {
          directories: { type: 'array', items: { type: 'string' } },
          enabled: { type: 'array', items: { type: 'string' } },
        },
      },
      agents: {
        type: 'object',
        properties: {
          defaultTimeoutMs: { type: 'number', default: 120_000 },
          maxConcurrent: { type: 'number', default: 5 },
        },
      },
      logging: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
          redactSecrets: { type: 'boolean', default: true },
        },
      },
      skills: {
        type: 'object',
        properties: {
          clawhub: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'ClawHub registry URL' },
              enabled: { type: 'boolean', default: true, description: 'Enable ClawHub integration' },
            },
          },
          snapshotIntervalMs: { type: 'number', default: 300000, description: 'Skill snapshot refresh interval in milliseconds' },
          envOverrides: { type: 'boolean', default: true, description: 'Enable environment variable overrides for skills' },
          remoteSync: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: false, description: 'Enable remote skill sync' },
              intervalMs: { type: 'number', default: 60000, description: 'Remote sync interval in milliseconds' },
              nodes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nodeId: { type: 'string', description: 'Unique node identifier' },
                    nodeUrl: { type: 'string', description: 'Node URL' },
                    nodeName: { type: 'string', description: 'Human-readable node name' },
                    autoPull: { type: 'boolean', default: false, description: 'Auto-pull new skills' },
                  },
                },
                description: 'List of remote skill nodes',
              },
            },
          },
          security: {
            type: 'object',
            properties: {
              autoVerify: { type: 'boolean', default: true, description: 'Auto-verify skill security' },
              minScore: { type: 'number', default: 0.7, description: 'Minimum security score to allow installation' },
              cacheTtlMs: { type: 'number', default: 86400000, description: 'Security verdict cache TTL in milliseconds' },
            },
          },
          agentFilter: {
            type: 'object',
            properties: {
              defaultVisibility: { type: 'string', enum: ['all', 'whitelist', 'tagged'], default: 'all', description: 'Default skill visibility for agents' },
            },
          },
        },
      },
    },
  };
}

// ===================== 增强版校验 =====================

/**
 * 递归校验配置值，支持：
 * - object / array / 基本类型
 * - enum / const
 * - composition (anyOf / oneOf / allOf)
 * - additionalProperties
 * - minimum / maximum / minLength / maxLength / minItems / maxItems
 */
export function validateConfig(
  config: unknown,
  schema?: ConfigSchema | JsonSchemaObject,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  const resolvedSchema = schema ?? resolveConfigSchema();

  function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  function validate(value: unknown, sch: ConfigSchema | JsonSchemaObject, path: string): void {
    const node = sch as JsonSchemaObject;
    const type = node.type;

    // composition: anyOf — 至少一个分支通过
    if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
      const branchErrors: ConfigValidationError[][] = [];
      let matched = false;
      for (const branch of node.anyOf) {
        const branchErrs: ConfigValidationError[] = [];
        validateCollect(value, branch, path, branchErrs);
        if (branchErrs.length === 0) {
          matched = true;
          break;
        }
        branchErrors.push(branchErrs);
      }
      if (!matched) {
        errors.push({
          path,
          message: `Value does not match any branch of anyOf`,
          severity: 'error',
        });
      }
      return;
    }

    // composition: oneOf — 恰好一个分支通过
    if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
      let matchCount = 0;
      for (const branch of node.oneOf) {
        const branchErrs: ConfigValidationError[] = [];
        validateCollect(value, branch, path, branchErrs);
        if (branchErrs.length === 0) matchCount++;
      }
      if (matchCount !== 1) {
        errors.push({
          path,
          message: `Value matched ${matchCount} branches of oneOf (expected exactly 1)`,
          severity: 'error',
        });
      }
      return;
    }

    // composition: allOf — 所有分支都通过
    if (Array.isArray(node.allOf) && node.allOf.length > 0) {
      for (const branch of node.allOf) {
        validate(value, branch, path);
      }
      // 继续校验当前节点自身约束
    }

    // enum 校验
    if (Array.isArray(node.enum) && !node.enum.includes(value)) {
      errors.push({
        path,
        message: `Value "${String(value)}" not in enum [${node.enum.map((v) => JSON.stringify(v)).join(', ')}]`,
        severity: 'error',
      });
      return;
    }

    // const 校验
    if ('const' in node && value !== node.const) {
      errors.push({
        path,
        message: `Value "${String(value)}" does not equal const "${String(node.const)}"`,
        severity: 'error',
      });
      return;
    }

    // 类型校验
    if (type === 'object' || (!type && (node.properties || node.additionalProperties))) {
      if (!isPlainObject(value)) {
        errors.push({ path, message: `Expected object, got ${typeof value}`, severity: 'error' });
        return;
      }
      // required
      if (Array.isArray(node.required)) {
        for (const key of node.required) {
          if (!(key in value)) {
            errors.push({ path: `${path}.${key}`, message: 'Missing required property', severity: 'error' });
          }
        }
      }
      // properties
      if (node.properties) {
        for (const [key, propSchema] of Object.entries(node.properties)) {
          if (key in value) {
            validate(value[key], propSchema, `${path}.${key}`);
          }
        }
      }
      // additionalProperties
      const addl = node.additionalProperties;
      if (addl !== undefined && addl !== true && node.properties) {
        const knownKeys = new Set(Object.keys(node.properties));
        for (const key of Object.keys(value)) {
          if (!knownKeys.has(key)) {
            if (addl === false) {
              errors.push({
                path: `${path}.${key}`,
                message: `Additional property not allowed`,
                severity: 'warning',
              });
            } else if (typeof addl === 'object') {
              validate(value[key], addl, `${path}.${key}`);
            }
          }
        }
      }
      return;
    }

    if (type === 'array') {
      if (!Array.isArray(value)) {
        errors.push({ path, message: `Expected array, got ${typeof value}`, severity: 'error' });
        return;
      }
      if (typeof node.minItems === 'number' && value.length < node.minItems) {
        errors.push({ path, message: `Array length ${value.length} < minItems ${node.minItems}`, severity: 'error' });
      }
      if (typeof node.maxItems === 'number' && value.length > node.maxItems) {
        errors.push({ path, message: `Array length ${value.length} > maxItems ${node.maxItems}`, severity: 'error' });
      }
      const items = node.items;
      if (items) {
        if (Array.isArray(items)) {
          // tuple validation
          for (let i = 0; i < Math.min(items.length, value.length); i++) {
            validate(value[i], items[i], `${path}[${i}]`);
          }
        } else {
          for (let i = 0; i < value.length; i++) {
            validate(value[i], items, `${path}[${i}]`);
          }
        }
      }
      return;
    }

    if (type === 'number' || type === 'integer') {
      if (typeof value !== 'number' || (type === 'integer' && !Number.isInteger(value))) {
        errors.push({ path, message: `Expected ${type}, got ${typeof value}`, severity: 'error' });
        return;
      }
      if (typeof node.minimum === 'number' && value < node.minimum) {
        errors.push({ path, message: `Value ${value} < minimum ${node.minimum}`, severity: 'error' });
      }
      if (typeof node.maximum === 'number' && value > node.maximum) {
        errors.push({ path, message: `Value ${value} > maximum ${node.maximum}`, severity: 'error' });
      }
      return;
    }

    if (type === 'string') {
      if (typeof value !== 'string') {
        errors.push({ path, message: `Expected string, got ${typeof value}`, severity: 'error' });
        return;
      }
      if (typeof node.minLength === 'number' && value.length < node.minLength) {
        errors.push({ path, message: `String length ${value.length} < minLength ${node.minLength}`, severity: 'error' });
      }
      if (typeof node.maxLength === 'number' && value.length > node.maxLength) {
        errors.push({ path, message: `String length ${value.length} > maxLength ${node.maxLength}`, severity: 'error' });
      }
      return;
    }

    if (type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ path, message: `Expected boolean, got ${typeof value}`, severity: 'error' });
      return;
    }
  }

  function validateCollect(
    value: unknown,
    sch: ConfigSchema | JsonSchemaObject,
    path: string,
    collect: ConfigValidationError[],
  ): void {
    const saved = errors.length;
    validate(value, sch, path);
    // 把本次新增的错误移到 collect
    while (errors.length > saved) {
      collect.push(errors.pop()!);
    }
  }

  validate(config, resolvedSchema as JsonSchemaObject, 'config');

  if (errors.length > 0) {
    logger.warn(`[Config] Found ${errors.length} validation issues`);
  }

  return errors;
}

// ===================== Schema 合并 =====================

function isObjectSchema(schema: JsonSchemaObject): boolean {
  const type = schema.type;
  if (type === 'object') return true;
  if (Array.isArray(type) && type.includes('object')) return true;
  return Boolean(schema.properties || schema.additionalProperties);
}

/** 合并两个 object schema（base + extension），合并 properties 和 required */
export function mergeObjectSchema(
  base: JsonSchemaObject,
  extension: JsonSchemaObject,
): JsonSchemaObject {
  const mergedRequired = new Set<string>([...(base.required ?? []), ...(extension.required ?? [])]);
  const merged: JsonSchemaObject = {
    ...base,
    ...extension,
    properties: {
      ...base.properties,
      ...extension.properties,
    },
  };
  if (mergedRequired.size > 0) {
    merged.required = Array.from(mergedRequired);
  }
  const additional = extension.additionalProperties ?? base.additionalProperties;
  if (additional !== undefined) {
    merged.additionalProperties = additional;
  }
  return merged;
}

// ===================== 路径查找 =====================

const FORBIDDEN_LOOKUP_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_LOOKUP_PATH_SEGMENTS = 32;

function normalizeLookupPath(path: string): string {
  return path
    .trim()
    .replace(/\[(\*|\d*)\]/g, (_match, segment: string) => `.${segment || '*'}`)
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

function splitLookupPath(path: string): string[] {
  const normalized = normalizeLookupPath(path);
  return normalized ? normalized.split('.').filter(Boolean) : [];
}

function resolveItemsSchema(schema: JsonSchemaObject, index?: number): JsonSchemaObject | null {
  if (Array.isArray(schema.items)) {
    const entry =
      index === undefined
        ? schema.items.find((candidate) => typeof candidate === 'object' && candidate !== null)
        : schema.items[index];
    return entry && typeof entry === 'object' ? entry : null;
  }
  return schema.items && typeof schema.items === 'object' ? schema.items : null;
}

function parseConfigPathArrayIndex(segment: string): number | undefined {
  const n = Number(segment);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function resolveLookupChildSchema(
  schema: JsonSchemaObject,
  segment: string,
): JsonSchemaObject | null {
  if (FORBIDDEN_LOOKUP_SEGMENTS.has(segment)) return null;

  const properties = schema.properties;
  if (properties && Object.hasOwn(properties, segment)) {
    return asJsonSchemaObject(properties[segment]);
  }

  const itemIndex = parseConfigPathArrayIndex(segment);
  const items = resolveItemsSchema(schema, itemIndex);
  if ((segment === '*' || itemIndex !== undefined) && items) {
    return items;
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    return schema.additionalProperties;
  }
  return null;
}

function resolveUiHintMatch(
  uiHints: ConfigUiHints,
  path: string,
): { path: string; hint: ConfigUiHint } | null {
  return findWildcardHintMatch({
    uiHints,
    path,
    splitPath: splitLookupPath,
  });
}

const LOOKUP_SCHEMA_STRING_KEYS = new Set([
  '$id', '$schema', 'title', 'description', 'format', 'pattern', 'contentEncoding', 'contentMediaType',
]);
const LOOKUP_SCHEMA_NUMBER_KEYS = new Set([
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties',
]);
const LOOKUP_SCHEMA_BOOLEAN_KEYS = new Set([
  'additionalProperties', 'uniqueItems', 'deprecated', 'readOnly', 'writeOnly',
]);
const LOOKUP_SCHEMA_COMPOSITION_KEYS = ['anyOf', 'oneOf', 'allOf'] as const;
const LOOKUP_SCHEMA_NESTED_FORM_DEPTH = 4;

function stripSchemaForLookup(schema: JsonSchemaObject, nestedFormDepth = 0): JsonSchemaNode {
  const next: JsonSchemaNode = {};

  for (const [key, value] of Object.entries(schema)) {
    if (LOOKUP_SCHEMA_STRING_KEYS.has(key) && typeof value === 'string') {
      next[key] = value;
      continue;
    }
    if (LOOKUP_SCHEMA_NUMBER_KEYS.has(key) && typeof value === 'number') {
      next[key] = value;
      continue;
    }
    if (LOOKUP_SCHEMA_BOOLEAN_KEYS.has(key) && typeof value === 'boolean') {
      next[key] = value;
      continue;
    }
    if (key === 'type') {
      if (typeof value === 'string') {
        next[key] = value;
      } else if (Array.isArray(value) && value.every((e) => typeof e === 'string')) {
        next[key] = [...value];
      }
      continue;
    }
    if (key === 'enum' && Array.isArray(value)) {
      const entries = value.filter(
        (e) => e === null || typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean',
      );
      if (entries.length === value.length) {
        next[key] = [...entries];
      }
      continue;
    }
    if (key === 'const' && (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      next[key] = value;
    }
  }

  if (
    schema.properties &&
    ((nestedFormDepth > 0 && nestedFormDepth <= LOOKUP_SCHEMA_NESTED_FORM_DEPTH) ||
      (schema.additionalProperties && typeof schema.additionalProperties === 'object'))
  ) {
    next.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, child]) => [
        key,
        stripSchemaForLookup(child, nestedFormDepth + 1),
      ]),
    );
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    next.additionalProperties = stripSchemaForLookup(schema.additionalProperties, nestedFormDepth + 1);
  }
  if (Array.isArray(schema.items)) {
    next.items = schema.items.map((item) => stripSchemaForLookup(item, nestedFormDepth + 1));
  } else if (schema.items && typeof schema.items === 'object') {
    next.items = stripSchemaForLookup(schema.items, nestedFormDepth + 1);
  }
  if (nestedFormDepth <= LOOKUP_SCHEMA_NESTED_FORM_DEPTH) {
    for (const key of LOOKUP_SCHEMA_COMPOSITION_KEYS) {
      const variants = schema[key];
      if (!Array.isArray(variants)) continue;
      next[key] = variants
        .filter((v) => v && typeof v === 'object')
        .map((v) => stripSchemaForLookup(v, nestedFormDepth + 1));
    }
  }

  return next;
}

function buildLookupChildren(
  schema: JsonSchemaObject,
  path: string,
  uiHints: ConfigUiHints,
): ConfigSchemaLookupChild[] {
  const children: ConfigSchemaLookupChild[] = [];
  const required = new Set(schema.required ?? []);

  const pushChild = (key: string, childSchema: JsonSchemaObject, isRequired: boolean) => {
    const childPath = path ? `${path}.${key}` : key;
    const resolvedHint = resolveUiHintMatch(uiHints, childPath);
    children.push({
      key,
      path: childPath,
      type: childSchema.type,
      required: isRequired,
      hasChildren: schemaHasChildren(childSchema),
      hint: resolvedHint?.hint,
      hintPath: resolvedHint?.path,
    });
  };

  for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
    pushChild(key, childSchema, required.has(key));
  }

  const wildcardSchema =
    (schema.additionalProperties &&
    typeof schema.additionalProperties === 'object' &&
    !Array.isArray(schema.additionalProperties)
      ? schema.additionalProperties
      : null) ?? resolveItemsSchema(schema);
  if (wildcardSchema) {
    pushChild('*', wildcardSchema, false);
  }

  return children;
}

/** 按路径查找 schema 节点（支持通配符 `*` 和数组索引） */
export function lookupConfigSchema(
  response: ConfigSchemaResponse,
  path: string,
): ConfigSchemaLookupResult | null {
  const wantsRoot = path.trim() === '.';
  const normalizedPath = normalizeLookupPath(path);
  if (!normalizedPath && !wantsRoot) return null;
  const parts = splitLookupPath(normalizedPath);
  if ((!wantsRoot && parts.length === 0) || parts.length > MAX_LOOKUP_PATH_SEGMENTS) return null;

  let current = asJsonSchemaObject(response.schema);
  if (!current) return null;
  for (const segment of parts) {
    const next = resolveLookupChildSchema(current, segment);
    if (!next) return null;
    current = next;
  }

  const resolvedHint = resolveUiHintMatch(response.uiHints, normalizedPath);
  return {
    path: wantsRoot ? '.' : normalizedPath,
    schema: stripSchemaForLookup(current),
    hint: resolvedHint?.hint,
    hintPath: resolvedHint?.path,
    children: buildLookupChildren(current, wantsRoot ? '' : normalizedPath, response.uiHints),
  };
}

// ===================== 扩展 schema 合并（plugin / channel） =====================

const EXTENSION_SCHEMA_MAX_BYTES = 256 * 1024;
const EXTENSION_SCHEMA_TOTAL_MAX_BYTES = 2 * 1024 * 1024;
const EXTENSION_SCHEMA_MAX_ITEMS = 256;

function schemaJsonBytes(schema: JsonSchemaNode): number {
  try {
    return Buffer.byteLength(JSON.stringify(schema), 'utf-8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function buildOmittedExtensionConfigSchema(kind: 'plugin' | 'channel', id: string): JsonSchemaNode {
  return {
    type: 'object',
    additionalProperties: true,
    description: `${kind} config schema for ${id} was omitted from the full config.schema response because installed extension schemas exceeded the Gateway response budget.`,
  };
}

function limitExtensionSchemas(params: {
  plugins: PluginUiMetadata[];
  channels: ChannelUiMetadata[];
}): { plugins: PluginUiMetadata[]; channels: ChannelUiMetadata[] } {
  let totalBytes = 0;
  let includedItems = 0;

  const keepSchema = (schema: JsonSchemaNode): boolean => {
    const bytes = schemaJsonBytes(schema);
    if (
      !Number.isFinite(bytes) ||
      bytes > EXTENSION_SCHEMA_MAX_BYTES ||
      totalBytes + bytes > EXTENSION_SCHEMA_TOTAL_MAX_BYTES ||
      includedItems >= EXTENSION_SCHEMA_MAX_ITEMS
    ) {
      return false;
    }
    totalBytes += bytes;
    includedItems += 1;
    return true;
  };

  const plugins = params.plugins.map((plugin) => {
    if (!plugin.configSchema || keepSchema(plugin.configSchema)) return plugin;
    return { ...plugin, configSchema: buildOmittedExtensionConfigSchema('plugin', plugin.id) };
  });

  const channels = params.channels.map((channel) => {
    if (!channel.configSchema || keepSchema(channel.configSchema)) return channel;
    return { ...channel, configSchema: buildOmittedExtensionConfigSchema('channel', channel.id) };
  });

  return { plugins, channels };
}

function applyPluginHints(hints: ConfigUiHints, plugins: PluginUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const plugin of plugins) {
    const id = plugin.id.trim();
    if (!id) continue;
    const name = (plugin.name ?? id).trim() || id;
    const basePath = `plugins.entries.${id}`;

    next[basePath] = {
      ...next[basePath],
      label: name,
      help: plugin.description ? `${plugin.description} (plugin: ${id})` : `Plugin entry for ${id}.`,
    };
    next[`${basePath}.enabled`] = { ...next[`${basePath}.enabled`], label: `Enable ${name}` };
    next[`${basePath}.config`] = {
      ...next[`${basePath}.config`],
      label: `${name} Config`,
      help: `Plugin-defined config payload for ${id}.`,
    };

    const uiHints = plugin.configUiHints ?? {};
    for (const [relPathRaw, hint] of Object.entries(uiHints)) {
      const relPath = relPathRaw.trim().replace(/^\./, '');
      if (!relPath) continue;
      next[`${basePath}.config.${relPath}`] = { ...next[`${basePath}.config.${relPath}`], ...hint };
    }
  }
  return next;
}

function applyChannelHints(hints: ConfigUiHints, channels: ChannelUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const channel of channels) {
    const id = channel.id.trim();
    if (!id) continue;
    const basePath = `channels.${id}`;
    const current = next[basePath] ?? {};
    const label = channel.label?.trim();
    const help = channel.description?.trim();
    next[basePath] = {
      ...current,
      ...(label ? { label } : {}),
      ...(help ? { help } : {}),
    };

    const uiHints = channel.configUiHints ?? {};
    for (const [relPathRaw, hint] of Object.entries(uiHints)) {
      const relPath = relPathRaw.trim().replace(/^\./, '');
      if (!relPath) continue;
      next[`${basePath}.${relPath}`] = { ...next[`${basePath}.${relPath}`], ...hint };
    }
  }
  return next;
}

function applyPluginSchemas(schema: JsonSchemaNode, plugins: PluginUiMetadata[]): JsonSchemaNode {
  const next = cloneSchema(schema);
  const root = asJsonSchemaObject(next);
  const pluginsNode = asJsonSchemaObject(root?.properties?.plugins);
  const entriesNode = asJsonSchemaObject(pluginsNode?.properties?.entries);
  if (!entriesNode) return next;

  const entryBase = asJsonSchemaObject(entriesNode.additionalProperties);
  const entryProperties = entriesNode.properties ?? {};
  entriesNode.properties = entryProperties;

  for (const plugin of plugins) {
    if (!plugin.configSchema) continue;
    const entrySchema = entryBase
      ? cloneSchema(entryBase)
      : ({ type: 'object' } as JsonSchemaObject);
    const entryObject = asJsonSchemaObject(entrySchema) ?? ({ type: 'object' } as JsonSchemaObject);
    const baseConfigSchema = asJsonSchemaObject(entryObject.properties?.config);
    const pluginSchema = asJsonSchemaObject(plugin.configSchema);
    const nextConfigSchema =
      baseConfigSchema && pluginSchema && isObjectSchema(baseConfigSchema) && isObjectSchema(pluginSchema)
        ? mergeObjectSchema(baseConfigSchema, pluginSchema)
        : cloneSchema(plugin.configSchema);

    entryObject.properties = { ...entryObject.properties, config: nextConfigSchema };
    entryProperties[plugin.id] = entryObject;
  }

  return next;
}

function applyChannelSchemas(schema: JsonSchemaNode, channels: ChannelUiMetadata[]): JsonSchemaNode {
  const next = cloneSchema(schema);
  const root = asJsonSchemaObject(next);
  const channelsNode = asJsonSchemaObject(root?.properties?.channels);
  if (!channelsNode) return next;
  const channelProps = channelsNode.properties ?? {};
  channelsNode.properties = channelProps;

  for (const channel of channels) {
    if (!channel.configSchema) continue;
    const existing = asJsonSchemaObject(channelProps[channel.id]);
    const incoming = asJsonSchemaObject(channel.configSchema);
    if (existing && incoming && isObjectSchema(existing) && isObjectSchema(incoming)) {
      channelProps[channel.id] = mergeObjectSchema(existing, incoming);
    } else {
      channelProps[channel.id] = cloneSchema(channel.configSchema);
    }
  }

  return next;
}

// ===================== 从 schema-meta 构建 UI hints =====================

function buildBaseUiHints(): ConfigUiHints {
  const hints: ConfigUiHints = {};
  for (const [path, meta] of Object.entries(schemaHints)) {
    hints[path] = {
      label: meta.title,
      help: meta.description ?? schemaHelp[path],
      placeholder: meta.placeholder,
      widget: meta.widget,
      tags: meta.tags,
    };
  }
  return hints;
}

function applyDerivedTags(hints: ConfigUiHints): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const [path, hint] of Object.entries(next)) {
    if (!hint.tags || hint.tags.length === 0) {
      const derived = schemaTags.deriveTags(path);
      if (derived.length > 0) {
        next[path] = { ...hint, tags: derived };
      }
    }
  }
  return next;
}

function applySensitiveHints(hints: ConfigUiHints, _knownKeys: Set<string>): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const [path, hint] of Object.entries(next)) {
    const lower = path.toLowerCase();
    if (/(token|password|secret|api[_.-]?key|credential)/i.test(path)) {
      next[path] = { ...hint, sensitive: true };
    }
    if (lower.includes('url') && /(token|key|secret)/i.test(path)) {
      next[path] = { ...hint, sensitive: true };
    }
  }
  return next;
}

// ===================== 构建完整 schema 响应 =====================

let cachedBase: ConfigSchemaResponse | null = null;

function buildBaseConfigSchema(): ConfigSchemaResponse {
  if (cachedBase) return cachedBase;
  const schema = resolveConfigSchema() as unknown as JsonSchemaNode;
  const uiHints = applyDerivedTags(applySensitiveHints(buildBaseUiHints(), new Set()));
  const next: ConfigSchemaResponse = {
    schema,
    uiHints,
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
  };
  cachedBase = next;
  return next;
}

const mergedSchemaCache = new Map<string, ConfigSchemaResponse>();
const MERGED_SCHEMA_CACHE_MAX = 64;

function buildMergedSchemaCacheKey(params: {
  plugins: PluginUiMetadata[];
  channels: ChannelUiMetadata[];
}): string {
  const plugins = params.plugins
    .map((p) => ({ id: p.id, name: p.name, description: p.description, configSchema: p.configSchema ?? null }))
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const channels = params.channels
    .map((c) => ({ id: c.id, label: c.label, description: c.description, configSchema: c.configSchema ?? null }))
    .toSorted((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ plugins, channels });
}

function setMergedSchemaCache(key: string, value: ConfigSchemaResponse): void {
  if (mergedSchemaCache.size >= MERGED_SCHEMA_CACHE_MAX) {
    const oldest = mergedSchemaCache.keys().next();
    if (!oldest.done) mergedSchemaCache.delete(oldest.value);
  }
  mergedSchemaCache.set(key, value);
}

/** 构建带 plugin/channel 扩展的完整配置 schema 响应 */
export function buildConfigSchema(params?: {
  plugins?: PluginUiMetadata[];
  channels?: ChannelUiMetadata[];
  cache?: boolean;
}): ConfigSchemaResponse {
  const base = buildBaseConfigSchema();
  const { plugins, channels } = limitExtensionSchemas({
    plugins: params?.plugins ?? [],
    channels: params?.channels ?? [],
  });
  if (plugins.length === 0 && channels.length === 0) return base;

  const useCache = params?.cache !== false;
  const cacheKey = useCache ? buildMergedSchemaCacheKey({ plugins, channels }) : null;
  if (cacheKey) {
    const cached = mergedSchemaCache.get(cacheKey);
    if (cached) return cached;
  }

  const mergedHints = applySensitiveHints(
    applyChannelHints(applyPluginHints(base.uiHints, plugins), channels),
    new Set(),
  );
  const mergedSchema = applyChannelSchemas(applyPluginSchemas(base.schema, plugins), channels);
  const merged: ConfigSchemaResponse = { ...base, schema: mergedSchema, uiHints: mergedHints };

  if (cacheKey) setMergedSchemaCache(cacheKey, merged);
  return merged;
}

/** 重置 schema 缓存（测试用） */
export function resetConfigSchemaCache(): void {
  cachedBase = null;
  mergedSchemaCache.clear();
}
