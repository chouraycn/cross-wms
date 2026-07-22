import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import {
  fetchClawHubSkillVerification,
  fetchClawHubSkillDetail,
  type ClawHubSkillVerificationResponse,
  type ClawHubSkillDetail,
} from "../lifecycle/clawhub.js";
import {
  scanDirectoryWithSummary,
  hasCriticalFindings,
  type SkillScanSummary,
} from "./scanner.js";

export type SecurityVerdictDecision = "trusted" | "warn" | "rejected";

export type SecurityVerdict = {
  decision: SecurityVerdictDecision;
  reasons: string[];
  score: number;
  details: Record<string, unknown>;
  source: VerificationSource;
  slug: string;
  version?: string;
};

export type VerdictCacheEntry = {
  verdict: SecurityVerdict;
  fetchedAt: number;
  ttl: number;
};

export type VerificationSource = "clawhub" | "local" | "manual";

export type VerdictDimension =
  | "publisher_trusted"
  | "install_count"
  | "age_days"
  | "has_source_code"
  | "has_tests"
  | "malicious_code_check"
  | "permission_scope";

export type DimensionScores = Record<VerdictDimension, number>;

const TRUSTED_PUBLISHERS = new Set(["openclaw", "github", "makenotion", "agilebits"]);
const VERIFIED_PUBLISHERS = new Set([
  "obsidian-community",
  "spotify-community",
  "himalaya-cli",
  "diagram-labs",
  "pdf-tools",
]);

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const TRUSTED_TTL_MS = 6 * 60 * 60 * 1000;
const REJECTED_TTL_MS = 24 * 60 * 60 * 1000;

const verdictCache = new Map<string, VerdictCacheEntry>();

function cacheKey(slug: string, version?: string): string {
  return version ? `${slug}@${version}` : slug;
}

function getTtlForDecision(decision: SecurityVerdictDecision): number {
  switch (decision) {
    case "trusted":
      return TRUSTED_TTL_MS;
    case "rejected":
      return REJECTED_TTL_MS;
    default:
      return DEFAULT_TTL_MS;
  }
}

export function scorePublisherTrusted(publisher: string): number {
  if (TRUSTED_PUBLISHERS.has(publisher)) return 100;
  if (VERIFIED_PUBLISHERS.has(publisher)) return 70;
  return 30;
}

export function scoreInstallCount(installCount: number): number {
  if (installCount > 10000) return 100;
  if (installCount > 1000) return 70;
  if (installCount > 100) return 40;
  return 20;
}

export function scoreAgeDays(ageDays: number): number {
  if (ageDays > 180) return 100;
  if (ageDays > 90) return 70;
  if (ageDays > 30) return 40;
  return 20;
}

export function scoreHasSourceCode(hasSourceCode: boolean): number {
  return hasSourceCode ? 100 : 0;
}

export function scoreHasTests(hasTests: boolean): number {
  return hasTests ? 100 : 30;
}

export function scoreMaliciousCodeCheck(
  result: "pass" | "warn" | "fail",
): number {
  switch (result) {
    case "pass":
      return 100;
    case "warn":
      return 40;
    case "fail":
      return 0;
  }
}

export function scorePermissionScope(
  scope: "read-only" | "read-write" | "system",
): number {
  switch (scope) {
    case "read-only":
      return 100;
    case "read-write":
      return 60;
    case "system":
      return 30;
  }
}

export function computeVerdictFromScores(scores: DimensionScores): {
  decision: SecurityVerdictDecision;
  score: number;
  reasons: string[];
} {
  const dimensions: VerdictDimension[] = [
    "publisher_trusted",
    "install_count",
    "age_days",
    "has_source_code",
    "has_tests",
    "malicious_code_check",
    "permission_scope",
  ];

  const total = dimensions.reduce((sum, dim) => sum + scores[dim], 0);
  const average = Math.round(total / dimensions.length);

  const reasons: string[] = [];

  if (scores.publisher_trusted >= 100) {
    reasons.push("Trusted publisher");
  } else if (scores.publisher_trusted >= 70) {
    reasons.push("Verified publisher");
  } else {
    reasons.push("Unverified publisher");
  }

  if (scores.malicious_code_check === 100) {
    reasons.push("No malicious code detected");
  } else if (scores.malicious_code_check > 0) {
    reasons.push("Potential issues detected in code scan");
  } else {
    reasons.push("Critical security issues detected");
  }

  if (scores.has_source_code === 100) {
    reasons.push("Source code available");
  } else {
    reasons.push("No source code available");
  }

  let decision: SecurityVerdictDecision;
  if (average >= 80) {
    decision = "trusted";
  } else if (average >= 50) {
    decision = "warn";
  } else {
    decision = "rejected";
  }

  return { decision, score: average, reasons };
}

export function getVerdictSummary(verdict: SecurityVerdict): string {
  const statusEmoji =
    verdict.decision === "trusted"
      ? "✓"
      : verdict.decision === "warn"
        ? "⚠"
        : "✗";

  const lines = [
    `${statusEmoji} Security Verdict: ${verdict.decision.toUpperCase()}`,
    `   Slug: ${verdict.slug}`,
    `   Score: ${verdict.score}/100`,
    `   Source: ${verdict.source}`,
  ];

  if (verdict.version) {
    lines.splice(2, 0, `   Version: ${verdict.version}`);
  }

  lines.push("", "Reasons:");
  for (const reason of verdict.reasons) {
    lines.push(`   - ${reason}`);
  }

  return lines.join("\n");
}

export function cacheVerdict(
  slug: string,
  version: string | undefined,
  verdict: SecurityVerdict,
): void {
  const key = cacheKey(slug, version);
  const ttl = getTtlForDecision(verdict.decision);
  verdictCache.set(key, {
    verdict,
    fetchedAt: Date.now(),
    ttl,
  });
  logger.debug(`[Security] Cached verdict for ${key}: ${verdict.decision} (ttl=${ttl}ms)`);
}

export function getCachedVerdict(
  slug: string,
  version?: string,
): SecurityVerdict | null {
  const key = cacheKey(slug, version);
  const entry = verdictCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.fetchedAt > entry.ttl) {
    verdictCache.delete(key);
    logger.debug(`[Security] Cache expired for ${key}`);
    return null;
  }

  return entry.verdict;
}

export function clearVerdictCache(slug?: string): void {
  if (slug) {
    const keysToDelete: string[] = [];
    for (const key of verdictCache.keys()) {
      if (key.startsWith(slug + "@") || key === slug) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      verdictCache.delete(key);
    }
    logger.debug(`[Security] Cleared cache for ${slug}`);
  } else {
    verdictCache.clear();
    logger.debug("[Security] Cleared all verdict cache");
  }
}

export async function verifySkillSecurity(
  slug: string,
  version?: string,
): Promise<SecurityVerdict> {
  logger.debug(`[Security] Verifying skill security: ${slug}${version ? `@${version}` : ""}`);

  try {
    const detail = fetchClawHubSkillDetail(slug);
    const verification = fetchClawHubSkillVerification(slug, version);

    if (!verification.ok || !detail) {
      const verdict: SecurityVerdict = {
        decision: "rejected",
        reasons: verification.reasons.length > 0
          ? verification.reasons
          : [`Skill "${slug}" not found in registry`],
        score: 0,
        details: { verification },
        source: "clawhub",
        slug,
        version,
      };
      cacheVerdict(slug, version, verdict);
      return verdict;
    }

    const ageMs = Date.now() - detail.createdAt;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    const scores: DimensionScores = {
      publisher_trusted: scorePublisherTrusted(detail.ownerHandle),
      install_count: scoreInstallCount(detail.downloadCount),
      age_days: scoreAgeDays(ageDays),
      has_source_code: scoreHasSourceCode(!!detail.repository),
      has_tests: scoreHasTests(false),
      malicious_code_check: scoreMaliciousCodeCheck(
        verification.decision === "rejected" ? "fail" : verification.decision === "warn" ? "warn" : "pass",
      ),
      permission_scope: scorePermissionScope("read-write"),
    };

    const { decision, score, reasons } = computeVerdictFromScores(scores);

    const verdict: SecurityVerdict = {
      decision,
      reasons,
      score,
      details: {
        scores,
        publisher: detail.ownerHandle,
        downloadCount: detail.downloadCount,
        ageDays,
        hasRepository: !!detail.repository,
        verification: verification.decision,
      },
      source: "clawhub",
      slug,
      version,
    };

    cacheVerdict(slug, version, verdict);
    return verdict;
  } catch (err) {
    logger.error("[Security] Failed to verify skill from ClawHub:", err);
    const verdict: SecurityVerdict = {
      decision: "warn",
      reasons: ["Unable to reach ClawHub for verification", "Falling back to local scan"],
      score: 50,
      details: { error: err instanceof Error ? err.message : String(err) },
      source: "clawhub",
      slug,
      version,
    };
    return verdict;
  }
}

async function checkForTestFiles(skillDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(skillDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "tests" || entry.name === "test") {
          return true;
        }
        const hasTests = await checkForTestFiles(fullPath);
        if (hasTests) return true;
      } else if (entry.isFile()) {
        if (/\.(?:spec|test)\.[^.]+$/i.test(entry.name)) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function checkForSourceCode(skillDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs"].includes(ext)) {
          return true;
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const hasSource = await checkForSourceCode(path.join(skillDir, entry.name));
        if (hasSource) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function inferPermissionScope(scanSummary: SkillScanSummary): "read-only" | "read-write" | "system" {
  if (hasCriticalFindings(scanSummary.findings)) {
    return "system";
  }

  const hasWriteOperations = scanSummary.findings.some(
    (f) => f.ruleId === "dangerous-exec" || f.ruleId === "potential-exfiltration",
  );

  if (hasWriteOperations) {
    return "read-write";
  }

  return "read-only";
}

export async function computeLocalVerdict(skillDir: string): Promise<SecurityVerdict> {
  logger.debug(`[Security] Computing local verdict for: ${skillDir}`);

  const slug = path.basename(skillDir);

  try {
    const [hasSourceCode, hasTests, scanSummary] = await Promise.all([
      checkForSourceCode(skillDir),
      checkForTestFiles(skillDir),
      scanDirectoryWithSummary(skillDir, { maxFiles: 100 }),
    ]);

    const maliciousResult: "pass" | "warn" | "fail" = hasCriticalFindings(scanSummary.findings)
      ? "fail"
      : scanSummary.findings.length > 0
        ? "warn"
        : "pass";

    const permissionScope = inferPermissionScope(scanSummary);

    const scores: DimensionScores = {
      publisher_trusted: 30,
      install_count: 20,
      age_days: 20,
      has_source_code: scoreHasSourceCode(hasSourceCode),
      has_tests: scoreHasTests(hasTests),
      malicious_code_check: scoreMaliciousCodeCheck(maliciousResult),
      permission_scope: scorePermissionScope(permissionScope),
    };

    const { decision, score, reasons } = computeVerdictFromScores(scores);

    const localReasons = [...reasons];
    if (scanSummary.findings.length > 0) {
      localReasons.push(`${scanSummary.findings.length} security finding(s) in local scan`);
    }

    const verdict: SecurityVerdict = {
      decision,
      reasons: localReasons,
      score,
      details: {
        scores,
        hasSourceCode,
        hasTests,
        scanSummary: {
          scannedFiles: scanSummary.scannedFiles,
          critical: scanSummary.critical,
          warn: scanSummary.warn,
          info: scanSummary.info,
        },
        permissionScope,
      },
      source: "local",
      slug,
    };

    logger.debug(`[Security] Local verdict for ${slug}: ${decision} (score=${score})`);
    return verdict;
  } catch (err) {
    logger.error("[Security] Failed to compute local verdict:", err);
    return {
      decision: "warn",
      reasons: ["Failed to scan skill directory", "Manual review recommended"],
      score: 40,
      details: { error: err instanceof Error ? err.message : String(err) },
      source: "local",
      slug,
    };
  }
}

export async function getSkillSecurityVerdict(
  slug: string,
  version?: string,
): Promise<SecurityVerdict> {
  const cached = getCachedVerdict(slug, version);
  if (cached) {
    logger.debug(`[Security] Cache hit for ${slug}${version ? `@${version}` : ""}`);
    return cached;
  }

  return verifySkillSecurity(slug, version);
}

export async function isSkillSafeToInstall(
  slug: string,
  version?: string,
): Promise<boolean> {
  const verdict = await getSkillSecurityVerdict(slug, version);
  return verdict.decision !== "rejected";
}
