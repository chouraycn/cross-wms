/**
 * Plugin install paths.
 * 移植自 openclaw/src/plugins/install-paths.ts。
 * 降级策略：使用 node:path 实现。
 */
import path from "node:path";

export function safePluginInstallFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function encodePluginInstallDirName(pluginId: string): string {
  return safePluginInstallFileName(pluginId);
}

export function validatePluginId(pluginId: string): string | null {
  if (!pluginId || typeof pluginId !== "string") {
    return "plugin id must be a non-empty string";
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(pluginId)) {
    return "plugin id contains invalid characters";
  }
  return null;
}

export function matchesExpectedPluginId(params: {
  pluginId: string;
  expectedPluginId?: string;
}): boolean {
  if (!params.expectedPluginId) {
    return true;
  }
  return params.pluginId === params.expectedPluginId;
}

export function resolveDefaultPluginExtensionsDir(env?: NodeJS.ProcessEnv): string {
  const home = env?.HOME ?? env?.USERPROFILE ?? process.env.HOME ?? "";
  return path.join(home, ".openclaw", "extensions");
}

export function resolveDefaultPluginNpmDir(env?: NodeJS.ProcessEnv): string {
  const home = env?.HOME ?? env?.USERPROFILE ?? process.env.HOME ?? "";
  return path.join(home, ".openclaw", "npm");
}

export function encodePluginNpmProjectDirName(packageName: string): string {
  return safePluginInstallFileName(packageName);
}

export function resolvePluginNpmProjectsDir(npmDir?: string): string {
  return path.join(npmDir ?? resolveDefaultPluginNpmDir(), "projects");
}

export function resolvePluginNpmProjectDir(params: {
  packageName: string;
  npmDir?: string;
}): string {
  return path.join(
    resolvePluginNpmProjectsDir(params.npmDir),
    encodePluginNpmProjectDirName(params.packageName),
  );
}

export function resolvePluginNpmGenerationProjectDirPrefix(packageName: string): string {
  return `${encodePluginNpmProjectDirName(packageName)}-`;
}

export function resolvePluginNpmGenerationProjectDir(params: {
  packageName: string;
  generation: string;
  npmDir?: string;
}): string {
  return path.join(
    resolvePluginNpmProjectsDir(params.npmDir),
    `${resolvePluginNpmGenerationProjectDirPrefix(params.packageName)}${params.generation}`,
  );
}

export function resolvePluginNpmPackageDir(params: {
  packageName: string;
  npmDir?: string;
}): string {
  return path.join(
    resolvePluginNpmProjectsDir(params.npmDir),
    encodePluginNpmProjectDirName(params.packageName),
    "package",
  );
}

export function resolveDefaultPluginGitDir(env?: NodeJS.ProcessEnv): string {
  const home = env?.HOME ?? env?.USERPROFILE ?? process.env.HOME ?? "";
  return path.join(home, ".openclaw", "git");
}

export function resolvePluginInstallDir(pluginId: string, extensionsDir?: string): string {
  return path.join(extensionsDir ?? resolveDefaultPluginExtensionsDir(), encodePluginInstallDirName(pluginId));
}
