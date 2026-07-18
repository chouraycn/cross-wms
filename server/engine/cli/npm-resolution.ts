// Helpers for recording npm plugin installs with optional exact-version pinning metadata.
// 移植自 openclaw/src/cli/npm-resolution.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/install-source-utils.js` 的 `buildNpmResolutionFields`
//    与 `NpmSpecResolution` 类型。该模块在 cross-wms 中尚未移植；
//    这里内联降级实现，保留函数签名以便未来替换为正式实现。

// ===== 内联降级：NpmSpecResolution =====
/** Npm spec resolution metadata (degraded placeholder). */
export type NpmSpecResolution = {
  resolvedName?: string;
  resolvedVersion?: string;
  resolvedSpec?: string;
  integrity?: string;
  shasum?: string;
  resolvedAt?: string;
};
// ===== NpmSpecResolution 结束 =====

// ===== 内联降级：buildNpmResolutionFields =====
function buildNpmResolutionFields(resolution?: NpmSpecResolution): Partial<NpmSpecResolution> {
  if (!resolution) {
    return {};
  }
  const fields: Partial<NpmSpecResolution> = {};
  if (resolution.resolvedName) {
    fields.resolvedName = resolution.resolvedName;
  }
  if (resolution.resolvedVersion) {
    fields.resolvedVersion = resolution.resolvedVersion;
  }
  if (resolution.resolvedSpec) {
    fields.resolvedSpec = resolution.resolvedSpec;
  }
  if (resolution.integrity) {
    fields.integrity = resolution.integrity;
  }
  if (resolution.shasum) {
    fields.shasum = resolution.shasum;
  }
  if (resolution.resolvedAt) {
    fields.resolvedAt = resolution.resolvedAt;
  }
  return fields;
}
// ===== buildNpmResolutionFields 结束 =====

/** Choose the install-record spec for an npm package, optionally pinning to the resolved version. */
export function resolvePinnedNpmSpec(params: {
  rawSpec: string;
  pin: boolean;
  resolvedSpec?: string;
}): { recordSpec: string; pinWarning?: string; pinNotice?: string } {
  const recordSpec = params.pin && params.resolvedSpec ? params.resolvedSpec : params.rawSpec;
  if (!params.pin) {
    return { recordSpec };
  }
  if (!params.resolvedSpec) {
    return {
      recordSpec,
      pinWarning: "Could not resolve exact npm version for --pin; storing original npm spec.",
    };
  }
  return {
    recordSpec,
    pinNotice: `Pinned npm install record to ${params.resolvedSpec}.`,
  };
}

/** Build the npm section of a plugin install record. */
export function buildNpmInstallRecordFields(params: {
  spec: string;
  installPath: string;
  version?: string;
  resolution?: NpmSpecResolution;
}): {
  source: "npm";
  spec: string;
  installPath: string;
  version?: string;
  resolvedName?: string;
  resolvedVersion?: string;
  resolvedSpec?: string;
  integrity?: string;
  shasum?: string;
  resolvedAt?: string;
} {
  return {
    source: "npm",
    spec: params.spec,
    installPath: params.installPath,
    version: params.version,
    ...buildNpmResolutionFields(params.resolution),
  };
}

/** Resolve and log npm pinning decisions before constructing the persisted install record. */
export function resolvePinnedNpmInstallRecord(params: {
  rawSpec: string;
  pin: boolean;
  installPath: string;
  version?: string;
  resolution?: NpmSpecResolution;
}): {
  recordSpec: string;
  pinWarning?: string;
  pinNotice?: string;
  fields: ReturnType<typeof buildNpmInstallRecordFields>;
} {
  const { recordSpec, pinWarning, pinNotice } = resolvePinnedNpmSpec({
    rawSpec: params.rawSpec,
    pin: params.pin,
    resolvedSpec: params.resolution?.resolvedSpec,
  });
  const fields = buildNpmInstallRecordFields({
    spec: recordSpec,
    installPath: params.installPath,
    version: params.version,
    resolution: params.resolution,
  });
  return { recordSpec, pinWarning, pinNotice, fields };
}
