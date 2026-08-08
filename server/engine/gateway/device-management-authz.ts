// 移植自 openclaw/src/gateway/server-methods/device-management-authz.ts

export type DeviceSessionAuthz = unknown;

export type DeviceManagementAuthz = unknown;

export function resolveDeviceSessionAuthz(...args: any[]): any {
  return undefined;
}

export function resolveDeviceManagementAuthz(...args: any[]): any {
  return undefined;
}

export function deniesCrossDeviceManagement(...args: any[]): any {
  return undefined;
}

export function deniesDeviceTokenRoleManagement(...args: any[]): any {
  return undefined;
}

export function requestsNonOperatorDeviceRole(...args: any[]): any {
  return undefined;
}

export function pairedDeviceHasNonOperatorRole(...args: any[]): any {
  return undefined;
}
