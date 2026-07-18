// 移植自 openclaw/src/infra/system-run-command.ts（降级实现）
// 规范化与验证 system-run 命令。
import { normalizeExecutableToken, unwrapDispatchWrappersForResolution } from "./exec-wrapper-resolution.js";
import { resolveInlineCommandMatch, POSIX_INLINE_COMMAND_FLAGS } from "./shell-inline-command.js";

type SystemRunCommandValidation =
  | {
      ok: true;
      shellPayload: string | null;
      commandText: string;
      previewText: string | null;
    }
  | {
      ok: false;
      message: string;
      details?: Record<string, unknown>;
    };

type ResolvedSystemRunCommand =
  | {
      ok: true;
      argv: string[];
      commandText: string;
      shellPayload: string | null;
      previewText: string | null;
    }
  | {
      ok: false;
      message: string;
      details?: Record<string, unknown>;
    };

/** 格式化 argv 为 shell 风格的命令文本 */
export function formatExecCommand(argv: string[]): string {
  return argv
    .map((arg) => {
      if (arg.length === 0) return '""';
      const needsQuotes = /\s|"/.test(arg);
      if (!needsQuotes) return arg;
      return `"${arg.replace(/"/g, '\\"')}"`;
    })
    .join(" ");
}

/** 验证 system-run 命令 argv */
export function validateSystemRunCommandArgv(argv: string[]): SystemRunCommandValidation {
  if (!Array.isArray(argv) || argv.length === 0) {
    return { ok: false, message: "empty argv" };
  }
  const commandText = formatExecCommand(argv);
  return {
    ok: true,
    shellPayload: null,
    commandText,
    previewText: null,
  };
}

/**
 * 解析 system-run 命令。
 * 降级实现：不调用完整的 shell wrapper 解包，仅做基本规范化。
 */
export function resolveSystemRunCommand(params: {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string | null;
}): ResolvedSystemRunCommand {
  const validation = validateSystemRunCommandArgv(params.argv);
  if (!validation.ok) {
    return validation;
  }
  return {
    ok: true,
    argv: params.argv,
    commandText: validation.commandText,
    shellPayload: validation.shellPayload,
    previewText: validation.previewText,
  };
}

/** 解析 system-run 命令预览 */
export function resolveSystemRunCommandPreview(argv: string[]): string | null {
  if (argv.length === 0) return null;
  return formatExecCommand(argv.slice(0, 3)) + (argv.length > 3 ? " ..." : "");
}

export { normalizeExecutableToken, unwrapDispatchWrappersForResolution, resolveInlineCommandMatch, POSIX_INLINE_COMMAND_FLAGS };
export type { SystemRunCommandValidation, ResolvedSystemRunCommand };
