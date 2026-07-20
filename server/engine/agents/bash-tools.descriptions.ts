/**
 * Tool descriptions for bash exec and process-control tools.
 * Ported from openclaw/src/agents/bash-tools.descriptions.ts
 */
import path from "node:path";

function deriveExecShortName(fullPath: string): string {
  if (path.isAbsolute(fullPath)) {
    return fullPath;
  }
  const base = path.basename(fullPath);
  return base.replace(/\.exe$/i, "") || base;
}

/** Builds the model-facing exec tool description for the current platform/config. */
export function describeExecTool(params?: { agentId?: string; hasCronTool?: boolean }): string {
  const base = [
    "Execute shell commands with background continuation for work that starts now.",
    "Use yieldMs/background to continue later via process tool.",
    "For long-running work started now, rely on automatic completion wake when it is enabled and the command emits output or fails; otherwise use process to confirm completion. Use process whenever you need logs, status, input, or intervention.",
    params?.hasCronTool
      ? "Do not use exec sleep or delay loops for reminders or deferred follow-ups; use cron instead."
      : undefined,
    "Use pty=true for TTY-required commands (terminal UIs, coding agents).",
  ]
    .filter(Boolean)
    .join(" ");
  if (process.platform !== "win32") {
    return base;
  }
  const lines: string[] = [base];
  lines.push(
    "IMPORTANT (Windows): Run executables directly; do NOT wrap commands in `cmd /c`, `powershell -Command`, `& ` prefix, or WSL. Use backslash paths (C:\\path), not forward slashes. Use short executable names (e.g. `node`, `python3`) instead of full paths.",
  );
  return lines.join("\n");
}

/** Builds the model-facing process-control tool description. */
export function describeProcessTool(params?: { hasCronTool?: boolean }): string {
  return [
    "Manage running exec sessions for commands already started: list, poll, log, write, send-keys, submit, paste, kill.",
    "Use poll/log when you need status, logs, quiet-success confirmation, or completion confirmation when automatic completion wake is unavailable. Use poll/log also for input-wait hints. Use write/send-keys/submit/paste/kill for input or intervention.",
    params?.hasCronTool
      ? "Do not use process polling to emulate timers or reminders; use cron for scheduled follow-ups."
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}
