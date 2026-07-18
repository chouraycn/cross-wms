// 移植自 openclaw/src/config/state-dir-dotenv.ts
// 加载 state-directory dotenv 条目，用于配置和运行时启动。
//
// 降级策略：
// 1. 源文件依赖 dotenv 包的 parse 函数。cross-wms 未安装 dotenv 包，但
//    infra/dotenv.ts 导出了功能等价的 parseDotenv 函数。此处使用 parseDotenv
//    替代 dotenv.parse。
// 2. 源文件依赖 ./paths.js 的 resolveStateDir。cross-wms 的 paths.ts 未导出
//    此函数（仅有 resolveConfigDir）。此处内联降级实现：检查 OPENCLAW_STATE_DIR
//    环境变量，回退到 ~/.openclaw。
// 3. 源文件依赖 ./types.js 的 OpenClawConfig 类型，cross-wms 中该类型位于
//    ./types/openclaw.js，此处调整导入路径。
// 4. 其余依赖（../infra/host-env-security.js、./config-env-vars.js、
//    ./future-version-guard.js）均已就绪。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDotenv } from "../infra/dotenv.js";
import {
  isDangerousHostEnvOverrideVarName,
  isDangerousHostEnvVarName,
  normalizeEnvVarKey,
} from "../infra/host-env-security.js";
import { collectConfigServiceEnvVars } from "./config-env-vars.js";
import { ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV } from "./future-version-guard.js";
import type { OpenClawConfig } from "./types/openclaw.js";

/**
 * 降级实现：openclaw 的 resolveStateDir 检查 OPENCLAW_STATE_DIR 环境变量，
 * 支持遗留状态目录（.clawdbot），并回退到 ~/.openclaw。此处简化为检查
 * 环境变量并回退到 ~/.openclaw，与 openclaw 的默认行为一致。
 */
function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  const home = os.homedir();
  return path.join(home, ".openclaw");
}

function isBlockedServiceEnvVar(key: string): boolean {
  return (
    key.toUpperCase() === ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV ||
    isDangerousHostEnvVarName(key) ||
    isDangerousHostEnvOverrideVarName(key)
  );
}

function unwrapMatchingLiteralQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value.at(-1);
  if ((first === `"` || first === `'`) && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

/** Returns true when a dotenv value is only a shell reference, not an expanded secret. */
export function isUnresolvedShellReference(value: string): boolean {
  const candidate = unwrapMatchingLiteralQuotes(value.trim());
  // Match only values whose entire content is a shell variable reference:
  //   $VAR_NAME          (simple reference, OpenClaw env-var style)
  //   ${VAR_NAME}        (brace-form reference)
  //   $(command)         (command substitution)
  // A real credential that merely contains a $ (e.g. "abc$2!", "$100") is NOT matched.
  return (
    /^\$[A-Z_][A-Z0-9_]*$/.test(candidate) ||
    /^\$\{[A-Z_][A-Z0-9_]*[^}]*\}$/.test(candidate) ||
    /^\$\([^)]*\)$/.test(candidate)
  );
}

type ParsedStateDirDotEnv = {
  /** Keys whose values are persisted to the managed service environment. */
  entries: Record<string, string>;
  /**
   * Keys that were dropped because their entire value was an unresolved shell
   * reference ($VAR, ${VAR}, or $(cmd)). These are still OpenClaw-managed keys:
   * a previously generated env file may carry a stale literal reference for them
   * that must be removed on re-stage rather than preserved as an operator secret.
   */
  skippedShellReferenceKeys: string[];
};

function parseStateDirDotEnvContent(content: string): ParsedStateDirDotEnv {
  const parsed = parseDotenv(content);
  const entries: Record<string, string> = {};
  const skippedShellReferenceKeys: string[] = [];
  for (const [rawKey, value] of Object.entries(parsed)) {
    if (!value?.trim()) {
      continue;
    }
    const key = normalizeEnvVarKey(rawKey, { portable: true });
    if (!key) {
      continue;
    }
    if (isBlockedServiceEnvVar(key)) {
      continue;
    }
    // Skip values whose entire content is an unresolved shell variable reference
    // ($VAR, ${VAR}, or $(cmd)). dotenv does not expand them, so persisting them
    // into a single-quoted LaunchAgent/systemd env file would store the literal
    // reference string rather than the intended credential value.
    // Values that merely contain $ (e.g. a password like "abc$2!") are kept.
    if (isUnresolvedShellReference(value)) {
      skippedShellReferenceKeys.push(key);
      continue;
    }
    entries[key] = value;
  }
  return { entries, skippedShellReferenceKeys };
}

/**
 * Read and parse the state-dir `.env`, returning both the persisted entries and
 * the keys that were skipped because they held unresolved shell references. The
 * skipped keys are surfaced so generated service env files can remove stale
 * literal references for keys OpenClaw previously managed.
 */
export function readStateDirDotEnvFromStateDir(stateDir: string): ParsedStateDirDotEnv {
  const dotEnvPath = path.join(stateDir, ".env");
  try {
    return parseStateDirDotEnvContent(fs.readFileSync(dotEnvPath, "utf8"));
  } catch {
    return { entries: {}, skippedShellReferenceKeys: [] };
  }
}

/**
 * Read and parse `~/.openclaw/.env` (or `$OPENCLAW_STATE_DIR/.env`), returning
 * a filtered record of key-value pairs suitable for a managed service
 * environment source.
 */
export function readStateDirDotEnvVars(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const stateDir = resolveStateDir(env as NodeJS.ProcessEnv);
  return readStateDirDotEnvFromStateDir(stateDir).entries;
}

/** Split view of durable gateway service env sources before precedence is applied. */
export type DurableServiceEnvVarSources = {
  stateDirDotEnvEnvironment: Record<string, string>;
  configEnvironment: Record<string, string>;
  durableEnvironment: Record<string, string>;
};

/** Collects durable service env vars from state-dir `.env` and config, preserving each source. */
export function collectDurableServiceEnvVarSources(params: {
  env: Record<string, string | undefined>;
  config?: OpenClawConfig;
}): DurableServiceEnvVarSources {
  const stateDirDotEnvEnvironment = readStateDirDotEnvVars(params.env);
  const configEnvironment = collectConfigServiceEnvVars(params.config);
  return {
    stateDirDotEnvEnvironment,
    configEnvironment,
    durableEnvironment: {
      ...stateDirDotEnvEnvironment,
      ...configEnvironment,
    },
  };
}

/**
 * Durable service env sources survive beyond the invoking shell and are safe to
 * persist into owner-only gateway service environment sources.
 *
 * Precedence:
 * 1. state-dir `.env` file vars
 * 2. config service env vars
 */
export function collectDurableServiceEnvVars(params: {
  env: Record<string, string | undefined>;
  config?: OpenClawConfig;
}): Record<string, string> {
  return collectDurableServiceEnvVarSources(params).durableEnvironment;
}
