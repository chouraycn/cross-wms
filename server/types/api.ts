/**
 * 统一 API 类型定义
 *
 * 集中导出所有后端 API 相关的类型，便于前后端类型对齐和维护。
 * 类型来源：
 * - db.ts: 数据库行类型
 * - 各 dao 层: 业务实体类型
 * - 各 routes 层: 请求/响应类型
 */

// ============ 通用响应类型 ============

export interface ApiResponse<T = unknown> {
  code?: number;
  data?: T;
  message?: string;
  error?: string;
}

export interface ListResponse<T> {
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ============ WMS 业务类型 ============

import type {
  WarehouseRow,
  InventoryItemRow,
  TransitOrderRow,
  InboundRecordRow,
  OutboundRecordRow,
  TransferOrderRow,
  StatusHistoryRow,
  PartnerRow,
} from '../db.js';

export type Warehouse = WarehouseRow;
export type InventoryItem = InventoryItemRow;
export type TransitOrder = TransitOrderRow;
export type InboundRecord = InboundRecordRow;
export type OutboundRecord = OutboundRecordRow;
export type TransferOrder = TransferOrderRow;
export type StatusHistory = StatusHistoryRow;
export type Partner = PartnerRow;

// 库存变动类型
export type TransactionType = 'inbound' | 'outbound' | 'transfer' | 'adjustment' | 'count';

export interface InventoryTransaction {
  id: string;
  warehouseId: string;
  itemId: string;
  itemName?: string;
  type: TransactionType;
  quantity: number;
  beforeQuantity?: number;
  afterQuantity?: number;
  referenceId?: string;
  referenceType?: string;
  remark?: string;
  operator?: string;
  createdAt: string;
}

// ============ 技能系统类型 ============

import type { UserSkillRow, BuiltinStatusPatchRow } from '../db.js';

export type UserSkill = UserSkillRow;
export type BuiltinStatusPatch = BuiltinStatusPatchRow;

export interface SkillClient {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  path: string;
  trigger?: string;
  detail?: string;
  tags: string[];
  status: string;
  version?: string;
  featured: boolean;
  shortcut?: string;
  source: 'user' | 'builtin' | 'marketplace';
  installedAt: number;
  promptTemplate?: string;
  executionMode?: string;
}

export interface SkillUsageStats {
  skillId: string;
  totalCalls: number;
  successCount: number;
  failCount: number;
  lastUsedAt?: number;
}

export interface SkillConflictCheckResult {
  hasConflict: boolean;
  conflicts: Array<{
    skillId: string;
    skillName: string;
    conflictType: 'trigger' | 'command' | 'tool';
    details: string;
  }>;
}

export interface SkillAuditResult {
  id: string;
  skillId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  findings: Array<{
    type: string;
    severity: string;
    description: string;
    recommendation?: string;
  }>;
  score: number;
  scannedAt: number;
}

// ============ 技能链类型 ============

import type { SkillChainRow, SkillChainExecutionRow } from '../db.js';

export type SkillChain = SkillChainRow;
export type SkillChainExecution = SkillChainExecutionRow;

export interface SkillChainStep {
  id: string;
  skillId: string;
  skillName?: string;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  condition?: string;
  timeout?: number;
  retryCount?: number;
}

export interface SkillChainExecutionRequest {
  chainId: string;
  input?: Record<string, unknown>;
  sessionId?: string;
}

// ============ 任务与项目类型 ============

import type { TaskRow, ProjectRow } from '../db.js';

export type Task = TaskRow;
export type Project = ProjectRow;

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// ============ 模型配置类型 ============

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
  enabled: boolean;
}

export interface ModelHealthCheckResult {
  modelId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  error?: string;
  checkedAt: number;
}

// ============ MCP 类型 ============

export interface McpServer {
  id: string;
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  tools?: Array<{ name: string; description: string }>;
  createdAt: number;
  lastConnectedAt?: number;
}

// ============ Agent 类型 ============

export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt?: string;
  avatar?: string;
  color?: string;
  skills?: string[];
  tools?: string[];
  scenarios?: string[];
  isBuiltin?: boolean;
  enabled: boolean;
  createdAt: number;
}

// ============ 记忆系统类型 ============

export interface MemoryItem {
  id: string;
  type: 'fact' | 'preference' | 'experience' | 'document';
  content: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  importance?: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  accessCount: number;
}

export interface MemorySearchParams {
  query: string;
  limit?: number;
  types?: string[];
  tags?: string[];
}

// ============ 密钥管理类型 ============

export interface SecretItem {
  id: string;
  name: string;
  type: 'api_key' | 'password' | 'token' | 'certificate';
  value?: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

// ============ 目标追踪类型 ============

export interface Goal {
  id: string;
  sessionKey: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'cancelled';
  progress: number;
  milestones?: Array<{
    id: string;
    title: string;
    completed: boolean;
    completedAt?: number;
  }>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ============ Soul 规则类型 ============

export interface SoulRule {
  id: string;
  type: 'system' | 'behavior' | 'personality' | 'custom';
  name: string;
  content: string;
  priority: number;
  enabled: boolean;
  isBuiltin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SoulCurrent {
  activeRules: SoulRule[];
  personalityTraits: string[];
  behaviorPatterns: string[];
}

// ============ 上下文引擎类型 ============

export interface ContextEngineStatus {
  name: string;
  status: 'running' | 'stopped' | 'quarantined';
  memoryUsage?: number;
  documentCount?: number;
  lastSyncAt?: number;
  error?: string;
}

// ============ 图片生成类型 ============

export interface ImageProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface ImageGenerationRequest {
  prompt: string;
  size?: 'square' | 'portrait' | 'landscape';
  provider?: string;
  count?: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  size: string;
  provider: string;
  createdAt: number;
}

// ============ 插件类型 ============

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
  installed: boolean;
  path?: string;
  entry?: string;
  permissions?: string[];
  tools?: Array<{ name: string; description: string }>;
  installedAt?: number;
  updatedAt?: number;
}

// ============ 通道类型 ============

export type ChannelType = 'web' | 'feishu' | 'wecom' | 'dingtalk' | 'email' | 'webhook';
export type ChannelStatus = 'active' | 'inactive' | 'error' | 'connecting';

export interface ChannelAccount {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  config?: Record<string, unknown>;
  webhookUrl?: string;
  lastActiveAt?: number;
  createdAt: number;
}

// ============ Webhook 类型 ============

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: 'POST' | 'PUT';
  events: string[];
  headers?: Record<string, string>;
  secret?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  statusCode?: number;
  errorMessage?: string;
  payload?: unknown;
  response?: string;
  durationMs?: number;
  createdAt: number;
}

// ============ 系统指标类型 ============

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    cores: number;
    loadAverage?: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    heapUsed?: number;
    heapTotal?: number;
  };
  disk?: {
    total: number;
    used: number;
    free: number;
    path: string;
  };
  network?: {
    rx: number;
    tx: number;
  };
  process?: {
    uptime: number;
    pid: number;
    memory: number;
    cpu: number;
  };
}

export interface MetricsQueryParams {
  startTime?: number;
  endTime?: number;
  interval?: '1m' | '5m' | '1h' | '1d';
  metrics?: string[];
}

// ============ 浏览器配置类型 ============

export interface BrowserProfile {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

// ============ 权限类型 ============

export interface SystemPermission {
  id: string;
  name: string;
  status: 'granted' | 'denied' | 'not_determined';
  description?: string;
  lastCheckedAt?: number;
}

// ============ 触发器类型 ============

export type TriggerType = 'cron' | 'event' | 'webhook' | 'keyword';
export type TriggerStatus = 'active' | 'inactive' | 'paused';

export interface Trigger {
  id: string;
  name: string;
  type: TriggerType;
  status: TriggerStatus;
  config: Record<string, unknown>;
  action: {
    type: 'skill' | 'chain' | 'agent';
    targetId: string;
    input?: Record<string, unknown>;
  };
  lastTriggeredAt?: number;
  triggerCount: number;
  createdAt: number;
  updatedAt: number;
}

// ============ 自动化类型 ============

export interface Automation {
  id: string;
  name: string;
  description?: string;
  trigger: Trigger;
  steps: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============ Workflow 类型 ============

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============ 语义匹配类型 ============

export interface MatchingConfig {
  provider: string;
  model?: string;
  dimension: number;
  similarityThreshold: number;
  maxResults: number;
}

export interface MatchResult {
  id: string;
  text: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

// ============ 代码索引类型 ============

export interface CodeIndexStatus {
  status: 'idle' | 'indexing' | 'ready' | 'error';
  totalFiles: number;
  indexedFiles: number;
  progress: number;
  lastIndexedAt?: number;
  error?: string;
}

// ============ LSP 类型 ============

export interface LspServer {
  id: string;
  name: string;
  language: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  status: 'stopped' | 'starting' | 'running' | 'error';
  pid?: number;
  capabilities?: string[];
  error?: string;
  lastStartedAt?: number;
}

// ============ Git 类型 ============

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: Array<{ file: string; status: string }>;
  unstaged: Array<{ file: string; status: string }>;
  untracked: string[];
}

export interface GitCommitOptions {
  message: string;
  files?: string[];
  all?: boolean;
}

// ============ 消息生命周期类型 ============

export interface MessageLifecycleEvent {
  id: string;
  messageId: string;
  sessionId: string;
  event: 'created' | 'updated' | 'delivered' | 'read' | 'deleted' | 'archived';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============ 审计日志类型 ============

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target?: string;
  status: 'success' | 'failed';
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  createdAt: number;
}

// ============ 缓存管理类型 ============

export interface CacheNamespace {
  name: string;
  keyCount: number;
  sizeBytes: number;
  ttl?: number;
  lastAccessedAt?: number;
}

export interface CacheEntry {
  key: string;
  value?: unknown;
  sizeBytes: number;
  ttl?: number;
  createdAt: number;
  expiresAt?: number;
  lastAccessedAt: number;
  accessCount: number;
}

// ============ 性能指标类型 ============

export interface PerformanceMetrics {
  startupTime?: {
    total: number;
    phases: Record<string, number>;
  };
  apiLatency?: {
    p50: number;
    p95: number;
    p99: number;
    endpoints: Record<string, number>;
  };
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

// ============ Wiki 类型 ============

export interface WikiPage {
  id: string;
  title: string;
  content: string;
  path?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WikiSearchResult {
  id: string;
  title: string;
  snippet: string;
  path: string;
  score: number;
}

// ============ SSE 事件类型 ============

export type SSEEventStream =
  | 'lifecycle'
  | 'text'
  | 'thinking'
  | 'tool'
  | 'error'
  | 'approval'
  | 'file'
  | 'status';

export interface AgentEventPayload {
  runId: string;
  seq: number;
  stream: SSEEventStream;
  ts: number;
  data: Record<string, unknown>;
}
