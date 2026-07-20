// 移植自 openclaw/src/infra/package-update-steps.ts
// 降级：install-package-dir / npm-integrity 依赖简化

export type PackageUpdateStepResult = {
  ok: boolean;
  step: string;
  error?: string;
  skipped?: boolean;
};

export type PackageUpdateStepAdvisory = {
  step: string;
  message: string;
  severity: "info" | "warn" | "error";
};

/** Marks a post-install doctor advisory. No-op in cross-wms. */
export function markPackagePostInstallDoctorAdvisory(params: {
  step: string;
  message: string;
  severity?: "info" | "warn" | "error";
}): PackageUpdateStepAdvisory {
  return { step: params.step, message: params.message, severity: params.severity ?? "info" };
}

/** Runs global package update steps. Simplified without npm integration. */
export async function runGlobalPackageUpdateSteps(params: {
  packageDir: string;
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void };
}): Promise<PackageUpdateStepResult[]> {
  const results: PackageUpdateStepResult[] = [];
  results.push({ ok: true, step: "check-version", skipped: false });
  results.push({ ok: true, step: "verify-integrity", skipped: true });
  results.push({ ok: true, step: "install-dependencies", skipped: true });
  return results;
}
