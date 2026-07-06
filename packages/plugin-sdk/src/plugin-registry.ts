import EventEmitter from 'eventemitter3';
import type {
  PluginDefinition,
  PluginApi,
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
  PluginAudioProviderCapability,
  PluginImageGenerationCapability,
  PluginVideoGenerationCapability,
  PluginWebSearchCapability,
  PluginSecurityProviderCapability,
  PluginApiIntegrationCapability,
  PluginRuntimeLifecycleRegistration,
  PluginLifecycleContext,
  PluginConfigSchema,
  PluginLogger,
  PluginRegistryStats,
  PluginContract,
  CompactionProviderRegistration,
  PluginHookType,
  HookHandler,
} from './types';

import { emptyPluginConfigSchema } from './types';

export interface ToolRegistryAdapter {
  registerPluginTool(fullToolName: string, definition: Record<string, unknown>, handler: (args: Record<string, unknown>) => Promise<string>): void;
  unregisterPluginTool(fullToolName: string): void;
}

export interface UnifiedPluginRegistryOptions {
  toolRegistry?: ToolRegistryAdapter;
}

export interface UnifiedPluginRegistryEvents {
  plugin_registered: [pluginId: string];
  plugin_unregistered: [pluginId: string];
  plugin_activated: [pluginId: string];
  plugin_deactivated: [pluginId: string];
  plugin_error: [pluginId: string, error: string];
  capability_registered: [pluginId: string, capability: PluginCapability];
  hook_emitted: [event: string, payload: unknown];
}

export class UnifiedPluginRegistry extends EventEmitter<UnifiedPluginRegistryEvents> {
  private static instance: UnifiedPluginRegistry | null = null;

  private runtimes: Map<string, PluginRuntime> = new Map();

  private capabilityIndex: Map<PluginCapabilityKind, Array<{ pluginId: string; cap: PluginCapability }>> = new Map();

  private hookIndex: Map<string, Array<{ pluginId: string; cap: PluginHookCapability }>> = new Map();

  private toolRegistry?: ToolRegistryAdapter;

  private constructor(options: UnifiedPluginRegistryOptions = {}) {
    super();
    this.toolRegistry = options.toolRegistry;
  }

  static create(options: UnifiedPluginRegistryOptions = {}): UnifiedPluginRegistry {
    return new UnifiedPluginRegistry(options);
  }

  static getInstance(): UnifiedPluginRegistry {
    if (!UnifiedPluginRegistry.instance) {
      UnifiedPluginRegistry.instance = new UnifiedPluginRegistry();
    }
    return UnifiedPluginRegistry.instance;
  }

  static resetInstance(): void {
    UnifiedPluginRegistry.instance = null;
  }

  async registerDefinition(
    definition: PluginDefinition,
    config: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (this.runtimes.has(definition.id)) {
      console.warn(`[UnifiedPluginRegistry] Plugin ${definition.id} already registered, overriding`);
      await this.unregisterDefinition(definition.id);
    }

    const runtime: PluginRuntime = {
      definition,
      capabilities: [],
      status: 'discovered',
      config,
    };

    this.runtimes.set(definition.id, runtime);

    try {
      const api = this.createPluginApi(definition.id, runtime);
      await definition.register(api);
      runtime.status = 'registered';
      this.emit('plugin_registered', definition.id);
      console.info(
        `[UnifiedPluginRegistry] Plugin ${definition.id} registered with ${runtime.capabilities.length} capabilities`,
      );
      return true;
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      this.emit('plugin_error', definition.id, runtime.error);
      console.error(
        `[UnifiedPluginRegistry] Failed to register plugin ${definition.id}:`,
        err,
      );
      return false;
    }
  }

  async unregisterDefinition(pluginId: string): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) return false;

    if (runtime.status === 'activated') {
      await this.deactivate(pluginId);
    }

    for (const cap of runtime.capabilities) {
      this.removeFromCapabilityIndex(pluginId, cap);
    }

    if (runtime.lifecycle?.onCleanup) {
      try {
        await runtime.lifecycle.onCleanup(this.createLifecycleContext(runtime));
      } catch (err) {
        console.error(`[UnifiedPluginRegistry] onCleanup failed for ${pluginId}:`, err);
      }
    }

    this.runtimes.delete(pluginId);
    this.emit('plugin_unregistered', pluginId);
    console.info(`[UnifiedPluginRegistry] Plugin ${pluginId} unregistered`);
    return true;
  }

  has(pluginId: string): boolean {
    return this.runtimes.has(pluginId);
  }

  getRuntime(pluginId: string): PluginRuntime | undefined {
    return this.runtimes.get(pluginId);
  }

  listPluginIds(): string[] {
    return Array.from(this.runtimes.keys());
  }

  async activate(pluginId: string): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) {
      console.warn(`[UnifiedPluginRegistry] Cannot activate unknown plugin: ${pluginId}`);
      return false;
    }

    if (runtime.status === 'activated') {
      console.debug(`[UnifiedPluginRegistry] Plugin ${pluginId} already activated`);
      return true;
    }

    if (runtime.status === 'error') {
      console.warn(`[UnifiedPluginRegistry] Cannot activate plugin in error state: ${pluginId}`);
      return false;
    }

    try {
      if (runtime.lifecycle?.onActivate) {
        await runtime.lifecycle.onActivate(this.createLifecycleContext(runtime));
      }

      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          this.registerToolToToolRegistry(pluginId, cap);
        }
      }

      runtime.status = 'activated';
      runtime.activatedAt = Date.now();
      this.emit('plugin_activated', pluginId);
      console.info(`[UnifiedPluginRegistry] Plugin ${pluginId} activated`);
      return true;
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      this.emit('plugin_error', pluginId, runtime.error);
      console.error(`[UnifiedPluginRegistry] Failed to activate ${pluginId}:`, err);
      return false;
    }
  }

  async deactivate(pluginId: string): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) return false;

    if (runtime.status !== 'activated') {
      console.debug(`[UnifiedPluginRegistry] Plugin ${pluginId} not activated, skip deactivate`);
      return true;
    }

    try {
      if (runtime.lifecycle?.onDeactivate) {
        await runtime.lifecycle.onDeactivate(this.createLifecycleContext(runtime));
      }

      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          const fullToolName = this.getFullToolName(pluginId, cap);
          this.toolRegistry?.unregisterPluginTool(fullToolName);
        }
      }

      runtime.status = 'deactivated';
      this.emit('plugin_deactivated', pluginId);
      console.info(`[UnifiedPluginRegistry] Plugin ${pluginId} deactivated`);
      return true;
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      this.emit('plugin_error', pluginId, runtime.error);
      console.error(`[UnifiedPluginRegistry] Failed to deactivate ${pluginId}:`, err);
      return false;
    }
  }

  async reload(pluginId: string, newDefinition?: PluginDefinition): Promise<boolean> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime) return false;

    const definition = newDefinition ?? runtime.definition;

    if (runtime.lifecycle?.onReload) {
      try {
        await runtime.lifecycle.onReload(this.createLifecycleContext(runtime));
      } catch (err) {
        console.error(`[UnifiedPluginRegistry] onReload failed for ${pluginId}:`, err);
      }
    }

    const wasActivated = runtime.status === 'activated';
    await this.unregisterDefinition(pluginId);
    await this.registerDefinition(definition, runtime.config);

    if (wasActivated) {
      await this.activate(pluginId);
    }

    return true;
  }

  getActiveTools(): Array<PluginToolCapability & { pluginId: string }> {
    const tools: Array<PluginToolCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          tools.push({ ...cap, pluginId });
        }
      }
    }
    return tools;
  }

  async invokeTool(
    pluginId: string,
    toolName: string,
    args: Record<string, unknown>,
    ctx?: { sessionId?: string },
  ): Promise<string> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime || runtime.status !== 'activated') {
      return JSON.stringify({ error: `Plugin not activated: ${pluginId}` });
    }

    const cap = runtime.capabilities.find(
      (c): c is PluginToolCapability => c.kind === 'tool' && c.name === toolName,
    );
    if (!cap) {
      return JSON.stringify({ error: `Tool not found: ${toolName}` });
    }

    try {
      const timeoutMs = cap.timeoutMs ?? 30000;
      const result = await this.callWithTimeout(
        cap.handler(args, { pluginId, sessionId: ctx?.sessionId }),
        timeoutMs,
        toolName,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[UnifiedPluginRegistry] Tool ${toolName} failed:`, err);
      return JSON.stringify({ error: msg });
    }
  }

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

  getEmbeddingProviders(): Array<PluginEmbeddingProviderCapability & { pluginId: string }> {
    const result: Array<PluginEmbeddingProviderCapability & { pluginId: string }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'embedding-provider') {
          result.push({ ...cap, pluginId });
        }
      }
    }
    return result;
  }

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

  getHooks(event: string): Array<PluginHookCapability & { pluginId: string }> {
    const hooks = this.hookIndex.get(event) ?? [];
    return hooks
      .slice()
      .sort((a, b) => (b.cap.priority ?? 0) - (a.cap.priority ?? 0))
      .map((h) => ({ ...h.cap, pluginId: h.pluginId }));
  }

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
        console.error(
          `[UnifiedPluginRegistry] Hook ${event} failed for plugin ${hook.pluginId}:`,
          err,
        );
      }
    }
    this.emit('hook_emitted', event, currentPayload);
    return currentPayload;
  }

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
        'embedding-provider': 0,
        'memory-host': 0,
        channel: 0,
        hook: 0,
        command: 0,
        service: 0,
        'audio-provider': 0,
        'image-generation': 0,
        'video-generation': 0,
        'web-search': 0,
        'security-provider': 0,
        'api-integration': 0,
      },
    };

    for (const runtime of this.runtimes.values()) {
      switch (runtime.status) {
        case 'discovered': stats.discovered++; break;
        case 'registered': stats.registered++; break;
        case 'activated': stats.activated++; break;
        case 'deactivated': stats.deactivated++; break;
        case 'error': stats.error++; break;
      }
      for (const cap of runtime.capabilities) {
        stats.capabilitiesByKind[cap.kind]++;
      }
    }

    return stats;
  }

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

  private createPluginApi(pluginId: string, runtime: PluginRuntime): PluginApi {
    const log: PluginLogger = {
      debug: (msg, ...args) => console.debug(`[plugin:${pluginId}] ${msg}`, ...args),
      info: (msg, ...args) => console.info(`[plugin:${pluginId}] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[plugin:${pluginId}] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[plugin:${pluginId}] ${msg}`, ...args),
    };

    const self = this;

    return {
      pluginId,
      log,

      registerTool(cap: PluginToolCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      unregisterTool(name: string): void {
        const idx = runtime.capabilities.findIndex(
          (c): c is PluginToolCapability => c.kind === 'tool' && c.name === name,
        );
        if (idx >= 0) {
          const cap = runtime.capabilities[idx];
          runtime.capabilities.splice(idx, 1);
          self.removeFromCapabilityIndex(pluginId, cap);
        }
      },

      registerHook(cap: PluginHookCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        let list = self.hookIndex.get(cap.event);
        if (!list) {
          list = [];
          self.hookIndex.set(cap.event, list);
        }
        list.push({ pluginId, cap });
        self.emit('capability_registered', pluginId, cap);
      },

      unregisterHook(hookType: PluginHookType, handler: HookHandler): void {
        const idx = runtime.capabilities.findIndex(
          (c): c is PluginHookCapability => c.kind === 'hook' && c.event === hookType,
        );
        if (idx >= 0) {
          const cap = runtime.capabilities[idx];
          runtime.capabilities.splice(idx, 1);
          self.removeFromCapabilityIndex(pluginId, cap);
        }
      },

      registerContract(contract: PluginContract): void {
      },

      registerProvider(cap: PluginProviderCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerMemoryHost(cap: PluginMemoryHostCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerChannel(cap: PluginChannelCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerCommand(cap: PluginCommandCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerService(cap: PluginServiceCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerEmbeddingProvider(cap: PluginEmbeddingProviderCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerAudioProvider(cap: PluginAudioProviderCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerImageGeneration(cap: PluginImageGenerationCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerVideoGeneration(cap: PluginVideoGenerationCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerWebSearch(cap: PluginWebSearchCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerSecurityProvider(cap: PluginSecurityProviderCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerApiIntegration(cap: PluginApiIntegrationCapability): void {
        runtime.capabilities.push(cap);
        self.addToCapabilityIndex(pluginId, cap);
        self.emit('capability_registered', pluginId, cap);
      },

      registerCompactionProvider(provider: CompactionProviderRegistration): void {
      },

      registerLifecycle(lifecycle: PluginRuntimeLifecycleRegistration): void {
        runtime.lifecycle = lifecycle;
      },

      getConfig(): Record<string, unknown> {
        return runtime.config;
      },

      getConfigSchema(): PluginConfigSchema {
        return runtime.definition.configSchema ?? emptyPluginConfigSchema;
      },
    };
  }

  private addToCapabilityIndex(pluginId: string, cap: PluginCapability): void {
    let list = this.capabilityIndex.get(cap.kind);
    if (!list) {
      list = [];
      this.capabilityIndex.set(cap.kind, list);
    }
    list.push({ pluginId, cap });
  }

  private removeFromCapabilityIndex(pluginId: string, cap: PluginCapability): void {
    const list = this.capabilityIndex.get(cap.kind);
    if (!list) return;
    const idx = list.findIndex((item) => item.pluginId === pluginId && item.cap === cap);
    if (idx >= 0) list.splice(idx, 1);

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

  private createLifecycleContext(runtime: PluginRuntime): PluginLifecycleContext {
    return {
      pluginId: runtime.definition.id,
      config: runtime.config,
    };
  }

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

  private registerToolToToolRegistry(pluginId: string, cap: PluginToolCapability): void {
    if (!this.toolRegistry) return;
    const fullToolName = this.getFullToolName(pluginId, cap);
    const definition = {
      type: 'function',
      function: {
        name: fullToolName,
        description: cap.description,
        parameters: cap.parameters,
      },
    };
    const handler = async (args: Record<string, unknown>): Promise<string> => {
      return this.invokeTool(pluginId, cap.name, args);
    };
    this.toolRegistry.registerPluginTool(fullToolName, definition, handler);
  }

  private getFullToolName(pluginId: string, cap: PluginToolCapability): string {
    return `plugin_${pluginId}_${cap.name}`;
  }

  private parseFullToolName(fullName: string): { pluginId: string; toolShortName: string } | null {
    const match = fullName.match(/^plugin_([a-z0-9-]+)_(.+)$/);
    if (!match) return null;
    return { pluginId: match[1], toolShortName: match[2] };
  }

  getToolsForToolRegistry(): Array<{ fullName: string; definition: Record<string, unknown>; handler: (args: Record<string, unknown>) => Promise<string> }> {
    const tools: Array<{ fullName: string; definition: Record<string, unknown>; handler: (args: Record<string, unknown>) => Promise<string> }> = [];
    for (const [pluginId, runtime] of this.runtimes) {
      if (runtime.status !== 'activated') continue;
      for (const cap of runtime.capabilities) {
        if (cap.kind === 'tool') {
          const fullName = this.getFullToolName(pluginId, cap);
          tools.push({
            fullName,
            definition: {
              type: 'function',
              function: {
                name: fullName,
                description: cap.description,
                parameters: cap.parameters,
              },
            },
            handler: async (args: Record<string, unknown>) => this.invokeTool(pluginId, cap.name, args),
          });
        }
      }
    }
    return tools;
  }
}

export function getUnifiedPluginRegistry(): UnifiedPluginRegistry {
  return UnifiedPluginRegistry.getInstance();
}