import { logger } from '../../logger.js';
import type { PluginDefinition, PluginInstance, ToolDefinition, ToolHandler } from './types.js';
import { ToolRegistry } from './tool-registry.js';

type PluginHostOptions = {
  toolRegistry?: ToolRegistry;
  autoActivate?: boolean;
};

export class PluginHost {
  private plugins: Map<string, PluginInstance> = new Map();
  private toolRegistry: ToolRegistry;
  private autoActivate: boolean;

  constructor(options: PluginHostOptions = {}) {
    this.toolRegistry = options.toolRegistry ?? new ToolRegistry();
    this.autoActivate = options.autoActivate ?? true;
  }

  load(definition: PluginDefinition, handlers?: Map<string, ToolHandler>): PluginInstance {
    const { id } = definition;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin already loaded: ${id}`);
    }

    const instance: PluginInstance = {
      definition,
      loadedAt: Date.now(),
      status: this.autoActivate ? 'active' : 'loaded',
      tools: handlers ?? new Map(),
    };

    this.plugins.set(id, instance);
    logger.info(`[PluginHost] Loaded plugin: ${id} v${definition.version}`);

    if (this.autoActivate) {
      this.registerPluginTools(instance);
    }

    return instance;
  }

  unload(pluginId: string): boolean {
    const instance = this.plugins.get(pluginId);
    if (!instance) return false;

    this.unregisterPluginTools(instance);
    this.plugins.delete(pluginId);
    logger.info(`[PluginHost] Unloaded plugin: ${pluginId}`);
    return true;
  }

  activate(pluginId: string): boolean {
    const instance = this.plugins.get(pluginId);
    if (!instance) return false;

    if (instance.status === 'active') return true;

    instance.status = 'active';
    this.registerPluginTools(instance);
    logger.info(`[PluginHost] Activated plugin: ${pluginId}`);
    return true;
  }

  deactivate(pluginId: string): boolean {
    const instance = this.plugins.get(pluginId);
    if (!instance) return false;

    if (instance.status === 'loaded' || instance.status === 'disabled') return true;

    this.unregisterPluginTools(instance);
    instance.status = 'disabled';
    logger.info(`[PluginHost] Deactivated plugin: ${pluginId}`);
    return true;
  }

  private registerPluginTools(instance: PluginInstance): void {
    const tools = instance.definition.tools ?? [];
    for (const toolDef of tools) {
      const handler = instance.tools.get(toolDef.name);
      if (handler) {
        this.toolRegistry.register(toolDef, handler);
      }
    }
  }

  private unregisterPluginTools(instance: PluginInstance): void {
    const tools = instance.definition.tools ?? [];
    for (const toolDef of tools) {
      this.toolRegistry.unregister(toolDef.name);
    }
  }

  get(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  list(): PluginDefinition[] {
    return Array.from(this.plugins.values()).map(p => p.definition);
  }

  listActive(): PluginDefinition[] {
    return Array.from(this.plugins.values())
      .filter(p => p.status === 'active')
      .map(p => p.definition);
  }

  getStatus(pluginId: string): PluginInstance['status'] | null {
    return this.plugins.get(pluginId)?.status ?? null;
  }

  setToolHandler(pluginId: string, toolName: string, handler: ToolHandler): boolean {
    const instance = this.plugins.get(pluginId);
    if (!instance) return false;

    instance.tools.set(toolName, handler);

    if (instance.status === 'active') {
      const toolDef = instance.definition.tools?.find(t => t.name === toolName);
      if (toolDef) {
        this.toolRegistry.register(toolDef, handler);
      }
    }

    return true;
  }

  getPluginTools(pluginId: string): ToolDefinition[] {
    const instance = this.plugins.get(pluginId);
    if (!instance) return [];
    return instance.definition.tools ?? [];
  }

  size(): number {
    return this.plugins.size;
  }

  clear(): void {
    for (const id of this.plugins.keys()) {
      this.unload(id);
    }
    logger.debug('[PluginHost] All plugins cleared');
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }
}

export function createPluginHost(options?: PluginHostOptions): PluginHost {
  return new PluginHost(options);
}
