// 移植自 openclaw/src/channels/plugins/stateful-target-builtins.ts

export function isStatefulTargetBuiltinDriverId(..._args: any[]): any {
  return false;
}

export async function ensureStatefulTargetBuiltinsRegistered(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
