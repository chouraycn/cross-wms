// Checks plugin minimum host version compatibility.
//
// 移植自 openclaw/src/plugins/min-host-version.ts。
//
// 降级策略：
//  - 原文件依赖 `@openclaw/normalization-core/string-coerce` 的
//    `normalizeOptionalString`。改用 cross-wms 的 `../infra/string-coerce.js`，
//    该模块已提供同名导出，行为一致。
//  - 原文件依赖 `../infra/runtime-guard.js` 的 `parseSemver` 与 `isAtLeast`。
//    cross-wms 的 infra 未移植 runtime-guard，这里内联实现降级版本：
//    基于 cross-wms 已有的 `parseComparableSemver` 与 `compareComparableSemver`
//    （位于 `../infra/semver-compare.js`）封装出 `parseSemver` / `isAtLeast`
//    兼容签名，保留原模块的语义与返回值契约。

import { compareComparableSemver, parseComparableSemver } from "../infra/semver-compare.js";
import { normalizeOptionalString } from "../infra/string-coerce.js";

/** Validation message for plugin minHostVersion manifest fields. */
export const MIN_HOST_VERSION_FORMAT =
  'openclaw.install.minHostVersion must use a semver floor in the form ">=x.y.z[-prerelease][+build]"';
const SEMVER_LABEL_RE = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const MIN_HOST_VERSION_RE = new RegExp(`^>=(${SEMVER_LABEL_RE})$`);
const LEGACY_MIN_HOST_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parsed plugin minimum host version requirement. */
export type MinHostVersionRequirement = {
  raw: string;
  minimumLabel: string;
};

// ============================================================================
// 内联降级：../infra/runtime-guard.js —— parseSemver / isAtLeast
// ============================================================================

/**
 * 解析的 semver 值（降级占位类型）。
 *
 * 降级说明：原 openclaw runtime-guard 的 `ParsedSemver` 是不透明类型，
 * 这里复用 cross-wms `semver-compare.js` 的 `ComparableSemver` 返回类型。
 * 仅作为 `parseSemver` / `isAtLeast` 之间的传递类型，不对外暴露。
 */
type ParsedSemver = ReturnType<typeof parseComparableSemver>;

/**
 * 解析 semver 字符串。
 *
 * 降级说明：委托给 cross-wms 的 `parseComparableSemver`，行为与 openclaw
 * runtime-guard 的 `parseSemver` 一致（不支持 build 元数据的严格校验，
 * 但满足 minHostVersion 比较需求）。
 */
function parseSemver(version: string): ParsedSemver {
  return parseComparableSemver(version);
}

/**
 * 判断 current 是否 >= minimum。
 *
 * 降级说明：委托给 cross-wms 的 `compareComparableSemver`。当任一侧无法解析
 * 时返回 false（保守降级，避免误判兼容）。
 */
function isAtLeast(current: ParsedSemver, minimum: ParsedSemver): boolean {
  const result = compareComparableSemver(current, minimum);
  return result !== null && result >= 0;
}

/** Result of checking a plugin minHostVersion against the current host. */
export type MinHostVersionCheckResult =
  | { ok: true; requirement: MinHostVersionRequirement | null }
  | { ok: false; kind: "invalid"; error: string }
  | { ok: false; kind: "unknown_host_version"; requirement: MinHostVersionRequirement }
  | {
      ok: false;
      kind: "incompatible";
      requirement: MinHostVersionRequirement;
      currentVersion: string;
    };

/** Parses a plugin minHostVersion manifest field. */
export function parseMinHostVersionRequirement(
  raw: unknown,
  options: { allowLegacyBareSemver?: boolean } = {},
): MinHostVersionRequirement | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const match =
    trimmed.match(MIN_HOST_VERSION_RE) ??
    (options.allowLegacyBareSemver ? trimmed.match(LEGACY_MIN_HOST_VERSION_RE) : null);
  if (!match) {
    return null;
  }
  const minimumLabel = match.length >= 4 ? `${match[1]}.${match[2]}.${match[3]}` : (match[1] ?? "");
  if (!parseSemver(minimumLabel)) {
    return null;
  }
  return {
    raw: trimmed,
    minimumLabel,
  };
}

/** Checks whether the current host satisfies a plugin minHostVersion requirement. */
export function checkMinHostVersion(params: {
  currentVersion: string | undefined;
  minHostVersion: unknown;
  allowLegacyBareSemver?: boolean;
}): MinHostVersionCheckResult {
  if (params.minHostVersion === undefined) {
    return { ok: true, requirement: null };
  }
  const requirement = parseMinHostVersionRequirement(params.minHostVersion, {
    allowLegacyBareSemver: params.allowLegacyBareSemver,
  });
  if (!requirement) {
    return { ok: false, kind: "invalid", error: MIN_HOST_VERSION_FORMAT };
  }
  const currentVersion = normalizeOptionalString(params.currentVersion) || "unknown";
  const currentSemver = parseSemver(currentVersion);
  if (!currentSemver) {
    return {
      ok: false,
      kind: "unknown_host_version",
      requirement,
    };
  }
  const minimumSemver = parseSemver(requirement.minimumLabel);
  if (!minimumSemver || !isAtLeast(currentSemver, minimumSemver)) {
    return {
      ok: false,
      kind: "incompatible",
      requirement,
      currentVersion,
    };
  }
  return { ok: true, requirement };
}
