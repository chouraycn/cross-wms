import { logger } from '../../logger.js';

export type PluginLoadState = 'unloaded' | 'loading' | 'loaded' | 'activating' | 'active' | 'deactivating' | 'failed';

export interface PluginLoadRecord {
  pluginId: string;
  state: PluginLoadState;
  loadedAt?: number;
  error?: string;
  dependencies: string[];
  source: 'local' | 'npm' | 'git' | 'zip' | 'bundled';
  version?: string;
}

const loadRecords = new Map<string, PluginLoadRecord>();

export function setPluginLoadState(pluginId: string, state: PluginLoadState, error?: string, version?: string): void {
  const record = loadRecords.get(pluginId) ?? {
    pluginId,
    state: 'unloaded',
    dependencies: [],
    source: 'local',
  };
  record.state = state;
  if (state === 'active') record.loadedAt = Date.now();
  if (error) record.error = error;
  if (version) record.version = version;
  loadRecords.set(pluginId, record);
  logger.debug(`[Plugins:Loader] ${pluginId} -> ${state}${error ? ` (${error})` : ''}`);
}

export function getPluginLoadRecord(pluginId: string): PluginLoadRecord | undefined {
  return loadRecords.get(pluginId);
}

export function listLoadedPluginRecords(): PluginLoadRecord[] {
  return Array.from(loadRecords.values()).filter((r) => r.state === 'active' || r.state === 'loaded');
}

export function listFailedPlugins(): PluginLoadRecord[] {
  return Array.from(loadRecords.values()).filter((r) => r.state === 'failed');
}

export function setPluginDependencies(pluginId: string, dependencies: string[]): void {
  const record = loadRecords.get(pluginId) ?? {
    pluginId,
    state: 'unloaded',
    dependencies: [],
    source: 'local',
  };
  record.dependencies = dependencies;
  loadRecords.set(pluginId, record);
}

export function setPluginSource(pluginId: string, source: PluginLoadRecord['source']): void {
  const record = loadRecords.get(pluginId) ?? {
    pluginId,
    state: 'unloaded',
    dependencies: [],
    source,
  };
  record.source = source;
  loadRecords.set(pluginId, record);
}

export function clearPluginLoadRecord(pluginId: string): void {
  loadRecords.delete(pluginId);
}
