// 移植自 openclaw/src/config/agent-dirs.ts

export function findDuplicateAgentDirs(...args: unknown[]): unknown {
  return [];
}
export function formatDuplicateAgentDirError(...args: unknown[]): unknown {
  return "";
}
export class DuplicateAgentDirError {
  // Stub: not fully ported
}
