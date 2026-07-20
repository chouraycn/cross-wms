// 移植自 openclaw/src/gateway/server-methods/device-management-authz.ts

export type DeviceSessionAuthz = unknown;

export type DeviceManagementAuthz = unknown;

export function resolveDeviceSessionAuthz(...args: unknown[]): unknown {
  return undefined;
}

export function resolveDeviceManagementAuthz(...args: unknown[]): unknown {
  return undefined;
}

export function deniesCrossDeviceManagement(...args: unknown[]): unknown {
  return undefined;
}

export function deniesDeviceTokenRoleManagement(...args: unknown[]): unknown {
  return undefined;
}

export function requestsNonOperatorDeviceRole(...args: unknown[]): unknown {
  return undefined;
}

export function pairedDeviceHasNonOperatorRole(...args: unknown[]): unknown {
  return undefined;
}
