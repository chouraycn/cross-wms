import { logger } from '../../logger.js';

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error' | 'updating' | 'loaded';

export interface PluginStatusInfo {
  pluginId: string;
  status: PluginStatus;
  version: string;
  lastError?: string;
  enabledAt?: number;
  disabledAt?: number;
}

const pluginStatusMap = new Map<string, PluginStatusInfo>();

export function setPluginStatus(pluginId: string, status: PluginStatus, info?: Partial<PluginStatusInfo>): void {
  const current = pluginStatusMap.get(pluginId) ?? { pluginId, status: 'installed', version: 'unknown' };
  const updated: PluginStatusInfo = {
    ...current,
    status,
    ...info,
  };
  pluginStatusMap.set(pluginId, updated);
  logger.debug(`[Plugins:Status] ${pluginId} → ${status}`);
}

export function getPluginStatus(pluginId: string): PluginStatusInfo | undefined {
  return pluginStatusMap.get(pluginId);
}

export function getPluginStatuses(): PluginStatusInfo[] {
  return Array.from(pluginStatusMap.values());
}

export function getPluginsByStatus(status: PluginStatus): PluginStatusInfo[] {
  return Array.from(pluginStatusMap.values()).filter(s => s.status === status);
}

export function clearPluginStatus(pluginId: string): void {
  pluginStatusMap.delete(pluginId);
}