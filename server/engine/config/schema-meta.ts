/**
 * Schema 元数据 — 帮助文本、提示信息、标签分类
 *
 * 参考 openclaw/src/config/schema.help.ts、schema.hints.ts、schema.tags.ts，
 * 为 cross-wms 配置字段提供用户友好的描述、占位符提示和分类标签。
 */

/** 配置标签词汇表 — 用于字段过滤和分组 */
export const CONFIG_TAGS = [
  'security',
  'auth',
  'network',
  'access',
  'privacy',
  'observability',
  'performance',
  'reliability',
  'storage',
  'models',
  'media',
  'automation',
  'channels',
  'tools',
  'advanced',
] as const;

export type ConfigTag = (typeof CONFIG_TAGS)[number];

/** 标签优先级（数值越小优先级越高） */
const TAG_PRIORITY: Record<ConfigTag, number> = {
  security: 0,
  auth: 1,
  access: 2,
  network: 3,
  privacy: 4,
  observability: 5,
  reliability: 6,
  performance: 7,
  storage: 8,
  models: 9,
  media: 10,
  automation: 11,
  channels: 12,
  tools: 13,
  advanced: 14,
};

/** 路径前缀到标签的映射规则 */
const PREFIX_RULES: Array<{ prefix: string; tags: ConfigTag[] }> = [
  { prefix: 'gateway.auth', tags: ['security', 'auth', 'access'] },
  { prefix: 'gateway.', tags: ['network'] },
  { prefix: 'models.', tags: ['models'] },
  { prefix: 'logging.', tags: ['observability'] },
  { prefix: 'plugins.', tags: ['tools'] },
  { prefix: 'agents.', tags: ['automation'] },
  { prefix: 'skills.', tags: ['tools'] },
  { prefix: 'hooks.', tags: ['automation'] },
  { prefix: 'ui.', tags: ['advanced'] },
  { prefix: 'privacy.', tags: ['privacy'] },
  { prefix: 'experimental.', tags: ['advanced'] },
];

/** 关键词到标签的映射规则 */
const KEYWORD_RULES: Array<{ pattern: RegExp; tags: ConfigTag[] }> = [
  { pattern: /(token|password|secret|api[_.-]?key|credential)/i, tags: ['security', 'auth'] },
  { pattern: /(allow|deny|permission|policy|access)/i, tags: ['access'] },
  { pattern: /(timeout|debounce|interval|concurrency|max|limit|cache)/i, tags: ['performance'] },
  { pattern: /(retry|backoff|fallback|health|reload|probe)/i, tags: ['reliability'] },
  { pattern: /(path|dir|file|store|db|session)/i, tags: ['storage'] },
  { pattern: /(telemetry|trace|metrics|logs|diagnostic)/i, tags: ['observability'] },
  { pattern: /(experimental|dangerously|insecure)/i, tags: ['advanced', 'security'] },
  { pattern: /(privacy|redact|sanitize|anonym)/i, tags: ['privacy'] },
];

/**
 * 字段帮助文本
 *
 * 为配置字段路径提供中文描述，用于文档生成和 UI 展示。
 */
export const schemaHelp: Record<string, string> = {
  gateway: 'Gateway 运行时配置，包括端口、绑定地址、认证模式等。',
  'gateway.port': 'Gateway HTTP 服务监听的 TCP 端口。',
  'gateway.host': 'Gateway 绑定的网络地址。使用 127.0.0.1 仅允许本地访问，0.0.0.0 允许所有网络接口。',
  'gateway.baseUrl': 'Gateway 的外部可访问基础 URL，用于生成回调链接。',
  'gateway.auth': 'Gateway 认证策略配置。',
  'gateway.auth.mode': '认证模式：none（无认证）、token（共享令牌）、password（共享密码）、trusted-proxy（可信代理）。',
  'gateway.auth.token': '共享密钥令牌，用于 token 认证模式。',
  'gateway.auth.password': '共享密码，用于 password 认证模式。',
  models: 'AI 模型配置，包括默认模型和各 provider 的连接参数。',
  'models.default': '默认使用的模型 ID（格式：provider/model）。',
  'models.providers': '各 AI provider 的配置映射。',
  plugins: '插件系统配置，包括加载路径和启用列表。',
  'plugins.directories': '插件加载目录列表。',
  'plugins.enabled': '已启用的插件 ID 列表。',
  agents: 'Agent 运行时配置。',
  'agents.defaultTimeoutMs': 'Agent 执行的默认超时时间（毫秒）。',
  'agents.maxConcurrent': '最大并发 Agent 数量。',
  logging: '日志输出配置。',
  'logging.level': '日志级别：debug、info、warn、error。',
  'logging.redactSecrets': '是否在日志中脱敏密钥和敏感信息。',
};

/**
 * 字段 UI 提示
 *
 * 为配置字段提供 UI 展示所需的元数据（标题、描述、占位符、控件类型、标签）。
 */
export interface SchemaHint {
  /** 字段标题（简短中文名） */
  title?: string;
  /** 字段描述（详细说明） */
  description?: string;
  /** 输入框占位符文本 */
  placeholder?: string;
  /** UI 控件类型 */
  widget?: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'slider' | 'url' | 'email' | 'list' | 'group';
  /** 分类标签 */
  tags?: ConfigTag[];
}

export type SchemaHints = Record<string, SchemaHint>;

export const schemaHints: SchemaHints = {
  gateway: { title: 'Gateway', description: 'Gateway 运行时配置', widget: 'group', tags: ['network'] },
  'gateway.port': {
    title: '端口',
    description: 'Gateway HTTP 服务监听的 TCP 端口',
    placeholder: '3000',
    widget: 'number',
    tags: ['network', 'performance'],
  },
  'gateway.host': {
    title: '绑定地址',
    description: 'Gateway 绑定的网络地址',
    placeholder: '127.0.0.1',
    widget: 'text',
    tags: ['network', 'access'],
  },
  'gateway.baseUrl': {
    title: '基础 URL',
    description: 'Gateway 的外部可访问基础 URL',
    placeholder: 'http://127.0.0.1:3000',
    widget: 'url',
    tags: ['network'],
  },
  'gateway.auth': { title: '认证', description: 'Gateway 认证策略', widget: 'group', tags: ['security', 'auth'] },
  'gateway.auth.mode': {
    title: '认证模式',
    description: 'none / token / password / trusted-proxy',
    widget: 'select',
    tags: ['security', 'auth', 'access'],
  },
  'gateway.auth.token': {
    title: '认证令牌',
    description: '共享密钥令牌',
    placeholder: '输入安全令牌',
    widget: 'text',
    tags: ['security', 'auth'],
  },
  'gateway.auth.password': {
    title: '认证密码',
    description: '共享密码',
    placeholder: '输入密码',
    widget: 'text',
    tags: ['security', 'auth'],
  },
  models: { title: '模型', description: 'AI 模型配置', widget: 'group', tags: ['models'] },
  'models.default': {
    title: '默认模型',
    description: '默认使用的模型 ID',
    placeholder: 'openai/gpt-4o',
    widget: 'text',
    tags: ['models'],
  },
  'models.providers': { title: 'Provider 配置', description: '各 AI provider 的配置', widget: 'group', tags: ['models'] },
  plugins: { title: '插件', description: '插件系统配置', widget: 'group', tags: ['tools'] },
  'plugins.directories': {
    title: '插件目录',
    description: '插件加载目录列表',
    widget: 'list',
    tags: ['tools', 'storage'],
  },
  'plugins.enabled': {
    title: '已启用插件',
    description: '已启用的插件 ID 列表',
    widget: 'list',
    tags: ['tools'],
  },
  agents: { title: 'Agent', description: 'Agent 运行时配置', widget: 'group', tags: ['automation'] },
  'agents.defaultTimeoutMs': {
    title: '默认超时',
    description: 'Agent 执行的默认超时时间（毫秒）',
    placeholder: '120000',
    widget: 'number',
    tags: ['performance', 'reliability'],
  },
  'agents.maxConcurrent': {
    title: '最大并发',
    description: '最大并发 Agent 数量',
    placeholder: '5',
    widget: 'number',
    tags: ['performance'],
  },
  logging: { title: '日志', description: '日志输出配置', widget: 'group', tags: ['observability'] },
  'logging.level': {
    title: '日志级别',
    description: 'debug / info / warn / error',
    widget: 'select',
    tags: ['observability'],
  },
  'logging.redactSecrets': {
    title: '脱敏密钥',
    description: '是否在日志中脱敏密钥和敏感信息',
    widget: 'switch',
    tags: ['privacy', 'security'],
  },
};

/**
 * Schema 标签工具集
 *
 * 提供标签词汇表、优先级排序和基于路径的标签推导功能。
 */
export const schemaTags = {
  /** 全部可用标签 */
  tags: CONFIG_TAGS,

  /** 标签优先级映射 */
  priority: TAG_PRIORITY,

  /**
   * 根据配置字段路径推导标签
   *
   * 优先使用精确路径匹配的标签，其次按前缀规则和关键词规则推导。
   */
  deriveTags(path: string): ConfigTag[] {
    // 1) 精确匹配 schemaHints 中的标签
    const hintTags = schemaHints[path]?.tags;
    if (hintTags && hintTags.length > 0) {
      return sortTags(hintTags);
    }

    const collected = new Set<ConfigTag>();

    // 2) 前缀规则匹配
    for (const rule of PREFIX_RULES) {
      if (path.toLowerCase().startsWith(rule.prefix.toLowerCase())) {
        for (const tag of rule.tags) {
          collected.add(tag);
        }
      }
    }

    // 3) 关键词规则匹配
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(path)) {
        for (const tag of rule.tags) {
          collected.add(tag);
        }
      }
    }

    return sortTags([...collected]);
  },

  /**
   * 判断给定字符串是否为合法标签
   */
  isKnownTag(tag: string): tag is ConfigTag {
    return (CONFIG_TAGS as readonly string[]).includes(tag);
  },

  /**
   * 将标签列表按优先级排序
   */
  sortTags(tags: ConfigTag[]): ConfigTag[] {
    return sortTags(tags);
  },
} as const;

/** 内部辅助：按优先级排序标签 */
function sortTags(tags: ConfigTag[]): ConfigTag[] {
  return [...tags].sort((a, b) => TAG_PRIORITY[a] - TAG_PRIORITY[b]);
}
