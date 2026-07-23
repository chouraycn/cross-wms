// 移植自 openclaw/src/infra/exec-wrapper-resolution.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import type { UnwrapEnvInvocation } from "./dispatch-wrapper-resolution.js";

export function basenameLower(token: string): string {
  return (token ?? "").split("/").pop()?.toLowerCase() ?? "";
}

export function normalizeExecutableToken(token: string): string {
  return basenameLower(token ?? "");
}

export function extractEnvAssignmentKeysFromDispatchWrappers(_argv: string[]): string[] {
  return [];
}

export function isDispatchWrapperExecutable(_executable: string): boolean {
  return false;
}

export function resolveDispatchWrapperTrustPlan(argv: string[]): {
  unwrappedArgv: string[];
  wrapperChain: string[];
  envAssignments: Record<string, string>;
} {
  return { unwrappedArgv: argv, wrapperChain: [], envAssignments: {} };
}

export function unwrapDispatchWrappersForResolution(argv: string[]): string[] {
  return argv;
}

export function unwrapEnvInvocation(_argv: string[]): UnwrapEnvInvocation | null {
  return null;
}

export function unwrapKnownDispatchWrapperInvocation(_argv: string[]): string[] | null {
  return null;
}

export function extractBindableShellWrapperInlineCommand(_argv: string[]): string | null {
  return null;
}

export function extractShellWrapperCommand(_argv: string[]): string | null {
  return null;
}

export function extractShellWrapperInlineCommand(_argv: string[]): string | null {
  return null;
}

export function hasEnvManipulationBeforeShellWrapper(_argv: string[]): boolean {
  return false;
}

export function isBlockedShellWrapperCommand(_argv: string[]): boolean {
  return false;
}

export function isShellWrapperExecutable(_executable: string): boolean {
  return false;
}

export function isShellWrapperInvocation(_argv: string[]): boolean {
  return false;
}

export const POSIX_SHELL_WRAPPERS: Set<string> = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish",
]);

export const POWERSHELL_WRAPPERS: Set<string> = new Set([
  "powershell", "pwsh", "powershell.exe", "pwsh.exe",
]);

export function resolveShellWrapperTransportArgv(_argv: string[]): string[] | null {
  return null;
}

export function unwrapKnownShellMultiplexerInvocation(_argv: string[]): string[] | null {
  return null;
}
