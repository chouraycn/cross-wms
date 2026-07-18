// Windows shell 命令分析和转义。
// 降级实现：openclaw 中从 @openclaw/normalization-core/string-coerce 导入 normalizeLowercaseStringOrEmpty，
// 从 ./exec-command-analysis-types.js 导入 ExecCommandAnalysis 类型，
// 从 ./exec-command-resolution.js 导入 resolveCommandResolutionFromArgv；
// cross-wms 使用本地 string-coerce、本地类型定义和降级的 resolveCommandResolutionFromArgv。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";

/**
 * 命令解析结果类型。
 * 降级定义：openclaw 在 ./exec-command-resolution.ts 中导出，
 * cross-wms 未移植该文件，这里定义最小化本地类型。
 */
export type CommandResolution = {
  execution: {
    rawExecutable: string;
    resolvedPath?: string;
    resolvedRealPath?: string;
    executableName: string;
  };
  policy: {
    rawExecutable: string;
    resolvedPath?: string;
    resolvedRealPath?: string;
    executableName: string;
  };
  effectiveArgv?: string[];
  wrapperChain?: string[];
  policyBlocked?: boolean;
  blockedWrapper?: string;
};

/**
 * Exec 命令段类型。
 * 降级定义：openclaw 在 ./exec-command-analysis-types.ts 中导出。
 */
export type ExecCommandSegment = {
  raw: string;
  argv: string[];
  sourceArgv?: string[];
  resolution: CommandResolution | null;
};

/**
 * Exec 命令分析结果类型。
 * 降级定义：openclaw 在 ./exec-command-analysis-types.ts 中导出。
 */
export type ExecCommandAnalysis = {
  ok: boolean;
  reason?: string;
  segments: ExecCommandSegment[];
  chains?: ExecCommandSegment[][];
};

/**
 * 从 argv 解析命令解析结果。
 * 降级实现：openclaw 在 ./exec-command-resolution.ts 中导出 resolveCommandResolutionFromArgv，
 * cross-wms 未移植该模块，这里返回 null（表示未解析）。
 */
function resolveCommandResolutionFromArgv(
  _argv: string[],
  _cwd?: string,
  _env?: NodeJS.ProcessEnv,
  _platform?: NodeJS.Platform,
): CommandResolution | null {
  return null;
}

const WINDOWS_UNSUPPORTED_TOKENS = new Set([
  "&",
  "|",
  "<",
  ">",
  ";",
  "^",
  "(",
  ")",
  "%",
  "!",
  "`",
  "\n",
  "\r",
]);

// 这些 token 在双引号内仍然不安全：换行符破坏解析，cmd.exe
// 展开 %VAR%，PowerShell 将 ` 视为转义字符。
const WINDOWS_ALWAYS_UNSAFE_TOKENS = new Set(["\n", "\r", "%", "`"]);

function findWindowsUnsupportedToken(command: string): string | null {
  let inDouble = false;
  // cmd.exe 不识别单引号，因此在此跨主机安全检查中不将其视为安全引号。
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "$") {
      const next = command[i + 1];
      if (next !== undefined && /[A-Za-z_{(?$]/.test(next)) {
        return "$";
      }
      continue;
    }
    if (WINDOWS_UNSUPPORTED_TOKENS.has(ch)) {
      if (inDouble && !WINDOWS_ALWAYS_UNSAFE_TOKENS.has(ch)) {
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        return "newline";
      }
      return ch;
    }
  }
  return null;
}

export function tokenizeWindowsSegment(segment: string): string[] | null {
  const tokens: string[] = [];
  let buf = "";
  let inDouble = false;
  let inSingle = false;
  let wasQuoted = false;

  const pushToken = () => {
    if (buf.length > 0 || wasQuoted) {
      tokens.push(buf);
      buf = "";
    }
    wasQuoted = false;
  };

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === '"' && !inSingle) {
      if (!inDouble) {
        wasQuoted = true;
      }
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'" && !inDouble) {
      if (inSingle && segment[i + 1] === "'") {
        buf += "'";
        i += 1;
        continue;
      }
      if (!inSingle) {
        wasQuoted = true;
      }
      inSingle = !inSingle;
      continue;
    }
    if (!inDouble && !inSingle && /\s/.test(ch)) {
      pushToken();
      continue;
    }
    buf += ch;
  }

  if (inDouble || inSingle) {
    return null;
  }
  pushToken();
  return tokens.length > 0 ? tokens : null;
}

function stripWindowsShellWrapper(command: string): string {
  const maxDepth = 5;
  let result = command;
  for (let i = 0; i < maxDepth; i++) {
    const previous = result;
    result = stripWindowsShellWrapperOnce(result.trim());
    if (result === previous) {
      break;
    }
  }
  return result;
}

function stripWindowsShellWrapperOnce(command: string): string {
  const psCallMatch = command.match(/^&\s+(.+)$/s);
  if (psCallMatch) {
    return psCallMatch[1];
  }

  const psFlags =
    /(?:-(?!c(?:ommand)?\b|-command\b)\w+(?:\s+(?!-)(?:"[^"]*(?:""[^"]*)*"|'[^']*(?:''[^']*)*'|\S+))?\s+)*/i
      .source;
  const psCommandFlag = `(?:-command|-c|--command)`;
  const psInvokeMatch = command.match(
    new RegExp(`^(?:powershell|pwsh)(?:\\.exe)?\\s+${psFlags}${psCommandFlag}\\s+"(.+)"$`, "is"),
  );
  if (psInvokeMatch) {
    return psInvokeMatch[1].replace(/""/g, '"');
  }
  const psInvokeSingleQuote = command.match(
    new RegExp(`^(?:powershell|pwsh)(?:\\.exe)?\\s+${psFlags}${psCommandFlag}\\s+'(.+)'$`, "is"),
  );
  if (psInvokeSingleQuote) {
    return psInvokeSingleQuote[1].replace(/''/g, "'");
  }
  const psInvokeNoQuote = command.match(
    new RegExp(`^(?:powershell|pwsh)(?:\\.exe)?\\s+${psFlags}${psCommandFlag}\\s+(.+)$`, "is"),
  );
  if (psInvokeNoQuote) {
    return psInvokeNoQuote[1];
  }

  // `cmd /c` 保持完整，因为 PowerShell 执行会改变 cmd.exe
  // 内置语义；调用方需要对 cmd 本身的显式信任。
  return command;
}

export function analyzeWindowsShellCommand(params: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): ExecCommandAnalysis {
  const effective = stripWindowsShellWrapper(params.command.trim());
  const unsupported = findWindowsUnsupportedToken(effective);
  if (unsupported) {
    return {
      ok: false,
      reason: `unsupported windows shell token: ${unsupported}`,
      segments: [],
    };
  }
  const argv = tokenizeWindowsSegment(effective);
  if (!argv || argv.length === 0) {
    return { ok: false, reason: "unable to parse windows command", segments: [] };
  }
  return {
    ok: true,
    segments: [
      {
        raw: params.command,
        argv,
        resolution: resolveCommandResolutionFromArgv(
          argv,
          params.cwd,
          params.env,
          (params.platform ?? undefined) as NodeJS.Platform | undefined,
        ),
      },
    ],
  };
}

export function isWindowsPlatform(platform?: string | null): boolean {
  const normalized = normalizeLowercaseStringOrEmpty(platform);
  return normalized.startsWith("win");
}

const WINDOWS_UNSAFE_CMD_META = /[%`]|\$(?=[A-Za-z_{(?$])/;

export function windowsEscapeArg(value: string): { ok: true; escaped: string } | { ok: false } {
  if (value === "") {
    return { ok: true, escaped: '""' };
  }
  if (WINDOWS_UNSAFE_CMD_META.test(value)) {
    return { ok: false };
  }
  if (/^[a-zA-Z0-9_./:~\\=-]+$/.test(value)) {
    return { ok: true, escaped: value };
  }
  const escaped = value.replace(/"/g, '""');
  return { ok: true, escaped: `"${escaped}"` };
}

export type ShellSegmentRenderResult =
  | { ok: true; rendered: string }
  | { ok: false; reason: string };

export type RebuiltShellCommandResult = {
  ok: boolean;
  command?: string;
  reason?: string;
  segmentCount?: number;
};

export function rebuildWindowsShellCommandFromSource(params: {
  command: string;
  renderSegment: (rawSegment: string, segmentIndex: number) => ShellSegmentRenderResult;
}): RebuiltShellCommandResult {
  const source = stripWindowsShellWrapper(params.command.trim());
  if (!source) {
    return { ok: false, reason: "empty command" };
  }
  const unsupported = findWindowsUnsupportedToken(source);
  if (unsupported) {
    return { ok: false, reason: `unsupported windows shell token: ${unsupported}` };
  }
  const rendered = params.renderSegment(source, 0);
  if (!rendered.ok) {
    return { ok: false, reason: rendered.reason };
  }
  // 前缀 PowerShell 调用运算符 (&) 使带引号的可执行路径
  // 被视为命令，而非字符串字面量。
  return { ok: true, command: `& ${rendered.rendered}`, segmentCount: 1 };
}
