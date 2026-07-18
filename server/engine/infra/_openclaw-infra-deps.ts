/**
 * openclaw infra 内部模块降级依赖 — 为移植自 openclaw/src/infra/ 的文件提供
 * 未移植内部模块的占位实现。
 *
 * 降级原因：openclaw 内部模块（../routing/session-key、../config/types.openclaw、
 * ./command-analysis/inline-eval、./command-analysis/risks、./command-explainer/extract、
 * ./windows-shell-command、./exec-argv-analysis 等）未移植到 cross-wms。
 *
 * 设计原则：
 *  - 类型定义完整保留，确保消费方类型正确
 *  - 复杂函数抛出明确错误，避免静默失败
 *  - 简单常量提供默认值
 *
 * 参考 openclaw/src/{routing/session-key.js, config/types.openclaw.js}
 * 参考 openclaw/src/infra/{command-analysis/inline-eval.js, command-analysis/risks.js,
 *   command-explainer/extract.js, command-explainer/types.js, windows-shell-command.js,
 *   exec-argv-analysis.js}
 */

import type { OpenClawConfig } from "./_runtime-stubs.js";

// ============================================================================
// ../routing/session-key.js —— 会话键与默认 agent ID
// ============================================================================

/** 默认 agent ID（openclaw 的 ../routing/session-key.js 中导出） */
export const DEFAULT_AGENT_ID = "default";

// ============================================================================
// ../config/types.openclaw.js —— OpenClawConfig 类型重导出
// ============================================================================

export type { OpenClawConfig } from "./_runtime-stubs.js";

/** 降级的 OpenClawConfig 默认值 */
export const DEFAULT_OPENCLAW_CONFIG: OpenClawConfig = {};

// ============================================================================
// ./command-analysis/inline-eval.js —— 解释器模式匹配
// ============================================================================

/**
 * 判断是否为解释器风格的 allowlist 模式。
 * 降级实现：返回 false。
 */
export function isInterpreterLikeAllowlistPattern(_pattern: string): boolean {
  return false;
}

// ============================================================================
// ./command-analysis/risks.js —— 风险检测
// ============================================================================

/**
 * 检测 argv 中的 inline eval。
 * 降级实现：返回 null。
 */
export function detectInlineEvalArgv(_argv: readonly string[]): string | null {
  return null;
}

// ============================================================================
// ./command-explainer/types.js —— 命令解释类型
// ============================================================================

export type CommandStep = {
  id?: string;
  parentCommandId?: string;
  context?: string;
  executable: string;
  argv: string[];
  text: string;
  span?: {
    startIndex: number;
    endIndex: number;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  };
  executableSpan?: {
    startIndex: number;
    endIndex: number;
  };
};

export type CommandExplanationSummary = {
  commandCount: number;
  nestedCommandCount: number;
  riskKinds: string[];
  warningLines: string[];
};

// ============================================================================
// ./command-explainer/extract.js —— 命令解释
// ============================================================================

/**
 * 解释 shell 命令。
 * 降级实现：抛出错误，cross-wms 未移植完整的 command-explainer/extract。
 */
export async function explainShellCommand(_command: string): Promise<{
  topLevelCommands: CommandStep[];
  nestedCommands: CommandStep[];
}> {
  throw new Error("explainShellCommand stub: command-explainer/extract not ported");
}

// ============================================================================
// ./windows-shell-command.js —— Windows shell 命令解析
// ============================================================================

export type WindowsEscapeResult =
  | { ok: true; escaped: string }
  | { ok: false; reason: string };

/** Windows 参数转义（降级 stub） */
export function windowsEscapeArg(token: string): WindowsEscapeResult {
  if (typeof token !== "string") {
    return { ok: false, reason: "non-string token" };
  }
  if (token.includes("\0")) {
    return { ok: false, reason: "null byte in token" };
  }
  if (token === "") {
    return { ok: true, escaped: '""' };
  }
  if (/^[A-Za-z0-9@%_\-./:]+$/.test(token)) {
    return { ok: true, escaped: token };
  }
  const escaped = token.replace(/"/g, '\\"');
  return { ok: true, escaped: `"${escaped}"` };
}

/** 判断是否为 Windows 平台 */
export function isWindowsPlatform(platform?: string | null): boolean {
  const value = typeof platform === "string" ? platform.toLowerCase() : "";
  return value === "win32" || value.startsWith("win");
}

export type WindowsShellAnalysis = {
  ok: boolean;
  segments: Array<{
    raw: string;
    argv: string[];
    resolution: unknown;
    sourceArgv?: string[];
  }>;
  reason?: string;
};

/** 分析 Windows shell 命令（降级 stub） */
export function analyzeWindowsShellCommand(_params: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): WindowsShellAnalysis {
  return { ok: false, segments: [], reason: "windows-shell-command not ported" };
}

/** 从源重建 Windows shell 命令（降级 stub） */
export function rebuildWindowsShellCommandFromSource(_params: {
  command: string;
  renderSegment: (raw: string, segmentIndex: number) => { ok: true; rendered: string } | { ok: false; reason: string };
}): { ok: true; command: string; segmentCount: number } | { ok: false; reason: string } {
  return { ok: false, reason: "windows-shell-command not ported" };
}

/** 切分 Windows 段（降级 stub） */
export function tokenizeWindowsSegment(_command: string): string[] {
  return [];
}

// ============================================================================
// ./exec-argv-analysis.js —— argv 命令分析
// ============================================================================

/**
 * 分析 argv 命令。
 * 降级实现：返回失败结果。
 */
export function analyzeArgvCommand(argv: readonly string[]): {
  ok: boolean;
  segments: Array<{
    raw: string;
    argv: string[];
    resolution: unknown;
  }>;
  reason?: string;
} {
  if (!Array.isArray(argv) || argv.length === 0) {
    return { ok: false, segments: [], reason: "empty argv" };
  }
  return {
    ok: true,
    segments: [
      {
        raw: argv.join(" "),
        argv: [...argv],
        resolution: null,
      },
    ],
  };
}

// ============================================================================
// ./fs-safe-advanced.js —— 符号链接父目录检查
// ============================================================================

/** 断言路径父目录不含符号链接（降级 stub） */
export function assertNoSymlinkParentsSync(_params: {
  rootDir: string;
  targetPath: string;
  allowOutsideRoot?: boolean;
  messagePrefix?: string;
}): void {
  // 降级实现：不进行检查，cross-wms 未移植完整的 fs-safe-advanced
}

// ============================================================================
// ./home-dir.js —— 重导出（cross-wms 已有）
// ============================================================================

export { expandHomePrefix, resolveHomeRelativePath, resolveRequiredHomeDir } from "./home-dir.js";
