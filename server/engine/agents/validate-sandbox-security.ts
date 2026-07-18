/**
 * 移植自 openclaw/src/agents/sandbox/validate-sandbox-security.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function getBlockedBindReason(..._args: unknown[]): unknown {
  throw new Error("getBlockedBindReason not implemented (openclaw stub)");
}
export function validateBindMounts(..._args: unknown[]): unknown {
  throw new Error("validateBindMounts not implemented (openclaw stub)");
}
export function validateNetworkMode(..._args: unknown[]): unknown {
  throw new Error("validateNetworkMode not implemented (openclaw stub)");
}
export function validateSeccompProfile(..._args: unknown[]): unknown {
  throw new Error("validateSeccompProfile not implemented (openclaw stub)");
}
export function validateApparmorProfile(..._args: unknown[]): unknown {
  throw new Error("validateApparmorProfile not implemented (openclaw stub)");
}
export function validateSandboxSecurity(..._args: unknown[]): unknown {
  throw new Error("validateSandboxSecurity not implemented (openclaw stub)");
}
