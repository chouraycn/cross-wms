// 验证当前运行时是否符合 OpenClaw 的 Node 引擎下限。
// 降级实现：从 openclaw/src/infra/runtime-guard.ts 移植，
// 使用本地定义的 RuntimeEnv 类型替代 ../runtime.js。
import process from "node:process";

/**
 * 运行时环境接口（降级 stub）。
 * openclaw 的 ../runtime.js 导出 defaultRuntime 和 RuntimeEnv 类型，
 * cross-wms 未移植该模块，这里定义最小兼容接口。
 */
export type RuntimeEnv = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  exit?: (code?: number) => void;
};

/** 默认运行时环境（降级实现：使用 console 和 process.exit） */
export const defaultRuntime: RuntimeEnv = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
  exit: (code) => process.exit(code),
};

type RuntimeKind = "node" | "unknown";

type Semver = {
  major: number;
  minor: number;
  patch: number;
};

const MIN_NODE: Semver = { major: 22, minor: 19, patch: 0 };
const MINIMUM_ENGINE_RE = /^\s*>=\s*v?(\d+\.\d+\.\d+)\s*$/i;

/** 启动/运行时版本诊断中包含的运行时事实。 */
export type RuntimeDetails = {
  kind: RuntimeKind;
  version: string | null;
  execPath: string | null;
  pathEnv: string;
};

const SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;

/** 从运行时或 package 版本标签解析首个 major/minor/patch 三元组。 */
export function parseSemver(version: string | null): Semver | null {
  if (!version) {
    return null;
  }
  const match = version.match(SEMVER_RE);
  if (!match) {
    return null;
  }
  const [, major, minor, patch] = match;
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}

/** 比较解析后的 semver 三元组与包含性最小版本。 */
export function isAtLeast(version: Semver | null, minimum: Semver): boolean {
  if (!version) {
    return false;
  }
  if (version.major !== minimum.major) {
    return version.major > minimum.major;
  }
  if (version.minor !== minimum.minor) {
    return version.minor > minimum.minor;
  }
  return version.patch >= minimum.patch;
}

/** 读取当前进程运行时元数据用于启动支持检查。 */
export function detectRuntime(): RuntimeDetails {
  const kind: RuntimeKind = process.versions?.node ? "node" : "unknown";
  const version = process.versions?.node ?? null;

  return {
    kind,
    version,
    execPath: process.execPath ?? null,
    pathEnv: process.env.PATH ?? "(not set)",
  };
}

/** 返回检测到的运行时是否满足 OpenClaw 的最小运行时契约。 */
export function runtimeSatisfies(details: RuntimeDetails): boolean {
  const parsed = parseSemver(details.version);
  if (details.kind === "node") {
    return isAtLeast(parsed, MIN_NODE);
  }
  return false;
}

/** 检查 Node 版本标签是否符合 OpenClaw 当前最小 Node 版本。 */
export function isSupportedNodeVersion(version: string | null): boolean {
  return isAtLeast(parseSemver(version), MIN_NODE);
}

/** 解析 `>=x.y.z` 形式的简单 package `engines.node` 范围。 */
export function parseMinimumNodeEngine(engine: string | null): Semver | null {
  if (!engine) {
    return null;
  }
  const match = engine.match(MINIMUM_ENGINE_RE);
  if (!match) {
    return null;
  }
  return parseSemver(match[1] ?? null);
}

/** 返回 Node 版本是否满足简单最小引擎范围，不支持返回 null。 */
export function nodeVersionSatisfiesEngine(
  version: string | null,
  engine: string | null,
): boolean | null {
  const minimum = parseMinimumNodeEngine(engine);
  if (!minimum) {
    return null;
  }
  return isAtLeast(parseSemver(version), minimum);
}

/** 当前 Node 运行时不支持时通过提供的运行时退出。 */
export function assertSupportedRuntime(
  runtime: RuntimeEnv = defaultRuntime,
  details: RuntimeDetails = detectRuntime(),
): void {
  if (runtimeSatisfies(details)) {
    return;
  }

  const versionLabel = details.version ?? "unknown";
  const runtimeLabel =
    details.kind === "unknown" ? "unknown runtime" : `${details.kind} ${versionLabel}`;
  const execLabel = details.execPath ?? "unknown";

  runtime.error?.(
    [
      "openclaw requires Node >=22.19.0.",
      `Detected: ${runtimeLabel} (exec: ${execLabel}).`,
      `PATH searched: ${details.pathEnv}`,
      "Install Node: https://nodejs.org/en/download",
      "Upgrade Node and re-run openclaw.",
    ].join("\n"),
  );
  runtime.exit?.(1);
}
