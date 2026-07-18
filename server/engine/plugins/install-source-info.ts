// Describes package-authored plugin install source metadata and pinning warnings.
//
// 移植自 openclaw/src/plugins/install-source-info.ts。
//
// 降级策略：
//  - 原文件依赖 `@openclaw/normalization-core/string-coerce` 的
//    `normalizeOptionalString`。改用 cross-wms 的 `../infra/string-coerce.js`，
//    该模块已提供同名导出，行为一致。
//  - 原文件依赖 `../infra/clawhub-spec.js` 的 `parseClawHubPluginSpec`。
//    cross-wms 的 `clawhub-spec.js` 使用了不同的 API（zod schema 风格），
//    未导出 `parseClawHubPluginSpec`，这里内联实现完整逻辑，与 openclaw
//    原版行为一致（解析 `clawhub:<name>[@version]` 规范）。
//  - 原文件依赖 `../infra/npm-registry-spec.js` 的 `parseRegistryNpmSpec` 与
//    `ParsedRegistryNpmSpec`。cross-wms 已移植同名导出，直接使用。
//  - 原文件依赖 `./manifest.js` 的 `PluginPackageInstall` 类型。cross-wms 的
//    `manifest-types.js` 未导出该类型，这里内联定义结构兼容的类型占位。

import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../infra/string-coerce.js";
import {
  parseRegistryNpmSpec,
  type ParsedRegistryNpmSpec,
} from "../infra/npm-registry-spec.js";

// ============================================================================
// 内联降级：../infra/clawhub-spec.js —— parseClawHubPluginSpec
// ============================================================================

/**
 * 解析 `clawhub:<name>[@version]` 规范的结果。
 * 与 openclaw `infra/clawhub-spec.js` 的 `parseClawHubPluginSpec` 返回类型一致。
 */
type ParsedClawHubPluginSpec = {
  name: string;
  version?: string;
  baseUrl?: string;
};

/**
 * 解析显式 `clawhub:<name>[@version]` 包规范。
 *
 * 降级说明：cross-wms 的 `clawhub-spec.js` 使用了不同的 API（zod schema），
 * 未导出 `parseClawHubPluginSpec`。这里内联实现 openclaw 原版的完整逻辑，
 * 保持 `install-source-info.ts` 的解析行为不变。
 */
function parseClawHubPluginSpec(raw: string): ParsedClawHubPluginSpec | null {
  const trimmed = raw.trim();
  if (!normalizeLowercaseStringOrEmpty(trimmed).startsWith("clawhub:")) {
    return null;
  }
  const spec = trimmed.slice("clawhub:".length).trim();
  if (!spec) {
    return null;
  }
  const atIndex = spec.lastIndexOf("@");
  if (atIndex <= 0) {
    return { name: spec };
  }
  if (atIndex >= spec.length - 1) {
    return null;
  }
  const name = spec.slice(0, atIndex).trim();
  const version = spec.slice(atIndex + 1).trim();
  if (!name || !version) {
    return null;
  }
  return {
    name,
    version,
  };
}

// ============================================================================
// 内联降级：./manifest.js —— PluginPackageInstall 类型占位
// ============================================================================

/**
 * 插件包安装元数据（降级类型占位）。
 *
 * 降级原因：cross-wms 的 `manifest-types.js` 未导出 `PluginPackageInstall`。
 * 这里定义与 openclaw `manifest.ts` 结构兼容的类型，仅包含
 * `install-source-info.ts` 实际访问的字段。
 */
type PluginPackageInstall = {
  clawhubSpec?: string;
  npmSpec?: string;
  localPath?: string;
  defaultChoice?: "clawhub" | "npm" | "local";
  expectedIntegrity?: string;
};

// ============================================================================
// Install source info 实现
// ============================================================================

/** Warning emitted while describing plugin package install source metadata. */
export type PluginInstallSourceWarning =
  | "invalid-clawhub-spec"
  | "invalid-npm-spec"
  | "invalid-default-choice"
  | "default-choice-missing-source"
  | "clawhub-spec-floating"
  | "npm-integrity-without-source"
  | "npm-spec-floating"
  | "npm-spec-missing-integrity"
  | "npm-spec-package-name-mismatch";

/** Pinning state for npm plugin install metadata. */
export type PluginInstallNpmPinState =
  | "exact-with-integrity"
  | "exact-without-integrity"
  | "floating-with-integrity"
  | "floating-without-integrity";

/** Parsed npm install source metadata for a plugin package. */
export type PluginInstallNpmSourceInfo = {
  spec: string;
  packageName: string;
  expectedPackageName?: string;
  selector?: string;
  selectorKind: ParsedRegistryNpmSpec["selectorKind"];
  exactVersion: boolean;
  expectedIntegrity?: string;
  pinState: PluginInstallNpmPinState;
};

/** Parsed local install source metadata for a plugin package. */
export type PluginInstallLocalSourceInfo = {
  path: string;
};

/** Parsed ClawHub install source metadata for a plugin package. */
export type PluginInstallClawHubSourceInfo = {
  spec: string;
  packageName: string;
  version?: string;
  exactVersion: boolean;
};

/** Parsed plugin install sources plus validation warnings. */
export type PluginInstallSourceInfo = {
  defaultChoice?: PluginPackageInstall["defaultChoice"];
  clawhub?: PluginInstallClawHubSourceInfo;
  npm?: PluginInstallNpmSourceInfo;
  local?: PluginInstallLocalSourceInfo;
  warnings: readonly PluginInstallSourceWarning[];
};

/** Options for describing expected plugin install source metadata. */
export type DescribePluginInstallSourceOptions = {
  expectedPackageName?: string | null;
};

function resolveNpmPinState(params: {
  exactVersion: boolean;
  hasIntegrity: boolean;
}): PluginInstallNpmPinState {
  if (params.exactVersion) {
    return params.hasIntegrity ? "exact-with-integrity" : "exact-without-integrity";
  }
  return params.hasIntegrity ? "floating-with-integrity" : "floating-without-integrity";
}

function resolveDefaultChoice(value: unknown): PluginPackageInstall["defaultChoice"] | undefined {
  return value === "clawhub" || value === "npm" || value === "local" ? value : undefined;
}

function normalizeExpectedPackageName(value: string | null | undefined): string | undefined {
  const expected = normalizeOptionalString(value);
  if (!expected) {
    return undefined;
  }
  return parseRegistryNpmSpec(expected)?.name ?? expected;
}

/** Describes plugin install source metadata and warnings without mutating manifests. */
export function describePluginInstallSource(
  install: PluginPackageInstall,
  options?: DescribePluginInstallSourceOptions,
): PluginInstallSourceInfo {
  const clawhubSpec = normalizeOptionalString(install.clawhubSpec);
  const npmSpec = normalizeOptionalString(install.npmSpec);
  const localPath = normalizeOptionalString(install.localPath);
  const defaultChoice = resolveDefaultChoice(install.defaultChoice);
  const expectedIntegrity = normalizeOptionalString(install.expectedIntegrity);
  const expectedPackageName = normalizeExpectedPackageName(options?.expectedPackageName);
  const warnings: PluginInstallSourceWarning[] = [];
  let clawhub: PluginInstallClawHubSourceInfo | undefined;
  let npm: PluginInstallNpmSourceInfo | undefined;

  if (install.defaultChoice !== undefined && !defaultChoice) {
    warnings.push("invalid-default-choice");
  }

  if (clawhubSpec) {
    const parsed = parseClawHubPluginSpec(clawhubSpec);
    if (parsed) {
      if (!parsed.version) {
        warnings.push("clawhub-spec-floating");
      }
      clawhub = {
        spec: clawhubSpec,
        packageName: parsed.name,
        ...(parsed.version ? { version: parsed.version } : {}),
        exactVersion: Boolean(parsed.version),
      };
    } else {
      warnings.push("invalid-clawhub-spec");
    }
  }

  if (npmSpec) {
    const parsed = parseRegistryNpmSpec(npmSpec);
    if (parsed) {
      const exactVersion = parsed.selectorKind === "exact-version";
      const hasIntegrity = Boolean(expectedIntegrity);
      if (!exactVersion) {
        warnings.push("npm-spec-floating");
      }
      if (!hasIntegrity) {
        warnings.push("npm-spec-missing-integrity");
      }
      if (expectedPackageName && parsed.name !== expectedPackageName) {
        warnings.push("npm-spec-package-name-mismatch");
      }
      npm = {
        spec: parsed.raw,
        packageName: parsed.name,
        ...(expectedPackageName && parsed.name !== expectedPackageName
          ? { expectedPackageName }
          : {}),
        selectorKind: parsed.selectorKind,
        exactVersion,
        pinState: resolveNpmPinState({ exactVersion, hasIntegrity }),
        ...(parsed.selector ? { selector: parsed.selector } : {}),
        ...(expectedIntegrity ? { expectedIntegrity } : {}),
      };
    } else {
      warnings.push("invalid-npm-spec");
    }
  }
  if (defaultChoice === "clawhub" && !clawhub) {
    warnings.push("default-choice-missing-source");
  }
  if (defaultChoice === "npm" && !npm) {
    warnings.push("default-choice-missing-source");
  }
  if (defaultChoice === "local" && !localPath) {
    warnings.push("default-choice-missing-source");
  }
  if (expectedIntegrity && !npm) {
    warnings.push("npm-integrity-without-source");
  }

  return {
    ...(defaultChoice ? { defaultChoice } : {}),
    ...(clawhub ? { clawhub } : {}),
    ...(npm ? { npm } : {}),
    ...(localPath ? { local: { path: localPath } } : {}),
    warnings,
  };
}
