import { logger } from "../../../logger.js";
import type { PluginId, PluginPermission } from "./types.js";

const pluginPermissions = new Map<PluginId, Set<string>>();
const grantedPermissions = new Map<PluginId, Set<string>>();

export function registerPluginPermissions(pluginId: PluginId, permissions: PluginPermission[]): void {
  const ids = new Set(permissions.map((p) => p.id));
  pluginPermissions.set(pluginId, ids);
  logger.debug(`[ChannelPlugins:Permissions] Registered ${permissions.length} permissions for ${pluginId}`);
}

export function getPluginPermissions(pluginId: PluginId): PluginPermission[] {
  return Array.from(pluginPermissions.get(pluginId) ?? []).map((id) => ({
    id,
    name: id,
    scope: "read" as const,
  }));
}

export function checkPermissions(pluginId: PluginId, permissionId: string): boolean {
  const granted = grantedPermissions.get(pluginId);
  return granted?.has(permissionId) ?? false;
}

export function hasAllPermissions(pluginId: PluginId, permissionIds: string[]): boolean {
  const granted = grantedPermissions.get(pluginId);
  if (!granted) return false;
  return permissionIds.every((id) => granted.has(id));
}

export function grantPermission(pluginId: PluginId, permissionId: string): void {
  const granted = grantedPermissions.get(pluginId) ?? new Set<string>();
  granted.add(permissionId);
  grantedPermissions.set(pluginId, granted);
  logger.debug(`[ChannelPlugins:Permissions] Granted ${permissionId} to ${pluginId}`);
}

export function grantPermissions(pluginId: PluginId, permissionIds: string[]): void {
  const granted = grantedPermissions.get(pluginId) ?? new Set<string>();
  for (const id of permissionIds) {
    granted.add(id);
  }
  grantedPermissions.set(pluginId, granted);
}

export function revokePermission(pluginId: PluginId, permissionId: string): boolean {
  const granted = grantedPermissions.get(pluginId);
  if (!granted) return false;
  const deleted = granted.delete(permissionId);
  if (deleted) {
    logger.debug(`[ChannelPlugins:Permissions] Revoked ${permissionId} from ${pluginId}`);
  }
  return deleted;
}

export async function requestPermission(pluginId: PluginId, permission: PluginPermission): Promise<boolean> {
  logger.debug(`[ChannelPlugins:Permissions] Requesting ${permission.id} for ${pluginId}`);
  grantPermission(pluginId, permission.id);
  return true;
}

export function clearPluginPermissions(pluginId: PluginId): void {
  grantedPermissions.delete(pluginId);
  logger.debug(`[ChannelPlugins:Permissions] Cleared permissions for ${pluginId}`);
}

export function clearAllPermissions(): void {
  grantedPermissions.clear();
  logger.debug(`[ChannelPlugins:Permissions] All permissions cleared`);
}

export function getGrantedPermissions(pluginId: PluginId): string[] {
  return Array.from(grantedPermissions.get(pluginId) ?? []);
}

export function hasAnyPermission(pluginId: PluginId): boolean {
  return (grantedPermissions.get(pluginId)?.size ?? 0) > 0;
}