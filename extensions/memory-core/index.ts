import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'memory-core',
  name: 'Memory Core',
  description: 'Advanced memory management with semantic search and clustering',
  version: '1.0.0',
  kind: 'memory-host',
  sdkVersion: '1.0.0',
  requiresAuth: false,
};

export default class MemoryCoreExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering memory-core extension');

    const config = {
      embeddingDimension: 1536,
      maxEntries: 100000,
      clusteringEnabled: true,
      consolidationInterval: 3600000, // 1 hour
      searchMethods: ['semantic', 'hybrid', 'keyword'],
    };

    context.logger.info('Memory-core extension registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering memory-core extension');
  }
}

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  sessionId?: string;
  method?: 'semantic' | 'hybrid' | 'keyword';
}

export class MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();

  insert(entry: MemoryEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  search(query: string, options: SearchOptions = {}): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    const limit = options.limit ?? 10;

    for (const entry of this.entries.values()) {
      if (options.sessionId && entry.sessionId !== options.sessionId) {
        continue;
      }
      if (entry.content.includes(query)) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  count(): number {
    return this.entries.size;
  }
}