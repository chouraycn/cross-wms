// 移植自 openclaw/src/infra/system-run-command.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function formatExecCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: formatExecCommand");
}
export function extractShellCommandFromArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: extractShellCommandFromArgv");
}
export function validateSystemRunCommandConsistency(...args: unknown[]): unknown {
  throw new Error("not implemented: validateSystemRunCommandConsistency");
}
export function resolveSystemRunCommandRequest(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSystemRunCommandRequest");
}
