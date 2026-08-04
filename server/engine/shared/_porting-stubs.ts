/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// Porting stubs for shared/ files whose openclaw dependencies have not been
// ported to cross-wms. Each stub declares the public types and provides a
// simplified implementation so the ported entry-status helper compiles and
// remains type-safe. Replace these stubs with real ports when the backing
// modules (entry-metadata, requirements) are brought over.
//
// References:
//   openclaw/src/shared/entry-metadata.ts — resolveEmojiAndHomepage
//   openclaw/src/shared/requirements.ts  — evaluateRequirementsFromMetadataWithRemote + types

/** Metadata describing runtime requirements for an agent or tool entry. */
export type RequirementsMetadata = {
  requires?: {
    os?: string[];
    arch?: string[];
    bin?: string[];
    env?: string[];
    config?: string[];
    remote?: RequirementRemote;
  };
};

/** A single config-path requirement check result. */
export type RequirementConfigCheck = {
  path: string;
  satisfied: boolean;
};

/** Remote requirement probe used to validate network-backed capabilities. */
export type RequirementRemote = {
  url?: string;
  headers?: Record<string, string>;
};

/** Resolved requirement categories after evaluation. */
export type Requirements = {
  os: string[];
  arch: string[];
  bin: string[];
  env: string[];
  config: string[];
  remote?: RequirementRemote;
};

/** Result of evaluating an entry's metadata requirements. */
export type EvaluatedRequirements = {
  required: Requirements;
  missing: Requirements;
  eligible: boolean;
  configChecks: RequirementConfigCheck[];
};

/** Resolves emoji and homepage metadata for an entry. */
export function resolveEmojiAndHomepage(params: {
  metadata?: (RequirementsMetadata & { emoji?: string; homepage?: string }) | null;
  frontmatter?: {
    emoji?: string;
    homepage?: string;
    website?: string;
    url?: string;
  } | null;
}): { emoji?: string; homepage?: string } {
  const emoji =
    params.frontmatter?.emoji ??
    params.metadata?.emoji ??
    undefined;
  const homepage =
    params.frontmatter?.homepage ??
    params.frontmatter?.website ??
    params.frontmatter?.url ??
    params.metadata?.homepage ??
    undefined;
  return {
    ...(emoji ? { emoji } : {}),
    ...(homepage ? { homepage } : {}),
  };
}

/** Evaluates requirements against local binaries, platform, env, and config state. */
export function evaluateRequirementsFromMetadataWithRemote(params: {
  always: boolean;
  metadata?: RequirementsMetadata | undefined;
  hasLocalBin: (bin: string) => boolean;
  localPlatform: string;
  remote?: RequirementRemote;
  isEnvSatisfied: (envName: string) => boolean;
  isConfigSatisfied: (pathStr: string) => boolean;
}): EvaluatedRequirements {
  const required: Requirements = {
    os: params.metadata?.requires?.os ?? [],
    arch: params.metadata?.requires?.arch ?? [],
    bin: params.metadata?.requires?.bin ?? [],
    env: params.metadata?.requires?.env ?? [],
    config: params.metadata?.requires?.config ?? [],
    remote: params.metadata?.requires?.remote ?? params.remote,
  };

  const missing: Requirements = {
    os: required.os.filter((os) => os !== params.localPlatform),
    arch: [],
    bin: required.bin.filter((bin) => !params.hasLocalBin(bin)),
    env: required.env.filter((env) => !params.isEnvSatisfied(env)),
    config: required.config.filter((pathStr) => !params.isConfigSatisfied(pathStr)),
  };

  const configChecks: RequirementConfigCheck[] = required.config.map((pathStr) => ({
    path: pathStr,
    satisfied: params.isConfigSatisfied(pathStr),
  }));

  const eligible =
    params.always ||
    (missing.os.length === 0 &&
      missing.arch.length === 0 &&
      missing.bin.length === 0 &&
      missing.env.length === 0 &&
      missing.config.length === 0);

  return { required, missing, eligible, configChecks };
}
