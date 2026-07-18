/**
 * MCP 资源管理器
 *
 * 实现 MCP 资源协议，支持静态和动态资源的注册、订阅和访问。
 * 支持资源缓存、批量操作、URI 模式匹配等高级功能。
 */

import { logger } from '../../logger.js';
import type { MCPResource, MCPResourceContents, ResourceSubscriptionConfig } from './types.js';

export type ResourceHandler = (uri: string) => Promise<ResourceContent> | ResourceContent;

export type ResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

export type ResourceInfo = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  type: 'static' | 'dynamic';
  size?: number;
  annotations?: {
    audience?: Array<'user' | 'assistant'>;
    priority?: 'low' | 'normal' | 'high';
  };
};

export type ResourceDefinition = {
  info: ResourceInfo;
  handler: ResourceHandler;
  subscribers: Set<(content: ResourceContent) => void>;
  cache?: {
    content: ResourceContent;
    timestamp: number;
    ttlMs?: number;
  };
  pollTimer?: ReturnType<typeof setInterval>;
};

export class ResourceManager {
  private resources: Map<string, ResourceDefinition> = new Map();
  private globalSubscribers: Set<(uri: string, content: ResourceContent) => void> = new Set();
  private uriPatterns: Map<RegExp, ResourceDefinition> = new Map();
  private defaultCacheTtlMs: number = 60000;

  registerResource(
    uri: string,
    handler: ResourceHandler,
    info?: Partial<ResourceInfo>,
    options?: { cacheTtlMs?: number },
  ): void {
    const resourceInfo: ResourceInfo = {
      uri,
      name: info?.name ?? uri,
      description: info?.description,
      mimeType: info?.mimeType ?? 'text/plain',
      type: info?.type ?? 'static',
      size: info?.size,
      annotations: info?.annotations,
    };

    this.resources.set(uri, {
      info: resourceInfo,
      handler,
      subscribers: new Set(),
      cache: options?.cacheTtlMs ? undefined : undefined,
    });

    if (uri.includes('*') || uri.includes('?')) {
      const pattern = this.uriToRegex(uri);
      this.uriPatterns.set(pattern, this.resources.get(uri)!);
    }

    logger.debug(`[ResourceManager] Registered resource: ${uri} (${resourceInfo.type})`);
  }

  async getResource(uri: string): Promise<ResourceContent> {
    const resource = this.findResource(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    if (resource.cache) {
      const now = Date.now();
      const ttl = resource.cache.ttlMs ?? this.defaultCacheTtlMs;
      if (now - resource.cache.timestamp < ttl) {
        return resource.cache.content;
      }
    }

    try {
      const content = await resource.handler(uri);
      const result: ResourceContent = {
        uri,
        mimeType: content.mimeType ?? resource.info.mimeType,
        text: content.text,
        blob: content.blob,
      };

      if (resource.info.type === 'static' || resource.cache) {
        resource.cache = {
          content: result,
          timestamp: Date.now(),
          ttlMs: resource.cache?.ttlMs,
        };
      }

      return result;
    } catch (err) {
      logger.error(`[ResourceManager] Failed to get resource ${uri}: ${String(err)}`);
      throw err;
    }
  }

  private findResource(uri: string): ResourceDefinition | undefined {
    if (this.resources.has(uri)) {
      return this.resources.get(uri);
    }

    for (const [pattern, resource] of this.uriPatterns) {
      if (pattern.test(uri)) {
        return resource;
      }
    }

    return undefined;
  }

  private uriToRegex(uri: string): RegExp {
    const escaped = uri
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  listResources(): ResourceInfo[] {
    return Array.from(this.resources.values()).map((r) => r.info);
  }

  subscribe(uri: string, callback: (content: ResourceContent) => void): () => void {
    const resource = this.findResource(uri);
    if (!resource) {
      logger.warn(`[ResourceManager] Cannot subscribe to non-existent resource: ${uri}`);
      return () => {};
    }

    resource.subscribers.add(callback);
    logger.debug(`[ResourceManager] Subscribed to resource: ${uri}`);

    return () => {
      resource.subscribers.delete(callback);
      logger.debug(`[ResourceManager] Unsubscribed from resource: ${uri}`);
    };
  }

  unsubscribe(uri: string): void {
    const resource = this.findResource(uri);
    if (!resource) {
      return;
    }

    const count = resource.subscribers.size;
    resource.subscribers.clear();
    logger.debug(`[ResourceManager] Cleared ${count} subscriptions for resource: ${uri}`);
  }

  subscribeGlobal(callback: (uri: string, content: ResourceContent) => void): () => void {
    this.globalSubscribers.add(callback);
    logger.debug('[ResourceManager] Added global subscriber');

    return () => {
      this.globalSubscribers.delete(callback);
      logger.debug('[ResourceManager] Removed global subscriber');
    };
  }

  async notifyUpdate(uri: string): Promise<void> {
    const resource = this.findResource(uri);
    if (!resource) {
      return;
    }

    try {
      if (resource.cache) {
        resource.cache = undefined;
      }

      const content = await this.getResource(uri);

      for (const callback of resource.subscribers) {
        try {
          callback(content);
        } catch (err) {
          logger.error(`[ResourceManager] Subscriber callback error: ${String(err)}`);
        }
      }

      for (const callback of this.globalSubscribers) {
        try {
          callback(uri, content);
        } catch (err) {
          logger.error(`[ResourceManager] Global subscriber callback error: ${String(err)}`);
        }
      }

      logger.debug(`[ResourceManager] Notified update for resource: ${uri}`);
    } catch (err) {
      logger.error(`[ResourceManager] Failed to notify update for ${uri}: ${String(err)}`);
    }
  }

  unregisterResource(uri: string): void {
    const resource = this.resources.get(uri);
    if (!resource) {
      return;
    }

    if (resource.pollTimer) {
      clearInterval(resource.pollTimer);
    }

    resource.subscribers.clear();
    this.resources.delete(uri);

    for (const [pattern, def] of this.uriPatterns) {
      if (def === resource) {
        this.uriPatterns.delete(pattern);
      }
    }

    logger.debug(`[ResourceManager] Unregistered resource: ${uri}`);
  }

  hasResource(uri: string): boolean {
    return this.findResource(uri) !== undefined;
  }

  getResourceInfo(uri: string): ResourceInfo | undefined {
    return this.findResource(uri)?.info;
  }

  getSubscriptionCount(uri: string): number {
    const resource = this.findResource(uri);
    return resource?.subscribers.size ?? 0;
  }

  clear(): void {
    for (const resource of this.resources.values()) {
      if (resource.pollTimer) {
        clearInterval(resource.pollTimer);
      }
      resource.subscribers.clear();
    }
    this.resources.clear();
    this.uriPatterns.clear();
    this.globalSubscribers.clear();
    logger.debug('[ResourceManager] Cleared all resources and subscriptions');
  }

  getResourceCount(): number {
    return this.resources.size;
  }

  getGlobalSubscriberCount(): number {
    return this.globalSubscribers.size;
  }

  async batchGetResources(uris: string[]): Promise<Array<{ uri: string; content?: ResourceContent; error?: string }>> {
    const results: Array<{ uri: string; content?: ResourceContent; error?: string }> = [];

    for (const uri of uris) {
      try {
        const content = await this.getResource(uri);
        results.push({ uri, content });
      } catch (err) {
        results.push({ uri, error: String(err) });
      }
    }

    return results;
  }

  configurePolling(uri: string, config: ResourceSubscriptionConfig): void {
    const resource = this.findResource(uri);
    if (!resource) {
      logger.warn(`[ResourceManager] Cannot configure polling for non-existent resource: ${uri}`);
      return;
    }

    if (resource.pollTimer) {
      clearInterval(resource.pollTimer);
    }

    if (config.mode === 'poll' && config.pollIntervalMs) {
      resource.pollTimer = setInterval(() => {
        void this.notifyUpdate(uri);
      }, config.pollIntervalMs);
      logger.debug(`[ResourceManager] Configured polling for resource: ${uri} (interval: ${config.pollIntervalMs}ms)`);
    }
  }

  invalidateCache(uri: string): void {
    const resource = this.findResource(uri);
    if (resource?.cache) {
      resource.cache = undefined;
      logger.debug(`[ResourceManager] Invalidated cache for resource: ${uri}`);
    }
  }

  invalidateAllCache(): void {
    for (const resource of this.resources.values()) {
      if (resource.cache) {
        resource.cache = undefined;
      }
    }
    logger.debug('[ResourceManager] Invalidated all resource caches');
  }

  setDefaultCacheTtl(ttlMs: number): void {
    this.defaultCacheTtlMs = ttlMs;
    logger.debug(`[ResourceManager] Set default cache TTL: ${ttlMs}ms`);
  }

  toMCPResources(): MCPResource[] {
    return Array.from(this.resources.values()).map((r) => ({
      uri: r.info.uri,
      name: r.info.name,
      description: r.info.description,
      mimeType: r.info.mimeType,
      size: r.info.size,
      annotations: r.info.annotations,
    }));
  }

  toMCPResourceContents(content: ResourceContent): MCPResourceContents {
    return {
      uri: content.uri,
      mimeType: content.mimeType,
      text: content.text,
      blob: content.blob,
    };
  }
}

export const resourceManager = new ResourceManager();

export function registerResource(
  uri: string,
  handler: ResourceHandler,
  info?: Partial<ResourceInfo>,
): void {
  resourceManager.registerResource(uri, handler, info);
}

export async function getResource(uri: string): Promise<ResourceContent> {
  return resourceManager.getResource(uri);
}

export function listResources(): ResourceInfo[] {
  return resourceManager.listResources();
}

export function subscribeResource(
  uri: string,
  callback: (content: ResourceContent) => void,
): () => void {
  return resourceManager.subscribe(uri, callback);
}
