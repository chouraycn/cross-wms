import EventEmitter from 'eventemitter3';
import type { Permission, SecurityPolicy, SecurityContextConfig } from './types';

/**
 * SecurityContext 事件
 */
export interface SecurityContextEvents {
  permission_checked: [action: string, granted: boolean];
  permission_granted: [action: string];
  permission_revoked: [action: string];
  sandbox_executed: [success: boolean];
}

/**
 * SecurityContext 类
 *
 * 安全上下文管理器，提供权限检查、授予、撤销和沙箱执行功能。
 */
export class SecurityContext extends EventEmitter<SecurityContextEvents> {
  private policy: SecurityPolicy;
  private identity?: SecurityContextConfig['identity'];
  private permissionCache: Map<string, boolean> = new Map();

  constructor(config: SecurityContextConfig) {
    super();
    this.policy = config.policy;
    this.identity = config.identity;
  }

  /**
   * 检查权限
   * @param action 操作名称
   * @param resource 可选资源标识
   * @returns 是否有权限
   */
  checkPermission(action: string, resource?: string): boolean {
    // 检查缓存
    const cacheKey = `${action}:${resource ?? '*'}`;
    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    // 检查限制列表
    if (this.policy.restrictions?.includes(action)) {
      this.emit('permission_checked', action, false);
      this.permissionCache.set(cacheKey, false);
      return false;
    }

    // 查找匹配的权限
    const granted = this.policy.permissions.some((perm) => {
      if (perm.action !== action) {
        return false;
      }

      // 检查资源匹配
      if (resource && perm.resource && perm.resource !== resource) {
        return false;
      }

      // 检查条件（简化版本）
      if (perm.conditions) {
        // 这里可以添加更复杂的条件检查逻辑
        // 例如角色、时间、IP 等
        return this.checkConditions(perm.conditions);
      }

      return true;
    });

    this.emit('permission_checked', action, granted);
    this.permissionCache.set(cacheKey, granted);

    return granted;
  }

  /**
   * 授予权限
   * @param action 操作名称
   * @param resource 可选资源标识
   */
  grantPermission(action: string, resource?: string): void {
    // 检查是否已存在
    const existingIndex = this.policy.permissions.findIndex(
      (p) => p.action === action && (resource ? p.resource === resource : !p.resource),
    );

    if (existingIndex >= 0) {
      return; // 已存在
    }

    // 添加权限
    const permission: Permission = { action };
    if (resource) {
      permission.resource = resource;
    }

    this.policy.permissions.push(permission);

    // 清除缓存
    this.clearCache();

    this.emit('permission_granted', action);
  }

  /**
   * 撤销权限
   * @param action 操作名称
   * @param resource 可选资源标识
   */
  revokePermission(action: string, resource?: string): void {
    const index = this.policy.permissions.findIndex(
      (p) => p.action === action && (resource ? p.resource === resource : !p.resource),
    );

    if (index >= 0) {
      this.policy.permissions.splice(index, 1);

      // 清除缓存
      this.clearCache();

      this.emit('permission_revoked', action);
    }
  }

  /**
   * 在沙箱中执行函数
   * @param fn 要执行的函数
   * @returns 执行结果
   */
  async sandbox<T>(fn: () => Promise<T> | T): Promise<T> {
    // 记录沙箱执行
    try {
      const result = await fn();
      this.emit('sandbox_executed', true);
      return result;
    } catch (error) {
      this.emit('sandbox_executed', false);
      throw error;
    }
  }

  /**
   * 获取当前策略
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  /**
   * 更新策略
   * @param policy 新策略
   */
  setPolicy(policy: SecurityPolicy): void {
    this.policy = policy;
    this.clearCache();
  }

  /**
   * 获取身份信息
   */
  getIdentity(): SecurityContextConfig['identity'] {
    return this.identity ? { ...this.identity } : undefined;
  }

  /**
   * 列出所有权限
   */
  listPermissions(): Permission[] {
    return [...this.policy.permissions];
  }

  /**
   * 检查是否有任何权限
   */
  hasAnyPermission(): boolean {
    return this.policy.permissions.length > 0;
  }

  /**
   * 检查条件（内部方法）
   */
  private checkConditions(conditions: Record<string, unknown>): boolean {
    // 简化版本的条件检查
    // 实际实现中应该支持更复杂的条件逻辑
    if (conditions.role && this.identity?.roles) {
      const requiredRoles = Array.isArray(conditions.role)
        ? conditions.role
        : [conditions.role];
      return requiredRoles.some((r) => this.identity!.roles!.includes(r as string));
    }

    if (conditions.group && this.identity?.groups) {
      const requiredGroups = Array.isArray(conditions.group)
        ? conditions.group
        : [conditions.group];
      return requiredGroups.some((g) => this.identity!.groups!.includes(g as string));
    }

    return true;
  }

  /**
   * 清除权限缓存（内部方法）
   */
  private clearCache(): void {
    this.permissionCache.clear();
  }
}

/**
 * 创建安全上下文的工厂函数
 */
export function createSecurityContext(config: SecurityContextConfig): SecurityContext {
  return new SecurityContext(config);
}