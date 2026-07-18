// 移植自 openclaw/src/channels/plugins/config-schema.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const AllowFromEntrySchema: unknown = undefined;

export const AllowFromListSchema: unknown = undefined;

export function buildNestedDmConfigSchema(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildNestedDmConfigSchema");
}

export function buildCatchallMultiAccountChannelSchema(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildCatchallMultiAccountChannelSchema");
}

export function buildJsonChannelConfigSchema(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildJsonChannelConfigSchema");
}

export function buildChannelConfigSchema(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildChannelConfigSchema");
}

export function emptyChannelConfigSchema(..._args: unknown[]): unknown {
  throw new Error("not implemented: emptyChannelConfigSchema");
}
