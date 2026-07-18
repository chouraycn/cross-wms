// 移植自 openclaw/src/config/agent-dirs.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function findDuplicateAgentDirs(...args: unknown[]): unknown {
  throw new Error("not implemented: findDuplicateAgentDirs");
}
export function formatDuplicateAgentDirError(...args: unknown[]): unknown {
  throw new Error("not implemented: formatDuplicateAgentDirError");
}
export class DuplicateAgentDirError {
  constructor(...args: unknown[]) { throw new Error("not implemented: DuplicateAgentDirError"); }
}
