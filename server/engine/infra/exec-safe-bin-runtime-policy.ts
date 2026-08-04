// Resolves runtime safe-bin policy and trust warnings.
// 移植自 openclaw/src/infra/exec-safe-bin-runtime-policy.ts
// 降级策略：依赖模块（exec-approvals-allowlist, exec-safe-bin-policy, exec-safe-bin-semantics,
// exec-safe-bin-trust）尚未移植，这里使用本地降级实现，行为一致但不含完整的安全策略检查。

const INTERPRETER_LIKE_SAFE_BINS = new Set([
  "ash",
  "awk",
  "bash",
  "busybox",
  "bun",
  "cmd",
  "cmd.exe",
  "cscript",
  "dash",
  "deno",
  "fish",
  "gawk",
  "gsed",
  "ksh",
  "lua",
  "mawk",
  "nawk",
  "node",
  "nodejs",
  "perl",
  "php",
  "powershell",
  "powershell.exe",
  "pypy",
  "pwsh",
  "pwsh.exe",
  "python",
  "python2",
  "python3",
  "ruby",
  "sed",
  "sh",
  "toybox",
  "wscript",
  "zsh",
]);

const INTERPRETER_LIKE_PATTERNS = [
  /^python\d+(?:\.\d+)?$/,
  /^ruby\d+(?:\.\d+)?$/,
  /^perl\d+(?:\.\d+)?$/,
  /^php\d+(?:\.\d+)?$/,
  /^node\d+(?:\.\d+)?$/,
];

function normalizeSafeBinName(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Returns true for safeBins that can interpret scripts or execute broad embedded programs. */
export function isInterpreterLikeSafeBin(raw: string): boolean {
  const normalized = normalizeSafeBinName(raw);
  if (!normalized) {
    return false;
  }
  if (INTERPRETER_LIKE_SAFE_BINS.has(normalized)) {
    return true;
  }
  return INTERPRETER_LIKE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Lists normalized interpreter-like safeBins from a configured entry set. */
export function listInterpreterLikeSafeBins(entries: Iterable<string>): string[] {
  return Array.from(entries)
    .map((entry) => normalizeSafeBinName(entry))
    .filter((entry) => entry.length > 0 && isInterpreterLikeSafeBin(entry))
    .toSorted();
}

type ExecSafeBinConfigScope = {
  safeBins?: string[] | null;
  safeBinProfiles?: Record<string, unknown> | null;
  safeBinTrustedDirs?: string[] | null;
};

/** Merges global and local safe-bin profile fixtures, with local definitions winning. */
export function resolveMergedSafeBinProfileFixtures(params: {
  global?: ExecSafeBinConfigScope | null;
  local?: ExecSafeBinConfigScope | null;
}): Record<string, unknown> | undefined {
  const global = params.global?.safeBinProfiles ?? {};
  const local = params.local?.safeBinProfiles ?? {};
  if (Object.keys(global).length === 0 && Object.keys(local).length === 0) {
    return undefined;
  }
  return {
    ...global,
    ...local,
  };
}

/** Resolves safe-bin names, profiles, trusted dirs, and warning metadata for exec evaluation. */
export function resolveExecSafeBinRuntimePolicy(params: {
  global?: ExecSafeBinConfigScope | null;
  local?: ExecSafeBinConfigScope | null;
  onWarning?: (message: string) => void;
}): {
  safeBins: Set<string>;
  safeBinProfiles: Readonly<Record<string, unknown>>;
  trustedSafeBinDirs: ReadonlySet<string>;
  unprofiledSafeBins: string[];
  unprofiledInterpreterSafeBins: string[];
  writableTrustedSafeBinDirs: never[];
} {
  const rawSafeBins = params.local?.safeBins ?? params.global?.safeBins ?? [];
  const safeBins = new Set(
    Array.from(rawSafeBins)
      .map((entry) => normalizeSafeBinName(entry))
      .filter((entry) => entry.length > 0),
  );

  const safeBinProfiles: Record<string, unknown> = {};

  const unprofiledSafeBins = Array.from(safeBins)
    .filter((entry) => !safeBinProfiles[entry])
    .toSorted();

  const trustedSafeBinDirs = new Set<string>();

  return {
    safeBins,
    safeBinProfiles,
    trustedSafeBinDirs,
    unprofiledSafeBins,
    unprofiledInterpreterSafeBins: listInterpreterLikeSafeBins(unprofiledSafeBins),
    writableTrustedSafeBinDirs: [],
  };
}
