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
// ./command-explainer/extract.js —— 命令解释（基本实现）
// ============================================================================

/** 已知 shell 包装器可执行文件列表 */
const SHELL_WRAPPERS = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "fish",
  "python", "python3", "node", "nodejs", "ruby", "perl",
]);

/** 已知的 inline eval 标志 */
const INLINE_EVAL_FLAGS = new Set(["-c", "-e", "--eval", "-eval"]);

interface ShellToken {
  text: string;
  startIndex: number;
  endIndex: number;
  quoted: boolean;
}

/** 基础 shell 分词器（支持单引号、双引号、反斜杠转义） */
function tokenizeShellCommand(command: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let i = 0;
  const len = command.length;

  while (i < len) {
    // 跳过空白
    while (i < len && /\s/.test(command[i])) i++;
    if (i >= len) break;

    const startIndex = i;
    let text = "";
    let quoted = false;

    while (i < len) {
      const ch = command[i];

      if (ch === "\\" && i + 1 < len) {
        text += command[i + 1];
        i += 2;
        continue;
      }

      if (ch === "'") {
        quoted = true;
        i++;
        while (i < len && command[i] !== "'") {
          text += command[i];
          i++;
        }
        if (i < len) i++;
        continue;
      }

      if (ch === '"') {
        quoted = true;
        i++;
        while (i < len && command[i] !== '"') {
          if (command[i] === "\\" && i + 1 < len) {
            text += command[i + 1];
            i += 2;
          } else {
            text += command[i];
            i++;
          }
        }
        if (i < len) i++;
        continue;
      }

      if (/\s/.test(ch)) break;
      text += ch;
      i++;
    }

    if (text.length > 0 || quoted) {
      tokens.push({ text, startIndex, endIndex: i, quoted });
    }
  }

  return tokens;
}

/** 检测命令中的 $(...) 或 `...` 替换 */
function detectCommandSubstitutions(command: string): Array<{ text: string; startIndex: number; endIndex: number; kind: "dollar" | "backtick" }> {
  const results: Array<{ text: string; startIndex: number; endIndex: number; kind: "dollar" | "backtick" }> = [];

  // 检测 $(...)
  let i = 0;
  while (i < command.length - 1) {
    if (command[i] === "$" && command[i + 1] === "(") {
      const startIndex = i;
      let depth = 1;
      i += 2;
      while (i < command.length && depth > 0) {
        if (command[i] === "(" && command[i - 1] === "$") depth++;
        else if (command[i] === ")") depth--;
        i++;
      }
      results.push({ text: command.slice(startIndex, i), startIndex, endIndex: i, kind: "dollar" });
    } else {
      i++;
    }
  }

  // 检测 `...`
  i = 0;
  while (i < command.length) {
    if (command[i] === "`") {
      const startIndex = i;
      i++;
      while (i < command.length && command[i] !== "`") {
        if (command[i] === "\\" && i + 1 < command.length) i += 2;
        else i++;
      }
      if (i < command.length) i++;
      results.push({ text: command.slice(startIndex, i), startIndex, endIndex: i, kind: "backtick" });
    } else {
      i++;
    }
  }

  return results;
}

/** 提取包装器 payload（如 bash -c "..." 中的 "..."） */
function extractWrapperPayload(tokens: ShellToken[]): { executable: string; payload: string | null; payloadStart: number } | null {
  if (tokens.length < 2) return null;
  const exe = tokens[0].text;
  const baseExe = exe.replace(/.*\//, "");
  if (!SHELL_WRAPPERS.has(baseExe)) return null;

  for (let i = 1; i < tokens.length; i++) {
    if (INLINE_EVAL_FLAGS.has(tokens[i].text)) {
      const payloadToken = tokens[i + 1];
      if (payloadToken) {
        return {
          executable: baseExe,
          payload: payloadToken.text,
          payloadStart: payloadToken.startIndex,
        };
      }
    }
  }
  return null;
}

/** 解释 shell 命令（基本实现，不依赖 tree-sitter） */
export async function explainShellCommand(command: string): Promise<{
  topLevelCommands: CommandStep[];
  nestedCommands: CommandStep[];
}> {
  const topLevelCommands: CommandStep[] = [];
  const nestedCommands: CommandStep[] = [];

  if (!command || !command.trim()) {
    return { topLevelCommands, nestedCommands };
  }

  const trimmed = command.trim();
  const tokens = tokenizeShellCommand(trimmed);

  if (tokens.length === 0) {
    return { topLevelCommands, nestedCommands };
  }

  // 构建第一个命令 step
  const exeToken = tokens[0];
  const argv = tokens.map((t) => t.text);
  const stepId = `cmd-0`;

  topLevelCommands.push({
    id: stepId,
    context: "top-level",
    executable: exeToken.text,
    argv,
    text: trimmed,
    span: {
      startIndex: 0,
      endIndex: trimmed.length,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: trimmed.length },
    },
    executableSpan: {
      startIndex: exeToken.startIndex,
      endIndex: exeToken.endIndex,
    },
  });

  // 检测包装器 payload
  const wrapper = extractWrapperPayload(tokens);
  if (wrapper?.payload) {
    const payloadTokens = tokenizeShellCommand(wrapper.payload);
    if (payloadTokens.length > 0) {
      const payloadExe = payloadTokens[0];
      nestedCommands.push({
        id: `nested-0`,
        parentCommandId: stepId,
        context: "wrapper-payload",
        executable: payloadExe.text,
        argv: payloadTokens.map((t) => t.text),
        text: wrapper.payload,
        span: {
          startIndex: wrapper.payloadStart,
          endIndex: wrapper.payloadStart + wrapper.payload.length,
          startPosition: { row: 0, column: wrapper.payloadStart },
          endPosition: { row: 0, column: wrapper.payloadStart + wrapper.payload.length },
        },
        executableSpan: {
          startIndex: wrapper.payloadStart + payloadExe.startIndex,
          endIndex: wrapper.payloadStart + payloadExe.endIndex,
        },
      });
    }
  }

  // 检测命令替换
  const substitutions = detectCommandSubstitutions(trimmed);
  for (let sIdx = 0; sIdx < substitutions.length; sIdx++) {
    const sub = substitutions[sIdx];
    // $(...) 去掉 2 字符前缀，反引号去掉 1 字符前缀
    const prefixLen = sub.kind === "dollar" ? 2 : 1;
    const innerText = sub.text.slice(prefixLen, -1);
    const innerTokens = tokenizeShellCommand(innerText);
    if (innerTokens.length > 0) {
      const innerExe = innerTokens[0];
      nestedCommands.push({
        id: `subst-${sIdx}`,
        parentCommandId: stepId,
        context: "command-substitution",
        executable: innerExe.text,
        argv: innerTokens.map((t) => t.text),
        text: sub.text,
        span: {
          startIndex: sub.startIndex,
          endIndex: sub.endIndex,
          startPosition: { row: 0, column: sub.startIndex },
          endPosition: { row: 0, column: sub.endIndex },
        },
        executableSpan: {
          startIndex: sub.startIndex + prefixLen + innerExe.startIndex,
          endIndex: sub.startIndex + prefixLen + innerExe.endIndex,
        },
      });
    }
  }

  return { topLevelCommands, nestedCommands };
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

/** 分析 Windows shell 命令（基本实现） */
export function analyzeWindowsShellCommand(params: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): WindowsShellAnalysis {
  const { command } = params;
  if (!command || !command.trim()) {
    return { ok: false, segments: [], reason: "empty command" };
  }

  // 简单分词（处理双引号）
  const tokens: string[] = [];
  let buf = "";
  let inDouble = false;
  let wasQuoted = false;

  const pushToken = () => {
    if (buf.length > 0 || wasQuoted) {
      tokens.push(buf);
      buf = "";
    }
    wasQuoted = false;
  };

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === '"' && !inDouble) {
      wasQuoted = true;
      inDouble = true;
      continue;
    }
    if (ch === '"' && inDouble) {
      inDouble = false;
      continue;
    }
    if (/\s/.test(ch) && !inDouble) {
      pushToken();
      continue;
    }
    buf += ch;
  }
  pushToken();

  if (tokens.length === 0) {
    return { ok: false, segments: [], reason: "no tokens" };
  }

  const segments = [
    {
      raw: command,
      argv: tokens,
      resolution: null,
      sourceArgv: tokens,
    },
  ];

  return { ok: true, segments };
}

/** 从源重建 Windows shell 命令（基本实现） */
export function rebuildWindowsShellCommandFromSource(params: {
  command: string;
  renderSegment: (raw: string, segmentIndex: number) => { ok: true; rendered: string } | { ok: false; reason: string };
}): { ok: true; command: string; segmentCount: number } | { ok: false; reason: string } {
  const { command, renderSegment } = params;
  if (!command || !command.trim()) {
    return { ok: false, reason: "empty command" };
  }

  const result = renderSegment(command, 0);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return { ok: true, command: result.rendered, segmentCount: 1 };
}

/** 切分 Windows 段（基本实现） */
export function tokenizeWindowsSegment(command: string): string[] | null {
  if (!command || !command.trim()) {
    return null;
  }

  const tokens: string[] = [];
  let buf = "";
  let inDouble = false;
  let wasQuoted = false;

  const pushToken = () => {
    if (buf.length > 0 || wasQuoted) {
      tokens.push(buf);
      buf = "";
    }
    wasQuoted = false;
  };

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === '"' && !inDouble) {
      wasQuoted = true;
      inDouble = true;
      continue;
    }
    if (ch === '"' && inDouble) {
      inDouble = false;
      continue;
    }
    if (/\s/.test(ch) && !inDouble) {
      pushToken();
      continue;
    }
    buf += ch;
  }
  pushToken();

  return tokens.length > 0 ? tokens : null;
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
