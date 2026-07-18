// 移植自 openclaw/src/channels/message-access/runtime-access-groups.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function allReferencedAccessGroupNames(..._args: unknown[]): unknown {
  throw new Error("not implemented: allReferencedAccessGroupNames");
}

export async function normalizeEffectiveEntries(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: normalizeEffectiveEntries");
}

export async function resolveRuntimeAccessGroupMembershipFacts(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveRuntimeAccessGroupMembershipFacts");
}
