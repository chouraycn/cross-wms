/**
 * 移植自 openclaw/src/agents/sandbox/fs-bridge-path-safety.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type PathSafetyCheck = unknown;
export type PinnedSandboxEntry = unknown;
export type AnchoredSandboxEntry = unknown;
export type PinnedSandboxDirectoryEntry = unknown;
export class SandboxFsPathGuard {
  constructor(..._args: unknown[]) { throw new Error("SandboxFsPathGuard not implemented (openclaw stub)"); }
}
