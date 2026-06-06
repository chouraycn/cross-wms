/**
 * Security Auditor Service
 *
 * 7-step static security audit engine for SKILL.md files.
 * Analyzes skill content for dangerous patterns, file operations,
 * network requests, and dependency risks. Generates scored reports.
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb, createSkillAudit } from '../db';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===================== Types =====================

export interface AuditFinding {
  type: 'malicious' | 'suspicious' | 'informational';
  category: string;
  pattern: string;
  line?: number;
  snippet: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
}

export interface AuditResultSummary {
  skillName: string;
  skillPath: string;
  auditedAt: string;
  totalFindings: number;
  maliciousCount: number;
  suspiciousCount: number;
  informationalCount: number;
  score: number;
  level: 'safe' | 'suspicious' | 'malicious';
}

export interface AuditResultDetails {
  commandExecutionHits: number;
  fileOperationHits: number;
  networkRequestHits: number;
  dependencyHits: number;
}

export interface AuditResult {
  summary: AuditResultSummary;
  maliciousFindings: AuditFinding[];
  suspiciousFindings: AuditFinding[];
  informationalNotes: AuditFinding[];
  details: AuditResultDetails;
  recommendations: string[];
}

// ===================== Step 2: Dangerous Keyword Patterns =====================

const COMMAND_EXEC_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /curl\s+.*\|\s*(bash|sh|zsh)/i, name: 'curl-pipe-shell' },
  { regex: /wget\s+.*\|\s*(bash|sh|zsh)/i, name: 'wget-pipe-shell' },
  { regex: /eval\s*\(/i, name: 'eval-call' },
  { regex: /exec\s*\(/i, name: 'exec-call' },
  { regex: /subprocess/i, name: 'subprocess-module' },
  { regex: /os\.system/i, name: 'os-system' },
  { regex: /shell_exec/i, name: 'shell-exec' },
  { regex: /popen/i, name: 'popen' },
  { regex: /Runtime\.exec/i, name: 'runtime-exec' },
  { regex: /ProcessBuilder/i, name: 'process-builder' },
];

const STEALTH_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /silently/i, name: 'silently-flag' },
  { regex: /2>\/dev\/null/, name: 'stderr-suppression' },
  { regex: /&>\/dev\/null/, name: 'all-output-suppression' },
  { regex: /nohup/, name: 'nohup' },
  { regex: /--quiet/, name: 'quiet-flag' },
  { regex: /--silent/, name: 'silent-flag' },
];

const PRIVILEGE_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /sudo/, name: 'sudo-usage' },
  { regex: /chmod\s+777/, name: 'chmod-777' },
  { regex: /chown/, name: 'chown-usage' },
];

// ===================== Step 3: File Operations & Sensitive Paths =====================

const SENSITIVE_PATH_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /~\/\.ssh/, name: 'ssh-dir-access' },
  { regex: /~\/\.gnupg/, name: 'gnupg-dir-access' },
  { regex: /\/etc\/passwd/, name: 'passwd-file-access' },
  { regex: /\/etc\/shadow/, name: 'shadow-file-access' },
  { regex: /\/etc\/hosts/, name: 'hosts-file-access' },
  { regex: /\.env/, name: 'env-file-access' },
  { regex: /credentials/, name: 'credentials-access' },
  { regex: /secrets/, name: 'secrets-access' },
  { regex: /api_key/, name: 'api-key-access' },
  { regex: /private_key/, name: 'private-key-access' },
];

const FILE_OP_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /rm\s+-rf/, name: 'recursive-delete' },
  { regex: /unlink/, name: 'unlink-file' },
  { regex: /shutil\.rmtree/, name: 'rmtree' },
  { regex: /\.writeFile/i, name: 'write-file' },
  { regex: /\.readFile/i, name: 'read-file' },
];

// ===================== Step 4: Network Request Patterns =====================

const NETWORK_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /https?:\/\/[^\s"'`)\]]+/gi, name: 'url-pattern' },
  { regex: /curl\s+/i, name: 'curl-command' },
  { regex: /wget\s+/i, name: 'wget-command' },
  { regex: /fetch\s*\(/i, name: 'fetch-call' },
  { regex: /axios/i, name: 'axios-usage' },
  { regex: /requests\.(get|post)/i, name: 'requests-http' },
];

const BASE64_PATTERN = /[A-Za-z0-9+/]{20,}={0,2}/g;

// ===================== Step 5: Dependency Installation Risk =====================

const DEP_INSTALL_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /pip\s+install\s+\w+(?!\s*==)/i, name: 'pip-unpinned-install' },
  { regex: /npm\s+install\s+-g\s+\w+(?!\s*@)/i, name: 'npm-global-unpinned' },
  { regex: /yarn\s+global\s+add/i, name: 'yarn-global-add' },
];

// ===================== Helper Functions =====================

/** Count regex matches in content */
function countMatches(content: string, regexList: Array<{ regex: RegExp; name: string }>): number {
  let total = 0;
  for (const { regex } of regexList) {
    const matches = content.match(regex);
    if (matches) {
      total += matches.length;
    }
  }
  return total;
}

/** Extract a snippet around a match position */
function extractSnippet(content: string, lineIndex: number): string {
  const lines = content.split('\n');
  const start = Math.max(0, lineIndex - 1);
  const end = Math.min(lines.length, lineIndex + 2);
  return lines.slice(start, end).join('\n').substring(0, 200);
}

/** Find line number for a regex match in content */
function findLineNumber(content: string, matchText: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(matchText.substring(0, Math.min(matchText.length, 40)))) {
      return i + 1;
    }
  }
  return 0;
}

/** Search content for pattern matches and build findings */
function searchPatterns(
  content: string,
  patterns: Array<{ regex: RegExp; name: string }>,
  findingType: 'malicious' | 'suspicious' | 'informational',
  category: string,
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
  descriptionTemplate: string
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const { regex, name } of patterns) {
    const matches = content.match(regex);
    if (matches) {
      // Deduplicate matches
      const uniqueMatches = [...new Set(matches)];
      for (const match of uniqueMatches) {
        const line = findLineNumber(content, match);
        findings.push({
          type: findingType,
          category,
          pattern: name,
          line: line > 0 ? line : undefined,
          snippet: line > 0 ? extractSnippet(content, line - 1) : match.substring(0, 200),
          severity,
          description: `${descriptionTemplate}: ${match.substring(0, 80)}`,
        });
      }
    }
  }
  return findings;
}

/** Check if any of the given patterns match the content */
function hasMatch(content: string, patterns: Array<{ regex: RegExp; name: string }>): boolean {
  for (const { regex } of patterns) {
    if (regex.test(content)) {
      return true;
    }
  }
  return false;
}

// ===================== Main Audit Function =====================

/**
 * Perform a 7-step static security audit on a SKILL.md file.
 *
 * @param skillPath - Absolute path to the SKILL.md file
 * @param content   - Pre-read file content (to avoid duplicate I/O)
 * @returns Complete audit result with findings and recommendations
 */
export async function auditSkillMd(skillPath: string, content: string): Promise<AuditResult> {
  // Step 1: Record basic information (content already provided by caller)
  const dirName = path.basename(path.dirname(skillPath));
  const skillName = dirName;
  const auditedAt = new Date().toISOString();

  // Step 2: Search for dangerous keywords
  const commandExecFindings = searchPatterns(
    content,
    COMMAND_EXEC_PATTERNS,
    'malicious',
    'command-execution',
    'critical',
    'Dangerous command execution pattern detected'
  );

  const stealthFindings = searchPatterns(
    content,
    STEALTH_PATTERNS,
    'suspicious',
    'stealth-behavior',
    'high',
    'Stealth/disguise pattern detected'
  );

  const privilegeFindings = searchPatterns(
    content,
    PRIVILEGE_PATTERNS,
    'suspicious',
    'privilege-escalation',
    'high',
    'Privilege escalation pattern detected'
  );

  // Step 3: Check file operations and sensitive paths
  const sensitivePathFindings = searchPatterns(
    content,
    SENSITIVE_PATH_PATTERNS,
    'suspicious',
    'sensitive-path-access',
    'high',
    'Access to sensitive file path detected'
  );

  const fileOpFindings = searchPatterns(
    content,
    FILE_OP_PATTERNS,
    'suspicious',
    'file-operations',
    'medium',
    'File operation detected'
  );

  // Step 4: Network request detection
  const networkFindings = searchPatterns(
    content,
    NETWORK_PATTERNS,
    'informational',
    'network-requests',
    'low',
    'Network request pattern detected'
  );

  // Check for base64-encoded data (potential obfuscation)
  const base64Findings: AuditFinding[] = [];
  const base64Matches = content.match(BASE64_PATTERN);
  if (base64Matches && base64Matches.length > 0) {
    // Only flag if there are suspicious base64 strings (long ones that might contain obfuscated code)
    const suspiciousBase64 = base64Matches.filter((m: string) => m.length > 30);
    if (suspiciousBase64.length > 0) {
      base64Findings.push({
        type: 'suspicious',
        category: 'obfuscation',
        pattern: 'base64-encoded-data',
        line: findLineNumber(content, suspiciousBase64[0].substring(0, 20)),
        snippet: suspiciousBase64[0].substring(0, 100),
        severity: 'medium',
        description: `Base64-encoded string detected (${suspiciousBase64.length} occurrences), possible obfuscation`,
      });
    }
  }

  // Step 5: Dependency installation risk
  const depFindings = searchPatterns(
    content,
    DEP_INSTALL_PATTERNS,
    'suspicious',
    'dependency-risk',
    'high',
    'Unpinned dependency installation detected'
  );

  // Step 6: Calculate score and determine level
  let score = 100;

  // COMMAND_EXEC: -10 each
  const commandExecCount = commandExecFindings.length;
  score -= commandExecCount * 10;

  // STEALTH + COMMAND_EXEC combination: additional -15
  if (stealthFindings.length > 0 && commandExecCount > 0) {
    score -= 15;
  }

  // SENSITIVE_PATH + NETWORK combination: additional -20
  const hasSensitivePath = sensitivePathFindings.length > 0;
  const hasNetwork = networkFindings.length > 0;
  if (hasSensitivePath && hasNetwork) {
    score -= 20;
  }

  // PRIVILEGE + COMMAND_EXEC combination: additional -20
  if (privilegeFindings.length > 0 && commandExecCount > 0) {
    score -= 20;
  }

  // FILE_OP destructive operations (rm -rf etc): -15
  const destructiveFileOps = fileOpFindings.filter(
    (f: AuditFinding) => f.pattern === 'recursive-delete' || f.pattern === 'rmtree'
  );
  if (destructiveFileOps.length > 0) {
    score -= 15;
  }

  // Clamp score to [0, 100]
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: 'safe' | 'suspicious' | 'malicious';
  if (score >= 80) {
    level = 'safe';
  } else if (score >= 50) {
    level = 'suspicious';
  } else {
    level = 'malicious';
  }

  // Collect all findings by type
  const maliciousFindings: AuditFinding[] = [...commandExecFindings];
  const suspiciousFindings: AuditFinding[] = [
    ...stealthFindings,
    ...privilegeFindings,
    ...sensitivePathFindings,
    ...fileOpFindings.filter((f: AuditFinding) => f.pattern !== 'read-file' && f.pattern !== 'write-file'),
    ...base64Findings,
    ...depFindings,
  ];
  const informationalNotes: AuditFinding[] = [
    ...networkFindings,
    ...fileOpFindings.filter(
      (f: AuditFinding) => f.pattern === 'read-file' || f.pattern === 'write-file'
    ),
  ];

  const totalFindings = maliciousFindings.length + suspiciousFindings.length + informationalNotes.length;

  // Step 7: Build recommendations
  const recommendations: string[] = [];
  if (commandExecCount > 0) {
    recommendations.push('⚠️ 检测到命令执行模式，建议确认是否存在任意代码执行风险');
  }
  if (stealthFindings.length > 0) {
    recommendations.push('⚠️ 检测到隐蔽行为模式，建议审查是否试图隐藏操作痕迹');
  }
  if (hasSensitivePath) {
    recommendations.push('⚠️ 检测到敏感路径访问，建议确认是否有读取敏感文件的意图');
  }
  if (destructiveFileOps.length > 0) {
    recommendations.push('🔴 检测到破坏性文件操作，强烈建议禁止或严格审查');
  }
  if (depFindings.length > 0) {
    recommendations.push('⚠️ 检测到未固定版本的依赖安装，建议锁定版本号以防止供应链攻击');
  }
  if (networkFindings.length > 0) {
    recommendations.push('ℹ️ 检测到网络请求，建议确认请求目标是否为可信域名');
  }
  if (base64Findings.length > 0) {
    recommendations.push('⚠️ 检测到 Base64 编码数据，建议确认是否用于代码混淆');
  }
  if (level === 'safe') {
    recommendations.push('✅ 该技能通过基础安全审查，未发现严重风险');
  }

  // Details
  const details: AuditResultDetails = {
    commandExecutionHits: commandExecCount,
    fileOperationHits: fileOpFindings.length,
    networkRequestHits: networkFindings.length,
    dependencyHits: depFindings.length,
  };

  const summary: AuditResultSummary = {
    skillName,
    skillPath,
    auditedAt,
    totalFindings,
    maliciousCount: maliciousFindings.length,
    suspiciousCount: suspiciousFindings.length,
    informationalCount: informationalNotes.length,
    score,
    level,
  };

  return {
    summary,
    maliciousFindings,
    suspiciousFindings,
    informationalNotes,
    details,
    recommendations,
  };
}

// ===================== Report Generators =====================

/**
 * Generate a Markdown report from audit result.
 */
export function generateMarkdownReport(result: AuditResult): string {
  let md = '# 安全审计报告\n\n';

  md += '## 执行摘要\n';
  md += `- **审计对象**: ${result.summary.skillName}\n`;
  md += `- **审计路径**: ${result.summary.skillPath}\n`;
  md += `- **审计时间**: ${result.summary.auditedAt}\n`;
  md += `- **发现问题总数**: ${result.summary.totalFindings}\n`;
  md += `- **恶意风险**: ${result.summary.maliciousCount}\n`;
  md += `- **可疑风险**: ${result.summary.suspiciousCount}\n`;
  md += `- **提示信息**: ${result.summary.informationalCount}\n`;
  md += `- **安全评分**: ${result.summary.score} / 100\n`;
  md += `- **风险等级**: **${result.summary.level}**\n\n`;

  md += '## 详细检查结果\n\n';

  md += '### 命令执行检查\n';
  md += `- 命中次数: ${result.details.commandExecutionHits}\n\n`;

  md += '### 文件操作检查\n';
  md += `- 命中次数: ${result.details.fileOperationHits}\n\n`;

  md += '### 网络请求检查\n';
  md += `- 命中次数: ${result.details.networkRequestHits}\n\n`;

  md += '### 依赖风险检查\n';
  md += `- 命中次数: ${result.details.dependencyHits}\n\n`;

  if (result.maliciousFindings.length > 0) {
    md += '## 恶意风险发现\n\n';
    for (const f of result.maliciousFindings) {
      md += `### ${f.pattern}\n`;
      md += `- **严重程度**: ${f.severity}\n`;
      md += `- **说明**: ${f.description}\n`;
      if (f.line) md += `- **行号**: ${f.line}\n`;
      md += `\`\`\`\n${f.snippet}\n\`\`\`\n\n`;
    }
  }

  if (result.suspiciousFindings.length > 0) {
    md += '## 可疑风险发现\n\n';
    for (const f of result.suspiciousFindings) {
      md += `### ${f.pattern}\n`;
      md += `- **类别**: ${f.category}\n`;
      md += `- **严重程度**: ${f.severity}\n`;
      md += `- **说明**: ${f.description}\n`;
      if (f.line) md += `- **行号**: ${f.line}\n`;
      md += `\`\`\`\n${f.snippet}\n\`\`\`\n\n`;
    }
  }

  if (result.informationalNotes.length > 0) {
    md += '## 提示信息\n\n';
    for (const f of result.informationalNotes) {
      md += `- **${f.pattern}**: ${f.description}\n`;
    }
    md += '\n';
  }

  md += '## 建议措施\n\n';
  for (const rec of result.recommendations) {
    md += `- ${rec}\n`;
  }

  return md;
}

/**
 * Generate a JSON report string from audit result.
 */
export function generateJsonReport(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}

// ===================== Batch Audit =====================

/**
 * Batch audit all skills in ~/.workbuddy/skills/ at startup.
 * Non-blocking; should be called with a delay after server starts.
 */
export async function batchAuditSkills(): Promise<void> {
  const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.log('[SecurityAuditor] Skills directory does not exist, skipping batch audit');
    return;
  }

  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean }>;
  } catch {
    console.error('[SecurityAuditor] Failed to read skills directory');
    return;
  }

  const db = initDb();
  let auditedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '__MACOSX') {
      continue;
    }

    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    const skillMdLowerPath = path.join(skillsDir, entry.name, 'skill.md');

    let mdPath: string | null = null;
    if (fs.existsSync(skillMdPath)) {
      mdPath = skillMdPath;
    } else if (fs.existsSync(skillMdLowerPath)) {
      mdPath = skillMdLowerPath;
    }

    if (!mdPath) {
      continue;
    }

    try {
      const content = fs.readFileSync(mdPath, 'utf-8');
      const version = crypto.createHash('sha256').update(content).digest('hex');

      // Check if already audited for this version
      const existing = db.prepare(
        'SELECT id FROM skill_audits WHERE skill_id = ? AND skill_version = ?'
      ).get(entry.name, version) as { id: string } | undefined;

      if (existing) {
        skippedCount++;
        continue;
      }

      const result = await auditSkillMd(mdPath, content);
      const id = uuidv4();
      const now = new Date().toISOString();

      createSkillAudit({
        id,
        skillId: entry.name,
        skillVersion: version,
        score: result.summary.score,
        level: result.summary.level,
        reportJson: generateJsonReport(result),
        reportMarkdown: generateMarkdownReport(result),
        triggeredBy: 'batch-startup',
        createdAt: now,
      });

      auditedCount++;
      console.log(`[SecurityAuditor] Audited "${entry.name}": score=${result.summary.score}, level=${result.summary.level}`);
    } catch (e) {
      errorCount++;
      console.error(`[SecurityAuditor] Failed to audit "${entry.name}":`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[SecurityAuditor] Batch audit complete: ${auditedCount} audited, ${skippedCount} skipped, ${errorCount} errors`);
}
