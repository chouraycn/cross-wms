/**
 * 权限控制模块
 *
 * 实现基于作用域的访问控制（Scope-Based Access Control），
 * 遵循最小权限原则：仅授予完成任务所需的最小权限。
 *
 * 作用域层级（从宽到窄）：global > agent > channel > plugin > session
 */

import type { SecretAccessAction, SecretPermission, SecretProvider, SecretScope } from './types.js';

/** 作用域优先级（数字越小优先级越高 / 作用域越窄） */
const SCOPE_PRIORITY: Record<SecretScope, number> = {
  session: 0,
  plugin: 1,
  channel: 2,
  agent: 3,
  global: 4,
};

/**
 * 权限检查器 — 维护一组已授权的权限主体
 */
export class PermissionChecker {
  private readonly permissions: SecretPermission[] = [];

  constructor(permissions: SecretPermission[] = []) {
    for (const p of permissions) {
      this.permissions.push({ ...p, actions: [...p.actions] });
    }
  }

  /** 授予权限 */
  grant(permission: SecretPermission): void {
    this.permissions.push({ ...permission, actions: [...permission.actions] });
  }

  /** 撤销权限 */
  revoke(scope: SecretScope, scopeId?: string): void {
    const idx = this.permissions.findIndex(
      p => p.scope === scope && p.scopeId === scopeId,
    );
    if (idx >= 0) this.permissions.splice(idx, 1);
  }

  /**
   * 检查是否拥有指定操作权限
   *
   * @param action - 请求的操作
   * @param scope - 密钥所在作用域
   * @param scopeId - 作用域 ID
   * @param provider - 可选，限制到特定 provider
   */
  check(
    action: SecretAccessAction,
    scope: SecretScope,
    scopeId?: string,
    provider?: string,
  ): boolean {
    for (const perm of this.permissions) {
      if (!this.scopeCovers(perm.scope, perm.scopeId, scope, scopeId)) continue;
      if (!perm.actions.includes(action)) continue;
      if (perm.provider && perm.provider !== provider) continue;
      return true;
    }
    return false;
  }

  /** 当前所有权限快照 */
  list(): SecretPermission[] {
    return this.permissions.map(p => ({ ...p, actions: [...p.actions] }));
  }

  /**
   * 判断 permScope 是否覆盖 requestedScope
   *
   * 宽作用域可覆盖窄作用域（global 覆盖 session），反之不行。
   * 同作用域时 scopeId 必须匹配（或权限方未限定 scopeId）。
   */
  private scopeCovers(
    permScope: SecretScope,
    permScopeId: string | undefined,
    reqScope: SecretScope,
    reqScopeId: string | undefined,
  ): boolean {
    // 权限方作用域必须比请求方更宽或同等
    if (SCOPE_PRIORITY[permScope] < SCOPE_PRIORITY[reqScope]) {
      return false;
    }
    // 同作用域时需匹配 scopeId
    if (permScope === reqScope && permScopeId && reqScopeId) {
      return permScopeId === reqScopeId;
    }
    // 权限方未限定 scopeId → 覆盖该作用域所有条目
    return true;
  }
}

/**
 * 构建最小权限集 — 仅授予指定操作的权限
 */
export function buildLeastPrivilege(
  scope: SecretScope,
  scopeId: string | undefined,
  actions: SecretAccessAction[],
  provider?: SecretProvider,
): SecretPermission[] {
  return [{ scope, scopeId, actions: [...actions], provider }];
}

/**
 * 检查请求的作用域是否被允许的作用域集合覆盖
 *
 * 语义：allowed 表示已授权的最宽作用域集合。
 * - 请求作用域窄于或等于允许作用域（优先级数字更小或相等）→ 允许
 * - 请求作用域宽于允许作用域（优先级数字更大）→ 拒绝
 *
 * 示例：allowed=['global']（优先级4），请求 session（优先级0）→ 允许
 *       allowed=['session']（优先级0），请求 global（优先级4）→ 拒绝
 */
export function isScopeAllowed(
  requested: SecretScope,
  allowed: SecretScope[],
): boolean {
  const allowedPriority = Math.max(...allowed.map(s => SCOPE_PRIORITY[s]));
  return SCOPE_PRIORITY[requested] <= allowedPriority;
}

/** 获取作用域优先级（用于排序/比较） */
export function getScopePriority(scope: SecretScope): number {
  return SCOPE_PRIORITY[scope];
}
