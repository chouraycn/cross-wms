/**
 * Unified Plugin Registry — 统一插件运行时注册中心
 *
 * 与 server/engine/pluginRegistry.ts（DB-backed 安装管理器）互补：
 *   - DB-backed PluginRegistry：管理 install → enable → disable → uninstall（物理生命周期）
 *   - UnifiedPluginRegistry：管理 discover → register → activate → deactivate → cleanup（逻辑生命周期）
 *
 * 当 DB-backed PluginRegistry.enable() 沙箱执行插件入口后，
 * 通过 UnifiedPluginRegistry.registerDefinition() 注册插件定义，
 * 然后调用 activate() 触发 onActivate 生命周期钩子。
 *
 * 同时作为"能力聚合层"，对外提供：
 *   - getActiveTools() — 所有已激活插件的工具定义（用于 LLM tools 列表）
 *   - getProviders() — 所有已激活插件的 Provider 声明
 *   - getMemoryHosts() — 所有已激活插件的 Memory Host 工厂
 *   - getChannels() — 所有已激活插件的通道声明
 *   - getHooks(event) — 所有已激活插件订阅指定事件的 hook
 *   - getCommands() — 所有已激活插件的斜杠命令
 *   - getServices() — 所有已激活插件的长期服务
 */

import { logger } from '../../logger.js';
import { registerPluginTool, unregisterPluginTool } from '../toolRegistry.js';
import type { ToolDefinition } from '../../aiClient.js';
import {
  emptyPluginConfigSchema,
} from './types.js';
import type {
  PluginDefinition,
  PluginApi,
  PluginSdkApi,
  PluginRuntime,
  PluginRuntimeStatus,
  PluginCapability,
  PluginCapabilityKind,
  PluginToolCapability,
  PluginProviderCapability,
  PluginEmbeddingProviderCapability,
  PluginMemoryHostCapability,
  PluginChannelCapability,
  PluginHookCapability,
  PluginCommandCapability,
  PluginServiceCapability,
  PluginRuntimeLifecycleRegistration,
  PluginLifecycleContext,
  PluginConfigSchema,
  PluginLogger,
  PluginRegistryStats,
} from './types.js';

/**
 * 统一插件运行时注册中心
 *
 * 全局单例，通过 getUnifiedPluginRegistry() 获取。
 */
export class UnifiedPluginRegistry {
  private static instance: UnifiedPluginRegistry | null = null;

  /** 插件运行时实例（pluginId → PluginRuntime） */
  private runtimes: Map<string, PluginRuntime> = new Map();

  /** 能力索引（capabilityKind → 按优先级排序的能力列表） */
  private capabilityIndex: Map<PluginCapabilityKind, Array<{ pluginId: string; cap: PluginCapability }>> = new Map();

  /** hook 事件索引（eventName → hooks 按 priority 降序） */
  private hookIndex: Map<string, Array<{ pluginId: string; cap: PluginHookCapability }>> = new Map();

  private constructor() {}

  /** 获取单例 */
  static getInstance(): UnifiedPluginRegistry {
    if (!UnifiedPluginRegistry.instance) {
      UnifiedPluginRegistry.instance = new UnifiedPluginRegistry();
    }
    return UnifiedPluginRegistry.instance;
  }

  /** 重置单例（仅供测试） */
  static resetInstance(): void {
    UnifiedPluginRegistry.instance = null;
  }

  // ===================== 发现与注册 =====================

  /**
   * 注册插件定义 — 将 PluginDefinition 加入运行时注册中心
   *
   * 这是入口点：插件作者通过 definePluginEntry() 定义插件后，
   * 由加载器调用此方法注册到运行时。
   *
   * @param definition - 插件定义
   * @param config - 插件配置值（来自用户设置）
   * @returns 是否注册成功
   */
  async registerDefinition(
    definition: PluginDefinition,
    config: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (this.runtimes.has(definition.id)) {
      logger.warn(`[UnifiedPluginRegistry] Plugin ${definition.id} already registered, overriding`);
      // 先卸载旧的
      await this.unregisterDefinition(definition.id);
    }

    const runtime: PluginRuntime = {
      definition,
      capabilities: [],
      status: 'discovered',
      config,
    };

    this.runtimes.set(definition.id, runtime);

    // 执行 register() — 调用插件作者的注册函数，通过 PluginApi 收集能力
    try {
      const api = this.createPluginApi(definition.id, runtime);
      await definition.register(api as unknown as PluginSdkApi);
      runtime.status = 'registered';
      logger.info(
        `[UnifiedPluginRegistry] Plugin ${definition.id} registered with ${runtime.capabilities.length} capabilities`,
      );
      return true;
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      logger.error(
        `[UnifiedPluginRegistry] Failed to register plugin ${definition.id}:`,
        err,
      );
      return false;
    }
  }

  /**
   * 注销插件定义 — 从运行时注册中心移除
   */
  async unregisterDefinition(pluginId: string): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) return false;

    // 如果已激活，先停用
    if (runtime.status === 'activated') {
      await this.deactivate(pluginId);
    }

    // 清理能力索引
    for (const cap of runtime.capabilities) {
      this.removeFromCapabilityIndex(pluginId, cap);
    }

    // 调用 onCleanup
    if (runtime.lifecycle?.onCleanup) {
      try {
        await runtime.lifecycle.onCleanup(this.createLifecycleContext(runtime));
      } catch (err) {
        logger.error(`[UnifiedPluginRegistry] onCleanup failed for ${pluginId}:`, err);
      }
    }

    this.runtimes.delete(pluginId);
    logger.info(`[UnifiedPluginRegistry] Plugin ${pluginId} unregistered`);
    return true;
  }

  /** 检查插件是否已注册 */
  has(pluginId: string): boolean {
    return this.runtimes.has(pluginId);
  }

  /** 获取插件运行时 */
  getRuntime(pluginId: string): PluginRuntime | undefined {
    return this.runtimes.get(pluginId);
  }

  /** 列出所有插件 ID */
  listPluginIds(): string[] {
    return Array.from(this.runtimes.keys());
  }

  // ===================== 激活与停用 =====================

  /**
   * 激活插件 — 执行 onActivate 钩子 + 注册工具到 toolRegistry
   */
  async activate(pluginId: string): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) {
      logger.warn(`[UnifiedPluginRegistry] Cannot activate unknown plugin: ${pluginId}`);
      return false;
    }

    if (runtime.status === 'activated') {
      logger.debug(`[UnifiedPluginRegistry] Plugin ${pluginId} already activated`);
      return true;
    }

    if (runtime.status === 'error') {
      logger.warn(`[UnifiedPluginRegistry] Cannot activate plugin in error state: ${pluginId}`);
      return false;
    }

    try {
      // 调用 onActivate 生命周期钩子
      if (runtime.lifecycle?.onActivate) {
        await runtime.lifecycle.onActivate(this.createLifecycleContext(runtime));
      }

      // 注册工具到 toolRegistry（与 DB-backed PluginRegistry 保持兼容）
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          this.registerToolToToolRegistry(pluginId, cap);
        }
      }

      runtime.status = 'activated';
      runtime.activatedAt = Date.now();
      logger.info(`[UnifiedPluginRegistry] Plugin ${pluginId} activated`);
      return true;
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      logger.error(`[UnifiedPluginRegistry] Failed to activate ${pluginId}:`, err);
      return false;
    }
  }

  /**
   * 停用插件 — 调用 onDeactivate + 注销工具
   */
  async deactivate(pluginId: string): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) return false;

    if (runtime.status !== 'activated') {
      logger.debug(`[UnifiedPluginRegistry] Plugin ${pluginId} not activated, skip deactivate`);
      return true;
    }

    try {
      // 调用 onDeactivate 生命周期钩子
      if (runtime.lifecycle?.onDeactivate) {
        await runtime.lifecycle.onDeactivate(this.createLifecycleContext(runtime));
      }

      // 从 toolRegistry 注销工具
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          const fullToolName = this.getFullToolName(pluginId, cap);
          unregisterPluginTool(fullToolName);
        }
      }

      runtime.status = 'deactivated';
      logger.info(`[UnifiedPluginRegistry] Plugin ${pluginId} deactivated`);
      return true;
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      logger.error(`[UnifiedPluginRegistry] Failed to deactivate ${pluginId}:`, err);
      return false;
    }
  }

  /**
   * 重载插件 — 调用 onReload 后重新注册
   */
  async reload(pluginId: string, newDefinition?: PluginDefinition): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) return false;

    const definition = newDefinition ?? runtime.definition;

    if (runtime.lifecycle?.onReload) {
      try {
        await runtime.lifecycle.onReload(this.createLifecycleContext(runtime));
      } catch (err) {
        logger.error(`[UnifiedPluginRegistry] onReload failed for ${pluginId}:`, err);
      }
    }

    // 重新注册
    const wasActivated = runtime.status === 'activated';
    await this.unregisterDefinition(pluginId);
    await this.registerDefinition(definition, runtime.config);

    if (wasActivated) {
      await this.activate(pluginId);
    }

    return true;
  }

  // ===================== 能力查询 =====================

  /**
   * 获取所有已激活插件的工具定义（用于合并到 LLM tools 列表）
   */
  getActiveTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          tools.push({
            type: 'function',
            function: {
              name: this.getFullToolName(pluginId, cap),
              description: cap.description,
              parameters: cap.parameters,
            },
          });
        }
      }
    }
    return tools;
  }

  /**
   * 调用插件工具（含权限校验可选）
   */
  async invokeTool(
    fullToolName: string,
    args: Record<string, unknown>,
    ctx?: { sessionId?: string },
  ): Promise<string> {
    // 解析 pluginId 和 toolName
    const parsed = this.parseFullToolName(fullToolName);
    if (!parsed) {
      return JSON.stringify({ error: `Invalid tool name: ${fullToolName}` });
    }

    const { pluginId, toolShortName } = parsed;
    const runtime = this.runtimes.get(pluginId);
    if (!runtime || runtime.status !== 'activated') {
      return JSON.stringify({ error: `Plugin not activated: ${pluginId}` });
    }

    const cap = runtime.capabilities.find(
      (c): c is PluginToolCapability => c.kind === 'tool' && c.name === toolShortName,
    );
    if (!cap) {
      return JSON.stringify({ error: `Tool not found: ${fullToolName}` });
    }

    try {
      const timeoutMs = cap.timeoutMs ?? 30000;
      const result = await this.callWithTimeout(
        Promise.resolve(cap.handler(args, { pluginId, sessionId: ctx?.sessionId })),
        timeoutMs,
        fullToolName,
      );
      return result as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[UnifiedPluginRegistry] Tool ${fullToolName} failed:`, err);
      return JSON.stringify({ error: msg });
    }
  }

  /**
   * 获取所有已激活插件的 Provider 能力
   */
  getProviders(): Array<PluginProviderCapability & { pluginId: string }> {
    const result: Array<PluginProviderCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'provider') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

  /**
   * 获取所有已激活插件的 Embedding Provider 能力
   */
  getEmbeddingProviders(): Array<PluginEmbeddingProviderCapability & { pluginId: string }> {
    const result: Array<PluginEmbeddingProviderCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'embedding') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

  /**
   * 获取所有已激活插件的 Memory Host 能力
   */
  getMemoryHosts(): Array<PluginMemoryHostCapability & { pluginId: string }> {
    const result: Array<PluginMemoryHostCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'memory-host') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

  /**
   * 获取所有已激活插件的 Channel 能力
   */
  getChannels(): Array<PluginChannelCapability & { pluginId: string }> {
    const result: Array<PluginChannelCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'channel') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

  /**
   * 获取订阅指定事件的所有 hook（按 priority 降序）
   */
  getHooks(event: string): Array<PluginHookCapability & { pluginId: string }> {
    const hooks = this.hookIndex.get(event) ?? [];
    return hooks
      .slice()
      .sort((a, b) => (b.cap.priority ?? 0) - (a.cap.priority ?? 0))
      .map((h) => ({ ...h.cap, pluginId: h.pluginId }));
  }

  /**
   * 触发 hook 事件 — 按 priority 顺序执行所有 handler
   */
  async emitHook(event: string, payload: unknown, ctx?: { sessionId?: string }): Promise<unknown> {
    const hooks = this.getHooks(event);
    let currentPayload = payload;
    for (const hook of hooks) {
      try {
        const result = await hook.handler(currentPayload, {
          pluginId: hook.pluginId,
          sessionId: ctx?.sessionId,
        });
        if (result?.mutatedPayload !== undefined) {
          currentPayload = result.mutatedPayload;
        }
        if (result?.stopPropagation) {
          break;
        }
      } catch (err) {
        logger.error(
          `[UnifiedPluginRegistry] Hook ${event} failed for plugin ${hook.pluginId}:`,
          err,
        );
      }
    }
    return currentPayload;
  }

  /**
   * 获取所有已激活插件的斜杠命令
   */
  getCommands(): Array<PluginCommandCapability & { pluginId: string }> {
    const result: Array<PluginCommandCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'command') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

  /**
   * 获取所有已激活插件的 Service 能力
   */
  getServices(): Array<PluginServiceCapability & { pluginId: string }> {
    const result: Array<PluginServiceCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'service') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

  // ===================== 统计 =====================

  /**
   * 获取注册中心统计
   */
  getStats(): PluginRegistryStats {
    const stats: PluginRegistryStats = {
      total: this.runtimes.size,
      discovered: 0,
      registered: 0,
      activated: 0,
      deactivated: 0,
      error: 0,
      capabilitiesByKind: {
        tool: 0,
        provider: 0,
        'embedding': 0,
        'memory-host': 0,
        channel: 0,
        hook: 0,
        command: 0,
        service: 0,
        search: 0,
        media: 0,
        skill: 0,
      },
    };

    for (const runtime of this.runtimes.values()) {
      stats[runtime.status as Exclude<PluginRuntimeStatus, 'unloaded'>]++;
      for (const cap of runtime.capabilities) {
        stats.capabilitiesByKind[cap.kind]++;
      }
    }

    return stats;
  }

  /**
   * 获取健康状态
   */
  getHealth(): { total: number; activated: number; errors: string[] } {
    const errors: string[] = [];
    let activated = 0;
    for (const [id, runtime] of this.runtimes) {
      if (runtime.status === 'activated') activated++;
      if (runtime.status === 'error' && runtime.error) {
        errors.push(`[${id}] ${runtime.error}`);
      }
    }
    return { total: this.runtimes.size, activated, errors };
  }

  // ===================== 内部实现 =====================

  /**
   * 创建 PluginApi 实例 — 暴露给插件 register() 函数
   */
  private createPluginApi(pluginId: string, runtime: PluginRuntime): PluginApi {
    const log: PluginLogger = {
      debug: (msg, ...args) => logger.debug(`[plugin:${pluginId}] ${msg}`, ...args),
      info: (msg, ...args) => logger.info(`[plugin:${pluginId}] ${msg}`, ...args),
      warn: (msg, ...args) => logger.warn(`[plugin:${pluginId}] ${msg}`, ...args),
      error: (msg, ...args) => logger.error(`[plugin:${pluginId}] ${msg}`, ...args),
    };

    return {
      pluginId,
      log,

      registerTool: (cap: PluginToolCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerProvider: (cap: PluginProviderCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerEmbeddingProvider: (cap: PluginEmbeddingProviderCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerMemoryHost: (cap: PluginMemoryHostCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerChannel: (cap: PluginChannelCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerHook: (cap: PluginHookCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
        let list = this.hookIndex.get(cap.event);
        if (!list) {
          list = [];
          this.hookIndex.set(cap.event, list);
        }
        list.push({ pluginId, cap });
      },

      registerCommand: (cap: PluginCommandCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerService: (cap: PluginServiceCapability): void => {
        runtime.capabilities.push(cap);
        this.addToCapabilityIndex(pluginId, cap);
      },

      registerLifecycle: (lifecycle: PluginRuntimeLifecycleRegistration): void => {
        runtime.lifecycle = lifecycle;
      },

      getConfig: (): Record<string, unknown> => {
        return runtime.config;
      },

      getConfigSchema: (): PluginConfigSchema => {
        return runtime.definition.configSchema ?? emptyPluginConfigSchema;
      },
    };
  }

  /** 添加到能力索引 */
  private addToCapabilityIndex(pluginId: string, cap: PluginCapability): void {
    let list = this.capabilityIndex.get(cap.kind);
    if (!list) {
      list = [];
      this.capabilityIndex.set(cap.kind, list);
    }
    list.push({ pluginId, cap });
  }

  /** 从能力索引移除 */
  private removeFromCapabilityIndex(pluginId: string, cap: PluginCapability): void {
    const list = this.capabilityIndex.get(cap.kind);
    if (!list) return;
    const idx = list.findIndex((item) => item.pluginId === pluginId && item.cap === cap);
    if (idx >= 0) list.splice(idx, 1);

    // hook 额外从事件索引移除
    if (cap.kind === 'hook') {
      const hookList = this.hookIndex.get(cap.event);
      if (hookList) {
        const hidx = hookList.findIndex(
          (item) => item.pluginId === pluginId && item.cap === cap,
        );
        if (hidx >= 0) hookList.splice(hidx, 1);
      }
    }
  }

  /** 注册工具到 toolRegistry（兼容现有 toolRegistry） */
  private registerToolToToolRegistry(pluginId: string, cap: PluginToolCapability): void {
    const fullToolName = this.getFullToolName(pluginId, cap);
    const definition: ToolDefinition = {
      type: 'function',
      function: {
        name: fullToolName,
        description: cap.description,
        parameters: cap.parameters,
      },
    };
    const handler = async (args: Record<string, unknown>): Promise<string> => {
      return this.invokeTool(fullToolName, args);
    };
    registerPluginTool(fullToolName, definition, handler);
  }

  /** 生成完整工具名 */
  private getFullToolName(pluginId: string, cap: PluginToolCapability): string {
    return `plugin_${pluginId}_${cap.name}`;
  }

  /** 解析完整工具名 → { pluginId, toolShortName } */
  private parseFullToolName(fullName: string): { pluginId: string; toolShortName: string } | null {
    const match = fullName.match(/^plugin_([a-z0-9-]+)_(.+)$/);
    if (!match) return null;
    return { pluginId: match[1], toolShortName: match[2] };
  }

  /** 创建生命周期上下文 */
  private createLifecycleContext(runtime: PluginRuntime): PluginLifecycleContext {
    return {
      pluginId: runtime.definition.id,
      config: runtime.config,
    };
  }

  /** 带超时的函数调用 */
  private async callWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    opName: string,
  ): Promise<T> {
    if (timeoutMs <= 0) return promise;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms: ${opName}`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

/**
 * 获取全局统一插件注册中心单例
 */
export function getUnifiedPluginRegistry(): UnifiedPluginRegistry {
  return UnifiedPluginRegistry.getInstance();
}
