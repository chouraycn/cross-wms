/**
 * Plugin SDK 共享类型 — API/Route 层与 SDK 公共契约
 *
 * 与现有 ./types.ts 的关系：
 * - ./types.ts 描述运行时内部类型（PluginInstance、PluginContext 等）
 * - 本文件描述 SDK 公共层暴露给插件作者与 API 路由的类型契约
 *
 * 通过分层避免循环依赖：本文件仅依赖 ./plugin-errors.ts，不依赖运行时实现。
 */

import type { PluginPermission } from './permissions.js';
import type { PluginCapabilityKind, PluginManifest, PluginSource } from './types.js';
import type { PluginSdkError } from './plugin-errors.js';

// ===================== SDK 公共类型 =====================

/** SDK 注册模式（控制插件在不同阶段如何注册能力） */
export type SdkRegistrationMode =
  | 'full'            // 完整注册（工具+通道+provider）
  | 'discovery'       // 仅发现（CLI metadata + 通道清单）
  | 'cli-metadata'    // 仅 CLI 元数据
  | 'tool-discovery'; // 仅工具发现

/** SDK 插件定义（插件作者通过 definePlugin 提交） */
export interface SdkPluginDefinition {
  /** 唯一标识 */
  id: string;
  /** 显示名 */
  name: string;
  /** 描述 */
  description?: string;
  /** 版本号 */
  version: string;
  /** 作者 */
  author?: string;
  /** 入口注册函数 */
  register?: (api: SdkPluginApi) => void | Promise<void>;
  /** 卸载函数 */
  unregister?: (api: SdkPluginApi) => void | Promise<void>;
  /** 能力声明 */
  capabilities?: PluginCapabilityKind[];
  /** 依赖声明 */
  dependencies?: Array<{ id: string; versionRange: string; optional?: boolean }>;
  /** 权限声明 */
  permissions?: PluginPermission[];
  /** 最小宿主 API 版本 */
  minHostApiVersion?: string;
}

/** SDK 插件 API（注入到 register 函数） */
export interface SdkPluginApi {
  /** 当前插件 ID */
  readonly pluginId: string;
  /** 当前注册模式 */
  readonly registrationMode: SdkRegistrationMode;
  /** 宿主 API 版本 */
  readonly hostApiVersion: string;
  /** 注册工具 */
  registerTool?(tool: SdkToolRegistration): void;
  /** 注册通道 */
  registerChannel?(channel: SdkChannelRegistration): void;
  /** 注册能力提供者 */
  registerCapability?(capability: SdkCapabilityRegistration): void;
  /** 注册命令 */
  registerCommand?(command: SdkCommandRegistration): void;
  /** 访问受限 logger */
  getLogger?(): SdkLogger;
  /** 访问事件总线 */
  getEventBus?(): SdkEventBus;
  /** 读取配置 */
  getConfig?<T = unknown>(key: string): T | undefined;
}

/** 工具注册信息 */
export interface SdkToolRegistration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: (args: unknown, context: SdkToolCallContext) => Promise<unknown>;
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
}

/** 工具调用上下文 */
export interface SdkToolCallContext {
  pluginId: string;
  sessionId?: string;
  abortSignal?: { aborted: boolean };
}

/** 通道注册信息 */
export interface SdkChannelRegistration {
  id: string;
  name: string;
  capabilities?: string[];
  send?: (message: SdkChannelMessage) => Promise<SdkChannelSendResult>;
  receive?: (handler: (message: SdkChannelMessage) => void) => void;
}

/** 通道消息 */
export interface SdkChannelMessage {
  channelId: string;
  from: string;
  to: string;
  text?: string;
  attachments?: Array<{ kind: string; url?: string; data?: string }>;
  threadId?: string;
  timestamp: number;
}

/** 通道发送结果 */
export interface SdkChannelSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** 能力注册信息 */
export interface SdkCapabilityRegistration {
  kind: PluginCapabilityKind;
  provider: unknown;
  metadata?: Record<string, unknown>;
}

/** 命令注册信息 */
export interface SdkCommandRegistration {
  name: string;
  description?: string;
  handler: (args: string[]) => Promise<void>;
}

/** SDK logger */
export interface SdkLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** SDK 事件总线 */
export interface SdkEventBus {
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  off(event: string, handler: (payload: unknown) => void): void;
}

// ===================== API/Route 层类型 =====================

/** 安装请求体 */
export interface PluginInstallRequest {
  /** 来源类型 */
  source: PluginSource;
  /** 来源 URL 或路径（npm 包名 / git URL / 本地路径 / zip 路径） */
  sourceUrl: string;
  /** 是否启用后立即激活 */
  autoEnable?: boolean;
  /** 是否跳过安全扫描（高风险，仅 dev 来源可用） */
  skipSecurityScan?: boolean;
  /** 指定版本（npm/git） */
  version?: string;
}

/** 安装结果 */
export interface PluginInstallResult {
  ok: boolean;
  pluginId?: string;
  manifest?: PluginManifest;
  warnings?: string[];
  error?: string;
  errorStep?: string;
}

/** 启用/禁用请求 */
export interface PluginToggleRequest {
  pluginId: string;
  enabled: boolean;
}

/** 健康状态响应 */
export interface PluginHealthResponse {
  total: number;
  enabled: number;
  healthy: number;
  unhealthy: number;
  errorCount: number;
  plugins: Array<{
    pluginId: string;
    name: string;
    healthy: boolean;
    lastError?: string;
    errorCount: number;
  }>;
}

/** 列表查询参数 */
export interface PluginListQuery {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  capability?: PluginCapabilityKind;
}

/** SDK 错误响应 */
export interface PluginSdkErrorResponse {
  code: string;
  message: string;
  pluginId?: string;
  details?: unknown;
}

/** 将 PluginSdkError 转换为 API 响应 */
export function toSdkErrorResponse(error: PluginSdkError): PluginSdkErrorResponse {
  const response: PluginSdkErrorResponse = {
    code: error.code,
    message: error.message,
  };
  if (error.pluginId !== undefined) {
    response.pluginId = error.pluginId;
  }
  return response;
}

/** 插件市场查询 */
export interface PluginMarketplaceQuery {
  keyword?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

/** 插件市场条目（精简版） */
export interface PluginMarketplaceEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  downloads: number;
  rating: number;
  categories: string[];
  homepage?: string;
  repository?: string;
}
