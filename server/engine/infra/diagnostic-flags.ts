// 移植自 openclaw/src/infra/diagnostic-flags.ts
// 从配置和环境变量解析诊断功能标志。
//
// 降级策略：
// 1. 源文件依赖 @openclaw/normalization-core/string-coerce 的
//    normalizeLowercaseStringOrEmpty，cross-wms 中该模块位于 ./string-coerce.js，
//    此处调整导入路径。
// 2. 源文件依赖 @openclaw/normalization-core/string-normalization 的
//    normalizeUniqueStringEntriesLower，cross-wms 中该模块位于
//    ./string-normalization.js，此处调整导入路径。
// 3. 源文件依赖 ../config/types.openclaw.js 的 OpenClawConfig 类型，
//    cross-wms 中该类型位于 ../config/types/openclaw.js，此处调整导入路径。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import { normalizeUniqueStringEntriesLower } from "./string-normalization.js";
import type { OpenClawConfig } from "../config/types/openclaw.js";

const DIAGNOSTICS_ENV = "OPENCLAW_DIAGNOSTICS";

type ParsedEnvFlags = {
  flags: string[];
  disablesAll: boolean;
};

function parseEnvFlags(raw?: string): ParsedEnvFlags {
  if (!raw) {
    return { flags: [], disablesAll: false };
  }
  const trimmed = raw.trim();
  const lowered = normalizeLowercaseStringOrEmpty(trimmed);
  if (!lowered) {
    return { flags: [], disablesAll: false };
  }
  if (["0", "false", "off", "none"].includes(lowered)) {
    return { flags: [], disablesAll: true };
  }
  if (["1", "true", "all", "*"].includes(lowered)) {
    return { flags: ["*"], disablesAll: false };
  }
  return {
    flags: trimmed
      .split(/[,\s]+/)
      .map((value) => normalizeLowercaseStringOrEmpty(value))
      .filter(Boolean),
    disablesAll: false,
  };
}

function uniqueFlags(flags: string[]): string[] {
  return normalizeUniqueStringEntriesLower(flags);
}

/** Resolves enabled diagnostic flags from config plus `OPENCLAW_DIAGNOSTICS` overrides. */
export function resolveDiagnosticFlags(
  cfg?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configFlags = Array.isArray(cfg?.diagnostics?.flags) ? cfg?.diagnostics?.flags : [];
  const envFlags = parseEnvFlags(env[DIAGNOSTICS_ENV]);
  if (envFlags.disablesAll) {
    return [];
  }
  return uniqueFlags([...configFlags, ...envFlags.flags]);
}

/** Matches one diagnostic flag against exact, wildcard, and namespace-enabled flags. */
export function matchesDiagnosticFlag(flag: string, enabledFlags: string[]): boolean {
  const target = normalizeLowercaseStringOrEmpty(flag);
  if (!target) {
    return false;
  }
  for (const raw of enabledFlags) {
    const enabled = normalizeLowercaseStringOrEmpty(raw);
    if (!enabled) {
      continue;
    }
    if (enabled === "*" || enabled === "all") {
      return true;
    }
    if (enabled.endsWith(".*")) {
      const prefix = enabled.slice(0, -2);
      if (target === prefix || target.startsWith(`${prefix}.`)) {
        return true;
      }
    }
    if (enabled.endsWith("*")) {
      const prefix = enabled.slice(0, -1);
      if (target.startsWith(prefix)) {
        return true;
      }
    }
    if (enabled === target) {
      return true;
    }
  }
  return false;
}

/** Returns whether a diagnostic flag is enabled after config/env resolution. */
export function isDiagnosticFlagEnabled(
  flag: string,
  cfg?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flags = resolveDiagnosticFlags(cfg, env);
  return matchesDiagnosticFlag(flag, flags);
}
