/**
 * Resolves provider auth tokens from plugin-owned auth configuration.
 * 移植自 openclaw/src/plugins/provider-auth-token.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const ANTHROPIC_SETUP_TOKEN_PREFIX: unknown = undefined;

export function buildTokenProfileId(...args: unknown[]): unknown {
  throw new Error("not implemented: buildTokenProfileId");
}

export function validateAnthropicSetupToken(...args: unknown[]): unknown {
  throw new Error("not implemented: validateAnthropicSetupToken");
}

