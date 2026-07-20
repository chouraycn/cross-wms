// 移植自 openclaw/src/infra/exec-control-command-guard.ts

export type UnsafeExecControlShellCommandKind =
  | "exec-approval"
  | "channels-login"
  | "unknown-sensitive";

/** Parses an exec-approval shell command for safety analysis. */
export function parseExecApprovalShellCommand(argv: string[]): {
  isApprovalCommand: boolean;
  command?: string;
  subcommand?: string;
} {
  if (argv[0] !== "exec-approval" && argv[0] !== "openclaw-exec-approval") {
    return { isApprovalCommand: false };
  }
  return { isApprovalCommand: true, command: argv[0], subcommand: argv[1] };
}

/** Parses an openclaw channels login shell command. */
export function parseOpenClawChannelsLoginShellCommand(argv: string[]): {
  isChannelsLogin: boolean;
  channel?: string;
} {
  if (argv[0] !== "openclaw" || argv[1] !== "channels" || argv[2] !== "login") {
    return { isChannelsLogin: false };
  }
  return { isChannelsLogin: true, channel: argv[3] };
}

/** Detects if a command is an unsafe exec control shell command. */
export function detectUnsafeExecControlShellCommand(argv: string[]): UnsafeExecControlShellCommandKind | null {
  if (argv[0] === "exec-approval" || argv[0] === "openclaw-exec-approval") {
    return "exec-approval";
  }
  if (argv[0] === "openclaw" && argv[1] === "channels" && argv[2] === "login") {
    return "channels-login";
  }
  return null;
}

/** Rejects unsafe exec control shell commands by throwing. */
export function rejectUnsafeExecControlShellCommand(argv: string[]): void {
  const kind = detectUnsafeExecControlShellCommand(argv);
  if (kind) {
    throw new Error(`Unsafe exec control command detected: ${kind}`);
  }
}
