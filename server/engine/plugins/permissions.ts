import { logger } from '../../logger.js';

export type PluginPermission =
  | 'network'
  | 'filesystem'
  | 'shell'
  | 'subprocess'
  | 'subagent.spawn'
  | 'tool.register'
  | 'config.write'
  | 'memory.read'
  | 'memory.write'
  | 'channel.send'
  | 'event.emit';

export interface PluginPermissionPolicy {
  pluginId: string;
  granted: PluginPermission[];
  denied: PluginPermission[];
}

const policies = new Map<string, PluginPermissionPolicy>();

export function setPluginPermissionPolicy(policy: PluginPermissionPolicy): void {
  policies.set(policy.pluginId, policy);
  logger.debug(`[Plugins:Permissions] Set policy for ${policy.pluginId}`);
}

export function getPluginPermissionPolicy(pluginId: string): PluginPermissionPolicy | undefined {
  return policies.get(pluginId);
}

export function grantPluginPermission(pluginId: string, permission: PluginPermission): void {
  const policy = policies.get(pluginId) ?? { pluginId, granted: [], denied: [] };
  if (!policy.granted.includes(permission)) policy.granted.push(permission);
  policy.denied = policy.denied.filter((p) => p !== permission);
  policies.set(pluginId, policy);
}

export function denyPluginPermission(pluginId: string, permission: PluginPermission): void {
  const policy = policies.get(pluginId) ?? { pluginId, granted: [], denied: [] };
  if (!policy.denied.includes(permission)) policy.denied.push(permission);
  policy.granted = policy.granted.filter((p) => p !== permission);
  policies.set(pluginId, policy);
}

export function checkPluginPermission(pluginId: string, permission: PluginPermission): boolean {
  const policy = policies.get(pluginId);
  if (!policy) return false;
  if (policy.denied.includes(permission)) return false;
  return policy.granted.includes(permission);
}

export function clearPluginPermissions(pluginId: string): void {
  policies.delete(pluginId);
}
