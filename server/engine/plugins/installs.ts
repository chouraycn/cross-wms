import { logger } from '../../logger.js';

export interface PluginInstallRecord {
  pluginId: string;
  version: string;
  installTime: number;
  source?: string;
  sourceType?: 'zip' | 'git' | 'npm';
  installPath?: string;
}

const installRecords = new Map<string, PluginInstallRecord>();

export function recordPluginInstall(record: PluginInstallRecord): void {
  installRecords.set(record.pluginId, record);
  logger.info(`[Plugins:Installs] Recorded install: ${record.pluginId}@${record.version}`);
}

export function getInstalledPlugins(): PluginInstallRecord[] {
  return Array.from(installRecords.values());
}

export function getInstallRecord(pluginId: string): PluginInstallRecord | undefined {
  return installRecords.get(pluginId);
}

export function removePluginInstallRecord(pluginId: string): void {
  installRecords.delete(pluginId);
  logger.info(`[Plugins:Installs] Removed install record: ${pluginId}`);
}

export function hasInstallRecord(pluginId: string): boolean {
  return installRecords.has(pluginId);
}