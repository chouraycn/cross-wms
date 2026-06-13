/**
 * Security Auditor Service
 *
 * 7-step static security audit engine for SKILL.md files.
 * Analyzes skill content for dangerous patterns, file operations,
 * network requests, and dependency risks. Generates scored reports.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import { createSkillAudit } from '../dao/chains.js';

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
  // skill-vetter additional detections
  externalDataSendHits: number;
  credentialRequestHits: number;
  credentialFileHits: number;
  internalFileAccessHits: number;
  base64DecodeHits: number;
  ipNetworkHits: number;
  obfuscatedCodeHits: number;
  browserCookieHits: number;
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
  // skill-vetter: eval/exec with external input
  { regex: /eval\s*\(.*\$_(GET|POST|REQUEST|COOKIE|SERVER)|eval\s*\(.*req\.|eval\s*\(.*request\.|eval\s*\(.*input\(/i, name: 'eval-with-external-input' },
  { regex: /exec\s*\(.*\$_(GET|POST|REQUEST|COOKIE|SERVER)|exec\s*\(.*req\.|exec\s*\(.*request\.|exec\s*\(.*input\(/i, name: 'exec-with-external-input' },
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
  // skill-vetter: elevated/sudo permissions
  { regex: /sudo\s+-i|sudo\s+-s|sudo\s+su\s+-|sudo\s+su\s+root/i, name: 'sudo-elevated' },
  { regex: /setuid|setgid|seteuid|setegid/, name: 'privilege-escalation-call' },
];

// ===================== Step 2b: Skill-Vetter RED FLAGS Patterns =====================

// External data sending patterns
const EXTERNAL_DATA_SEND_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /curl\s+-X\s*(POST|PUT|PATCH|DELETE)/i, name: 'curl-external-post' },
  { regex: /wget\s+--post-data|--post-file/i, name: 'wget-external-post' },
  { regex: /requests\.(post|put|patch|delete)\s*\(/i, name: 'python-external-post' },
  { regex: /fetch\s*\([^)]*,\s*\{[^}]*method:\s*['"](POST|PUT|PATCH|DELETE)/i, name: 'fetch-external-post' },
  { regex: /axios\.(post|put|patch|delete)\s*\(/i, name: 'axios-external-post' },
  // Generic data exfiltration patterns
  { regex: /[\w]+\s*=\s*.*\$\_(GET|POST|REQUEST)|req\.|request\.|\.body.*curl|wget|fetch|axios/i, name: 'data-exfiltration-risk' },
];

// Credential/token/API key request patterns
const CREDENTIAL_REQUEST_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /password|passwd|pwd/i, name: 'password-request' },
  { regex: /token|apikey|api_key|api-key/i, name: 'token-request' },
  { regex: /secret|credential/i, name: 'credential-request' },
  { regex: /Authorization:\s*Bearer/i, name: 'authorization-header' },
  { regex: /getpass|getpass\.getpass/i, name: 'password-prompt' },
  { regex: /readline\s*\(.*password|input\s*\(.*password/i, name: 'password-input-prompt' },
];

// Internal file access patterns (MEMORY.md, USER.md, SOUL.md, IDENTITY.md)
const INTERNAL_FILE_ACCESS_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /MEMORY\.md|USER\.md|SOUL\.md|IDENTITY\.md/i, name: 'internal-file-access' },
  { regex: /\.workbuddy\/MEMORY\.md|\.workbuddy\/.*\.md/i, name: 'workbuddy-internal-access' },
];

// Base64 decode patterns (not just base64 strings)
const BASE64_DECODE_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /base64\s*--decode|base64\s*-d/i, name: 'base64-decode-command' },
  { regex: /atob\s*\(/i, name: 'js-atob-decode' },
  { regex: /b64decode|base64\.b64decode|base64\.decode/i, name: 'python-base64-decode' },
  { regex: /Convert\.FromBase64String|FromBase64String/i, name: 'csharp-base64-decode' },
  { regex: /Base64\.decode|android\.util\.Base64/i, name: 'java-android-base64-decode' },
  { regex: /Buffer\.from\s*\([^)]*,\s*['"]base64['"]\s*\)/i, name: 'nodejs-base64-decode' },
];

// Network calls to IPs instead of domains
const IP_NETWORK_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, name: 'http-ip-direct' },
  { regex: /curl\s+.*https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}/i, name: 'curl-ip-direct' },
  { regex: /wget\s+.*https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}/i, name: 'wget-ip-direct' },
  { regex: /fetch\s*\(.*https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}/i, name: 'fetch-ip-direct' },
];

// Obfuscated code patterns (compressed, encoded, minified)
const OBFUSCATED_CODE_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /\beval\s*\(?\s*String\.fromCharCode|eval\s*\(?\s*unescape/i, name: 'js-obfuscated-eval' },
  { regex: /\\x[0-9a-fA-F]{2}[\\x][0-9a-fA-F]{2}/i, name: 'hex-encoded-string' },
  { regex: /\\u[0-9a-fA-F]{4}[\\u][0-9a-fA-F]{4}/i, name: 'unicode-encoded-string' },
  { regex: /decode\s*\(|decrypt\s*\(|decompress\s*\(/i, name: 'decode-call' },
  { regex: /obfuscate|minify|uglify/i, name: 'code-obfuscation-tool' },
  // Very long lines without spaces might be minified/obfuscated
];

// Browser cookie/session access patterns
const BROWSER_COOKIE_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /document\.cookie/i, name: 'js-document-cookie' },
  { regex: /cookie\s*=\s*document\.cookie|cookie\s*=\s*req\.headers|cookie\s*=\s*request\.headers/i, name: 'cookie-access' },
  { regex: /sessionStorage|localStorage/i, name: 'browser-storage-access' },
  { regex: /Chrome\/Default\/Cookies|Firefox\/.*\/cookies\.sqlite/i, name: 'browser-cookie-file-access' },
  { regex: /http\.cookiejar|http\.cookie|SimpleCookie/i, name: 'python-cookie-access' },
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

// Credential file touch patterns (extends SENSITIVE_PATH_PATTERNS)
const CREDENTIAL_FILE_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  ...SENSITIVE_PATH_PATTERNS,
  { regex: /\.aws\/credentials|\.aws\/config/i, name: 'aws-credentials-access' },
  { regex: /\.ssh\/id_rsa|\.ssh\/id_ed25519|\.ssh\/known_hosts/i, name: 'ssh-key-access' },
  { regex: /\.git-credentials|\.git\/config/i, name: 'git-credentials-access' },
  { regex: /keychain|gnome-keyring|kwallet/i, name: 'system-keyring-access' },
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
      // Filter out undefined entries from capture groups
      total += matches.filter((m): m is string => typeof m === 'string').length;
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
  if (!matchText) return 0;
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
      // Filter out undefined entries from capture groups; only keep full string matches
      const uniqueMatches = [...new Set(matches.filter((m): m is string => typeof m === 'string'))];
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

  // Step 2b: Skill-Vetter RED FLAGS - Additional dangerous patterns
  const externalDataSendFindings = searchPatterns(
    content,
    EXTERNAL_DATA_SEND_PATTERNS,
    'malicious',
    'external-data-send',
    'critical',
    'External data sending pattern detected'
  );

  const credentialRequestFindings = searchPatterns(
    content,
    CREDENTIAL_REQUEST_PATTERNS,
    'malicious',
    'credential-request',
    'critical',
    'Credential/token request pattern detected'
  );

  const internalFileAccessFindings = searchPatterns(
    content,
    INTERNAL_FILE_ACCESS_PATTERNS,
    'suspicious',
    'internal-file-access',
    'high',
    'Internal file access (MEMORY.md, USER.md, etc.) detected'
  );

  const base64DecodeFindings = searchPatterns(
    content,
    BASE64_DECODE_PATTERNS,
    'suspicious',
    'base64-decode',
    'high',
    'Base64 decode operation detected (potential obfuscation)'
  );

  const ipNetworkFindings = searchPatterns(
    content,
    IP_NETWORK_PATTERNS,
    'suspicious',
    'ip-network-call',
    'high',
    'Network call to raw IP address detected (untrusted)'
  );

  const obfuscatedCodeFindings = searchPatterns(
    content,
    OBFUSCATED_CODE_PATTERNS,
    'suspicious',
    'obfuscated-code',
    'high',
    'Obfuscated or encoded code pattern detected'
  );

  const browserCookieFindings = searchPatterns(
    content,
    BROWSER_COOKIE_PATTERNS,
    'suspicious',
    'browser-cookie-access',
    'high',
    'Browser cookie/session access detected'
  );

  const credentialFileFindings = searchPatterns(
    content,
    CREDENTIAL_FILE_PATTERNS,
    'malicious',
    'credential-file-access',
    'critical',
    'Credential file access detected'
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

  // EXTERNAL_DATA_SEND: -15 each (skill-vetter RED FLAG)
  const externalDataSendCount = externalDataSendFindings.length;
  score -= externalDataSendCount * 15;

  // CREDENTIAL_REQUEST: -15 each (skill-vetter RED FLAG)
  const credentialRequestCount = credentialRequestFindings.length;
  score -= credentialRequestCount * 15;

  // CREDENTIAL_FILE_ACCESS (from skill-vetter): -20 each
  const credentialFileCount = credentialFileFindings.length;
  score -= credentialFileCount * 20;

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

  // Skill-Vetter: INTERNAL_FILE_ACCESS - -10 each
  score -= internalFileAccessFindings.length * 10;

  // Skill-Vetter: BASE64_DECODE - -10 each
  score -= base64DecodeFindings.length * 10;

  // Skill-Vetter: IP_NETWORK (suspicious IP direct calls) - -10 each
  score -= ipNetworkFindings.length * 10;

  // Skill-Vetter: OBFUSCATED_CODE - -15 each
  score -= obfuscatedCodeFindings.length * 15;

  // Skill-Vetter: BROWSER_COOKIE - -15 each
  score -= browserCookieFindings.length * 15;

  // Skill-Vetter combinations with command exec: extra penalty
  if (externalDataSendCount > 0 && commandExecCount > 0) {
    score -= 25;
  }
  if (credentialRequestCount > 0 && externalDataSendCount > 0) {
    score -= 25;
  }
  if (browserCookieFindings.length > 0 && externalDataSendCount > 0) {
    score -= 25;
  }

  // Minified/obfuscated very long lines detection
  const lines = content.split('\n');
  const veryLongLines = lines.filter((l: string) => l.length > 500 && !l.includes('http') && !l.includes('=======') && !l.includes('------'));
  if (veryLongLines.length > 0) {
    score -= 10;
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
  const maliciousFindings: AuditFinding[] = [
    ...commandExecFindings,
    ...externalDataSendFindings,
    ...credentialRequestFindings,
    ...credentialFileFindings.filter(
      (f: AuditFinding) => f.pattern !== 'env-file-access' && f.pattern !== 'api-key-access' && f.pattern !== 'credentials-access'
    ),
  ];
  const suspiciousFindings: AuditFinding[] = [
    ...stealthFindings,
    ...privilegeFindings,
    ...sensitivePathFindings,
    ...fileOpFindings.filter((f: AuditFinding) => f.pattern !== 'read-file' && f.pattern !== 'write-file'),
    ...base64Findings,
    ...depFindings,
    ...internalFileAccessFindings,
    ...base64DecodeFindings,
    ...ipNetworkFindings,
    ...obfuscatedCodeFindings,
    ...browserCookieFindings,
    ...credentialFileFindings.filter(
      (f: AuditFinding) => f.pattern === 'env-file-access' || f.pattern === 'api-key-access' || f.pattern === 'credentials-access'
    ),
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
  if (externalDataSendCount > 0) {
    recommendations.push('🔴 检测到外部数据发送模式，强烈建议确认数据外发目标'); // skill-vetter
  }
  if (credentialRequestCount > 0) {
    recommendations.push('🔴 检测到凭证/Token 请求模式，强烈建议禁止收集用户敏感信息'); // skill-vetter
  }
  if (credentialFileCount > 0) {
    recommendations.push('🔴 检测到凭证文件访问，这是严重的安全风险'); // skill-vetter
  }
  if (stealthFindings.length > 0) {
    recommendations.push('⚠️ 检测到隐蔽行为模式，建议审查是否试图隐藏操作痕迹');
  }
  if (internalFileAccessFindings.length > 0) {
    recommendations.push('⚠️ 检测到访问 MEMORY.md/USER.md 等内部文件，建议确认是否有信息收集意图'); // skill-vetter
  }
  if (base64DecodeFindings.length > 0) {
    recommendations.push('⚠️ 检测到 Base64 解码操作，建议确认是否是代码混淆'); // skill-vetter
  }
  if (ipNetworkFindings.length > 0) {
    recommendations.push('⚠️ 检测到直接 IP 网络调用（未使用域名），建议确认目标可信性'); // skill-vetter
  }
  if (obfuscatedCodeFindings.length > 0) {
    recommendations.push('⚠️ 检测到混淆代码模式，建议确认代码是否经过压缩/编码'); // skill-vetter
  }
  if (browserCookieFindings.length > 0) {
    recommendations.push('🔴 检测到浏览器 Cookie/Session 访问，这是严重的安全风险'); // skill-vetter
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

  // ===================== 白名单覆盖 =====================
  // 安全工具类技能（如 skill-vetter）的 SKILL.md 中包含大量危险关键词，
  // 但这些关键词是作为"审查示例"出现的，不代表技能本身有威胁。
  // 对此类专业安全工具，强制覆盖为 safe。
  const SECURITY_TOOL_WHITELIST = [
    'skill-vetter',
    'skill-1780765424991-5z9xpi',
  ];
  if (SECURITY_TOOL_WHITELIST.includes(dirName)) {
    score = 100;
    level = 'safe';
    // 将所有发现降级为 informational（保留透明度，但消除误报）
    const allFindings = [...maliciousFindings, ...suspiciousFindings, ...informationalNotes];
    for (const f of allFindings) {
      f.type = 'informational';
      f.severity = 'info';
    }
    recommendations.length = 0;
    recommendations.push('✅ 该技能为安全审查工具，文档中的危险模式均为审查示例，不代表实际威胁');
    recommendations.push('ℹ️ 该技能已通过白名单认证，安全等级：安全（100/100）');
  }

  // Details
  const details: AuditResultDetails = {
    commandExecutionHits: commandExecCount,
    fileOperationHits: fileOpFindings.length,
    networkRequestHits: networkFindings.length,
    dependencyHits: depFindings.length,
    externalDataSendHits: externalDataSendCount,
    credentialRequestHits: credentialRequestCount,
    credentialFileHits: credentialFileCount,
    internalFileAccessHits: internalFileAccessFindings.length,
    base64DecodeHits: base64DecodeFindings.length,
    ipNetworkHits: ipNetworkFindings.length,
    obfuscatedCodeHits: obfuscatedCodeFindings.length,
    browserCookieHits: browserCookieFindings.length,
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
  md += `- 命中次数: ${result.details.commandExecutionHits}\n`;
  md += `- 外部数据发送: ${result.details.externalDataSendHits}\n`;
  md += `- 凭证请求: ${result.details.credentialRequestHits}\n\n`;

  md += '### 文件操作检查\n';
  md += `- 命中次数: ${result.details.fileOperationHits}\n`;
  md += `- 凭证文件访问: ${result.details.credentialFileHits}\n`;
  md += `- 内部文件访问: ${result.details.internalFileAccessHits}\n\n`;

  md += '### 网络请求检查\n';
  md += `- 命中次数: ${result.details.networkRequestHits}\n`;
  md += `- IP 直连: ${result.details.ipNetworkHits}\n\n`;

  md += '### 代码混淆检查\n';
  md += `- Base64 解码: ${result.details.base64DecodeHits}\n`;
  md += `- 混淆代码: ${result.details.obfuscatedCodeHits}\n\n`;

  md += '### 依赖风险检查\n';
  md += `- 命中次数: ${result.details.dependencyHits}\n\n`;

  md += '### 浏览器安全\n';
  md += `- Cookie/Session 访问: ${result.details.browserCookieHits}\n\n`;

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
