/**
 * Converts user-facing sandbox tool policy config into the normalized runtime
 * allow/deny policy object used by tool filtering.
 *
 * 移植自 openclaw/src/agents/sandbox-tool-policy.ts
 * 降级策略：
 *  - uniqueStrings 内联实现（来自 @openclaw/normalization-core/string-normalization）
 *  - SandboxToolPolicy 在 cross-wms 的 sandbox/types 中不存在，定义本地最小类型
 */

// 降级类型：SandboxToolPolicy 的最小占位（openclaw 的 ./sandbox/types.js 中定义）
export type SandboxToolPolicy = {
  allow?: string[];
  deny?: string[];
};

/** Provenance marker for wildcard allowlists created from `alsoAllow`. */
export const IMPLICIT_ALLOW_ALL_FROM_ALSO_ALLOW = Symbol.for(
  "openclaw.toolPolicy.implicitAllowAllFromAlsoAllow",
);

type SandboxToolPolicyConfig = {
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
};

// 降级实现：uniqueStrings 来自 @openclaw/normalization-core/string-normalization
function uniqueStrings(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function unionAllow(base?: string[], extra?: string[]): string[] | undefined {
  // `alsoAllow` extends an existing allow list. Without an explicit allow list it
  // means "allow defaults plus these extras", represented by implicit "*".
  if (!Array.isArray(extra) || extra.length === 0) {
    return base;
  }
  if (!Array.isArray(base)) {
    return uniqueStrings(["*", ...extra]);
  }
  if (base.length === 0) {
    return uniqueStrings(["*", ...extra]);
  }
  return uniqueStrings([...base, ...extra]);
}

function hasExplicitAllowAll(list?: string[]): boolean {
  return Array.isArray(list) && list.some((entry) => entry.trim() === "*");
}

/** Picks the effective sandbox tool policy from allow/alsoAllow/deny config. */
export function pickSandboxToolPolicy(
  config?: SandboxToolPolicyConfig,
): SandboxToolPolicy | undefined {
  if (!config) {
    return undefined;
  }
  const allowFromAlsoAllowOnly =
    !Array.isArray(config.allow) &&
    Array.isArray(config.alsoAllow) &&
    config.alsoAllow.length > 0 &&
    !hasExplicitAllowAll(config.alsoAllow);
  const allow = Array.isArray(config.allow)
    ? unionAllow(config.allow, config.alsoAllow)
    : Array.isArray(config.alsoAllow) && config.alsoAllow.length > 0
      ? unionAllow(undefined, config.alsoAllow)
      : undefined;
  const deny = Array.isArray(config.deny) ? config.deny : undefined;
  if (!allow && !deny) {
    return undefined;
  }
  const policy = { allow, deny } as SandboxToolPolicy & {
    [IMPLICIT_ALLOW_ALL_FROM_ALSO_ALLOW]?: true;
  };
  if (allowFromAlsoAllowOnly) {
    // Preserve provenance for downstream diagnostics: this allow-all came from
    // `alsoAllow`, not from an operator-authored explicit wildcard.
    Object.defineProperty(policy, IMPLICIT_ALLOW_ALL_FROM_ALSO_ALLOW, {
      value: true,
    });
  }
  return policy;
}
