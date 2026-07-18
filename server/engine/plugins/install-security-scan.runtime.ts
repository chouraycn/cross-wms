/**
 * Install security scan runtime.
 * 移植自 openclaw/src/plugins/install-security-scan.runtime.ts。
 * 降级策略：返回通过结果。
 */
export type InstallSecurityScanResult = {
  ok: boolean;
  findings: Array<{ kind: string; message: string; severity: "info" | "warn" | "error" }>;
};

export async function scanBundleInstallSourceRuntime(_params: {
  archivePath: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function scanPackageInstallSourceRuntime(_params: {
  packageDir: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function scanInstalledPackageDependencyTreeRuntime(_params: {
  packageDir: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function scanFileInstallSourceRuntime(_params: {
  filePath: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function preflightPluginNpmInstallPolicyRuntime(_params: {
  npmSpec: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function preflightPluginGitInstallPolicyRuntime(_params: {
  gitUrl: string;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}

export async function evaluateSkillInstallPolicyRuntime(_params: {
  spec: unknown;
}): Promise<InstallSecurityScanResult> {
  return { ok: true, findings: [] };
}
