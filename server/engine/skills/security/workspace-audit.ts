import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import {
  scanDirectoryWithSummary,
  type SkillScanSummary,
  type SkillScanFinding,
  hasCriticalFindings,
} from "./scanner.js";

export type WorkspaceAuditResult = {
  success: boolean;
  workspaceDir: string;
  skillsDir: string;
  skillsScanned: number;
  skillNames: string[];
  summary: SkillScanSummary;
  hasCriticalIssues: boolean;
  findingsBySkill: Record<string, SkillScanFinding[]>;
  error?: string;
};

export type AuditOptions = {
  includeAllFiles?: boolean;
  maxFilesPerSkill?: number;
  onProgress?: (skillName: string, index: number, total: number) => void;
};

export async function auditWorkspaceSkills(
  workspaceDir: string,
  options?: AuditOptions,
): Promise<WorkspaceAuditResult> {
  const skillsDir = path.join(workspaceDir, ".cross-wms", "skills");
  const includeAllFiles = options?.includeAllFiles ?? false;
  const maxFilesPerSkill = options?.maxFilesPerSkill ?? 50;

  const result: WorkspaceAuditResult = {
    success: false,
    workspaceDir,
    skillsDir,
    skillsScanned: 0,
    skillNames: [],
    summary: {
      scannedFiles: 0,
      critical: 0,
      warn: 0,
      info: 0,
      truncated: false,
      findings: [],
    },
    hasCriticalIssues: false,
    findingsBySkill: {},
  };

  try {
    try {
      await fs.access(skillsDir);
    } catch {
      result.success = true;
      return result;
    }

    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    result.skillNames = skillDirs.sort();

    let allFindings: SkillScanFinding[] = [];
    let totalFiles = 0;
    let totalCritical = 0;
    let totalWarn = 0;
    let totalInfo = 0;
    let anyTruncated = false;

    for (let i = 0; i < skillDirs.length; i++) {
      const skillName = skillDirs[i];
      const skillDir = path.join(skillsDir, skillName);

      options?.onProgress?.(skillName, i + 1, skillDirs.length);

      try {
        const scanResult = await scanDirectoryWithSummary(skillDir, {
          maxFiles: maxFilesPerSkill,
          excludeTestFiles: !includeAllFiles,
          includeNodeModules: false,
        });

        result.findingsBySkill[skillName] = scanResult.findings;
        allFindings = allFindings.concat(scanResult.findings);
        totalFiles += scanResult.scannedFiles;
        totalCritical += scanResult.critical;
        totalWarn += scanResult.warn;
        totalInfo += scanResult.info;
        if (scanResult.truncated) anyTruncated = true;

        result.skillsScanned += 1;
      } catch (err) {
        logger.debug("[Skills] Failed to scan skill:", skillName, err);
        result.findingsBySkill[skillName] = [];
      }
    }

    result.summary = {
      scannedFiles: totalFiles,
      critical: totalCritical,
      warn: totalWarn,
      info: totalInfo,
      truncated: anyTruncated,
      findings: allFindings,
    };
    result.hasCriticalIssues = hasCriticalFindings(allFindings);
    result.success = true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Workspace audit failed:", err);
    result.error = errorMessage;
  }

  return result;
}

export async function auditSingleSkill(
  workspaceDir: string,
  skillName: string,
): Promise<{
  success: boolean;
  skillName: string;
  skillDir: string;
  summary?: SkillScanSummary;
  hasCriticalIssues?: boolean;
  error?: string;
}> {
  const skillDir = path.join(workspaceDir, ".cross-wms", "skills", skillName);

  try {
    await fs.access(skillDir);
  } catch {
    return {
      success: false,
      skillName,
      skillDir,
      error: `Skill '${skillName}' not found`,
    };
  }

  try {
    const summary = await scanDirectoryWithSummary(skillDir);
    return {
      success: true,
      skillName,
      skillDir,
      summary,
      hasCriticalIssues: hasCriticalFindings(summary.findings),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      skillName,
      skillDir,
      error: errorMessage,
    };
  }
}

export function getSkillsWithCriticalIssues(
  auditResult: WorkspaceAuditResult,
): string[] {
  const result: string[] = [];
  for (const [skillName, findings] of Object.entries(auditResult.findingsBySkill)) {
    if (hasCriticalFindings(findings)) {
      result.push(skillName);
    }
  }
  return result.sort();
}

export function getSkillIssueCount(
  auditResult: WorkspaceAuditResult,
  skillName: string,
): { critical: number; warn: number; info: number; total: number } {
  const findings = auditResult.findingsBySkill[skillName] || [];
  let critical = 0;
  let warn = 0;
  let info = 0;

  for (const finding of findings) {
    if (finding.severity === "critical") critical++;
    else if (finding.severity === "warn") warn++;
    else info++;
  }

  return {
    critical,
    warn,
    info,
    total: findings.length,
  };
}

export function formatAuditReport(auditResult: WorkspaceAuditResult): string {
  const lines = [
    "Workspace Skills Audit Report",
    "============================",
    "",
    `Workspace: ${auditResult.workspaceDir}`,
    `Skills directory: ${auditResult.skillsDir}`,
    `Skills scanned: ${auditResult.skillsScanned}`,
    "",
    "Summary:",
    `  Total findings: ${auditResult.summary.findings.length}`,
    `  Critical: ${auditResult.summary.critical}`,
    `  Warn: ${auditResult.summary.warn}`,
    `  Info: ${auditResult.summary.info}`,
    `  Files scanned: ${auditResult.summary.scannedFiles}`,
    `  Has critical issues: ${auditResult.hasCriticalIssues ? "YES" : "NO"}`,
    "",
  ];

  if (auditResult.skillNames.length > 0) {
    lines.push("Skills:");
    for (const skillName of auditResult.skillNames) {
      const counts = getSkillIssueCount(auditResult, skillName);
      lines.push(
        `  ${skillName}: ${counts.total} issues (${counts.critical} critical, ${counts.warn} warn, ${counts.info} info)`,
      );
    }
  }

  return lines.join("\n");
}
