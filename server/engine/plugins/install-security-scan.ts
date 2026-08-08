/**
 * Install security scan.
 * 移植自 openclaw/src/plugins/install-security-scan.ts。
 * 降级策略：返回通过结果。
 */
export type { InstallSafetyOverrides } from "./install-security-scan.types.js";

/** 占位：InstallPolicyRequestKind。 */
type InstallPolicyRequestKind = string;

export type InstallSecurityScanResult = {
  ok: boolean;
  findings: Array<{ kind: string; message: string; severity: "info" | "warn" | "error" }>;
  blocked?: { reason: string; code?: string };
};

export type PluginInstallRequestKind = Exclude<InstallPolicyRequestKind, "skill-install">;

export type SkillInstallSpecMetadata = {
  skillName: string;
  source: string;
};

export type PackageExecutableScanMetadata = {
  binEntries: string[];
  hasPostinstall: boolean;
  hasPreinstall: boolean;
};

export async function scanBundleInstallSource(_params: {
  archivePath: string;
  dangerouslyForceUnsafeInstall?: boolean;
  config?: any;
  sourceDir?: string;
  pluginId?: string;
  logger?: any;
  requestKind?: string;
  requestedSpecifier?: string;
  source?: any;
  mode?: string;
  version?: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function scanPackageInstallSource(_params: {
  packageDir: string;
  requestKind?: string;
  requestedSpecifier?: string;
  source?: any;
  mode?: string;
  packageName?: string;
  manifestId?: string;
  version?: string;
  config?: any;
  pluginId?: string;
  logger?: any;
  extensions?: string[];
  packageMetadata?: any;
  trustedSourceLinkedOfficialInstall?: boolean;
  dangerouslyForceUnsafeInstall?: boolean;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function scanInstalledPackageDependencyTree(_params: {
  packageDir: string;
  requestedSpecifier?: string;
  source?: any;
  mode?: string;
  config?: any;
  pluginId?: string;
  logger?: any;
  trustedSourceLinkedOfficialInstall?: boolean;
  requestKind?: string;
  allowManagedNpmRootPackagePeerSymlinks?: boolean;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function scanFileInstallSource(_params: {
  filePath: string;
  config?: any;
  dangerouslyForceUnsafeInstall?: boolean;
  logger?: any;
  mode?: string;
  pluginId?: string;
  requestedSpecifier?: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function preflightPluginNpmInstallPolicy(_params: {
  npmSpec?: string;
  config?: any;
  logger?: any;
  mode?: string;
  packageName?: string;
  pluginId?: string;
  requestedSpecifier?: string;
  source?: any;
  sourcePath?: string;
  sourcePathKind?: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function preflightPluginGitInstallPolicy(_params: {
  gitUrl: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function evaluateSkillInstallPolicy(_params: {
  spec: SkillInstallSpecMetadata;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}
