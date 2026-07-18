// 移植自 openclaw/src/config/schema.hints.ts
// 为配置文档和 UI 标签提供 schema 提示元数据。
//
// 降级说明：
// - 源文件依赖 @openclaw/net-policy/redact-sensitive-url 的 isSensitiveUrlConfigPath 与
//   SENSITIVE_URL_HINT_TAG，此处降级为无操作（敏感 URL 检测不生效）。
// - 源文件依赖 ../logging/subsystem 的 createSubsystemLogger，此处降级为 console。
// - 源文件依赖 ./zod-schema.sensitive.js 的 sensitive 标记集合，此处降级为空集合。
import { z } from 'zod';
import type { ConfigUiHints } from './schema.tags.js';
import { FIELD_HELP } from './schema.help.js';
import { FIELD_LABELS } from './schema.labels.js';
import { applyDerivedTags } from './schema.tags.js';
import { isSensitiveConfigPath } from './sensitive-paths.js';

export type { ConfigUiHint, ConfigUiHints } from './schema.tags.js';

// 降级：敏感 URL 配置路径检测在此 stub 中始终返回 false。
const SENSITIVE_URL_HINT_TAG = 'sensitive-url';
function isSensitiveUrlConfigPath(_path: string): boolean {
  return false;
}

// 降级：subsystem logger 简化为 console。
type SubsystemLogger = {
  debug: (message: string) => void;
  warn: (message: string) => void;
};
function createSubsystemLogger(_name: string): SubsystemLogger {
  return {
    debug: (message) => {
      // 静默：降级实现不输出 debug 日志。
      void message;
    },
    warn: (message) => console.warn(message),
  };
}

let log: SubsystemLogger | null = null;

function getLog(): SubsystemLogger {
  if (!log) {
    log = createSubsystemLogger('config/schema');
  }
  return log;
}

// 降级：zod-schema.sensitive 的 sensitive 标记集合为空，无 schema 被显式标记敏感。
const sensitive: WeakSet<object> = new WeakSet();

const GROUP_LABELS: Record<string, string> = {
  wizard: 'Wizard',
  update: 'Update',
  cli: 'CLI',
  diagnostics: 'Diagnostics',
  logging: 'Logging',
  gateway: 'Gateway',
  nodeHost: 'Node Host',
  agents: 'Agents',
  tools: 'Tools',
  bindings: 'Bindings',
  audio: 'Audio',
  models: 'Models',
  messages: 'Messages',
  commands: 'Commands',
  session: 'Session',
  cron: 'Cron',
  hooks: 'Hooks',
  ui: 'UI',
  browser: 'Browser',
  talk: 'Talk',
  channels: 'Messaging Channels',
  skills: 'Skills',
  plugins: 'Plugins',
  discovery: 'Discovery',
  presence: 'Presence',
  voicewake: 'Voice Wake',
};

const GROUP_ORDER: Record<string, number> = {
  wizard: 20,
  update: 25,
  cli: 26,
  diagnostics: 27,
  gateway: 30,
  nodeHost: 35,
  agents: 40,
  tools: 50,
  bindings: 55,
  audio: 60,
  models: 70,
  messages: 80,
  commands: 85,
  session: 90,
  cron: 100,
  hooks: 110,
  ui: 120,
  browser: 130,
  talk: 140,
  channels: 150,
  skills: 200,
  plugins: 205,
  discovery: 210,
  presence: 220,
  voicewake: 230,
  logging: 900,
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  'gateway.remote.url': 'ws://host:18789',
  'gateway.remote.tlsFingerprint': 'sha256:ab12cd34…',
  'gateway.remote.sshTarget': 'user@host',
  'gateway.controlUi.basePath': '/openclaw',
  'gateway.controlUi.root': 'dist/control-ui',
  'gateway.controlUi.allowedOrigins': 'https://control.example.com',
  'gateway.push.apns.relay.baseUrl': 'https://ios-push-relay.openclaw.ai',
  'channels.mattermost.baseUrl': 'https://chat.example.com',
  'agents.list[].identity.avatar': 'avatars/openclaw.png',
};

const CHANNEL_NAMESPACE_PREFIX = 'channels.';
const CHANNEL_KERNEL_HINT_PREFIXES = ['channels.defaults', 'channels.modelByChannel'] as const;

function isKernelOwnedChannelHintPath(path: string): boolean {
  if (path === 'channels') {
    return true;
  }
  return CHANNEL_KERNEL_HINT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}.`),
  );
}

/** 返回 channel 提示路径是否属于插件拥有的 channel 命名空间。 */
export function isPluginOwnedChannelHintPath(path: string): boolean {
  if (!path.startsWith(CHANNEL_NAMESPACE_PREFIX)) {
    return false;
  }
  return !isKernelOwnedChannelHintPath(path);
}

export { isSensitiveConfigPath };

/** 构建核心配置 UI 提示，将插件拥有的 channel 提示留给 plugin schema。 */
export function buildBaseHints(): ConfigUiHints {
  const hints: ConfigUiHints = {};
  for (const [group, label] of Object.entries(GROUP_LABELS)) {
    hints[group] = {
      label,
      group: label,
      order: GROUP_ORDER[group],
    };
  }
  for (const [path, label] of Object.entries(FIELD_LABELS)) {
    if (isPluginOwnedChannelHintPath(path)) {
      continue;
    }
    const current = hints[path];
    hints[path] = current ? { ...current, label } : { label };
  }
  for (const [path, help] of Object.entries(FIELD_HELP)) {
    if (isPluginOwnedChannelHintPath(path)) {
      continue;
    }
    const current = hints[path];
    hints[path] = current ? { ...current, help } : { help };
  }
  for (const [path, placeholder] of Object.entries(FIELD_PLACEHOLDERS)) {
    if (isPluginOwnedChannelHintPath(path)) {
      continue;
    }
    const current = hints[path];
    hints[path] = current ? { ...current, placeholder } : { placeholder };
  }
  return applyDerivedTags(hints);
}

/** 在提示映射中标记敏感配置路径，不覆盖显式的敏感元数据。 */
export function applySensitiveHints(
  hints: ConfigUiHints,
  allowedKeys?: ReadonlySet<string>,
): ConfigUiHints {
  const next = { ...hints };
  const keys = allowedKeys ? [...allowedKeys] : Object.keys(next);
  for (const key of keys) {
    const current = next[key];
    if (current?.sensitive !== undefined) {
      continue;
    }
    if (isSensitiveConfigPath(key)) {
      next[key] = { ...current, sensitive: true };
    }
  }
  return next;
}

/** 为携带带凭据风险 URL 的提示路径添加 sensitive-url 标签。 */
export function applySensitiveUrlHints(
  hints: ConfigUiHints,
  allowedKeys?: ReadonlySet<string>,
): ConfigUiHints {
  const next = { ...hints };
  const keys = allowedKeys ? [...allowedKeys] : Object.keys(next);
  for (const key of keys) {
    if (!isSensitiveUrlConfigPath(key)) {
      continue;
    }
    const current = next[key];
    const tags = new Set(current?.tags ?? []);
    tags.add(SENSITIVE_URL_HINT_TAG);
    next[key] = {
      ...current,
      tags: [...tags],
    };
  }
  return next;
}

/** 遍历 Zod schema 并收集被 matchesPath 接受的具体/通配符路径。 */
export function collectMatchingSchemaPaths(
  schema: z.ZodType,
  path: string,
  matchesPath: (path: string) => boolean,
  paths: Set<string> = new Set(),
): Set<string> {
  let currentSchema = schema;

  while (isUnwrappable(currentSchema)) {
    currentSchema = currentSchema.unwrap();
  }

  if (path && matchesPath(path)) {
    paths.add(path);
  }

  if (currentSchema instanceof z.ZodObject) {
    const shape = currentSchema.shape;
    for (const key in shape) {
      const nextPath = path ? `${path}.${key}` : key;
      collectMatchingSchemaPaths(shape[key], nextPath, matchesPath, paths);
    }
    const catchallSchema = currentSchema['_def'].catchall as z.ZodType | undefined;
    if (catchallSchema && !(catchallSchema instanceof z.ZodNever)) {
      const nextPath = path ? `${path}.*` : '*';
      collectMatchingSchemaPaths(catchallSchema, nextPath, matchesPath, paths);
    }
  } else if (currentSchema instanceof z.ZodArray) {
    const nextPath = path ? `${path}[]` : '[]';
    collectMatchingSchemaPaths(currentSchema.element as z.ZodType, nextPath, matchesPath, paths);
  } else if (currentSchema instanceof z.ZodRecord) {
    const nextPath = path ? `${path}.*` : '*';
    collectMatchingSchemaPaths(
      currentSchema['_def'].valueType as z.ZodType,
      nextPath,
      matchesPath,
      paths,
    );
  } else if (
    currentSchema instanceof z.ZodUnion ||
    currentSchema instanceof z.ZodDiscriminatedUnion
  ) {
    for (const option of currentSchema.options) {
      collectMatchingSchemaPaths(option as z.ZodType, path, matchesPath, paths);
    }
  } else if (currentSchema instanceof z.ZodIntersection) {
    collectMatchingSchemaPaths(currentSchema['_def'].left as z.ZodType, path, matchesPath, paths);
    collectMatchingSchemaPaths(currentSchema['_def'].right as z.ZodType, path, matchesPath, paths);
  }

  return paths;
}

// 似乎是 tsgo 接受我们检查是否有带 unwrap() 方法的 ZodClass 的唯一方式。
// 过于复杂是因为 oxlint 和 tsgo 各自禁止对方允许的写法。
interface ZodDummy {
  unwrap: () => z.ZodType;
}
function isUnwrappable(object: unknown): object is ZodDummy {
  if (!object || typeof object !== 'object') {
    return false;
  }
  return (
    'unwrap' in object &&
    typeof (object as Record<string, unknown>).unwrap === 'function' &&
    !(object instanceof z.ZodArray)
  );
}

/** 遍历 Zod schema 并为用 sensitive schema 标记注册的字段标记提示。 */
export function mapSensitivePaths(
  schema: z.ZodType,
  path: string,
  hints: ConfigUiHints,
): ConfigUiHints {
  let next = { ...hints };
  let currentSchema = schema;
  let isSensitive = sensitive.has(currentSchema as object);

  while (isUnwrappable(currentSchema)) {
    currentSchema = currentSchema.unwrap();
    isSensitive ||= sensitive.has(currentSchema as object);
  }

  if (isSensitive) {
    next[path] = { ...next[path], sensitive: true };
  } else if (isSensitiveConfigPath(path) && !next[path]?.sensitive) {
    getLog().debug(`possibly sensitive key found: (${path})`);
  }

  if (currentSchema instanceof z.ZodObject) {
    const shape = currentSchema.shape;
    for (const key in shape) {
      const nextPath = path ? `${path}.${key}` : key;
      next = mapSensitivePaths(shape[key], nextPath, next);
    }
    const catchallSchema = currentSchema['_def'].catchall as z.ZodType | undefined;
    if (catchallSchema && !(catchallSchema instanceof z.ZodNever)) {
      const nextPath = path ? `${path}.*` : '*';
      next = mapSensitivePaths(catchallSchema, nextPath, next);
    }
  } else if (currentSchema instanceof z.ZodArray) {
    const nextPath = path ? `${path}[]` : '[]';
    next = mapSensitivePaths(currentSchema.element as z.ZodType, nextPath, next);
  } else if (currentSchema instanceof z.ZodRecord) {
    const nextPath = path ? `${path}.*` : '*';
    next = mapSensitivePaths(currentSchema['_def'].valueType as z.ZodType, nextPath, next);
  } else if (
    currentSchema instanceof z.ZodUnion ||
    currentSchema instanceof z.ZodDiscriminatedUnion
  ) {
    for (const option of currentSchema.options) {
      next = mapSensitivePaths(option as z.ZodType, path, next);
    }
  } else if (currentSchema instanceof z.ZodIntersection) {
    next = mapSensitivePaths(currentSchema['_def'].left as z.ZodType, path, next);
    next = mapSensitivePaths(currentSchema['_def'].right as z.ZodType, path, next);
  }

  return next;
}

/** @internal */
export const testApi = {
  collectMatchingSchemaPaths,
  mapSensitivePaths,
};
export { testApi as __test__ };
