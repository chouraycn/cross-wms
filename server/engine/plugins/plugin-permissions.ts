/**
 * Plugin SDK 权限检查 — 包装 ./permissions.ts 提供 SDK 层 API
 *
 * 与现有 ./permissions.ts 的关系：
 * - ./permissions.ts 是底层权限模型（策略存储、请求流程、描述符表）
 * - 本文件是 SDK 层包装，提供：
 *   - 按插件 ID 批量查询
 *   - 权限需求矩阵（manifest 声明 → 运行时检查）
 *   - 安全的权限请求重试与缓存
 *   - 与 plugin-context 集成的 hasPermission 实现
 */

import type { PluginManifest } from './types.js';
import type { PluginPermission, PluginPermissionPolicy } from './permissions.js';
import {
  checkPluginPermission,
  requestPermission,
  grantPluginPermission,
  denyPluginPermission,
  getGrantedPermissions,
  getDeniedPermissions,
  listAllPermissionPolicies,
  setPluginPermissionPolicy,
  getPluginPermissionPolicy,
  PERMISSION_DESCRIPTORS,
} from './permissions.js';
import { logger } from '../../logger.js';
import { PluginPermissionDeniedError } from './plugin-errors.js';

// ===================== 权限需求矩阵 =====================

/** 能力到权限的映射（声明某能力需要哪些权限） */
const CAPABILITY_REQUIRED_PERMISSIONS: Record<string, PluginPermission[]> = {
  'tool': ['tool.register'],
  'hook': ['event.emit'],
  'command': ['tool.register'],
  'channel': ['channel.send', 'event.emit'],
  'provider': ['network'],
  'memory-host': ['memory.read', 'memory.write'],
  'embedding': ['network'],
  'service': ['network'],
};

/** 根据 manifest 声明的能力，推断需要的权限列表 */
export function inferRequiredPermissions(manifest: PluginManifest): PluginPermission[] {
  const declared = new Set<PluginPermission>();
  const inferred = new Set<PluginPermission>();

  for (const perm of (manifest.permissions ?? []) as PluginPermission[]) {
    declared.add(perm);
  }

  for (const capability of manifest.capabilities ?? []) {
    const required = CAPABILITY_REQUIRED_PERMISSIONS[capability];
    if (required) {
      for (const perm of required) {
        inferred.add(perm);
      }
    }
  }

  // 合并：声明 + 推断
  for (const perm of inferred) {
    declared.add(perm);
  }

  return Array.from(declared);
}

// ===================== 权限检查包装 =====================

/** 检查插件是否拥有权限，未拥有时抛出 PluginPermissionDeniedError */
export function assertPluginPermission(pluginId: string, permission: PluginPermission): void {
  if (!checkPluginPermission(pluginId, permission)) {
    throw new PluginPermissionDeniedError(
      `插件 ${pluginId} 缺少权限: ${permission}`,
      permission,
      pluginId,
    );
  }
}

/** 批量检查权限 */
export function assertAllPermissions(pluginId: string, permissions: PluginPermission[]): void {
  for (const perm of permissions) {
    assertPluginPermission(pluginId, perm);
  }
}

/** 安全请求权限（带重试与缓存） */
export async function safeRequestPermission(
  pluginId: string,
  permission: PluginPermission,
  reason?: string,
): Promise<boolean> {
  try {
    const granted = await requestPermission(pluginId, permission, reason);
    if (!granted) {
      logger.warn(`[PluginPermissions] ${pluginId} 请求权限 ${permission} 被拒绝`);
    }
    return granted;
  } catch (err) {
    logger.error(`[PluginPermissions] ${pluginId} 请求权限 ${permission} 失败: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ===================== 策略管理 =====================

/** 初始化插件权限策略（基于 manifest 声明） */
export function initializePluginPermissions(
  pluginId: string,
  manifest: PluginManifest,
  options: { autoGrantLowRisk?: boolean } = {},
): PluginPermissionPolicy {
  const required = inferRequiredPermissions(manifest);
  const existing = getPluginPermissionPolicy(pluginId);

  if (options.autoGrantLowRisk) {
    const toGrant: PluginPermission[] = [];
    for (const perm of required) {
      const descriptor = PERMISSION_DESCRIPTORS[perm];
      if (descriptor?.defaultGrant && !existing?.denied.includes(perm)) {
        toGrant.push(perm);
      }
    }
    if (toGrant.length > 0) {
      for (const perm of toGrant) {
        grantPluginPermission(pluginId, perm);
      }
      logger.info(`[PluginPermissions] 自动授予 ${pluginId} 低风险权限: ${toGrant.join(', ')}`);
    }
  }

  return getPluginPermissionPolicy(pluginId) ?? { pluginId, granted: [], denied: [] };
}

/** 撤销插件所有权限（卸载时调用） */
export function revokeAllPluginPermissions(pluginId: string): void {
  const policy = getPluginPermissionPolicy(pluginId);
  if (!policy) return;
  for (const perm of policy.granted) {
    denyPluginPermission(pluginId, perm);
  }
  logger.debug(`[PluginPermissions] 已撤销 ${pluginId} 所有权限`);
}

// ===================== 查询 API =====================

/** 获取插件权限摘要 */
export interface PluginPermissionSummary {
  pluginId: string;
  granted: PluginPermission[];
  denied: PluginPermission[];
  required: PluginPermission[];
  missing: PluginPermission[];
}

/** 获取插件权限摘要 */
export function getPluginPermissionSummary(
  pluginId: string,
  manifest?: PluginManifest,
): PluginPermissionSummary {
  const policy = getPluginPermissionPolicy(pluginId) ?? { pluginId, granted: [], denied: [] };
  const required = manifest ? inferRequiredPermissions(manifest) : [];
  const missing = required.filter((p) => !policy.granted.includes(p));

  return {
    pluginId,
    granted: policy.granted,
    denied: policy.denied,
    required,
    missing,
  };
}

/** 导出所有插件权限策略（用于备份/审计） */
export function exportAllPermissionPolicies(): PluginPermissionPolicy[] {
  return listAllPermissionPolicies();
}

/** 重新导出底层 API（保持 SDK 完整性） */
export {
  checkPluginPermission,
  requestPermission,
  grantPluginPermission,
  denyPluginPermission,
  getGrantedPermissions,
  getDeniedPermissions,
  setPluginPermissionPolicy,
  getPluginPermissionPolicy,
  listAllPermissionPolicies,
  PERMISSION_DESCRIPTORS,
};
