/**
 * Plugin install.
 * 移植自 openclaw/src/plugins/install.ts。
 * 降级策略：运行时函数抛出 "not implemented"。
 */
export { resolvePluginInstallDir } from "./install-paths.js";

export const PLUGIN_INSTALL_ERROR_CODE = {
  archiveOpen: "archive-open",
  archiveExtract: "archive-extract",
  manifestMissing: "manifest-missing",
  manifestInvalid: "manifest-invalid",
  pluginIdMismatch: "plugin-id-mismatch",
  npmInstall: "npm-install",
  npmPack: "npm-pack",
  gitClone: "git-clone",
  integrity: "integrity",
  security: "security",
  io: "io",
} as const;

export type PluginInstallErrorCode =
  | "archive-open"
  | "archive-extract"
  | "manifest-missing"
  | "manifest-invalid"
  | "plugin-id-mismatch"
  | "npm-install"
  | "npm-pack"
  | "git-clone"
  | "integrity"
  | "security"
  | "io";

export type InstallPluginResult =
  | { ok: true; pluginId: string; installDir: string }
  | { ok: false; error: string; code?: PluginInstallErrorCode };

export type PluginNpmIntegrityDriftParams = {
  packageName: string;
  expectedIntegrity?: string;
  actualIntegrity?: string;
};

export async function installPluginFromInstalledPackageDir(_params: {
  pluginId: string;
  packageDir: string;
  extensionsDir?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromInstalledPackageDir");
}

export async function installPluginFromArchive(_params: {
  archivePath: string;
  extensionsDir?: string;
  expectedPluginId?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromArchive");
}

export async function installPluginFromDir(_params: {
  sourceDir: string;
  extensionsDir?: string;
  expectedPluginId?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromDir");
}

export async function installPluginFromFile(_params: {
  filePath: string;
  extensionsDir?: string;
  expectedPluginId?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromFile");
}

export async function installPluginFromNpmSpec(_params: {
  npmSpec: string;
  extensionsDir?: string;
  expectedPluginId?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromNpmSpec");
}

export async function installPluginFromNpmPackArchive(_params: {
  archivePath: string;
  extensionsDir?: string;
  expectedPluginId?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromNpmPackArchive");
}

export async function installPluginFromPath(_params: {
  sourcePath: string;
  extensionsDir?: string;
  expectedPluginId?: string;
}): Promise<InstallPluginResult> {
  throw new Error("not implemented: installPluginFromPath");
}
