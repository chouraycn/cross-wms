// 配置 Schema 合并与缓存
// 参考 openclaw/src/config/schema.ts 的设计，构建 JSON Schema、合并插件/通道 schema、
// 提供 UI hints、敏感数据标记、reload 元数据，并使用 SHA-256 增量哈希构建缓存键

import crypto from 'node:crypto';
import { CONFIG_VERSION } from './version.js';

// JSON Schema 节点类型（宽松结构，兼容任意 JSON Schema 关键字）
export type ConfigSchema = Record<string, unknown>;

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
};

// UI hint：每个配置路径对应的展示元数据
export interface ConfigUiHint {
  label?: string;
  help?: string;
  placeholder?: string;
  tags?: string[];
  advanced?: boolean;
  sensitive?: boolean;
}

export type ConfigUiHints = Record<string, ConfigUiHint>;

// reload 类型：restart 需要重启、hot 热加载、none 无影响
export type ConfigSchemaReloadKind = 'restart' | 'hot' | 'none';

export interface ConfigSchemaReloadMetadata {
  kind: ConfigSchemaReloadKind;
}

export type ConfigSchemaReloadMetadataResolver = (
  path: string,
) => ConfigSchemaReloadMetadata | null | undefined;

// 完整的配置 schema 响应
export interface ConfigSchemaResponse {
  schema: ConfigSchema;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
}

// 查找单个配置路径的子项信息
export interface ConfigSchemaLookupChild {
  key: string;
  path: string;
  type?: string | string[];
  required: boolean;
  hasChildren: boolean;
  reloadKind?: ConfigSchemaReloadKind;
  hint?: ConfigUiHint;
  hintPath?: string;
}

export interface ConfigSchemaLookupResult {
  path: string;
  schema: JsonSchemaNode;
  reloadKind?: ConfigSchemaReloadKind;
  hint?: ConfigUiHint;
  hintPath?: string;
  children: ConfigSchemaLookupChild[];
}

// 插件 UI 元数据：插件 id、名称、描述、自定义 schema 与 UI hints
export interface PluginUiMetadata {
  id: string;
  name?: string;
  description?: string;
  configUiHints?: Record<string, Pick<ConfigUiHint, 'label' | 'help' | 'tags' | 'advanced' | 'sensitive' | 'placeholder'>>;
  configSchema?: JsonSchemaNode;
}

// 通道 UI 元数据
export interface ChannelUiMetadata {
  id: string;
  label?: string;
  description?: string;
  configSchema?: JsonSchemaNode;
  configUiHints?: Record<string, ConfigUiHint>;
}

// ============================================================================
// 内部常量
// ============================================================================

const FORBIDDEN_LOOKUP_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_LOOKUP_PATH_SEGMENTS = 32;
const LOOKUP_SCHEMA_NESTED_FORM_DEPTH = 4;

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

// 单个扩展 schema 与总量的字节上限，避免响应膨胀
const EXTENSION_SCHEMA_MAX_BYTES = 256 * 1024;
const EXTENSION_SCHEMA_TOTAL_MAX_BYTES = 2 * 1024 * 1024;
const EXTENSION_SCHEMA_MAX_ITEMS = 256;

// LRU 缓存最大条目数
const MERGED_SCHEMA_CACHE_MAX = 64;

// 敏感字段名后缀启发式匹配模式
const SENSITIVE_KEY_PATTERN = /(?:token|secret|password|passwd|api[-_]?key|api[-_]?secret|credential|bearer|private[-_]?key|recovery[-_]?key|signing[-_]?key|encryption[-_]?key|master[-_]?key|access[-_]?key)$/i;

// ============================================================================
// 工具函数
// ============================================================================

function asJsonSchemaObject(value: unknown): JsonSchemaObject | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonSchemaObject;
  }
  return null;
}

function cloneSchema<T>(schema: T): T {
  if (schema === null || typeof schema !== 'object') {
    return schema;
  }
  return JSON.parse(JSON.stringify(schema)) as T;
}

function schemaJsonBytes(schema: JsonSchemaNode): number {
  try {
    return Buffer.byteLength(JSON.stringify(schema), 'utf-8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isObjectSchema(schema: JsonSchemaObject): boolean {
  const type = schema.type;
  if (type === 'object') {
    return true;
  }
  if (Array.isArray(type) && type.includes('object')) {
    return true;
  }
  return Boolean(schema.properties || schema.additionalProperties);
}

// 合并两个 object schema：properties 浅合并，required 取并集
function mergeObjectSchema(base: JsonSchemaObject, extension: JsonSchemaObject): JsonSchemaObject {
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

// 判断 schema 是否拥有子节点（对象属性、数组项或通配符）
function schemaHasChildren(schema: JsonSchemaObject): boolean {
  if (schema.properties && Object.keys(schema.properties).length > 0) {
    return true;
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    return true;
  }
  if (schema.items) {
    return true;
  }
  return false;
}

// ============================================================================
// 扩展 schema 体积限制
// ============================================================================

function buildOmittedExtensionConfigSchema(kind: 'plugin' | 'channel', id: string): JsonSchemaNode {
  return {
    type: 'object',
    additionalProperties: true,
    description: `${kind} config schema for ${id} was omitted because installed extension schemas exceeded the response budget.`,
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
    if (!plugin.configSchema || keepSchema(plugin.configSchema)) {
      return plugin;
    }
    return { ...plugin, configSchema: buildOmittedExtensionConfigSchema('plugin', plugin.id) };
  });

  const channels = params.channels.map((channel) => {
    if (!channel.configSchema || keepSchema(channel.configSchema)) {
      return channel;
    }
    return { ...channel, configSchema: buildOmittedExtensionConfigSchema('channel', channel.id) };
  });

  return { plugins, channels };
}

// ============================================================================
// UI hints 应用
// ============================================================================

function applyPluginHints(hints: ConfigUiHints, plugins: PluginUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const plugin of plugins) {
    const id = plugin.id.trim();
    if (!id) {
      continue;
    }
    const name = (plugin.name ?? id).trim() || id;
    const basePath = `plugins.entries.${id}`;

    next[basePath] = {
      ...next[basePath],
      label: name,
      help: plugin.description ? `${plugin.description} (plugin: ${id})` : `Plugin entry for ${id}.`,
    };
    next[`${basePath}.enabled`] = {
      ...next[`${basePath}.enabled`],
      label: `Enable ${name}`,
    };
    next[`${basePath}.config`] = {
      ...next[`${basePath}.config`],
      label: `${name} Config`,
      help: `Plugin-defined config payload for ${id}.`,
    };

    const uiHints = plugin.configUiHints ?? {};
    for (const [relPathRaw, hint] of Object.entries(uiHints)) {
      const relPath = relPathRaw.trim().replace(/^\./, '');
      if (!relPath) {
        continue;
      }
      const key = `${basePath}.config.${relPath}`;
      next[key] = { ...next[key], ...hint };
    }
  }
  return next;
}

function applyChannelHints(hints: ConfigUiHints, channels: ChannelUiMetadata[]): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const channel of channels) {
    const id = channel.id.trim();
    if (!id) {
      continue;
    }
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
      if (!relPath) {
        continue;
      }
      const key = `${basePath}.${relPath}`;
      next[key] = { ...next[key], ...hint };
    }
  }
  return next;
}

// 收集扩展涉及的 hint 路径键，供敏感标记派生使用
function collectExtensionHintKeys(
  hints: ConfigUiHints,
  plugins: PluginUiMetadata[],
  channels: ChannelUiMetadata[],
): Set<string> {
  const keys = new Set<string>();
  const collectPrefixedHintKeys = (prefix: string) => {
    for (const key of Object.keys(hints)) {
      if (key === prefix || key.startsWith(`${prefix}.`)) {
        keys.add(key);
      }
    }
  };

  const collectSchemaKeys = (schema: unknown, basePath: string) => {
    const node = asJsonSchemaObject(schema);
    if (!node) {
      return;
    }
    keys.add(basePath);
    for (const [propertyKey, propertySchema] of Object.entries(node.properties ?? {})) {
      collectSchemaKeys(propertySchema, `${basePath}.${propertyKey}`);
    }
    if (node.additionalProperties && typeof node.additionalProperties === 'object') {
      collectSchemaKeys(node.additionalProperties, `${basePath}.*`);
    }
    if (Array.isArray(node.items)) {
      for (const item of node.items) {
        if (item && typeof item === 'object') {
          collectSchemaKeys(item, `${basePath}[]`);
        }
      }
      return;
    }
    if (node.items && typeof node.items === 'object') {
      collectSchemaKeys(node.items, `${basePath}[]`);
    }
  };

  for (const plugin of plugins) {
    const id = plugin.id.trim();
    if (!id) {
      continue;
    }
    const prefix = `plugins.entries.${id}`;
    collectPrefixedHintKeys(prefix);
    collectSchemaKeys(plugin.configSchema, `${prefix}.config`);
  }

  for (const channel of channels) {
    const id = channel.id.trim();
    if (!id) {
      continue;
    }
    const prefix = `channels.${id}`;
    collectPrefixedHintKeys(prefix);
    collectSchemaKeys(channel.configSchema, prefix);
  }

  return keys;
}

// 基于字段名后缀标记敏感字段
function applySensitiveHints(hints: ConfigUiHints, extensionKeys: Set<string>): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const key of extensionKeys) {
    const lastSegment = key.split('.').pop() ?? '';
    if (lastSegment && SENSITIVE_KEY_PATTERN.test(lastSegment)) {
      next[key] = { ...next[key], sensitive: true };
    }
  }
  return next;
}

// ============================================================================
// Schema 合并
// ============================================================================

function applyPluginSchemas(schema: ConfigSchema, plugins: PluginUiMetadata[]): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asJsonSchemaObject(next);
  const pluginsNode = asJsonSchemaObject(root?.properties?.plugins);
  const entriesNode = asJsonSchemaObject(pluginsNode?.properties?.entries);
  if (!entriesNode) {
    return next;
  }

  const entryBase = asJsonSchemaObject(entriesNode.additionalProperties);
  const entryProperties = entriesNode.properties ?? {};
  entriesNode.properties = entryProperties;

  for (const plugin of plugins) {
    if (!plugin.configSchema) {
      continue;
    }
    const entrySchema = entryBase ? cloneSchema(entryBase) : ({ type: 'object' } as JsonSchemaObject);
    const entryObject = asJsonSchemaObject(entrySchema) ?? ({ type: 'object' } as JsonSchemaObject);
    const baseConfigSchema = asJsonSchemaObject(entryObject.properties?.config);
    const pluginSchema = asJsonSchemaObject(plugin.configSchema);
    const nextConfigSchema =
      baseConfigSchema && pluginSchema && isObjectSchema(baseConfigSchema) && isObjectSchema(pluginSchema)
        ? mergeObjectSchema(baseConfigSchema, pluginSchema)
        : cloneSchema(plugin.configSchema);

    entryObject.properties = {
      ...entryObject.properties,
      config: nextConfigSchema,
    };
    entryProperties[plugin.id] = entryObject;
  }

  return next;
}

function applyChannelSchemas(schema: ConfigSchema, channels: ChannelUiMetadata[]): ConfigSchema {
  const next = cloneSchema(schema);
  const root = asJsonSchemaObject(next);
  const channelsNode = asJsonSchemaObject(root?.properties?.channels);
  if (!channelsNode) {
    return next;
  }
  const channelProps = channelsNode.properties ?? {};
  channelsNode.properties = channelProps;

  for (const channel of channels) {
    if (!channel.configSchema) {
      continue;
    }
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

// 合并单个插件的 schema 到目标 schema（公开 API，便于增量合并）
export function mergePluginSchema(
  schema: ConfigSchema,
  plugin: PluginUiMetadata,
): ConfigSchema {
  return applyPluginSchemas(schema, [plugin]);
}

// ============================================================================
// 基础 schema 构建
// ============================================================================

// cdf-know 的基础配置 schema（简化版，聚焦核心配置维度）
function buildBaseConfigSchemaObject(): JsonSchemaObject {
  return {
    type: 'object',
    additionalProperties: true,
    properties: {
      app: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: { type: 'string', description: '应用名称' },
          port: { type: 'number', minimum: 1, maximum: 65535, description: '服务监听端口' },
        },
      },
      models: {
        type: 'object',
        additionalProperties: true,
        properties: {
          default: { type: 'string', description: '默认模型引用' },
          providers: { type: 'object', additionalProperties: true },
        },
      },
      agents: {
        type: 'object',
        additionalProperties: true,
        properties: {
          defaults: {
            type: 'object',
            additionalProperties: true,
            properties: {
              maxConcurrent: { type: 'number', minimum: 1 },
              model: { type: 'string' },
            },
          },
        },
      },
      messages: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ackReactionScope: { type: 'string', description: '确认反应范围' },
        },
      },
      session: {
        type: 'object',
        additionalProperties: true,
        properties: {
          mainKey: { type: 'string', description: '主会话键' },
        },
      },
      cron: {
        type: 'object',
        additionalProperties: true,
        properties: {
          maxConcurrentRuns: { type: 'number', minimum: 1 },
        },
      },
      logging: {
        type: 'object',
        additionalProperties: true,
        properties: {
          level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
          redactSensitive: { type: ['string', 'boolean'] },
        },
      },
      talk: {
        type: 'object',
        additionalProperties: true,
        properties: {
          provider: { type: 'string' },
          speechLocale: { type: 'string' },
        },
      },
      channels: {
        type: 'object',
        additionalProperties: true,
      },
      plugins: {
        type: 'object',
        additionalProperties: true,
        properties: {
          entries: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                config: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      meta: {
        type: 'object',
        additionalProperties: true,
        properties: {
          lastTouchedVersion: { type: 'string' },
          lastTouchedAt: { type: 'string', format: 'date-time' },
          configVersion: { type: 'string' },
          source: { type: 'string' },
        },
      },
    },
  };
}

// ============================================================================
// 缓存
// ============================================================================

// LRU 缓存：键为基于插件/通道元数据的 SHA-256 哈希，值为合并后的 schema 响应
export class ConfigSchemaCache {
  private readonly store = new Map<string, ConfigSchemaResponse>();
  private readonly max: number;

  constructor(max: number = MERGED_SCHEMA_CACHE_MAX) {
    this.max = max;
  }

  get(key: string): ConfigSchemaResponse | undefined {
    const value = this.store.get(key);
    if (value !== undefined) {
      // Map 保留插入顺序；删除再插入以更新为最近使用
      this.store.delete(key);
      this.store.set(key, value);
    }
    return value;
  }

  set(key: string, value: ConfigSchemaResponse): void {
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next();
      if (!oldest.done) {
        this.store.delete(oldest.value);
      }
    }
    this.store.set(key, value);
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

const mergedSchemaCache = new ConfigSchemaCache();
let cachedBase: ConfigSchemaResponse | null = null;

// 增量构建 SHA-256 哈希作为缓存键，避免一次性序列化整个对象
function buildMergedSchemaCacheKey(params: {
  plugins: PluginUiMetadata[];
  channels: ChannelUiMetadata[];
}): string {
  const plugins = params.plugins
    .map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      configSchema: plugin.configSchema ?? null,
      configUiHints: plugin.configUiHints ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const channels = params.channels
    .map((channel) => ({
      id: channel.id,
      label: channel.label,
      description: channel.description,
      configSchema: channel.configSchema ?? null,
      configUiHints: channel.configUiHints ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const hash = crypto.createHash('sha256');
  hash.update('{"plugins":[');
  plugins.forEach((plugin, index) => {
    if (index > 0) {
      hash.update(',');
    }
    hash.update(JSON.stringify(plugin));
  });
  hash.update('],"channels":[');
  channels.forEach((channel, index) => {
    if (index > 0) {
      hash.update(',');
    }
    hash.update(JSON.stringify(channel));
  });
  hash.update(']}');
  return hash.digest('hex');
}

function buildBaseConfigSchema(): ConfigSchemaResponse {
  if (cachedBase) {
    return cachedBase;
  }
  const schema = buildBaseConfigSchemaObject() as ConfigSchema;
  const next: ConfigSchemaResponse = {
    schema,
    uiHints: {},
    version: CONFIG_VERSION,
    generatedAt: new Date().toISOString(),
  };
  cachedBase = next;
  return next;
}

// ============================================================================
// 公开 API：buildConfigSchema
// ============================================================================

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
  if (plugins.length === 0 && channels.length === 0) {
    return base;
  }
  const useCache = params?.cache !== false;
  const cacheKey = useCache ? buildMergedSchemaCacheKey({ plugins, channels }) : null;
  if (cacheKey) {
    const cached = mergedSchemaCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const mergedHints = applySensitiveHints(
    applyChannelHints(applyPluginHints(base.uiHints, plugins), channels),
    collectExtensionHintKeys(base.uiHints, plugins, channels),
  );
  const mergedSchema = applyChannelSchemas(applyPluginSchemas(base.schema, plugins), channels);
  const merged: ConfigSchemaResponse = {
    ...base,
    schema: mergedSchema,
    uiHints: mergedHints,
    generatedAt: new Date().toISOString(),
  };
  if (cacheKey) {
    mergedSchemaCache.set(cacheKey, merged);
  }
  return merged;
}

// ============================================================================
// 公开 API：lookupConfigSchema
// ============================================================================

// 规范化查找路径：将数组下标 [0] / [*] 转为点分形式，去除首尾与多余点号
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

// 通配符 hint 匹配：先精确匹配，再尝试 .* 与 [] 通配
function resolveUiHintMatch(
  uiHints: ConfigUiHints,
  path: string,
): { path: string; hint: ConfigUiHint } | null {
  if (path in uiHints) {
    return { path, hint: uiHints[path] };
  }
  const parts = splitLookupPath(path);
  // 从最长前缀开始尝试通配
  for (let i = parts.length - 1; i >= 1; i--) {
    const wildcardPath = `${parts.slice(0, i).join('.')}.*`;
    if (wildcardPath in uiHints) {
      return { path: wildcardPath, hint: uiHints[wildcardPath] };
    }
    const arrayPath = `${parts.slice(0, i).join('.')}[]`;
    if (arrayPath in uiHints) {
      return { path: arrayPath, hint: uiHints[arrayPath] };
    }
  }
  return null;
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

// 解析数组下标段（"0"、"3" 等）
function parseConfigPathArrayIndex(segment: string): number | undefined {
  if (!/^\d+$/.test(segment)) {
    return undefined;
  }
  const value = Number.parseInt(segment, 10);
  return Number.isFinite(value) ? value : undefined;
}

function resolveLookupChildSchema(
  schema: JsonSchemaObject,
  segment: string,
): JsonSchemaObject | null {
  if (FORBIDDEN_LOOKUP_SEGMENTS.has(segment)) {
    return null;
  }

  const properties = schema.properties;
  if (properties && Object.prototype.hasOwnProperty.call(properties, segment)) {
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

// 裁剪 schema 节点，仅保留查找所需的关键字，避免响应膨胀
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
      } else if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
        next[key] = [...value];
      }
      continue;
    }
    if (key === 'enum' && Array.isArray(value)) {
      const entries = value.filter(
        (entry) =>
          entry === null ||
          typeof entry === 'string' ||
          typeof entry === 'number' ||
          typeof entry === 'boolean',
      );
      if (entries.length === value.length) {
        next[key] = [...entries];
      }
      continue;
    }
    if (
      key === 'const' &&
      (value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean')
    ) {
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
        stripSchemaForLookup(child as JsonSchemaObject, nestedFormDepth + 1),
      ]),
    );
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    next.additionalProperties = stripSchemaForLookup(
      schema.additionalProperties,
      nestedFormDepth + 1,
    );
  }
  if (Array.isArray(schema.items)) {
    next.items = schema.items.map((item) => stripSchemaForLookup(item, nestedFormDepth + 1));
  } else if (schema.items && typeof schema.items === 'object') {
    next.items = stripSchemaForLookup(schema.items, nestedFormDepth + 1);
  }
  if (nestedFormDepth <= LOOKUP_SCHEMA_NESTED_FORM_DEPTH) {
    for (const key of LOOKUP_SCHEMA_COMPOSITION_KEYS) {
      const variants = schema[key];
      if (!Array.isArray(variants)) {
        continue;
      }
      next[key] = variants
        .filter((variant) => variant && typeof variant === 'object')
        .map((variant) => stripSchemaForLookup(variant, nestedFormDepth + 1));
    }
  }

  return next;
}

function buildLookupChildren(
  schema: JsonSchemaObject,
  path: string,
  uiHints: ConfigUiHints,
  resolveReloadMetadata?: ConfigSchemaReloadMetadataResolver,
): ConfigSchemaLookupChild[] {
  const children: ConfigSchemaLookupChild[] = [];
  const required = new Set(schema.required ?? []);

  const pushChild = (key: string, childSchema: JsonSchemaObject, isRequired: boolean) => {
    const childPath = path ? `${path}.${key}` : key;
    const resolvedHint = resolveUiHintMatch(uiHints, childPath);
    const reloadMetadata = resolveReloadMetadata?.(childPath);
    children.push({
      key,
      path: childPath,
      type: childSchema.type,
      required: isRequired,
      hasChildren: schemaHasChildren(childSchema),
      reloadKind: reloadMetadata?.kind,
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

// 根据点分路径查找 schema 节点，支持数组下标与通配符
export function lookupConfigSchema(
  response: ConfigSchemaResponse,
  path: string,
  resolveReloadMetadata?: ConfigSchemaReloadMetadataResolver,
): ConfigSchemaLookupResult | null {
  const wantsRoot = path.trim() === '.';
  const normalizedPath = normalizeLookupPath(path);
  if (!normalizedPath && !wantsRoot) {
    return null;
  }
  const parts = splitLookupPath(normalizedPath);
  if ((!wantsRoot && parts.length === 0) || parts.length > MAX_LOOKUP_PATH_SEGMENTS) {
    return null;
  }

  let current = asJsonSchemaObject(response.schema);
  if (!current) {
    return null;
  }
  for (const segment of parts) {
    const next = resolveLookupChildSchema(current, segment);
    if (!next) {
      return null;
    }
    current = next;
  }

  const resolvedHint = resolveUiHintMatch(response.uiHints, normalizedPath);
  const reloadMetadata = resolveReloadMetadata?.(normalizedPath);
  return {
    path: wantsRoot ? '.' : normalizedPath,
    schema: stripSchemaForLookup(current),
    reloadKind: reloadMetadata?.kind,
    hint: resolvedHint?.hint,
    hintPath: resolvedHint?.path,
    children: buildLookupChildren(
      current,
      wantsRoot ? '' : normalizedPath,
      response.uiHints,
      resolveReloadMetadata,
    ),
  };
}
