/**
 * Search Provider Registry — 搜索 Provider 注册表
 *
 * 管理搜索 Provider 的注册、查找、排序和实例化。
 */

import type {
  SearchProvider,
  SearchProviderId,
  SearchProviderFactory,
  ProviderRegistryEntry,
  SearchProviderConstructorOptions,
} from './types.js';
import { logger } from '../../logger.js';

const registry = new Map<SearchProviderId, ProviderRegistryEntry>();
const instances = new Map<SearchProviderId, SearchProvider>();

export function registerProvider(
  entry: ProviderRegistryEntry,
): void {
  if (registry.has(entry.id)) {
    logger.warn(`Search provider '${entry.id}' already registered, overwriting`);
  }
  registry.set(entry.id, entry);
  logger.debug(`Registered search provider: ${entry.id}`);
}

export function unregisterProvider(id: SearchProviderId): boolean {
  instances.delete(id);
  const existed = registry.delete(id);
  if (existed) {
    logger.debug(`Unregistered search provider: ${id}`);
  }
  return existed;
}

export function hasProvider(id: SearchProviderId): boolean {
  return registry.has(id);
}

export function getProviderEntry(id: SearchProviderId): ProviderRegistryEntry | undefined {
  return registry.get(id);
}

export function getAllProviders(): ProviderRegistryEntry[] {
  return Array.from(registry.values());
}

export function getDomesticProviders(): ProviderRegistryEntry[] {
  return getAllProviders().filter((p) => p.isDomestic);
}

export function getInternationalProviders(): ProviderRegistryEntry[] {
  return getAllProviders().filter((p) => !p.isDomestic);
}

export function getProvidersSortedByPriority(
  domesticFirst: boolean = true,
): ProviderRegistryEntry[] {
  const providers = getAllProviders();
  return providers.sort((a, b) => {
    if (domesticFirst) {
      if (a.isDomestic !== b.isDomestic) {
        return a.isDomestic ? -1 : 1;
      }
    }
    return a.defaultPriority - b.defaultPriority;
  });
}

export function getProviderInstance(
  id: SearchProviderId,
  options?: SearchProviderConstructorOptions,
): SearchProvider | null {
  const entry = registry.get(id);
  if (!entry) {
    logger.warn(`Search provider '${id}' not found in registry`);
    return null;
  }

  if (options) {
    try {
      return entry.factory(options);
    } catch (e) {
      logger.error(`Failed to create search provider '${id}': ${e}`);
      return null;
    }
  }

  if (!instances.has(id)) {
    try {
      instances.set(id, entry.factory());
    } catch (e) {
      logger.error(`Failed to create search provider '${id}': ${e}`);
      return null;
    }
  }

  return instances.get(id) || null;
}

export function clearAllInstances(): void {
  instances.clear();
  logger.debug('Cleared all search provider instances');
}

export function getProviderCount(): number {
  return registry.size;
}

export function resetRegistry(): void {
  registry.clear();
  instances.clear();
  logger.debug('Reset search provider registry');
}
