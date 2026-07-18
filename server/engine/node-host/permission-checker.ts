import { logger } from '../../logger.js';
import type { Permission, PermissionCheckResult } from './types.js';

type PermissionCheckerOptions = {
  defaultEffect?: 'allow' | 'deny';
  permissions?: Permission[];
};

export class PermissionChecker {
  private permissions: Permission[] = [];
  private defaultEffect: 'allow' | 'deny';

  constructor(options: PermissionCheckerOptions = {}) {
    this.defaultEffect = options.defaultEffect ?? 'deny';
    if (options.permissions) {
      this.addPermissions(options.permissions);
    }
  }

  addPermission(permission: Permission): void {
    this.permissions.push(permission);
    logger.debug(`[PermissionChecker] Added permission: ${permission.effect} ${permission.action} on ${permission.resource}`);
  }

  addPermissions(permissions: Permission[]): void {
    for (const p of permissions) {
      this.addPermission(p);
    }
  }

  removePermission(index: number): boolean {
    if (index < 0 || index >= this.permissions.length) {
      return false;
    }
    this.permissions.splice(index, 1);
    return true;
  }

  clear(): void {
    this.permissions = [];
    logger.debug('[PermissionChecker] All permissions cleared');
  }

  check(action: string, resource: string, context?: Record<string, unknown>): PermissionCheckResult {
    for (let i = this.permissions.length - 1; i >= 0; i--) {
      const perm = this.permissions[i];
      if (this.matches(perm.action, action) && this.matches(perm.resource, resource)) {
        if (perm.conditions && !this.evaluateConditions(perm.conditions, context ?? {})) {
          continue;
        }
        logger.debug(`[PermissionChecker] ${perm.effect}: ${action} on ${resource}`);
        return {
          allowed: perm.effect === 'allow',
          reason: `Matched permission #${i}: ${perm.effect} ${perm.action}:${perm.resource}`,
          matchedPermission: perm,
        };
      }
    }

    logger.debug(`[PermissionChecker] Default ${this.defaultEffect}: ${action} on ${resource}`);
    return {
      allowed: this.defaultEffect === 'allow',
      reason: `Default effect: ${this.defaultEffect}`,
    };
  }

  checkAll(
    requests: Array<{ action: string; resource: string }>,
    context?: Record<string, unknown>,
  ): PermissionCheckResult[] {
    return requests.map(req => this.check(req.action, req.resource, context));
  }

  isAllowed(action: string, resource: string, context?: Record<string, unknown>): boolean {
    return this.check(action, resource, context).allowed;
  }

  allAllowed(
    requests: Array<{ action: string; resource: string }>,
    context?: Record<string, unknown>,
  ): boolean {
    return requests.every(req => this.isAllowed(req.action, req.resource, context));
  }

  anyAllowed(
    requests: Array<{ action: string; resource: string }>,
    context?: Record<string, unknown>,
  ): boolean {
    return requests.some(req => this.isAllowed(req.action, req.resource, context));
  }

  private matches(pattern: string, value: string): boolean {
    if (pattern === '*') {
      return true;
    }
    const starIdx = pattern.indexOf('*');
    if (starIdx === -1) {
      return pattern === value;
    }
    const prefix = pattern.slice(0, starIdx);
    const suffix = pattern.slice(starIdx + 1);
    if (!value.startsWith(prefix)) {
      return false;
    }
    if (suffix && !value.endsWith(suffix)) {
      return false;
    }
    return value.length >= prefix.length + suffix.length;
  }

  private evaluateConditions(
    conditions: Record<string, unknown>,
    context: Record<string, unknown>,
  ): boolean {
    for (const [key, expected] of Object.entries(conditions)) {
      const actual = context[key];
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) {
          return false;
        }
      } else if (typeof expected === 'object' && expected !== null) {
        if (typeof actual !== 'object' || actual === null) {
          return false;
        }
        if (!this.evaluateConditions(expected as Record<string, unknown>, actual as Record<string, unknown>)) {
          return false;
        }
      } else if (actual !== expected) {
        return false;
      }
    }
    return true;
  }

  getPermissions(): Permission[] {
    return [...this.permissions];
  }

  size(): number {
    return this.permissions.length;
  }

  setDefaultEffect(effect: 'allow' | 'deny'): void {
    this.defaultEffect = effect;
  }

  getDefaultEffect(): 'allow' | 'deny' {
    return this.defaultEffect;
  }
}

export function createPermissionChecker(options?: PermissionCheckerOptions): PermissionChecker {
  return new PermissionChecker(options);
}
