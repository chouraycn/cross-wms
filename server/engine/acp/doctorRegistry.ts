import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorFinding,
  DoctorRegistry,
  DoctorReport,
  DoctorScope,
} from "./doctorTypes.js";

export function createDoctorRegistry(): DoctorRegistry {
  const checks = new Map<DoctorScope, DoctorCheck[]>();

  function register(check: DoctorCheck): void {
    const scopeChecks = checks.get(check.scope) ?? [];
    scopeChecks.push(check);
    checks.set(check.scope, scopeChecks);
  }

  function getChecks(scope?: DoctorScope): readonly DoctorCheck[] {
    if (!scope) {
      return Array.from(checks.values()).flat();
    }
    return checks.get(scope) ?? [];
  }

  async function runAll(config: unknown): Promise<DoctorReport> {
    return runScopes(
      Array.from(checks.keys()),
      config,
    );
  }

  async function runScopes(scopes: readonly DoctorScope[], config: unknown): Promise<DoctorReport> {
    const results: DoctorCheckResult[] = [];
    for (const scope of scopes) {
      const scopeChecks = checks.get(scope) ?? [];
      const findings: DoctorFinding[] = [];
      for (const check of scopeChecks) {
        findings.push(...(await check.check(config)));
      }
      results.push({ scope, findings });
    }
    const allFindings = results.flatMap((r) => r.findings);
    return {
      ok: allFindings.every((f) => f.severity !== "error"),
      scopesChecked: results.length,
      totalFindings: allFindings.length,
      findings: allFindings,
    };
  }

  return {
    register,
    getChecks,
    runAll,
    runScopes,
  };
}

export const doctorRegistry = createDoctorRegistry();