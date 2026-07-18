// 移植自 openclaw/src/infra/exec-control-command-guard.ts（降级实现）
// 守卫不安全的 exec 控制命令（如 /approve、openclaw channels login）。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import { splitShellArgs } from "./shell-argv.js";

type ParsedExecApprovalCommand = {
  approvalId: string;
  decision: "allow-once" | "allow-always" | "deny";
};

export type UnsafeExecControlShellCommandKind = "approve" | "channel-login";

export function parseExecApprovalShellCommand(raw: string): ParsedExecApprovalCommand | null {
  const normalized = raw.trimStart();
  const match = normalized.match(
    /^\/approve(?:@[^\s]+)?\s+([A-Za-z0-9][A-Za-z0-9._:-]*)\s+(allow-once|allow-always|always|deny)\b/i,
  );
  if (!match) return null;
  const rawDecision = normalizeLowercaseStringOrEmpty(match[2]);
  return {
    approvalId: match[1],
    decision: rawDecision === "always" ? "allow-always" : (rawDecision as ParsedExecApprovalCommand["decision"]),
  };
}

function normalizeCommandBaseName(token: string | undefined): string {
  if (!token) return "";
  const base = normalizeLowercaseStringOrEmpty(token.split(/[\\/]/u).at(-1));
  return base.replace(/\.(?:cmd|exe)$/u, "");
}

function stripOpenClawPackageRunner(argv: string[]): string[] {
  const commandName = normalizeCommandBaseName(argv[0]);
  if (commandName === "openclaw") return argv;
  if (
    (commandName === "pnpm" || commandName === "npm" || commandName === "yarn") &&
    normalizeCommandBaseName(argv[1]) === "openclaw"
  ) {
    return argv.slice(1);
  }
  if (
    (commandName === "pnpm" || commandName === "npm" || commandName === "yarn") &&
    (argv[1] === "exec" || argv[1] === "dlx" || argv[1] === "run") &&
    normalizeCommandBaseName(argv[2]) === "openclaw"
  ) {
    return argv.slice(2);
  }
  if (commandName === "npx" || commandName === "bunx") {
    let idx = 1;
    while (idx < argv.length) {
      const token = argv[idx];
      if (token === "--") {
        idx += 1;
        break;
      }
      if (!token.startsWith("-") || token === "-") break;
      idx += 1;
      if ((token === "-p" || token === "--package") && idx < argv.length) idx += 1;
    }
    if (normalizeCommandBaseName(argv[idx]) === "openclaw") return argv.slice(idx);
  }
  return argv;
}

export function parseOpenClawChannelsLoginShellCommand(raw: string): boolean {
  const argv = splitShellArgs(raw);
  if (!argv) return false;
  const openclawArgv = stripOpenClawPackageRunner(argv);
  return (
    normalizeCommandBaseName(openclawArgv[0]) === "openclaw" &&
    (openclawArgv[1] === "channels" || openclawArgv[1] === "channel") &&
    openclawArgv[2] === "login"
  );
}

/**
 * 检测不安全的 exec 控制命令。
 * 降级实现：不调用 explainShellCommand（未移植完整 command-explainer），仅做行级 splitShellArgs 解析。
 */
export async function detectUnsafeExecControlShellCommand(
  command: string,
): Promise<UnsafeExecControlShellCommandKind | null> {
  const rawCommand = command.trim();
  const lines = rawCommand.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (parseExecApprovalShellCommand(trimmed)) return "approve";
    if (parseOpenClawChannelsLoginShellCommand(trimmed)) return "channel-login";
    const argv = splitShellArgs(trimmed);
    if (argv) {
      if (parseExecApprovalShellCommand(argv.join(" "))) return "approve";
      if (parseOpenClawChannelsLoginShellCommand(argv.join(" "))) return "channel-login";
    }
  }
  return null;
}

export async function rejectUnsafeExecControlShellCommand(command: string): Promise<void> {
  const unsafeKind = await detectUnsafeExecControlShellCommand(command);
  if (unsafeKind === "approve") {
    throw new Error(
      "exec cannot run /approve commands. Show the /approve command to the user as chat text, or route it through the approval command handler instead of shell execution.",
    );
  }
  if (unsafeKind === "channel-login") {
    throw new Error(
      "exec cannot run interactive OpenClaw channel login commands. Run `openclaw channels login` in a terminal on the gateway host.",
    );
  }
}
