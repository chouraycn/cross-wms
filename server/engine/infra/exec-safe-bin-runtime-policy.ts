// 移植自 openclaw/src/infra/exec-safe-bin-runtime-policy.ts

const INTERPRETER_LIKE_BINS = new Set([
  "node", "python", "python3", "ruby", "perl", "php", "lua", "java", "bash", "sh", "zsh",
]);

/** Checks if a binary is interpreter-like (can execute arbitrary code). */
export function isInterpreterLikeSafeBin(executable: string): boolean {
  const normalized = executable?.trim().toLowerCase();
  if (!normalized) return false;
  // Get basename
  const basename = normalized.split("/").pop() ?? normalized;
  return INTERPRETER_LIKE_BINS.has(basename);
}

/** Lists all interpreter-like safe bins. */
export function listInterpreterLikeSafeBins(): string[] {
  return [...INTERPRETER_LIKE_BINS];
}

/** Resolves merged safe bin profile fixtures. */
export function resolveMergedSafeBinProfileFixtures(params: {
  safeBins?: readonly string[];
  additionalSafeBins?: readonly string[];
}): { safeBins: Set<string> } {
  const bins = new Set<string>(params.safeBins ?? []);
  for (const bin of params.additionalSafeBins ?? []) {
    bins.add(bin);
  }
  return { safeBins: bins };
}

/** Resolves the exec safe bin runtime policy. */
export function resolveExecSafeBinRuntimePolicy(params: {
  executable: string;
  safeBins?: readonly string[];
  trustedBins?: readonly string[];
}): { allowed: boolean; reason?: string } {
  const executable = params.executable?.trim();
  if (!executable) return { allowed: false, reason: "empty executable" };
  const basename = executable.split("/").pop() ?? executable;
  const safeSet = new Set([...(params.safeBins ?? []), ...(params.trustedBins ?? [])].map((s) => s.toLowerCase()));
  if (safeSet.has(basename.toLowerCase())) return { allowed: true };
  if (INTERPRETER_LIKE_BINS.has(basename.toLowerCase())) return { allowed: false, reason: "interpreter-like" };
  return { allowed: true };
}
