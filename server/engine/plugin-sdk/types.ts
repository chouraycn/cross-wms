/**
 * Plugin SDK 类型定义 — 暴露给插件作者的运行时类型契约
 *
 * 与 server/engine/plugins/types.ts 的关系：
 * - plugins/types.ts 是宿主内部类型（包含 manifest、registry、marketplace 等所有内部细节）
 * - plugin-sdk/types.ts 是子集，仅暴露插件作者需要用到的 API 类型
 *
 * 参考 openclaw/src/plugin-sdk/index.ts 的边界控制：
 * - 不暴露内部模块（registry.ts、marketplace.ts）
 * - 不暴露宿主控制类型（PluginRuntimeRecord、HealthSnapshot 等）
 */

import type {
  PluginCapabilityKind,
  PluginConfigSchema,
  PluginContext,
  PluginLogger,
} from '../plugins/types.js';
import type { PluginPermission } from '../plugins/permissions.js';

export type {
  PluginCapabilityKind,
  PluginSource,
  PluginVersionRange,
  PluginDependency,
  PluginManifest,
  PluginToolDefinition,
  PluginTrigger,
  PluginConfigSchema,
  PluginConfigProperty,
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginFetch,
  PluginFetchInit,
  PluginFetchResponse,
  PluginEventBus,
  PluginConfigAccessor,
  PluginLifecycle,
  PluginEvent,
} from '../plugins/types.js';

export type {
  PluginPermission,
  PluginPermissionGroup,
  PermissionRequest,
  PermissionRequestState,
  PluginPermissionDescriptor,
  PermissionResolver,
} from '../plugins/permissions.js';

/** 插件定义（由 definePlugin 返回） */
export interface PluginDefinition {
  /** 唯一 ID（小写字母、数字、下划线、连字符） */
  id: string;
  /** 显示名 */
  name: string;
  /** 描述 */
  description?: string;
  /** 版本号 */
  version?: string;
  /** 注册模式：full=完整注册 / lazy=按需注册 */
  registrationMode?: 'full' | 'lazy';
  /** 配置 schema */
  configSchema?: import('../plugins/types.js').PluginConfigSchema;
  /** 能力声明 */
  capabilities?: import('../plugins/types.js').PluginCapabilityKind[];
  /** 安装钩子 */
  setup?: (context: PluginContext) => Promise<void> | void;
  /** 注册回调 */
  register: (api: PluginSdkApi) => void | Promise<void>;
}

/**
 * SDK 侧 PluginApi — 暴露给 register(api) 的接口
 *
 * 与 plugins/api.ts 的 PluginApi 类似，但去掉了 manifest / getConfig 等内部字段，
 * 只保留插件作者需要的方法。
 */
export interface PluginSdkApi {
  /** 注册工具 */
  registerTool(tool: PluginSdkToolRegistration): void;
  /** 注册 hook */
  registerHook(
    hookName: string,
    handler: (payload: unknown) => unknown,
    options?: { priority?: number; metadata?: Record<string, unknown> },
  ): string;
  /** 注销 hook */
  unregisterHook(hookId: string): boolean;
  /** 读取配置 */
  getConfig<T = unknown>(key: string): T | undefined;
  /** 读取全部配置 */
  getAllConfig(): Record<string, unknown>;
  /** 请求权限 */
  requestPermission(permission: PluginPermission, reason?: string): Promise<boolean>;
  /** 检查权限 */
  hasPermission(permission: PluginPermission): boolean;
  /** 触发事件 */
  emit(event: string, payload?: unknown): void;
  /** 订阅事件 */
  on(event: string, handler: (payload: unknown) => void): () => void;
  /** 受限 logger（绑定到当前插件） */
  logger: PluginLogger;
}

/** SDK 侧工具注册 */
export interface PluginSdkToolRegistration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  riskLevel?: 'auto' | 'confirm' | 'high-risk';
  handler: (args: unknown) => Promise<unknown> | unknown;
}

/** 装饰器元数据（由 @plugin / @hook 等装饰器写入） */
export interface PluginDecoratorMetadata {
  kind: 'plugin' | 'hook' | 'command' | 'tool';
  name?: string;
  description?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/** 命令定义 */
export interface PluginCommandDefinition {
  /** 命令名（不含前缀） */
  name: string;
  /** 命令描述 */
  description: string;
  /** 命令处理器 */
  handler: (args: string[], context: PluginContext) => Promise<unknown> | unknown;
  /** 是否需要权限 */
  requirePermission?: PluginPermission;
}

/** 校验错误 */
export interface SdkValidationError {
  field: string;
  message: string;
}

/** 校验结果 */
export interface SdkValidationResult {
  valid: boolean;
  errors: SdkValidationError[];
}

// ===================== 运行时类型（供 UnifiedPluginRegistry 使用） =====================

/** 注册模式：full=完整注册 / lazy=按需注册 */
export type RegistrationMode = 'full' | 'lazy';

/** 空配置 schema（默认占位） */
export const emptyPluginConfigSchema: PluginConfigSchema = {
  type: 'object',
  properties: {},
};

/** 插件运行时状态 */
export type PluginRuntimeStatus =
  | 'discovered'
  | 'registered'
  | 'activated'
  | 'deactivated'
  | 'error'
  | 'unloaded';

/** 工具能力 */
export interface PluginToolCapability {
  kind: 'tool';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  handler: (
    args: Record<string, unknown>,
    ctx: { pluginId: string; sessionId?: string },
  ) => Promise<unknown> | unknown;
  timeoutMs?: number;
}

/** Provider 能力 */
export interface PluginProviderCapability {
  kind: 'provider';
  name: string;
  description?: string;
}

/** Embedding Provider 能力 */
export interface PluginEmbeddingProviderCapability {
  kind: 'embedding';
  name: string;
  description?: string;
}

/** Memory Host 能力 */
export interface PluginMemoryHostCapability {
  kind: 'memory-host';
  name: string;
  description?: string;
}

/** Channel 能力 */
export interface PluginChannelCapability {
  kind: 'channel';
  name: string;
  description?: string;
}

/** Hook 处理器返回结果 */
export interface PluginHookHandlerResult {
  mutatedPayload?: unknown;
  stopPropagation?: boolean;
}

/** Hook 能力 */
export interface PluginHookCapability {
  kind: 'hook';
  event: string;
  priority?: number;
  handler: (
    payload: unknown,
    ctx: { pluginId: string; sessionId?: string },
  ) => Promise<PluginHookHandlerResult | undefined> | PluginHookHandlerResult | undefined;
}

/** 命令能力 */
export interface PluginCommandCapability {
  kind: 'command';
  name: string;
  description?: string;
}

/** Service 能力 */
export interface PluginServiceCapability {
  kind: 'service';
  name: string;
  description?: string;
}

/** 能力联合类型 */
export type PluginCapability =
  | PluginToolCapability
  | PluginProviderCapability
  | PluginEmbeddingProviderCapability
  | PluginMemoryHostCapability
  | PluginChannelCapability
  | PluginHookCapability
  | PluginCommandCapability
  | PluginServiceCapability;

/** 生命周期上下文 */
export interface PluginLifecycleContext {
  pluginId: string;
  config: Record<string, unknown>;
}

/** 运行时生命周期注册 */
export interface PluginRuntimeLifecycleRegistration {
  onActivate?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  onDeactivate?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  onReload?: (ctx: PluginLifecycleContext) => Promise<void> | void;
  onCleanup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

/** 插件运行时实例 */
export interface PluginRuntime {
  definition: PluginDefinition;
  capabilities: PluginCapability[];
  status: PluginRuntimeStatus;
  config: Record<string, unknown>;
  error?: string;
  lifecycle?: PluginRuntimeLifecycleRegistration;
  activatedAt?: number;
}

/** 宿主侧 PluginApi — 传给 register() 用于收集能力 */
export interface PluginApi {
  pluginId: string;
  log: PluginLogger;
  registerTool(cap: PluginToolCapability): void;
  registerProvider(cap: PluginProviderCapability): void;
  registerEmbeddingProvider(cap: PluginEmbeddingProviderCapability): void;
  registerMemoryHost(cap: PluginMemoryHostCapability): void;
  registerChannel(cap: PluginChannelCapability): void;
  registerHook(cap: PluginHookCapability): void;
  registerCommand(cap: PluginCommandCapability): void;
  registerService(cap: PluginServiceCapability): void;
  registerLifecycle(lifecycle: PluginRuntimeLifecycleRegistration): void;
  getConfig(): Record<string, unknown>;
  getConfigSchema(): PluginConfigSchema;
}

/** 注册中心统计 */
export interface PluginRegistryStats {
  total: number;
  discovered: number;
  registered: number;
  activated: number;
  deactivated: number;
  error: number;
  capabilitiesByKind: Record<PluginCapabilityKind, number>;
}
