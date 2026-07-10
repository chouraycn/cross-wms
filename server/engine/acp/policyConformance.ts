import { promises as fs } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import JSON5 from "json5";
import type { PolicyRule, PermissionLevel } from "./policy.js";

export const POLICY_CONFORMANCE_CHECK_IDS = {
  missing: "policy/policy-conformance-missing",
  weaker: "policy/policy-conformance-weaker",
  invalid: "policy/policy-conformance-invalid",
} as const;

export type PolicyConformanceFinding = {
  readonly checkId: (typeof POLICY_CONFORMANCE_CHECK_IDS)[keyof typeof POLICY_CONFORMANCE_CHECK_IDS];
  readonly severity: "error";
  readonly message: string;
  readonly source: "policy";
  readonly path: string;
  readonly target: string;
  readonly requirement: string;
  readonly fixHint: string;
};

export type PolicyConformanceReport = {
  readonly ok: boolean;
  readonly baselinePath: string;
  readonly policyPath: string;
  readonly rulesChecked: number;
  readonly findings: readonly PolicyConformanceFinding[];
};

type PolicyDocument = {
  readonly displayName: string;
  readonly value: unknown;
};

type PolicyDocumentReadResult =
  | { readonly ok: true; readonly displayName: string; readonly document: PolicyDocument }
  | {
      readonly ok: false;
      readonly displayName: string;
      readonly message: string;
      readonly target: string;
    };

type PolicyRuleClaim = {
  readonly key: string;
  readonly rule: PolicyRule;
  readonly value: PermissionLevel;
  readonly target: string;
  readonly propertyPath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ocPathSegment(value: string): string {
  if (/^(?:[A-Za-z0-9_-]+|#\d+)$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function getPolicyPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function isPolicyValueAtLeastAsStrict(baseline: PermissionLevel, candidate: PermissionLevel): boolean {
  const strictness: Record<PermissionLevel, number> = { deny: 3, prompt: 2, allow: 1 };
  return strictness[candidate] >= strictness[baseline];
}

function uniqueConformanceFindings(
  findings: readonly PolicyConformanceFinding[],
): readonly PolicyConformanceFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.checkId}\n${finding.target}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function invalidParseConformanceFinding(
  result: Extract<PolicyDocumentReadResult, { readonly ok: false }>,
): PolicyConformanceFinding {
  return {
    checkId: POLICY_CONFORMANCE_CHECK_IDS.invalid,
    severity: "error",
    message: result.message,
    source: "policy",
    path: result.displayName,
    target: result.target,
    requirement: result.target,
    fixHint: `Fix ${result.displayName} so it contains valid policy JSONC.`,
  };
}

function collectPolicyRuleClaims(document: PolicyDocument): readonly PolicyRuleClaim[] {
  const claims: PolicyRuleClaim[] = [];
  if (!isRecord(document.value) || !Array.isArray(document.value.rules)) {
    return claims;
  }
  for (const rule of document.value.rules) {
    if (!isRecord(rule)) {
      continue;
    }
    const id = String(rule.id ?? "");
    const level = rule.level as PermissionLevel;
    if (!id || !["allow", "deny", "prompt"].includes(level)) {
      continue;
    }
    claims.push({
      key: `global:${id}`,
      rule: rule as unknown as PolicyRule,
      value: level,
      target: `oc://${document.displayName}/rules/${ocPathSegment(id)}`,
      propertyPath: `rules.${id}`,
    });
  }
  return claims;
}

function invalidConformanceFinding(
  claim: PolicyRuleClaim,
  displayName: string,
): PolicyConformanceFinding {
  return {
    checkId: POLICY_CONFORMANCE_CHECK_IDS.invalid,
    severity: "error",
    message: `${displayName} ${claim.propertyPath} is not valid policy conformance syntax.`,
    source: "policy",
    path: displayName,
    target: claim.target,
    requirement: claim.target,
    fixHint: `Fix ${claim.propertyPath} so it uses the documented policy syntax.`,
  };
}

function missingConformanceFinding(
  baseline: PolicyRuleClaim,
  policyDisplayName: string,
): PolicyConformanceFinding {
  return {
    checkId: POLICY_CONFORMANCE_CHECK_IDS.missing,
    severity: "error",
    message: `${policyDisplayName} is missing ${baseline.propertyPath}.`,
    source: "policy",
    path: policyDisplayName,
    target: `oc://${policyDisplayName}/${baseline.propertyPath.replaceAll(".", "/")}`,
    requirement: baseline.target,
    fixHint: `Add an equally or more restrictive ${baseline.propertyPath} rule, or update the baseline policy after review.`,
  };
}

function weakerConformanceFinding(
  baseline: PolicyRuleClaim,
  policyDisplayName: string,
  candidate: PolicyRuleClaim | undefined,
): PolicyConformanceFinding {
  return {
    checkId: POLICY_CONFORMANCE_CHECK_IDS.weaker,
    severity: "error",
    message: `${policyDisplayName} ${baseline.propertyPath} is weaker than the baseline policy.`,
    source: "policy",
    path: policyDisplayName,
    target: candidate?.target ?? `oc://${policyDisplayName}`,
    requirement: baseline.target,
    fixHint: `Use an equally or more restrictive ${baseline.propertyPath} value, or update the baseline policy after review.`,
  };
}

function conformanceFinding(
  baseline: PolicyRuleClaim,
  candidateClaims: readonly PolicyRuleClaim[],
  policyDisplayName: string,
): PolicyConformanceFinding | undefined {
  const globalCandidates = candidateClaims.filter((candidate) => candidate.key === baseline.key);
  if (globalCandidates.length === 0) {
    return missingConformanceFinding(baseline, policyDisplayName);
  }
  const weakerGlobal = globalCandidates.find(
    (candidate) => !isPolicyValueAtLeastAsStrict(baseline.value, candidate.value),
  );
  if (weakerGlobal !== undefined) {
    return weakerConformanceFinding(baseline, policyDisplayName, weakerGlobal);
  }
  return undefined;
}

async function readPolicyDocument(path: string): Promise<PolicyDocumentReadResult> {
  const displayName = basename(path);
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      displayName,
      message: `${displayName} could not be read: ${message}`,
      target: `oc://${displayName}`,
    };
  }
  try {
    return { ok: true, displayName, document: { displayName, value: JSON5.parse(raw) } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      displayName,
      message: `${displayName} could not be parsed: ${message}`,
      target: `oc://${displayName}`,
    };
  }
}

function resolvePolicyPath(path: string, cwd: string | undefined): string {
  return isAbsolute(path) ? path : resolve(cwd ?? process.cwd(), path);
}

export async function buildPolicyConformanceReport(params: {
  readonly baselinePath: string;
  readonly policyPath: string;
  readonly cwd?: string;
}): Promise<PolicyConformanceReport> {
  const baselinePath = resolvePolicyPath(params.baselinePath, params.cwd);
  const policyPath = resolvePolicyPath(params.policyPath, params.cwd);
  const baselineResult = await readPolicyDocument(baselinePath);
  const policyResult = await readPolicyDocument(policyPath);

  if (!baselineResult.ok || !policyResult.ok) {
    const invalidFindings = [baselineResult, policyResult]
      .filter((result): result is Extract<PolicyDocumentReadResult, { readonly ok: false }> => {
        return !result.ok;
      })
      .map((result) => invalidParseConformanceFinding(result));
    return {
      ok: false,
      baselinePath: baselineResult.displayName,
      policyPath: policyResult.displayName,
      rulesChecked: 0,
      findings: invalidFindings,
    };
  }

  const baseline = baselineResult.document;
  const policy = policyResult.document;
  const baselineClaims = collectPolicyRuleClaims(baseline);
  const candidateClaims = collectPolicyRuleClaims(policy);

  const invalidFindings = uniqueConformanceFindings([
    ...baselineClaims
      .filter((claim) => !["allow", "deny", "prompt"].includes(claim.value))
      .map((claim) => invalidConformanceFinding(claim, baseline.displayName)),
    ...candidateClaims
      .filter((claim) => !["allow", "deny", "prompt"].includes(claim.value))
      .map((claim) => invalidConformanceFinding(claim, policy.displayName)),
  ]);

  if (invalidFindings.length > 0) {
    return {
      ok: false,
      baselinePath: baseline.displayName,
      policyPath: policy.displayName,
      rulesChecked: 0,
      findings: invalidFindings,
    };
  }

  const findings = baselineClaims
    .map((claim) => conformanceFinding(claim, candidateClaims, policy.displayName))
    .filter((finding): finding is PolicyConformanceFinding => finding !== undefined);

  return {
    ok: invalidFindings.length === 0 && findings.length === 0,
    baselinePath: baseline.displayName,
    policyPath: policy.displayName,
    rulesChecked: baselineClaims.length,
    findings: [...invalidFindings, ...findings],
  };
}