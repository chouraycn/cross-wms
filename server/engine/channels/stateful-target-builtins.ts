// 移植自 openclaw/src/channels/plugins/stateful-target-builtins.ts

export function isStatefulTargetBuiltinDriverId(..._args: unknown[]): unknown {
  return false;
}

export async function ensureStatefulTargetBuiltinsRegistered(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
