// 移植自 openclaw/src/infra/exec-safe-bin-runtime-policy.ts（降级实现）
// 解析运行时 safe-bin policy 与信任警告。
import {
  type SafeBinProfile,
  type SafeBinProfileFixture,
  type SafeBinProfileFixtures,
  normalizeSafeBinProfileFixtures,
  resolveSafeBinProfiles,
} from "./exec-approvals/exec-safe-bin-policy-profiles.js";
import { normalizeSafeBinName } from "./exec-approvals/exec-safe-bin-semantics.js";
import {
  getTrustedSafeBinDirs,
  listWritableExplicitTrustedSafeBinDirs,
  normalizeTrustedSafeBinDirs,
  type WritableTrustedSafeBinDir,
} from "./exec-safe-bin-trust.js";

export type { SafeBinProfile, SafeBinProfileFixture, SafeBinProfileFixtures, WritableTrustedSafeBinDir };

type ExecSafeBinConfigScope = {
  safeBins?: string[] | null;
  safeBinProfiles?: SafeBinProfileFixtures | null;
  safeBinTrustedDirs?: string[] | null;
};

const INTERPRETER_LIKE_SAFE_BINS = new Set([
  "ash", "awk", "bash", "busybox", "bun", "cmd", "cmd.exe", "cscript", "dash", "deno",
  "fish", "gawk", "gsed", "ksh", "lua", "mawk", "nawk", "node", "nodejs", "perl", "php",
  "powershell", "powershell.exe", "pypy", "pwsh", "pwsh.exe", "python", "python2", "python3",
  "ruby", "sed", "sh", "toybox", "wscript", "zsh",
]);

export type ResolvedSafeBinRuntimePolicy = {
  safeBins: readonly string[];
  profiles: ReadonlyMap<string, SafeBinProfile>;
  trustedDirs: readonly string[];
  writableTrustedDirs: readonly WritableTrustedSafeBinDir[];
  interpreterLikeSafeBins: readonly string[];
};

export type SafeBinTrustWarning = {
  kind: "interpreter-like" | "trusted-dir-outside-home" | "glob-in-safe-bin";
  bin: string;
  message: string;
};

/**
 * 解析运行时 safe-bin policy。
 * 降级实现：不依赖 resolveSafeBins（未移植完整），直接从 config scope 读取。
 */
export function resolveSafeBinRuntimePolicy(params: {
  cfg?: ExecSafeBinConfigScope | null;
  env?: NodeJS.ProcessEnv;
}): ResolvedSafeBinRuntimePolicy {
  const scope = params.cfg ?? {};
  const safeBins = Array.isArray(scope.safeBins) ? scope.safeBins.map(normalizeSafeBinName).filter(Boolean) : [];
  const fixtures = normalizeSafeBinProfileFixtures(scope.safeBinProfiles ?? {});
  const profiles = resolveSafeBinProfiles(fixtures);
  const trustedDirs = normalizeTrustedSafeBinDirs(scope.safeBinTrustedDirs ?? []);
  const writableTrustedDirs = listWritableExplicitTrustedSafeBinDirs(trustedDirs);
  return {
    safeBins,
    profiles: new Map(Object.entries(profiles)),
    trustedDirs,
    writableTrustedDirs,
    interpreterLikeSafeBins: safeBins.filter((bin) => INTERPRETER_LIKE_SAFE_BINS.has(bin)),
  };
}

/**
 * 收集 safe-bin 信任警告。
 * 降级实现：检查解释器类 safe-bin 与 glob 模式。
 */
export function collectSafeBinTrustWarnings(params: {
  policy: ResolvedSafeBinRuntimePolicy;
}): SafeBinTrustWarning[] {
  const warnings: SafeBinTrustWarning[] = [];
  for (const bin of params.policy.interpreterLikeSafeBins) {
    warnings.push({
      kind: "interpreter-like",
      bin,
      message: `Safe-bin "${bin}" is interpreter-like and may execute arbitrary code.`,
    });
  }
  for (const bin of params.policy.safeBins) {
    if (/[*?[\]]/.test(bin)) {
      warnings.push({
        kind: "glob-in-safe-bin",
        bin,
        message: `Safe-bin "${bin}" contains glob characters.`,
      });
    }
  }
  return warnings;
}

export { INTERPRETER_LIKE_SAFE_BINS, getTrustedSafeBinDirs, normalizeTrustedSafeBinDirs };
