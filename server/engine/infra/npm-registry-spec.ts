// 将 npm registry 规范解析为包、版本和 tag 引用。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";

const EXACT_SEMVER_VERSION_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const OPENCLAW_STABLE_CORRECTION_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)-(?<correction>[1-9]\d*)$/;
const OPENCLAW_STABLE_VERSION_RE = /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)$/;
const OPENCLAW_ALPHA_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)-alpha\.(?<alpha>[1-9]\d*)$/;
const OPENCLAW_BETA_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]\d?)\.(?<patch>[1-9]\d*)-beta\.(?<beta>[1-9]\d*)$/;
const DIST_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 解析的月度补丁 OpenClaw 发布版本，用于通道感知排序。 */
type OpenClawReleaseVersion = {
  channel: "alpha" | "beta" | "stable";
  year: number;
  month: number;
  patch: number;
  alphaNumber?: number;
  betaNumber?: number;
  correctionNumber?: number;
};

/**
 * 解析的仅 registry npm 规范，被插件安装流程接受。
 * 选择器仅限于精确版本和 dist-tag；URL/git/file 规范
 * 在它们能在 gateway 主机上执行之前被拒绝。
 */
export type ParsedRegistryNpmSpec = {
  name: string;
  raw: string;
  selector?: string;
  selectorKind: "none" | "exact-version" | "tag";
  selectorIsPrerelease: boolean;
};

function parseRegistryNpmSpecInternal(
  rawSpec: string,
): { ok: true; parsed: ParsedRegistryNpmSpec } | { ok: false; error: string } {
  const spec = rawSpec.trim();
  if (!spec) {
    return { ok: false, error: "missing npm spec" };
  }
  if (/\s/.test(spec)) {
    return { ok: false, error: "unsupported npm spec: whitespace is not allowed" };
  }
  // 仅 registry：不允许 URL、git、file 或 alias 协议。
  // 保持严格：这在 gateway 主机上运行。
  if (spec.includes("://")) {
    return { ok: false, error: "unsupported npm spec: URLs are not allowed" };
  }
  if (spec.includes("#")) {
    return { ok: false, error: "unsupported npm spec: git refs are not allowed" };
  }
  if (spec.includes(":")) {
    return { ok: false, error: "unsupported npm spec: protocol specs are not allowed" };
  }

  const at = spec.lastIndexOf("@");
  const hasSelector = at > 0;
  const name = hasSelector ? spec.slice(0, at) : spec;
  const selector = hasSelector ? spec.slice(at + 1) : "";

  // 仅接受 registry 包名；文件路径、别名和 URL/git 规范
  // 在此处之前被故意拒绝，因为插件安装在 gateway 主机上运行。
  const unscopedName = /^[a-z0-9][a-z0-9-._~]*$/;
  const scopedName = /^@[a-z0-9][a-z0-9-._~]*\/[a-z0-9][a-z0-9-._~]*$/;
  const isValidName = name.startsWith("@") ? scopedName.test(name) : unscopedName.test(name);
  if (!isValidName) {
    return {
      ok: false,
      error: "unsupported npm spec: expected <name> or <name>@<version> from the npm registry",
    };
  }
  if (!hasSelector) {
    return {
      ok: true,
      parsed: {
        name,
        raw: spec,
        selectorKind: "none",
        selectorIsPrerelease: false,
      },
    };
  }
  if (!selector) {
    return { ok: false, error: "unsupported npm spec: missing version/tag after @" };
  }
  if (/[\\/]/.test(selector)) {
    return { ok: false, error: "unsupported npm spec: invalid version/tag" };
  }
  const exactVersionMatch = EXACT_SEMVER_VERSION_RE.exec(selector);
  if (exactVersionMatch) {
    return {
      ok: true,
      parsed: {
        name,
        raw: spec,
        selector,
        selectorKind: "exact-version",
        selectorIsPrerelease:
          Boolean(exactVersionMatch[4]) && !isOpenClawStableCorrectionVersion(selector),
      },
    };
  }
  if (!DIST_TAG_RE.test(selector)) {
    return {
      ok: false,
      error: "unsupported npm spec: use an exact version or dist-tag (ranges are not allowed)",
    };
  }
  return {
    ok: true,
    parsed: {
      name,
      raw: spec,
      selector,
      selectorKind: "tag",
      selectorIsPrerelease: false,
    },
  };
}

/** 将仅 registry npm 包规范解析为包名和可选选择器元数据。 */
export function parseRegistryNpmSpec(rawSpec: string): ParsedRegistryNpmSpec | null {
  const parsed = parseRegistryNpmSpecInternal(rawSpec);
  return parsed.ok ? parsed.parsed : null;
}

/** 返回用户提供的 npm 规范是否解析到官方 OpenClaw npm 范围。 */
export function isOpenClawOrgNpmSpec(rawSpec: string | undefined): boolean {
  const parsed = rawSpec ? parseRegistryNpmSpec(rawSpec) : null;
  return parsed?.name.startsWith("@openclaw/") === true;
}

/** 验证仅 registry npm 规范，被拒绝时返回面向用户的错误。 */
export function validateRegistryNpmSpec(rawSpec: string): string | null {
  const parsed = parseRegistryNpmSpecInternal(rawSpec);
  return parsed.ok ? null : parsed.error;
}

/** 返回值是否为精确 semver 选择器，可选前导 `v`。 */
export function isExactSemverVersion(value: string): boolean {
  return EXACT_SEMVER_VERSION_RE.test(value.trim());
}

/** 解析 OpenClaw 的月度补丁 stable/alpha/beta/correction 版本格式。 */
function parseOpenClawReleaseVersion(value: string): OpenClawReleaseVersion | null {
  const trimmed = value.trim();
  const candidates = [
    { match: OPENCLAW_STABLE_VERSION_RE.exec(trimmed), channel: "stable" as const },
    { match: OPENCLAW_STABLE_CORRECTION_VERSION_RE.exec(trimmed), channel: "stable" as const },
    { match: OPENCLAW_ALPHA_VERSION_RE.exec(trimmed), channel: "alpha" as const },
    { match: OPENCLAW_BETA_VERSION_RE.exec(trimmed), channel: "beta" as const },
  ];
  const candidate = candidates.find((entry) => entry.match?.groups);
  if (!candidate?.match?.groups) {
    return null;
  }

  const year = Number.parseInt(candidate.match.groups.year ?? "", 10);
  const month = Number.parseInt(candidate.match.groups.month ?? "", 10);
  const patch = Number.parseInt(candidate.match.groups.patch ?? "", 10);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(patch) ||
    month < 1 ||
    month > 12 ||
    patch < 1
  ) {
    return null;
  }

  const correctionNumber =
    candidate.channel === "stable" && candidate.match.groups.correction
      ? Number.parseInt(candidate.match.groups.correction, 10)
      : undefined;
  // 稳定修正版本共享稳定通道排名；
  // 可选的修正号稍后比较，使基础稳定排在修正之前。
  const alphaNumber =
    candidate.channel === "alpha"
      ? Number.parseInt(candidate.match.groups.alpha ?? "", 10)
      : undefined;
  const betaNumber =
    candidate.channel === "beta"
      ? Number.parseInt(candidate.match.groups.beta ?? "", 10)
      : undefined;

  return {
    channel: candidate.channel,
    year,
    month,
    patch,
    correctionNumber,
    alphaNumber,
    betaNumber,
  };
}

/** 返回版本是否为 OpenClaw 月度补丁稳定修正版本。 */
export function isOpenClawStableCorrectionVersion(value: string): boolean {
  const parsed = parseOpenClawReleaseVersion(value);
  return parsed?.channel === "stable" && parsed.correctionNumber !== undefined;
}

/** 跨 alpha、beta、stable 和修正版本比较 OpenClaw 月度补丁发布版本。 */
export function compareOpenClawReleaseVersions(left: string, right: string): number | null {
  const parsedLeft = parseOpenClawReleaseVersion(left);
  const parsedRight = parseOpenClawReleaseVersion(right);
  if (!parsedLeft || !parsedRight) {
    return null;
  }
  if (parsedLeft.year !== parsedRight.year) {
    return parsedLeft.year < parsedRight.year ? -1 : 1;
  }
  if (parsedLeft.month !== parsedRight.month) {
    return parsedLeft.month < parsedRight.month ? -1 : 1;
  }
  if (parsedLeft.patch !== parsedRight.patch) {
    return parsedLeft.patch < parsedRight.patch ? -1 : 1;
  }
  if (parsedLeft.channel !== parsedRight.channel) {
    const rank = { alpha: 0, beta: 1, stable: 2 };
    return rank[parsedLeft.channel] < rank[parsedRight.channel] ? -1 : 1;
  }
  if (parsedLeft.channel === "alpha") {
    return Math.sign((parsedLeft.alphaNumber ?? 0) - (parsedRight.alphaNumber ?? 0));
  }
  if (parsedLeft.channel === "beta") {
    return Math.sign((parsedLeft.betaNumber ?? 0) - (parsedRight.betaNumber ?? 0));
  }
  return Math.sign((parsedLeft.correctionNumber ?? 0) - (parsedRight.correctionNumber ?? 0));
}

/** 返回精确 semver 值是否为预发布，排除稳定修正版本。 */
export function isPrereleaseSemverVersion(value: string): boolean {
  const trimmed = value.trim();
  const match = EXACT_SEMVER_VERSION_RE.exec(trimmed);
  return Boolean(match?.[4]) && !isOpenClawStableCorrectionVersion(trimmed);
}

/**
 * 在 npm 规范可能解析为预发布之前强制显式选择。
 * 裸规范和 `latest` 保持稳定版本，除非解析的版本
 * 是 OpenClaw 稳定修正。
 */
export function isPrereleaseResolutionAllowed(params: {
  spec: ParsedRegistryNpmSpec;
  resolvedVersion?: string;
}): boolean {
  if (!params.resolvedVersion || !isPrereleaseSemverVersion(params.resolvedVersion)) {
    return true;
  }
  // 裸规范和 `latest` 不应漂移到 beta/rc 构建；
  // 预发布需要 tag 或精确预发布选择器以保持自动化稳定。
  if (params.spec.selectorKind === "none") {
    return false;
  }
  if (params.spec.selectorKind === "exact-version") {
    return params.spec.selectorIsPrerelease;
  }
  return normalizeLowercaseStringOrEmpty(params.spec.selector) !== "latest";
}

/** 格式化当 registry 规范解析为不允许的预发布时显示的安装错误。 */
export function formatPrereleaseResolutionError(params: {
  spec: ParsedRegistryNpmSpec;
  resolvedVersion: string;
}): string {
  const selectorHint =
    params.spec.selectorKind === "none" ||
    normalizeLowercaseStringOrEmpty(params.spec.selector) === "latest"
      ? `Use "${params.spec.name}@beta" (or another prerelease tag) or an exact prerelease version to opt in explicitly.`
      : `Use an explicit prerelease tag or exact prerelease version if you want prerelease installs.`;
  return `Resolved ${params.spec.raw} to prerelease version ${params.resolvedVersion}, but prereleases are only installed when explicitly requested. ${selectorHint}`;
}
