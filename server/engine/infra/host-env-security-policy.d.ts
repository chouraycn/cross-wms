// 移植自 openclaw/src/infra/host-env-security-policy.d.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function loadHostEnvSecurityPolicy(...args: unknown[]): unknown;
export const HOST_ENV_SECURITY_POLICY: unknown;
