// 移植自 openclaw/src/gateway/server-methods/device-management-authz.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type DeviceSessionAuthz = unknown;

export type DeviceManagementAuthz = unknown;

export function resolveDeviceSessionAuthz(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDeviceSessionAuthz");
}

export function resolveDeviceManagementAuthz(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDeviceManagementAuthz");
}

export function deniesCrossDeviceManagement(...args: unknown[]): unknown {
  throw new Error("not implemented: deniesCrossDeviceManagement");
}

export function deniesDeviceTokenRoleManagement(...args: unknown[]): unknown {
  throw new Error("not implemented: deniesDeviceTokenRoleManagement");
}

export function requestsNonOperatorDeviceRole(...args: unknown[]): unknown {
  throw new Error("not implemented: requestsNonOperatorDeviceRole");
}

export function pairedDeviceHasNonOperatorRole(...args: unknown[]): unknown {
  throw new Error("not implemented: pairedDeviceHasNonOperatorRole");
}
