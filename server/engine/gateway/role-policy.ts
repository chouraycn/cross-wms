// Gateway 连接角色策略。
// 在 method scope 检查之前将 node-role RPC 与 operator RPC 分离。
// 移植自 openclaw/src/gateway/role-policy.ts。
// 依赖调整：./method-scopes.js（已移植）。
import { isNodeRoleMethod } from "./method-scopes.js";

const GATEWAY_ROLES = ["operator", "node"] as const;

/** 在方法级 operator scope 检查之前使用的 gateway 连接角色。 */
export type GatewayRole = (typeof GATEWAY_ROLES)[number];

/** 将 connect params 中不可信的角色声明解析为封闭角色集合。 */
export function parseGatewayRole(roleRaw: unknown): GatewayRole | null {
  if (roleRaw === "operator" || roleRaw === "node") {
    return roleRaw;
  }
  return null;
}

/** 使用 shared auth 的 operator 可在设备身份建立前连接。 */
export function roleCanSkipDeviceIdentity(role: GatewayRole, sharedAuthOk: boolean): boolean {
  return role === "operator" && sharedAuthOk;
}

/** 使 node 起源的通知远离 operator RPC 表面，反之亦然。 */
export function isRoleAuthorizedForMethod(role: GatewayRole, method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return role === "node";
  }
  return role === "operator";
}
