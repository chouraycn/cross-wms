/**
 * 角色策略 — 参考 OpenClaw gateway/role-policy.ts
 *
 * 在方法作用域检查之前分离节点角色 RPC 和操作员 RPC。
 */

export type GatewayRole = 'operator' | 'node';

export const GATEWAY_ROLES: GatewayRole[] = ['operator', 'node'];

export function parseGatewayRole(roleRaw: unknown): GatewayRole | null {
  if (roleRaw === 'operator' || roleRaw === 'node') {
    return roleRaw;
  }
  return null;
}

export function roleCanSkipDeviceIdentity(role: GatewayRole, sharedAuthOk: boolean): boolean {
  return role === 'operator' && sharedAuthOk;
}

export function isRoleAuthorizedForMethod(role: GatewayRole, method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return role === 'node';
  }
  return role === 'operator';
}

function isNodeRoleMethod(method: string): boolean {
  const nodeMethods = [
    'nodes.invoke',
    'nodes.list',
    'nodes.status',
    'nodes.wake',
    'nodes.pair',
    'nodes.unpair',
  ];
  return nodeMethods.includes(method);
}