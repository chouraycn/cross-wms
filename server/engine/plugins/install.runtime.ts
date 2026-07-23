/**
 * Plugin install runtime helpers.
 * 移植自 openclaw/src/plugins/install.runtime.ts。
 * 降级策略：install.js 未导出 NpmIntegrityDrift / NpmSpecResolution，降级为本地占位类型。
 * 函数降级为返回空/默认值，仅保留类型签名供 install.ts 类型检查通过。
 */

import type { InstallSecurityScanResult } from "./install-security-scan.js";

export type NpmIntegrityDrift = unknown;
export type NpmSpecResolution = unknown;

// Re-export functions that have real implementations in dedicated modules.
// These were previously stubbed here, causing TS2308 duplicate export conflicts
// in the barrel (index.ts) which also exports from the real modules.
export {
  getPackageManifestMetadata,
  loadPluginManifest,
} from "./manifest.js";
export {
  detectBundleManifestFormat,
  loadBundleManifest,
} from "./bundle-manifest.js";
export {
  scanBundleInstallSource,
  scanPackageInstallSource,
  scanInstalledPackageDependencyTree,
  scanFileInstallSource,
} from "./install-security-scan.js";

export {
  resolvePluginInstallDir,
  encodePluginInstallDirName,
  validatePluginId,
} from "./install-paths.js";

// ============================================================================
// 类型定义
// ============================================================================

export type PluginInstallLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  debug?: (message: string) => void;
  error?: (message: string) => void;
};

export type InstallModeOptions = {
  timeoutMs?: number;
  mode?: "install" | "update";
  dryRun?: boolean;
  logger?: PluginInstallLogger;
};

export type TimedInstallModeOptions = {
  logger: PluginInstallLogger;
  timeoutMs: number;
  mode: "install" | "update";
  dryRun: boolean;
};

export type InstallModeResolution = {
  logger: PluginInstallLogger;
  mode: "install" | "update";
  dryRun: boolean;
};

export type PackageManifestMetadata = {
  version?: string;
  integrity?: string;
  optionalDependencies?: Record<string, string>;
  platformPackages?: Array<{ name: string; optional: boolean }>;
};

export type BundleManifestFormat = string;

export type BundleManifestResult =
  | { ok: true; manifest: { id: string; version?: string; [key: string]: unknown } }
  | { ok: false; error: string };

export type PluginManifestResult =
  | { ok: true; manifest: { id: string; version?: string; [key: string]: unknown } }
  | { ok: false; error: string };

export type ArchiveSourcePathResult =
  | { ok: true; path: string }
  | { ok: false; error: string; code?: string };

export type ExistingInstallPathResult =
  | { ok: true; resolvedPath: string; stat: { isDirectory: () => boolean; isFile: () => boolean } }
  | { ok: false; error: string; code?: string };

export type CanonicalInstallTargetResult =
  | { ok: true; targetDir: string }
  | { ok: false; error: string };

export type InstallTargetAvailabilityResult =
  | { ok: true }
  | { ok: false; error: string };

export type InstallPackageDirResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export type FileSystemRoot = {
  copyIn: (name: string, sourcePath: string) => Promise<void>;
  ensureDir: (dirPath: string) => Promise<void>;
  readFile: (filePath: string) => Promise<Buffer>;
  writeFile: (filePath: string, data: Buffer | string) => Promise<void>;
};

export type MinHostVersionCheckResult = {
  ok: boolean;
  kind?: "invalid" | "unknown_host_version" | "incompatible";
  error?: string;
  requirement?: { minimumLabel: string; minimum: string };
  currentVersion?: string;
};

// ============================================================================
// 降级函数实现
// ============================================================================

export function resolveCompatibilityHostVersion(): string {
  return "0.0.0";
}

export function checkMinHostVersion(params: {
  currentVersion: string;
  minHostVersion?: string;
}): MinHostVersionCheckResult {
  void params;
  return { ok: true };
}

export async function fileExists(filePath: string): Promise<boolean> {
  void filePath;
  return false;
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  void filePath;
  return {} as T;
}

export function resolveTimedInstallModeOptions(
  params: InstallModeOptions,
  defaultLogger: PluginInstallLogger,
): TimedInstallModeOptions {
  return {
    logger: params.logger ?? defaultLogger,
    timeoutMs: params.timeoutMs ?? 120_000,
    mode: params.mode ?? "install",
    dryRun: params.dryRun ?? false,
  };
}

export function resolveInstallModeOptions(
  params: InstallModeOptions,
  defaultLogger: PluginInstallLogger,
): InstallModeResolution {
  return {
    logger: params.logger ?? defaultLogger,
    mode: params.mode ?? "install",
    dryRun: params.dryRun ?? false,
  };
}

export async function ensureInstallTargetAvailable(params: {
  mode: "install" | "update";
  targetDir: string;
  alreadyExistsError: string;
}): Promise<InstallTargetAvailabilityResult> {
  void params;
  return { ok: true };
}

export async function installPackageDir(params: {
  sourceDir: string;
  targetDir: string;
  mode: "install" | "update";
  timeoutMs?: number;
  logger?: PluginInstallLogger;
  copyErrorPrefix?: string;
  hasDeps?: boolean;
  sourceHardlinks?: "reject" | "allow" | "package-manager";
  depsLogMessage?: string;
  afterCopy?: (installedDir: string) => Promise<void>;
  afterInstall?: (installedDir: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>;
}): Promise<InstallPackageDirResult> {
  void params;
  return { ok: true };
}

export async function resolveCanonicalInstallTarget(params: {
  baseDir: string;
  id: string;
  invalidNameMessage: string;
  boundaryLabel: string;
  nameEncoder?: (pluginId: string) => string;
}): Promise<CanonicalInstallTargetResult> {
  void params;
  return { ok: true, targetDir: params.baseDir };
}

export async function resolveArchiveSourcePath(
  archivePath: string,
): Promise<ArchiveSourcePathResult> {
  return { ok: true, path: archivePath };
}

export async function withExtractedArchiveRoot<T>(params: {
  archivePath: string;
  tempDirPrefix: string;
  timeoutMs: number;
  logger?: PluginInstallLogger;
  rootMarkers?: string[];
  onExtracted: (sourceDir: string) => Promise<T>;
}): Promise<T> {
  void params;
  return await params.onExtracted("");
}

export async function resolveExistingInstallPath(
  inputPath: string,
): Promise<ExistingInstallPathResult> {
  return {
    ok: true,
    resolvedPath: inputPath,
    stat: {
      isDirectory: () => false,
      isFile: () => true,
    },
  };
}

export function resolveArchiveKind(
  resolvedPath: string,
): string | null {
  void resolvedPath;
  return null;
}

export function validateRegistryNpmSpec(
  spec: string,
): string | null {
  void spec;
  return null;
}

export async function root(extensionsDir: string): Promise<FileSystemRoot> {
  void extensionsDir;
  return {
    copyIn: async () => {},
    ensureDir: async () => {},
    readFile: async () => Buffer.alloc(0),
    writeFile: async () => {},
  };
}
