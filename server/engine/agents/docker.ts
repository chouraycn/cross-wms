/**
 * 移植自 openclaw/src/agents/sandbox/docker.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExecDockerRawResult = unknown;
export type ExecDockerOptions = unknown;
export function resolveDockerSpawnInvocation(..._args: unknown[]): unknown {
  throw new Error("resolveDockerSpawnInvocation not implemented (openclaw stub)");
}
export function execDockerRaw(..._args: unknown[]): unknown {
  throw new Error("execDockerRaw not implemented (openclaw stub)");
}
export function resolveDockerEnvPolicyEpoch(..._args: unknown[]): unknown {
  throw new Error("resolveDockerEnvPolicyEpoch not implemented (openclaw stub)");
}
export function execDocker(..._args: unknown[]): unknown {
  throw new Error("execDocker not implemented (openclaw stub)");
}
export function readDockerContainerLabel(..._args: unknown[]): unknown {
  throw new Error("readDockerContainerLabel not implemented (openclaw stub)");
}
export function readDockerContainerEnvVar(..._args: unknown[]): unknown {
  throw new Error("readDockerContainerEnvVar not implemented (openclaw stub)");
}
export function readDockerPort(..._args: unknown[]): unknown {
  throw new Error("readDockerPort not implemented (openclaw stub)");
}
export function isDockerDaemonUnavailable(..._args: unknown[]): unknown {
  throw new Error("isDockerDaemonUnavailable not implemented (openclaw stub)");
}
export function formatDockerDaemonUnavailableError(..._args: unknown[]): unknown {
  throw new Error("formatDockerDaemonUnavailableError not implemented (openclaw stub)");
}
export function ensureDockerImage(..._args: unknown[]): unknown {
  throw new Error("ensureDockerImage not implemented (openclaw stub)");
}
export function dockerContainerState(..._args: unknown[]): unknown {
  throw new Error("dockerContainerState not implemented (openclaw stub)");
}
export function buildSandboxCreateArgs(..._args: unknown[]): unknown {
  throw new Error("buildSandboxCreateArgs not implemented (openclaw stub)");
}
export function ensureSandboxContainer(..._args: unknown[]): unknown {
  throw new Error("ensureSandboxContainer not implemented (openclaw stub)");
}
