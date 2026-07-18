// 移植自 openclaw/src/channels/plugins/helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveChannelDefaultAccountId(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelDefaultAccountId");
}

export function formatPairingApproveHint(..._args: unknown[]): unknown {
  throw new Error("not implemented: formatPairingApproveHint");
}

export function parseOptionalDelimitedEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: parseOptionalDelimitedEntries");
}

export function buildAccountScopedDmSecurityPolicy(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildAccountScopedDmSecurityPolicy");
}
