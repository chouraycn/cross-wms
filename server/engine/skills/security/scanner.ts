import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import {
  scanForMaliciousCode,
  MaliciousScanResult,
} from "./malicious-scanner.js";
import {
  checkDependencySecurity,
  DependencyScanResult,
} from "./dependency-security.js";

export type SkillScanSeverity = "info" | "warn" | "critical";

export type SkillScanFinding = {
  ruleId: string;
  severity: SkillScanSeverity;
  file: string;
  line: number;
  message: string;
  evidence: string;
};

export type SkillScanSummary = {
  scannedFiles: number;
  critical: number;
  warn: number;
  info: number;
  truncated: boolean;
  findings: SkillScanFinding[];
  maliciousCodeScan?: MaliciousScanResult;
  dependencySecurityScan?: DependencyScanResult;
};

export type SkillScanOptions = {
  excludeTestFiles?: boolean;
  includeHiddenDirectories?: boolean;
  includeNodeModules?: boolean;
  maxFiles?: number;
  maxFileBytes?: number;
};

const SCANNABLE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".jsx",
  ".tsx",
  ".md",
]);

const DEFAULT_MAX_SCAN_FILES = 500;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

type LineRule = {
  ruleId: string;
  severity: SkillScanSeverity;
  message: string;
  pattern: RegExp;
  requiresContext?: RegExp;
};

type SourceRule = {
  ruleId: string;
  severity: SkillScanSeverity;
  message: string;
  pattern: RegExp;
  requiresContext?: RegExp;
  requiresContextWindowLines?: number;
};

const LINE_RULES: LineRule[] = [
  {
    ruleId: "dangerous-exec",
    severity: "critical",
    message: "Shell command execution detected (child_process)",
    pattern: /\b(exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(/,
    requiresContext: /child_process/,
  },
  {
    ruleId: "dynamic-code-execution",
    severity: "critical",
    message: "Dynamic code execution detected",
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
  },
  {
    ruleId: "crypto-mining",
    severity: "critical",
    message: "Possible crypto-mining reference detected",
    pattern: /stratum\+tcp|stratum\+ssl|coinhive|cryptonight|xmrig/i,
  },
];

const SOURCE_RULES: SourceRule[] = [
  {
    ruleId: "potential-exfiltration",
    severity: "warn",
    message: "File read combined with network send — possible data exfiltration",
    pattern: /readFileSync|readFile/,
    requiresContext: /\bfetch\s*\(|\bpost\s*\(/i,
  },
  {
    ruleId: "obfuscated-code",
    severity: "warn",
    message: "Hex-encoded string sequence detected (possible obfuscation)",
    pattern: /(\\x[0-9a-fA-F]{2}){6,}/,
  },
  {
    ruleId: "env-harvesting",
    severity: "critical",
    message:
      "Environment variable access combined with network send — possible credential harvesting",
    pattern: /process\.env/,
    requiresContext: /\bfetch\s*\(|\bpost\s*\(/i,
    requiresContextWindowLines: 8,
  },
];

const SKILL_CONTENT_RULES: SourceRule[] = [
  {
    ruleId: "prompt-injection-ignore-instructions",
    severity: "critical",
    message: "Prompt-injection wording attempts to override higher-priority instructions",
    pattern: /ignore (all|any|previous|above|prior) instructions/i,
  },
  {
    ruleId: "prompt-injection-system",
    severity: "critical",
    message: "Skill text references hidden prompt layers",
    pattern: /\b(system prompt|developer message|hidden instructions)\b/i,
  },
  {
    ruleId: "shell-pipe-to-shell",
    severity: "critical",
    message: "Skill text includes pipe-to-shell install pattern",
    pattern: /\b(curl|wget)\b[^|\n]{0,120}\|\s*(sh|bash|zsh)\b/i,
  },
  {
    ruleId: "secret-exfiltration",
    severity: "critical",
    message: "Skill text may exfiltrate environment variables",
    pattern: /\b(process\.env|env)\b.{0,80}\b(fetch|curl|wget|http|https)\b/i,
  },
  {
    ruleId: "destructive-delete",
    severity: "warn",
    message: "Skill text contains broad destructive delete command",
    pattern: /\brm\s+-rf\s+(\/|\$HOME|~|\.)/i,
  },
  {
    ruleId: "unsafe-permissions",
    severity: "warn",
    message: "Skill text contains unsafe permission change",
    pattern: /\bchmod\s+(-R\s+)?777\b/i,
  },
];

function truncateEvidence(evidence: string, maxLen = 120): string {
  if (evidence.length <= maxLen) {
    return evidence;
  }
  return `${evidence.slice(0, maxLen)}…`;
}

function isScannable(filePath: string): boolean {
  return SCANNABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function findSourceRuleMatch(params: {
  rule: SourceRule;
  source: string;
  lines: string[];
}): { line: number; evidence: string } | null {
  if (!params.rule.pattern.test(params.source)) {
    return null;
  }
  if (params.rule.requiresContext && !params.rule.requiresContext.test(params.source)) {
    return null;
  }

  for (let i = 0; i < params.lines.length; i++) {
    if (!params.rule.pattern.test(params.lines[i] ?? "")) {
      continue;
    }

    if (params.rule.requiresContext && params.rule.requiresContextWindowLines !== undefined) {
      const start = Math.max(0, i - params.rule.requiresContextWindowLines);
      const end = Math.min(params.lines.length, i + params.rule.requiresContextWindowLines + 1);
      const windowSource = params.lines.slice(start, end).join("\n");
      if (!params.rule.requiresContext.test(windowSource)) {
        continue;
      }
    }

    return { line: i + 1, evidence: params.lines[i] ?? "" };
  }

  if (params.rule.requiresContextWindowLines !== undefined) {
    return null;
  }

  return { line: 1, evidence: params.source.slice(0, 120) };
}

export function scanSource(source: string, filePath: string): SkillScanFinding[] {
  const findings: SkillScanFinding[] = [];
  const lines = source.split("\n");
  const matchedLineRules = new Set<string>();

  for (const rule of LINE_RULES) {
    if (matchedLineRules.has(rule.ruleId)) {
      continue;
    }

    if (rule.requiresContext && !rule.requiresContext.test(source)) {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const match = rule.pattern.exec(line);
      if (!match) {
        continue;
      }

      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        file: filePath,
        line: i + 1,
        message: rule.message,
        evidence: truncateEvidence(line.trim()),
      });
      matchedLineRules.add(rule.ruleId);
      break;
    }
  }

  const matchedSourceRules = new Set<string>();
  for (const rule of SOURCE_RULES) {
    const ruleKey = `${rule.ruleId}::${rule.message}`;
    if (matchedSourceRules.has(ruleKey)) {
      continue;
    }

    const match = findSourceRuleMatch({
      rule,
      source,
      lines,
    });
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: rule.ruleId,
      severity: rule.severity,
      file: filePath,
      line: match.line,
      message: rule.message,
      evidence: truncateEvidence(lines[match.line - 1]?.trim() ?? match.evidence.trim()),
    });
    matchedSourceRules.add(ruleKey);
  }

  return findings;
}

export function scanSkillContent(content: string, filePath: string): SkillScanFinding[] {
  const findings: SkillScanFinding[] = [];
  const lines = content.split("\n");
  const matchedRules = new Set<string>();

  for (const rule of SKILL_CONTENT_RULES) {
    if (matchedRules.has(rule.ruleId)) {
      continue;
    }
    const match = findSourceRuleMatch({
      rule,
      source: content,
      lines,
    });
    if (!match) {
      continue;
    }
    findings.push({
      ruleId: rule.ruleId,
      severity: rule.severity,
      file: filePath,
      line: match.line,
      message: rule.message,
      evidence: truncateEvidence(lines[match.line - 1]?.trim() ?? match.evidence.trim()),
    });
    matchedRules.add(rule.ruleId);
  }

  return findings;
}

export async function scanDirectoryWithSummary(
  dirPath: string,
  opts?: SkillScanOptions,
): Promise<SkillScanSummary> {
  const excludeTestFiles = opts?.excludeTestFiles ?? false;
  const includeHiddenDirectories = opts?.includeHiddenDirectories ?? false;
  const includeNodeModules = opts?.includeNodeModules ?? false;
  const maxFiles = Math.max(1, opts?.maxFiles ?? DEFAULT_MAX_SCAN_FILES);
  const maxFileBytes = Math.max(1, opts?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES);

  const allFindings: SkillScanFinding[] = [];
  let scannedFiles = 0;
  let critical = 0;
  let warn = 0;
  let info = 0;
  let truncated = false;
  let maliciousCodeScan: MaliciousScanResult | undefined;
  let dependencySecurityScan: DependencyScanResult | undefined;

  try {
    const files = await collectScannableFiles(dirPath, {
      excludeTestFiles,
      includeHiddenDirectories,
      includeNodeModules,
      maxFiles,
    });

    truncated = files.truncated;

    let combinedSource = "";

    for (const file of files.paths) {
      try {
        const stat = await fs.stat(file);
        if (stat.size > maxFileBytes) {
          continue;
        }

        const source = await fs.readFile(file, "utf-8");
        combinedSource += source + "\n";

        let findings: SkillScanFinding[];

        if (file.endsWith(".md")) {
          findings = scanSkillContent(source, file);
        } else {
          findings = scanSource(source, file);
        }

        scannedFiles += 1;
        for (const finding of findings) {
          allFindings.push(finding);
          if (finding.severity === "critical") critical += 1;
          else if (finding.severity === "warn") warn += 1;
          else info += 1;
        }
      } catch (err) {
        logger.debug("[Skills] Failed to scan file:", file, err);
      }
    }

    const skillName = path.basename(dirPath);
    maliciousCodeScan = scanForMaliciousCode(combinedSource, skillName);

    for (const finding of maliciousCodeScan.findings) {
      allFindings.push({
        ruleId: finding.patternId,
        severity: finding.severity as SkillScanSeverity,
        file: dirPath,
        line: finding.line,
        message: finding.description,
        evidence: finding.evidence,
      });
      if (finding.severity === "critical") critical += 1;
      else if (finding.severity === "warn") warn += 1;
      else info += 1;
    }

    dependencySecurityScan = await checkDependencySecurity(dirPath);

    for (const vulnerability of dependencySecurityScan.vulnerabilities) {
      const severity = vulnerability.severity === "high" ? "critical" : vulnerability.severity;
      allFindings.push({
        ruleId: `dep-vuln-${vulnerability.name}`,
        severity: severity as SkillScanSeverity,
        file: path.join(dirPath, "package.json"),
        line: 0,
        message: `${vulnerability.name}@${vulnerability.version} has ${vulnerability.severity} vulnerability${vulnerability.cve ? ` (${vulnerability.cve})` : ""}: ${vulnerability.description}`,
        evidence: vulnerability.fixedVersion ? `Fixed in ${vulnerability.fixedVersion}` : "",
      });
      if (severity === "critical") critical += 1;
      else if (severity === "warn") warn += 1;
      else info += 1;
    }
  } catch (err) {
    logger.error("[Skills] Directory scan failed:", err);
  }

  return {
    scannedFiles,
    critical,
    warn,
    info,
    truncated,
    findings: allFindings,
    maliciousCodeScan,
    dependencySecurityScan,
  };
}

async function collectScannableFiles(
  dirPath: string,
  opts: {
    excludeTestFiles: boolean;
    includeHiddenDirectories: boolean;
    includeNodeModules: boolean;
    maxFiles: number;
  },
): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  const stack: string[] = [dirPath];
  const testDirNames = new Set(["__fixtures__", "__mocks__", "__tests__", "test", "tests"]);
  const testFilePattern = /\.(?:mock|spec|test)\.[^.]+$/i;

  while (stack.length > 0 && paths.length < opts.maxFiles) {
    const currentDir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true }) as import("node:fs").Dirent[];
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (paths.length >= opts.maxFiles) break;

      if (!opts.includeHiddenDirectories && entry.name.startsWith(".")) {
        continue;
      }
      if (!opts.includeNodeModules && entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (opts.excludeTestFiles && testDirNames.has(entry.name)) {
          continue;
        }
        stack.push(fullPath);
      } else if (entry.isFile() && isScannable(entry.name)) {
        if (opts.excludeTestFiles && testFilePattern.test(entry.name)) {
          continue;
        }
        paths.push(fullPath);
      }
    }
  }

  return { paths, truncated: paths.length >= opts.maxFiles };
}

export function getSeverityCount(
  findings: SkillScanFinding[],
  severity: SkillScanSeverity,
): number {
  return findings.filter((f) => f.severity === severity).length;
}

export function hasCriticalFindings(findings: SkillScanFinding[]): boolean {
  return findings.some((f) => f.severity === "critical");
}

export function filterFindingsBySeverity(
  findings: SkillScanFinding[],
  severity: SkillScanSeverity,
): SkillScanFinding[] {
  return findings.filter((f) => f.severity === severity);
}
