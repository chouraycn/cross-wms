/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/runtime.ts (RuntimeEnv, OutputRuntimeEnv types)
// Status: 已移植 openclaw 同源类型定义
// Used by: server/engine/plugins/provider-openai-chatgpt-oauth.ts
// 注：RuntimeEnv 是 CLI 运行时环境接口（log/error/exit）。
//      OutputRuntimeEnv 扩展了 stdout/json 输出能力。两者均为纯类型，无运行时依赖。

/** CLI runtime environment used by command implementations. */
export type RuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
};

/** Extended runtime env with structured stdout output helpers. */
export type OutputRuntimeEnv = RuntimeEnv & {
  writeStdout: (value: string) => void;
  writeJson: (value: unknown, space?: number) => void;
};
