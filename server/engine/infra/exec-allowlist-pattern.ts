// 移植自 openclaw/src/infra/exec-allowlist-pattern.ts

/** Checks if an executable matches an allowlist pattern (glob or exact). */
export function matchesExecAllowlistPattern(params: {
  executable: string;
  pattern: string;
  cwd?: string;
}): boolean {
  const { executable, pattern } = params;
  if (!executable || !pattern) return false;
  // Exact match
  if (executable === pattern) return true;
  // Simple glob: * matches any chars
  if (pattern.includes("*")) {
    const regex = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return regex.test(executable);
  }
  return false;
}
