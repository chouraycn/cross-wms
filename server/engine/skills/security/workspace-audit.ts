import fs from "node:fs/promises";
import path from "node:path";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skills" } as any);

const MAX_WORKSPACE_SKILL_SCAN_FILES_PER_WORKSPACE = 2000;

export interface SecurityAuditFinding {
  checkId: string;
  severity: "error" | "warn" | "info";
  title: string;
  detail: string;
  remediation?: string;
}

async function safeStat(targetPath: string): Promise<{ ok: boolean; isDir: boolean }> {
  try {
    const lst = await fs.lstat(targetPath);
    return { ok: true, isDir: lst.isDirectory() };
  } catch {
    return { ok: false, isDir: false };
  }
}

function realpathWithTimeout(p: string, timeoutMs = 2000): Promise<string | null> {
  let timerHandle: ReturnType<typeof setTimeout> | undefined;

  const realpathPromise = fs
    .realpath(p)
    .catch(() => null)
    .then((result) => {
      clearTimeout(timerHandle);
      return result;
    });

  const timeoutPromise = new Promise<null>((resolve) => {
    timerHandle = setTimeout(() => resolve(null), timeoutMs);
    timerHandle.unref?.();
  });

  return Promise.race([realpathPromise, timeoutPromise]);
}

async function listWorkspaceSkillMarkdownFiles(
  workspaceDir: string,
  maxFiles = MAX_WORKSPACE_SKILL_SCAN_FILES_PER_WORKSPACE,
): Promise<{ skillFilePaths: string[]; truncated: boolean }> {
  const skillsRoot = path.join(workspaceDir, "skills");
  const rootStat = await safeStat(skillsRoot);
  if (!rootStat.ok || !rootStat.isDir) {
    return { skillFilePaths: [], truncated: false };
  }

  const skillFiles: string[] = [];
  const queue: string[] = [skillsRoot];
  const visitedDirs = new Set<string>();
  const maxTotalDirVisits = maxFiles * 20;

  for (const _ of Array.from({ length: maxTotalDirVisits })) {
    if (queue.length === 0 || skillFiles.length >= maxFiles) {
      break;
    }
    const dir = queue.shift()!;
    const dirRealPath = (await realpathWithTimeout(dir)) ?? path.resolve(dir);
    if (visitedDirs.has(dirRealPath)) {
      continue;
    }
    visitedDirs.add(dirRealPath);

    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        const stat = await fs.stat(fullPath).catch(() => null);
        if (!stat) {
          continue;
        }
        if (stat.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (stat.isFile() && entry.name === "SKILL.md") {
          skillFiles.push(fullPath);
        }
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        skillFiles.push(fullPath);
      }
    }
  }

  return { skillFilePaths: skillFiles, truncated: queue.length > 0 };
}

export async function collectWorkspaceSkillSymlinkEscapeFindings(
  workspaceDirs: string[],
): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];
  if (workspaceDirs.length === 0) {
    return findings;
  }

  const seenSkillPaths = new Set<string>();

  for (const workspaceDir of workspaceDirs) {
    const workspacePath = path.resolve(workspaceDir);
    const workspaceRealPath = (await realpathWithTimeout(workspacePath)) ?? workspacePath;
    const { skillFilePaths, truncated } = await listWorkspaceSkillMarkdownFiles(workspacePath);

    if (truncated) {
      findings.push({
        checkId: "skills.workspace.scan_truncated",
        severity: "warn",
        title: "Workspace skill scan reached the directory visit limit",
        detail:
          `The skills/ directory scan in ${workspacePath} stopped early after reaching the ` +
          `BFS visit cap. Skill files in the unscanned portion of the tree were not checked ` +
          "for symlink escapes.",
        remediation:
          "Flatten or simplify the skills/ directory hierarchy to stay within the scan budget, " +
          "or move deeply-nested skill collections to a managed skill location.",
      });
    }

    for (const skillFilePath of skillFilePaths) {
      const canonicalSkillPath = path.resolve(skillFilePath);
      if (seenSkillPaths.has(canonicalSkillPath)) {
        continue;
      }
      seenSkillPaths.add(canonicalSkillPath);

      const skillRealPath = (await realpathWithTimeout(skillFilePath)) ?? canonicalSkillPath;
      if (skillRealPath !== canonicalSkillPath) {
        if (!skillRealPath.startsWith(workspaceRealPath)) {
          findings.push({
            checkId: "skills.workspace.symlink_escape",
            severity: "error",
            title: "Skill file escapes workspace via symlink",
            detail:
              `Found a symlink at ${skillFilePath} that resolves outside the workspace directory ` +
              `(${skillRealPath}). This could allow skills to read or execute content from ` +
              "unexpected locations.",
            remediation:
              "Remove or relocate symlinks that point outside the workspace, or move the " +
              "target content inside the workspace skills directory.",
          });
        }
      }
    }
  }

  return findings;
}

export async function auditWorkspaceSkills(workspaceDir: string): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];

  try {
    const { skillFilePaths } = await listWorkspaceSkillMarkdownFiles(workspaceDir);

    for (const skillFilePath of skillFilePaths) {
      const content = await fs.readFile(skillFilePath, "utf8").catch(() => "");

      if (content.includes("eval(") || content.includes("new Function(")) {
        findings.push({
          checkId: "skills.workspace.dynamic_code",
          severity: "warn",
          title: "Skill contains dynamic code execution",
          detail: `Skill at ${skillFilePath} contains potential dynamic code execution patterns.`,
          remediation: "Review the skill for security risks and remove unnecessary dynamic code.",
        });
      }

      if (content.includes("process.env") && content.includes("SECRET")) {
        findings.push({
          checkId: "skills.workspace.secret_access",
          severity: "warn",
          title: "Skill accesses environment secrets",
          detail: `Skill at ${skillFilePath} accesses environment variables that may contain secrets.`,
          remediation: "Ensure secrets are properly managed and not exposed in skill prompts.",
        });
      }
    }
  } catch (err) {
    logger.error("[Audit] Failed to audit workspace skills:", err);
  }

  return findings;
}

export interface WorkspaceAuditResult {
  findings: SecurityAuditFinding[];
  totalSkills: number;
  criticalCount: number;
  warningCount: number;
}

export interface AuditOptions {
  includeSymlinkCheck?: boolean;
  includeContentScan?: boolean;
  maxFiles?: number;
}

export async function auditSingleSkill(skillPath: string): Promise<SecurityAuditFinding[]> {
  const findings: SecurityAuditFinding[] = [];

  try {
    const content = await fs.readFile(skillPath, "utf8").catch(() => "");
    if (!content) {
      return findings;
    }

    if (content.includes("eval(") || content.includes("new Function(")) {
      findings.push({
        checkId: "skills.single.dynamic_code",
        severity: "warn",
        title: "Skill contains dynamic code execution",
        detail: `Skill at ${skillPath} contains potential dynamic code execution patterns.`,
        remediation: "Review the skill for security risks and remove unnecessary dynamic code.",
      });
    }

    if (content.includes("process.env") && content.includes("SECRET")) {
      findings.push({
        checkId: "skills.single.secret_access",
        severity: "warn",
        title: "Skill accesses environment secrets",
        detail: `Skill at ${skillPath} accesses environment variables that may contain secrets.`,
        remediation: "Ensure secrets are properly managed and not exposed in skill prompts.",
      });
    }

    if (content.includes("<script") || content.includes("javascript:")) {
      findings.push({
        checkId: "skills.single.xss_risk",
        severity: "error",
        title: "Skill contains potential XSS patterns",
        detail: `Skill at ${skillPath} contains potential XSS-related patterns.`,
        remediation: "Remove or sanitize any script tags or javascript: URIs.",
      });
    }
  } catch (err) {
    logger.error("[Audit] Failed to audit single skill:", err);
  }

  return findings;
}

export function getSkillsWithCriticalIssues(findings: SecurityAuditFinding[]): string[] {
  return findings
    .filter((f) => f.severity === "error")
    .map((f) => f.checkId);
}

export function getSkillIssueCount(findings: SecurityAuditFinding[]): {
  critical: number;
  warning: number;
  info: number;
} {
  return {
    critical: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warn").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}

export function formatAuditReport(findings: SecurityAuditFinding[]): string {
  if (findings.length === 0) {
    return "No security issues found.";
  }

  const lines: string[] = ["Security Audit Report", "=" .repeat(40), ""];

  for (const finding of findings) {
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`  Check: ${finding.checkId}`);
    lines.push(`  Detail: ${finding.detail}`);
    if (finding.remediation) {
      lines.push(`  Remediation: ${finding.remediation}`);
    }
    lines.push("");
  }

  const counts = getSkillIssueCount(findings);
  lines.push("Summary:");
  lines.push(`  Critical: ${counts.critical}`);
  lines.push(`  Warning: ${counts.warning}`);
  lines.push(`  Info: ${counts.info}`);

  return lines.join("\n");
}