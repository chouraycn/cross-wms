import { logger } from '../../logger.js';
import type { ToolDefinition, ToolHandler } from './types.js';

type RegistryEntry = {
  definition: ToolDefinition;
  handler: ToolHandler;
  registeredAt: number;
  category: string;
};

export class ToolRegistry {
  private tools: Map<string, RegistryEntry> = new Map();

  register(definition: ToolDefinition, handler: ToolHandler): boolean {
    const { name } = definition;

    if (this.tools.has(name)) {
      logger.warn(`[ToolRegistry] Tool already registered: ${name}`);
      return false;
    }

    this.tools.set(name, {
      definition,
      handler,
      registeredAt: Date.now(),
      category: definition.category ?? 'general',
    });

    logger.debug(`[ToolRegistry] Registered tool: ${name}`);
    return true;
  }

  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      logger.debug(`[ToolRegistry] Unregistered tool: ${name}`);
    }
    return existed;
  }

  get(name: string): RegistryEntry | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(entry => entry.definition);
  }

  listByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(entry => entry.category === category)
      .map(entry => entry.definition);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const entry of this.tools.values()) {
      categories.add(entry.category);
    }
    return Array.from(categories).sort();
  }

  search(query: string): ToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values())
      .filter(entry => {
        const def = entry.definition;
        return (
          def.name.toLowerCase().includes(lowerQuery) ||
          def.description.toLowerCase().includes(lowerQuery)
        );
      })
      .map(entry => entry.definition);
  }

  size(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
    logger.debug('[ToolRegistry] All tools cleared');
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const toolRegistry = new ToolRegistry();

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
