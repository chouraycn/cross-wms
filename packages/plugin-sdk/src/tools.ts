import EventEmitter from 'eventemitter3';
import type { ToolDefinition, ToolHandler, ToolContext } from './types';

export interface ToolRegistryEvents {
  tool_registered: [tool: ToolDefinition];
  tool_unregistered: [toolName: string];
  tool_called: [toolName: string, params: Record<string, unknown>, context: ToolContext];
  tool_error: [toolName: string, error: Error];
}

export class ToolRegistry extends EventEmitter<ToolRegistryEvents> {
  private tools: Map<string, ToolDefinition> = new Map();
  private toolOwners: Map<string, string> = new Map();

  registerTool(definition: ToolDefinition, pluginId: string = 'system'): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool ${definition.name} already registered`);
    }
    this.tools.set(definition.name, definition);
    this.toolOwners.set(definition.name, pluginId);
    this.emit('tool_registered', definition);
  }

  unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    this.toolOwners.delete(name);
    if (existed) {
      this.emit('tool_unregistered', name);
    }
    return existed;
  }

  unregisterPluginTools(pluginId: string): number {
    let count = 0;
    for (const [toolName, owner] of this.toolOwners.entries()) {
      if (owner === pluginId) {
        this.tools.delete(toolName);
        this.toolOwners.delete(toolName);
        count++;
      }
    }
    return count;
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listToolsByPlugin(pluginId: string): ToolDefinition[] {
    const names = Array.from(this.toolOwners.entries())
      .filter(([, owner]) => owner === pluginId)
      .map(([name]) => name);
    return names.map((n) => this.tools.get(n)!).filter(Boolean);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getToolOwner(toolName: string): string | undefined {
    return this.toolOwners.get(toolName);
  }

  async callTool(
    name: string,
    params: Record<string, unknown>,
    context: Omit<ToolContext, 'pluginId'>,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    const pluginId = this.toolOwners.get(name) || 'unknown';
    const fullContext: ToolContext = { ...context, pluginId };

    this.emit('tool_called', name, params, fullContext);

    try {
      const result = await tool.handler(params, fullContext);
      return result;
    } catch (error) {
      this.emit('tool_error', name, error as Error);
      throw error;
    }
  }

  getToolDescriptions(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return this.listTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  clear(): void {
    this.tools.clear();
    this.toolOwners.clear();
  }

  size(): number {
    return this.tools.size;
  }
}

export const toolRegistry = new ToolRegistry();

export function defineTool(definition: ToolDefinition): ToolDefinition {
  return definition;
}

export function registerTool(definition: ToolDefinition, pluginId?: string): void {
  toolRegistry.registerTool(definition, pluginId);
}

export function unregisterTool(name: string): boolean {
  return toolRegistry.unregisterTool(name);
}
