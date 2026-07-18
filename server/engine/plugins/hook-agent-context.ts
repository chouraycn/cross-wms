/**
 * * Builds plugin hook agent context snapshots from active session and model state.
 * 移植自 openclaw/src/plugins/hook-agent-context.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveAgentHookChannelId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentHookChannelId");
}

export function buildAgentHookContextChannelFields(...args: unknown[]): unknown {
  throw new Error("not implemented: buildAgentHookContextChannelFields");
}

export function buildAgentHookContextIdentityFields(...args: unknown[]): unknown {
  throw new Error("not implemented: buildAgentHookContextIdentityFields");
}

