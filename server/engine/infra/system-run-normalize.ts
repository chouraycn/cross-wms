// 移植自 openclaw/src/infra/system-run-normalize.ts（降级实现）
// 规范化 system-run 命令。
import { normalizeExecutableToken } from "./exec-wrapper-resolution.js";

/** 规范化 system-run argv */
export function normalizeSystemRunArgv(argv: string[]): string[] {
  if (!Array.isArray(argv) || argv.length === 0) return [];
  const normalized = [...argv];
  if (normalized[0]) {
    normalized[0] = normalizeExecutableToken(normalized[0]);
  }
  return normalized;
}

/** 规范化 system-run 命令文本 */
export function normalizeSystemRunCommandText(command: string): string {
  return command.trim();
}

/** 解析 system-run 命令为 argv（降级：使用空格分割） */
export function parseSystemRunCommand(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

/** 规范化 system-run 工作目录 */
export function normalizeSystemRunCwd(cwd?: string | null): string | undefined {
  if (typeof cwd !== "string") return undefined;
  const trimmed = cwd.trim();
  return trimmed || undefined;
}

export { normalizeExecutableToken };
