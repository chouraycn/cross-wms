

export type SecurityScanSeverity = 'info' | 'warn' | 'critical';

export interface SecurityScanFinding {
  ruleId: string;
  severity: SecurityScanSeverity;
  file: string;
  line: number;
  message: string;
  evidence: string;
}

export interface SecurityScanResult {
  skillId: string;
  scannedFiles: number;
  critical: number;
  warn: number;
  info: number;
  passed: boolean;
  findings: SecurityScanFinding[];
  scannedAt: number;
  durationMs: number;
}

const LINE_RULES: Array<{
  ruleId: string;
  severity: SecurityScanSeverity;
  message: string;
  pattern: RegExp;
  requiresContext?: RegExp;
}> = [
  {
    ruleId: 'dangerous-exec',
    severity: 'critical',
    message: 'Shell command execution detected (child_process)',
    pattern: /\b(exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(/,
    requiresContext: /child_process/,
  },
  {
    ruleId: 'dynamic-code-execution',
    severity: 'critical',
    message: 'Dynamic code execution detected',
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
  },
  {
    ruleId: 'crypto-mining',
    severity: 'critical',
    message: 'Possible crypto-mining reference detected',
    pattern: /stratum\+tcp|stratum\+ssl|coinhive|cryptonight|xmrig/i,
  },
  {
    ruleId: 'suspicious-network',
    severity: 'warn',
    message: 'WebSocket connection to non-standard port',
    pattern: /new\s+WebSocket\s*\(\s*["']wss?:\/\/[^"']*:(\d+)/,
  },
  {
    ruleId: 'reverse-shell',
    severity: 'critical',
    message: 'Possible reverse shell / remote shell pattern detected',
    pattern: /\b(sh|bash|zsh|sh\.exe|cmd\.exe|powershell|pwsh)\b[^|\n]{0,160}\/dev\/tcp\/|\b(bash\s+-i|bash\s+--login|sh\s+-i)\b/,
  },
  {
    ruleId: 'powershell-encoded',
    severity: 'critical',
    message: 'PowerShell encoded command detected (possible obfuscation)',
    pattern: /powershell(?:\.exe)?\s+(?:-e|-enc|-EncodedCommand)\s+[A-Za-z0-9+/=]{20,}/i,
  },
  {
    ruleId: 'hardcoded-credential',
    severity: 'critical',
    message: 'Possible hardcoded credential assignment',
    pattern: /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'][A-Za-z0-9_\-./+=]{16,}["']/i,
  },
  {
    ruleId: 'private-key-material',
    severity: 'critical',
    message: 'Embedded PEM private key detected',
    pattern: /-----BEGIN\s+(?:RSA|EC|OPENSSH|PRIVATE|DSA|PGP)\s+PRIVATE\s+KEY-----/,
  },
  {
    ruleId: 'command-injection-pipe',
    severity: 'critical',
    message: 'Command injection via shell pipe detected',
    pattern: /\|\s*(?:bash|sh|zsh|cmd|powershell|pwsh)/i,
  },
  {
    ruleId: 'command-injection-redirect',
    severity: 'critical',
    message: 'Command injection via file redirect detected',
    pattern: /(?:>>|>)\s*(?:\/etc|\/tmp|~\/\.ssh|\/root)/i,
  },
  {
    ruleId: 'dns-lookup',
    severity: 'warn',
    message: 'DNS lookup detected (possible C2 communication)',
    pattern: /\bdns\.lookup\s*\(|\bresolve4\s*\(|\bresolve6\s*\(|\blookup\s*\(/,
    requiresContext: /dns/,
  },
];

const SHELL_DANGEROUS_COMMANDS = [
  'rm', 'chmod', 'chown', 'kill', 'reboot', 'shutdown', 'mkfs', 'dd', 'fdisk',
  'rmdir', 'mv', 'cp', 'ln', 'mount', 'umount', 'cat', 'grep', 'sed', 'awk',
];

const SHELL_DANGEROUS_PATTERNS = SHELL_DANGEROUS_COMMANDS.map(cmd => ({
  ruleId: `shell-dangerous-${cmd}`,
  severity: 'warn' as SecurityScanSeverity,
  message: `Shell command ${cmd} detected in script context`,
  pattern: new RegExp(`\\b${cmd}\\s+`),
  requiresContext: undefined as RegExp | undefined,
}));

const STANDARD_PORTS = new Set([80, 443, 8080, 8443, 3000]);
const NETWORK_SEND_CONTEXT_PATTERN = /\bfetch\s*\(|\bpost\s*\(|\.\s*post\s*\(|http\.request\s*\(/i;

const SOURCE_RULES: Array<{
  ruleId: string;
  severity: SecurityScanSeverity;
  message: string;
  pattern: RegExp;
  requiresContext?: RegExp;
  requiresContextWindowLines?: number;
}> = [
  {
    ruleId: 'potential-exfiltration',
    severity: 'warn',
    message: 'File read combined with network send — possible data exfiltration',
    pattern: /readFileSync|readFile/,
    requiresContext: NETWORK_SEND_CONTEXT_PATTERN,
  },
  {
    ruleId: 'obfuscated-code-hex',
    severity: 'warn',
    message: 'Hex-encoded string sequence detected (possible obfuscation)',
    pattern: /(\\x[0-9a-fA-F]{2}){6,}/,
  },
  {
    ruleId: 'obfuscated-code-base64',
    severity: 'warn',
    message: 'Large base64 payload with decode call detected (possible obfuscation)',
    pattern: /(?:atob|Buffer\.from)\s*\(\s*["'][A-Za-z0-9+/=]{200,}["']/,
  },
  {
    ruleId: 'env-harvesting',
    severity: 'critical',
    message: 'Environment variable access combined with network send — possible credential harvesting',
    pattern: /process\.env/,
    requiresContext: NETWORK_SEND_CONTEXT_PATTERN,
    requiresContextWindowLines: 8,
  },
  {
    ruleId: 'path-traversal',
    severity: 'warn',
    message: 'Path traversal sequence in file access detected',
    pattern: /(?:readFile|writeFile|readdir|unlink|stat)\s*\(\s*["'`][^"'`]*\.\.\/(?:[^"'`]*\.\.\/){2,}/,
  },
  {
    ruleId: 'unsafe-deserialization',
    severity: 'critical',
    message: 'Unsafe deserialization via node-serialize / func/Function.parse detected',
    pattern: /\bnode_serialize\b|\bserializerr\b|\bfuncster\b|\bjs-yaml\b[^.\n]{0,40}\.load\s*\(|\bnode-serialize\b[^.\n]{0,40}\.unserialize\s*\(/,
  },
  {
    ruleId: 'suspicious-binary-download',
    severity: 'critical',
    message: 'Downloading and executing remote binary in a single expression',
    pattern: /(?:curl|wget|fetch)\b[\s\S]{0,80}(?:chmod\s+\+x|\bos\.chmod\s*\([^)]*0o755)/i,
  },
  {
    ruleId: 'raw-ip-network',
    severity: 'warn',
    message: 'Network request to raw IP address (possible C2 callback)',
    pattern: /\bfetch\s*\(\s*["'`]https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/i,
  },
  {
    ruleId: 'install-hook-curl-pipe',
    severity: 'critical',
    message: 'Remote install command piped to a shell (curl|sh pattern)',
    pattern: /\bcurl\s+[^\n|]{0,160}\|\s*(?:sh|bash|zsh|sudo\s+sh|sudo\s+bash)\b/i,
  },
];

const SKILL_CONTENT_RULES: Array<{
  ruleId: string;
  severity: SecurityScanSeverity;
  message: string;
  pattern: RegExp;
  requiresContext?: RegExp;
}> = [
  {
    ruleId: 'prompt-injection-ignore-instructions',
    severity: 'critical',
    message: 'Prompt-injection wording attempts to override higher-priority instructions',
    pattern: /ignore (all|any|previous|above|prior) instructions/i,
  },
  {
    ruleId: 'prompt-injection-system',
    severity: 'critical',
    message: 'Skill text references hidden prompt layers',
    pattern: /\b(system prompt|developer message|hidden instructions)\b/i,
  },
  {
    ruleId: 'prompt-injection-tool',
    severity: 'critical',
    message: 'Skill text encourages bypassing tool approval',
    pattern: /\b(run|execute|invoke|call)\b.{0,50}\btool\b.{0,50}\bwithout\b.{0,30}\b(permission|approval)/i,
  },
  {
    ruleId: 'shell-pipe-to-shell',
    severity: 'critical',
    message: 'Skill text includes pipe-to-shell install pattern',
    pattern: /\b(curl|wget)\b[^|\n]{0,120}\|\s*(sh|bash|zsh)\b/i,
  },
  {
    ruleId: 'secret-exfiltration',
    severity: 'critical',
    message: 'Skill text may exfiltrate environment variables',
    pattern: /\b(process\.env|env)\b.{0,80}\b(fetch|curl|wget|http|https)\b/i,
  },
  {
    ruleId: 'destructive-delete',
    severity: 'warn',
    message: 'Skill text contains broad destructive delete command',
    pattern: /\brm\s+-rf\s+(\/|\$HOME|~|\.)/i,
  },
  {
    ruleId: 'unsafe-permissions',
    severity: 'warn',
    message: 'Skill text contains unsafe permission change',
    pattern: /\bchmod\s+(-R\s+)?777\b/i,
  },
  {
    ruleId: 'sensitive-file-access',
    severity: 'warn',
    message: 'Skill text references access to sensitive credential files',
    pattern: /~\/\.ssh\/|\/etc\/passwd|\/etc\/shadow|\.aws\/credentials|\.npmrc|\.netrc/i,
  },
  {
    ruleId: 'data-exfiltration-hint',
    severity: 'warn',
    message: 'Skill text instructs reading and transmitting user data',
    pattern: /\b(read|copy|scrape|harvest)\b[^.\n]{0,80}\b(send|upload|post|exfiltrate)\b/i,
  },
  {
    ruleId: 'bypass-policy',
    severity: 'critical',
    message: 'Skill text encourages bypassing policy / safety checks',
    pattern: /\b(bypass|disable|skip|circumvent|ignore)\b[^.\n]{0,80}\b(policy|guard|guardrail|safety|filter|moderation)\b/i,
  },
  {
    ruleId: 'prompt-injection-role-play',
    severity: 'critical',
    message: 'Skill text uses role-play to bypass system instructions',
    pattern: /(?:role|assume|pretend)\s+to\s+be\s+a\s+(?:system|superuser|admin|root|developer)/i,
  },
  {
    ruleId: 'prompt-injection-format',
    severity: 'critical',
    message: 'Skill text attempts to override output format instructions',
    pattern: /(?:override|ignore)\s+output\s+(?:format|structure|instructions)/i,
  },
  {
    ruleId: 'prompt-injection-urgent',
    severity: 'critical',
    message: 'Skill text uses urgency to bypass safety constraints',
    pattern: /(?:urgent|emergency|critical|immediate|top\s+priority)/i,
  },
  {
    ruleId: 'prompt-injection-identity',
    severity: 'critical',
    message: 'Skill text attempts to change assistant identity',
    pattern: /(?:you\s+are\s+no\s+longer|forget\s+you\s+are|change\s+your\s+identity)/i,
  },
  {
    ruleId: 'privacy-violation',
    severity: 'critical',
    message: 'Skill text instructs accessing personal/private data',
    pattern: /\b(access|read|extract|scrape)\b.{0,60}\b(personal|private|confidential|secret)\b/i,
  },
  {
    ruleId: 'credential-harvesting',
    severity: 'critical',
    message: 'Skill text instructs collecting credentials',
    pattern: /\b(collect|gather|harvest|extract)\b.{0,60}\b(password|token|secret|key|credential)\b/i,
  },
  {
    ruleId: 'remote-code-execution',
    severity: 'critical',
    message: 'Skill text instructs remote code execution',
    pattern: /\b(execute|run|eval)\b.{0,60}\b(remote|arbitrary|untrusted)\b/i,
  },
  {
    ruleId: 'social-engineering',
    severity: 'critical',
    message: 'Skill text attempts social engineering',
    pattern: /\b(pretend|impersonate|fake|spoof)\b.{0,60}\b(identity|account|email|message)\b/i,
  },
  {
    ruleId: 'phishing',
    severity: 'critical',
    message: 'Skill text contains phishing indicators',
    pattern: /\b(click|download|open)\b.{0,60}\b(link|attachment|file)\b/i,
  },
  {
    ruleId: 'supply-chain-attack',
    severity: 'critical',
    message: 'Skill text references supply chain attack patterns',
    pattern: /\b(tamper|modify|replace)\b.{0,60}\b(dependency|package|library|binary)\b/i,
  },
  {
    ruleId: 'keylogger',
    severity: 'critical',
    message: 'Skill text references keylogging',
    pattern: /\b(key|keylog|keyboard|input)\b.{0,60}\b(log|record|capture)\b/i,
  },
  {
    ruleId: 'screen-capture',
    severity: 'warn',
    message: 'Skill text references screen capture',
    pattern: /\b(screen|display|desktop)\b.{0,60}\b(capture|record|screenshot)\b/i,
  },
  {
    ruleId: 'clipboard-access',
    severity: 'warn',
    message: 'Skill text references clipboard access',
    pattern: /\b(clipboard|pasteboard)\b.{0,60}\b(read|write|access)\b/i,
  },
  {
    ruleId: 'system-modification',
    severity: 'critical',
    message: 'Skill text instructs system modification',
    pattern: /\b(modify|alter|change|replace)\b.{0,60}\b(system|config|setting|registry)\b/i,
  },
  {
    ruleId: 'network-scanning',
    severity: 'warn',
    message: 'Skill text references network scanning',
    pattern: /\b(port|scan|ping|nmap|traceroute)\b/i,
  },
  {
    ruleId: 'persistence',
    severity: 'critical',
    message: 'Skill text references persistence mechanisms',
    pattern: /\b(startup|boot|cron|service|daemon)\b.{0,60}\b(auto|persist|always)\b/i,
  },
];

function truncateEvidence(evidence: string, maxLen = 120): string {
  if (evidence.length <= maxLen) return evidence;
  return `${evidence.slice(0, maxLen)}…`;
}

function isBenignMemberExecMatch(line: string, match: RegExpExecArray): boolean {
  const command = match[1];
  if (command !== 'exec') return false;
  const matchIndex = match.index;
  if (matchIndex <= 0 || line[matchIndex - 1] !== '.') return false;
  return !/\b(?:cp|childProcess|child_process)\s*\.\s*exec\s*\(/.test(line);
}

function stripCommentsForHeuristics(source: string): string {
  let stripped = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i] ?? '';
    const next = source[i + 1] ?? '';

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
        continue;
      }
      if (ch === '\n') stripped += '\n';
      continue;
    }

    if (quote) {
      stripped += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      stripped += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      if (source[i] === '\n') stripped += '\n';
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    stripped += ch;
  }

  return stripped;
}

function findSourceRuleMatch(params: {
  rule: typeof SOURCE_RULES[0];
  source: string;
  lines: string[];
}): { line: number; evidence: string } | null {
  if (!params.rule.pattern.test(params.source)) return null;
  if (params.rule.requiresContext && !params.rule.requiresContext.test(params.source)) return null;

  for (let i = 0; i < params.lines.length; i++) {
    if (!params.rule.pattern.test(params.lines[i] ?? '')) continue;

    if (params.rule.requiresContext && params.rule.requiresContextWindowLines !== undefined) {
      const start = Math.max(0, i - params.rule.requiresContextWindowLines);
      const end = Math.min(params.lines.length, i + params.rule.requiresContextWindowLines + 1);
      const windowSource = params.lines.slice(start, end).join('\n');
      if (!params.rule.requiresContext.test(windowSource)) continue;
    }

    return { line: i + 1, evidence: params.lines[i] ?? '' };
  }

  if (params.rule.requiresContextWindowLines !== undefined) return null;
  return { line: 1, evidence: params.source.slice(0, 120) };
}

export function scanSource(source: string, filePath: string): SecurityScanFinding[] {
  const findings: SecurityScanFinding[] = [];
  const lines = source.split('\n');
  const heuristicSource = stripCommentsForHeuristics(source);
  const heuristicLines = heuristicSource.split('\n');
  const matchedLineRules = new Set<string>();

  for (const rule of [...LINE_RULES, ...SHELL_DANGEROUS_PATTERNS]) {
    if (matchedLineRules.has(rule.ruleId)) continue;
    if (rule.requiresContext && !rule.requiresContext.test(source)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = rule.pattern.exec(line);
      if (!match) continue;

      if (rule.ruleId === 'dangerous-exec' && isBenignMemberExecMatch(line, match)) continue;

      if (rule.ruleId === 'suspicious-network') {
        const port = Number.parseInt(match[1], 10);
        if (STANDARD_PORTS.has(port)) continue;
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
    if (matchedSourceRules.has(ruleKey)) continue;

    const match = findSourceRuleMatch({ rule, source: heuristicSource, lines: heuristicLines });
    if (!match) continue;

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

export function scanSkillContent(content: string, filePath: string = 'SKILL.md'): SecurityScanFinding[] {
  const findings: SecurityScanFinding[] = [];
  const lines = content.split('\n');
  const matchedRules = new Set<string>();

  for (const rule of SKILL_CONTENT_RULES) {
    if (matchedRules.has(rule.ruleId)) continue;
    const match = findSourceRuleMatch({ rule, source: content, lines });
    if (!match) continue;

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

export function scanSkillMd(skillId: string, content: string): SecurityScanResult {
  const startTime = Date.now();
  const findings = scanSkillContent(content, 'SKILL.md');

  const critical = findings.filter(f => f.severity === 'critical').length;
  const warn = findings.filter(f => f.severity === 'warn').length;
  const info = findings.filter(f => f.severity === 'info').length;

  return {
    skillId,
    scannedFiles: 1,
    critical,
    warn,
    info,
    passed: critical === 0,
    findings,
    scannedAt: Date.now(),
    durationMs: Date.now() - startTime,
  };
}

export class SecurityScanner {
  scanSkillMd(skillId: string, content: string): SecurityScanResult {
    return scanSkillMd(skillId, content);
  }

  scanContent(content: string, filePath: string = 'SKILL.md'): SecurityScanFinding[] {
    return scanSkillContent(content, filePath);
  }

  scanSource(source: string, filePath: string): SecurityScanFinding[] {
    return scanSource(source, filePath);
  }
}

export const securityScanner = new SecurityScanner();
