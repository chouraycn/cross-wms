// 扫描 bundled 插件源/构建根目录，并从 manifest 派生公共/运行时工件。
//
// 移植自 openclaw/src/plugins/bundled-plugin-scan.ts。
//
// 降级策略：
//  - 原文件依赖 ../../packages/normalization-core/src/string-coerce.js 的
//    normalizeOptionalString。改用 cross-wms 的 ../infra/string-coerce.js，行为一致。
//  - 原文件依赖 ../../packages/normalization-core/src/string-normalization.js 的
//    normalizeTrimmedStringList。改用 cross-wms 的 ../infra/string-normalization.js。
//  - 原文件依赖 ./public-surface-runtime.js 的 PUBLIC_SURFACE_SOURCE_EXTENSIONS。
//    cross-wms 已在本批移植中创建，直接引用。

import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalString } from "../infra/string-coerce.js";
import { normalizeTrimmedStringList } from "../infra/string-normalization.js";
import { PUBLIC_SURFACE_SOURCE_EXTENSIONS } from "./public-surface-runtime.js";

const RUNTIME_SIDECAR_ARTIFACTS = new Set([
  "helper-api.js",
  "light-runtime-api.js",
  "runtime-api.js",
  "runtime-setter-api.js",
  "thread-bindings-runtime.js",
]);

export { normalizeOptionalString as trimBundledPluginString };

/** 规范化扫描 bundled 插件文件时找到的 string-list manifest 字段。 */
export function normalizeBundledPluginStringList(value: unknown): string[] {
  return normalizeTrimmedStringList(value);
}

/** 将源码入口路径转换为构建后的 JavaScript 工件路径。 */
export function rewriteBundledPluginEntryToBuiltPath(
  entry: string | undefined,
): string | undefined {
  if (!entry) {
    return undefined;
  }
  const normalized = entry.replace(/^\.\//u, "");
  return normalized.replace(/\.[^.]+$/u, ".js");
}

function isTopLevelPublicSurfaceSource(name: string): boolean {
  if (
    !PUBLIC_SURFACE_SOURCE_EXTENSIONS.includes(
      path.extname(name) as (typeof PUBLIC_SURFACE_SOURCE_EXTENSIONS)[number],
    )
  ) {
    return false;
  }
  if (name.startsWith(".") || name.startsWith("test-") || name.includes(".test-")) {
    return false;
  }
  if (name.endsWith(".d.ts")) {
    return false;
  }
  if (/^config-api(\.[cm]?[jt]s)$/u.test(name)) {
    return false;
  }
  return !/(\.test|\.spec)(\.[cm]?[jt]s)$/u.test(name);
}

/** 为含一个或多个扩展入口的 bundled 插件派生稳定的 id hint。 */
export function deriveBundledPluginIdHint(params: {
  entryPath: string;
  manifestId: string;
  packageName?: string;
  hasMultipleExtensions: boolean;
}): string {
  const base = path.basename(params.entryPath, path.extname(params.entryPath));
  if (!params.hasMultipleExtensions) {
    return params.manifestId;
  }
  const packageName = normalizeOptionalString(params.packageName);
  if (!packageName) {
    return `${params.manifestId}/${base}`;
  }
  const unscoped = packageName.includes("/")
    ? (packageName.split("/").pop() ?? packageName)
    : packageName;
  return `${unscoped}/${base}`;
}

/** 列出应随 bundled 插件运行时一起复制的顶层公共表面工件。 */
export function collectBundledPluginPublicSurfaceArtifacts(params: {
  pluginDir: string;
  sourceEntry: string;
  setupEntry?: string;
}): readonly string[] | undefined {
  const excluded = new Set(
    normalizeTrimmedStringList([params.sourceEntry, params.setupEntry]).map((entry) =>
      path.basename(entry),
    ),
  );
  const artifacts = fs
    .readdirSync(params.pluginDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isTopLevelPublicSurfaceSource)
    .filter((entry) => !excluded.has(entry))
    .map((entry) => rewriteBundledPluginEntryToBuiltPath(entry))
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .toSorted((left, right) => left.localeCompare(right));
  return artifacts.length > 0 ? artifacts : undefined;
}

/** 将公共工件筛选为 bundled 插件执行所需的运行时 sidecar。 */
export function collectBundledPluginRuntimeSidecarArtifacts(
  publicSurfaceArtifacts: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!publicSurfaceArtifacts) {
    return undefined;
  }
  const artifacts = publicSurfaceArtifacts.filter((artifact) =>
    RUNTIME_SIDECAR_ARTIFACTS.has(artifact),
  );
  return artifacts.length > 0 ? artifacts : undefined;
}

/** 选择适合当前包布局的源码或构建扩展目录。 */
export function resolveBundledPluginScanDir(params: {
  packageRoot: string;
  runningFromBuiltArtifact: boolean;
}): string | undefined {
  const sourceDir = path.join(params.packageRoot, "extensions");
  const runtimeDir = path.join(params.packageRoot, "dist-runtime", "extensions");
  const builtDir = path.join(params.packageRoot, "dist", "extensions");
  if (params.runningFromBuiltArtifact) {
    if (fs.existsSync(builtDir)) {
      return builtDir;
    }
    if (fs.existsSync(runtimeDir)) {
      return runtimeDir;
    }
  }
  if (fs.existsSync(sourceDir)) {
    return sourceDir;
  }
  if (fs.existsSync(runtimeDir) && fs.existsSync(builtDir)) {
    return runtimeDir;
  }
  if (fs.existsSync(builtDir)) {
    return builtDir;
  }
  return undefined;
}
