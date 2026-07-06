import type { ToolDefinition } from '../types';

export interface HarnessCapability {
  id: string;
  type: 'tool' | 'memory' | 'channel' | 'provider';
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface RegisteredTool {
  capability: HarnessCapability;
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export class HarnessRegistry {
  private capabilities: Map<string, HarnessCapability> = new Map();
  private tools: Map<string, RegisteredTool> = new Map();
  private memoryBackends: Map<string, HarnessCapability> = new Map();
  private channels: Map<string, HarnessCapability> = new Map();

  registerCapability(cap: HarnessCapability): void {
    this.capabilities.set(cap.id, cap);

    switch (cap.type) {
      case 'tool':
        break;
      case 'memory':
        this.memoryBackends.set(cap.id, cap);
        break;
      case 'channel':
        this.channels.set(cap.id, cap);
        break;
      case 'provider':
        break;
    }
  }

  registerTool(id: string, definition: ToolDefinition, handler: (args: Record<string, unknown>) => Promise<string>): void {
    const cap: HarnessCapability = {
      id,
      type: 'tool',
      name: definition.name,
      description: definition.description || '',
    };
    this.capabilities.set(id, cap);
    this.tools.set(id, { capability: cap, definition, handler });
  }

  getTool(id: string): RegisteredTool | undefined {
    return this.tools.get(id);
  }

  listTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  getCapability(id: string): HarnessCapability | undefined {
    return this.capabilities.get(id);
  }

  listCapabilities(): HarnessCapability[] {
    return Array.from(this.capabilities.values());
  }

  listMemoryBackends(): HarnessCapability[] {
    return Array.from(this.memoryBackends.values());
  }

  listChannels(): HarnessCapability[] {
    return Array.from(this.channels.values());
  }

  unregisterCapability(id: string): void {
    const cap = this.capabilities.get(id);
    if (cap) {
      switch (cap.type) {
        case 'tool':
          this.tools.delete(id);
          break;
        case 'memory':
          this.memoryBackends.delete(id);
          break;
        case 'channel':
          this.channels.delete(id);
          break;
      }
    }
    this.capabilities.delete(id);
  }
}