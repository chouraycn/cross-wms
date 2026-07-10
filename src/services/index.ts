/**
 * API 服务模块分类索引
 *
 * 按功能模块分类组织所有 API 服务，便于查找和维护。
 * 与后端路由一一对应，确保前后端接口对齐。
 *
 * 注意：各模块 API 函数直接从各自文件导入，
 * 本文件仅提供分类参考和模块元数据。
 */

// ============ 模块分类 ============

export interface ApiModuleInfo {
  key: string;
  label: string;
  route: string;
  description?: string;
  category: ApiCategoryKey;
}

export type ApiCategoryKey =
  | 'core'
  | 'skills'
  | 'agent'
  | 'plugins'
  | 'automation'
  | 'channels'
  | 'system'
  | 'developer';

export const API_CATEGORIES: Record<ApiCategoryKey, { label: string; description: string }> = {
  core: {
    label: '核心业务',
    description: 'WMS 核心业务功能，包括仓库、库存、调拨、出入库、客商等',
  },
  skills: {
    label: '技能系统',
    description: '技能管理、技能链、触发器、语义匹配、提案工作坊',
  },
  agent: {
    label: 'Agent 系统',
    description: 'Agent 身份、记忆、目标追踪、人格规则、上下文引擎',
  },
  plugins: {
    label: '插件与扩展',
    description: '插件管理、MCP 服务器、扩展系统',
  },
  automation: {
    label: '自动化',
    description: '自动化任务、工作流、触发器',
  },
  channels: {
    label: '通道与通知',
    description: '消息通道、Webhook、语音对话',
  },
  system: {
    label: '系统管理',
    description: '模型配置、密钥管理、系统权限、审计日志、系统指标',
  },
  developer: {
    label: '开发工具',
    description: 'Git 管理、LSP 服务器、代码索引、文件管理、浏览器配置',
  },
};

export const API_MODULES: ApiModuleInfo[] = [
  // 核心业务
  { key: 'warehouses', label: '仓库管理', route: '/api/warehouses', category: 'core' },
  { key: 'inventory', label: '库存管理', route: '/api/inventory', category: 'core' },
  { key: 'transit-orders', label: '调拨单', route: '/api/transit-orders', category: 'core' },
  { key: 'inbound-records', label: '入库记录', route: '/api/inbound-records', category: 'core' },
  { key: 'outbound-records', label: '出库记录', route: '/api/outbound-records', category: 'core' },
  { key: 'inbound', label: '入库操作', route: '/api/inbound', category: 'core' },
  { key: 'outbound', label: '出库操作', route: '/api/outbound', category: 'core' },
  { key: 'transfer-orders', label: '调拨操作', route: '/api/transfer-orders', category: 'core' },
  { key: 'inventory-transactions', label: '库存变动', route: '/api/inventory-transactions', category: 'core' },
  { key: 'partners', label: '客商管理', route: '/api/partners', category: 'core' },
  { key: 'sessions', label: '会话管理', route: '/api/sessions', category: 'core' },
  { key: 'folders', label: '文件夹', route: '/api/folders', category: 'core' },

  // 技能系统
  { key: 'skills', label: '技能管理', route: '/api/user-skills', category: 'skills' },
  { key: 'skill-chains', label: '技能链', route: '/api/skill-chains', category: 'skills' },
  { key: 'triggers', label: '触发器', route: '/api/triggers', category: 'skills' },
  { key: 'matching', label: '语义匹配', route: '/api/matching', category: 'skills' },
  { key: 'skill-workshop', label: '技能工作坊', route: '/api/skill-workshop', category: 'skills' },
  { key: 'templates', label: '模板管理', route: '/api/templates', category: 'skills' },

  // Agent 系统
  { key: 'agents', label: 'Agent 身份', route: '/api/agents', category: 'agent' },
  { key: 'memory', label: '记忆系统', route: '/api/memory', category: 'agent' },
  { key: 'goals', label: '目标追踪', route: '/api/goals', category: 'agent' },
  { key: 'soul', label: '人格规则', route: '/api/soul', category: 'agent' },
  { key: 'context-engine', label: '上下文引擎', route: '/api/context-engine', category: 'agent' },

  // 插件与扩展
  { key: 'plugins', label: '插件管理', route: '/api/plugins', category: 'plugins' },
  { key: 'extensions', label: '扩展系统', route: '/api/extensions', category: 'plugins' },
  { key: 'mcp', label: 'MCP 服务器', route: '/api/mcp', category: 'plugins' },

  // 自动化
  { key: 'automation', label: '自动化任务', route: '/api/automation', category: 'automation' },
  { key: 'workflow', label: '工作流', route: '/api/workflow', category: 'automation' },
  { key: 'keyword-trigger', label: '关键词触发', route: '/api/keyword-trigger', category: 'automation' },

  // 通道与通知
  { key: 'channels', label: '通道管理', route: '/api/channels', category: 'channels' },
  { key: 'webhook', label: 'Webhook', route: '/api/webhook', category: 'channels' },
  { key: 'talk', label: '语音对话', route: '/api/talk', category: 'channels' },
  { key: 'message-lifecycle', label: '消息生命周期', route: '/api/message-lifecycle', category: 'channels' },

  // 系统管理
  { key: 'models', label: '模型配置', route: '/api/models', category: 'system' },
  { key: 'secrets', label: '密钥管理', route: '/api/secrets', category: 'system' },
  { key: 'permissions', label: '系统权限', route: '/api/permissions', category: 'system' },
  { key: 'app-settings', label: '应用设置', route: '/api/app-settings', category: 'system' },
  { key: 'audit', label: '审计日志', route: '/api/audit', category: 'system' },
  { key: 'metrics', label: '系统指标', route: '/api/metrics', category: 'system' },
  { key: 'performance', label: '性能指标', route: '/api/performance', category: 'system' },
  { key: 'cache', label: '缓存管理', route: '/api/cache', category: 'system' },

  // 开发工具
  { key: 'git', label: 'Git 管理', route: '/api/git', category: 'developer' },
  { key: 'lsp', label: 'LSP 服务器', route: '/api/lsp', category: 'developer' },
  { key: 'code-index', label: '代码索引', route: '/api/code-index', category: 'developer' },
  { key: 'file', label: '文件管理', route: '/api/file', category: 'developer' },
  { key: 'browser', label: '浏览器管理', route: '/api/browser', category: 'developer' },
  { key: 'browser-profiles', label: '浏览器配置', route: '/api/browser/profiles', category: 'developer' },
  { key: 'pdf', label: 'PDF 处理', route: '/api/pdf', category: 'developer' },
  { key: 'api-templates', label: 'API 模板', route: '/api/api-templates', category: 'developer' },
  { key: 'api-credentials', label: 'API 凭证', route: '/api/api-credentials', category: 'developer' },
  { key: 'api-history', label: 'API 历史', route: '/api/api-history', category: 'developer' },
  { key: 'api-domain-whitelist', label: '域名白名单', route: '/api/api-domain-whitelist', category: 'developer' },
  { key: 'execution-history', label: '执行历史', route: '/api/execution-history', category: 'developer' },
  { key: 'event-ledger', label: '事件账本', route: '/api/event-ledger', category: 'developer' },
];

// ============ 前端 API 服务文件映射 ============

export const API_SERVICE_FILES: Record<string, string> = {
  warehouses: 'api.ts',
  inventory: 'api.ts',
  'transit-orders': 'api.ts',
  'inbound-records': 'api.ts',
  'outbound-records': 'api.ts',
  'inventory-transactions': 'api.ts',
  partners: 'api.ts',
  sessions: 'api.ts',
  'user-skills': 'api.ts',
  'skill-chains': 'chainsApi.ts',
  triggers: 'triggersApi.ts',
  matching: 'matchingApi.ts',
  models: 'modelsApi.ts',
  projects: 'api.ts',
  tasks: 'tasksApi.ts',
  channels: 'channelsApi.ts',
  plugins: 'plugins/api.ts',
  webhook: 'webhook/api.ts',
  audit: 'audit/api.ts',
  metrics: 'metrics/api.ts',
  automation: 'automation/api.ts',
  talk: 'talk/api.ts',
  git: 'gitApi.ts',
  lsp: 'lspApi.ts',
  'code-index': 'codeIndexApi.ts',
  wiki: 'wikiApi.ts',
  'event-ledger': 'eventLedgerApi.ts',
  'execution-history': 'executionHistoryApi.ts',
  'browser-profiles': 'browserProfilesApi.ts',
  cache: 'cacheApi.ts',
  'keyword-trigger': 'keywordTriggerApi.ts',
  templates: 'templatesApi.ts',
  file: 'fileApi.ts',
  'api-templates': 'apiTemplates/api.ts',
  'api-credentials': 'apiCredentials/api.ts',
  'api-history': 'apiHistory/api.ts',
  'api-domain-whitelist': 'apiDomainWhitelist/api.ts',
};

// ============ SSE 端点 ============

export const SSE_ENDPOINTS = {
  chat: '/api/chat',
  'agent-chat': '/api/agent-chat',
  'skill-events': '/api/skill-events',
  'chain-execution-events': '/api/chain-execution-events',
} as const;

export type SseEndpointKey = keyof typeof SSE_ENDPOINTS;

// ============ 工具函数 ============

export function getModuleByRoute(route: string): ApiModuleInfo | undefined {
  return API_MODULES.find(m => route.startsWith(m.route));
}

export function getModulesByCategory(category: ApiCategoryKey): ApiModuleInfo[] {
  return API_MODULES.filter(m => m.category === category);
}
