import { logger } from "../../../logger.js";

export type MaliciousPattern = {
  id: string;
  pattern: RegExp;
  severity: "critical" | "warn" | "info";
  description: string;
  category: string;
};

export type MaliciousScanResult = {
  skillName: string;
  findings: {
    patternId: string;
    severity: string;
    category: string;
    description: string;
    line: number;
    evidence: string;
  }[];
};

const MALICIOUS_PATTERNS: MaliciousPattern[] = [
  {
    id: "cmd-injection-pipe",
    pattern: /(\$\()|(`)|(eval\s*\(\s*['"`].*\|.*['"`]\s*\))/g,
    severity: "critical",
    description: "Command injection via shell pipe",
    category: "command-injection",
  },
  {
    id: "cmd-injection-args",
    pattern: /exec\s*\(\s*['"`].*;.*['"`]/g,
    severity: "critical",
    description: "Command injection via semicolon separation",
    category: "command-injection",
  },
  {
    id: "cmd-injection-user-input",
    pattern: /exec\s*\(\s*[^'"]*\+.*[^'"]*\s*\)/g,
    severity: "critical",
    description: "Command injection via string concatenation with user input",
    category: "command-injection",
  },
  {
    id: "xss-innerhtml",
    pattern: /innerHTML\s*=\s*[^;]+/g,
    severity: "critical",
    description: "Potential XSS via innerHTML assignment",
    category: "xss",
  },
  {
    id: "xss-document-write",
    pattern: /document\.write\s*\(/g,
    severity: "critical",
    description: "Potential XSS via document.write",
    category: "xss",
  },
  {
    id: "xss-eval-string",
    pattern: /eval\s*\(\s*document\.(location|URL|referrer|cookie)/g,
    severity: "critical",
    description: "Potential XSS via eval with document properties",
    category: "xss",
  },
  {
    id: "path-traversal-dotdot",
    pattern: /(\.\.\/)+|(\.\.\\)+/g,
    severity: "critical",
    description: "Path traversal via dot-dot-slash",
    category: "path-traversal",
  },
  {
    id: "path-traversal-absolute",
    pattern: /path\.join\s*\(\s*__dirname\s*,\s*['"`].*\/.*['"`]/g,
    severity: "warn",
    description: "Potential path traversal via path.join with dynamic input",
    category: "path-traversal",
  },
  {
    id: "path-traversal-user-input",
    pattern: /readFileSync\s*\(\s*[^'"]*\+.*[^'"]*\s*\)/g,
    severity: "critical",
    description: "Path traversal via user input concatenation",
    category: "path-traversal",
  },
  {
    id: "eval-dangerous",
    pattern: /eval\s*\(\s*(process\.env|req\.|res\.|user\.|body\.|query\.|params\.)/g,
    severity: "critical",
    description: "Dangerous eval with user-controlled input",
    category: "eval",
  },
  {
    id: "eval-unsanitized",
    pattern: /eval\s*\(\s*(location\.hash|location\.search|document\.cookie)/g,
    severity: "critical",
    description: "Eval with unsanitized browser input",
    category: "eval",
  },
  {
    id: "eval-new-function",
    pattern: /new\s+Function\s*\(\s*['"`][^'"]*['"`]\s*\)/g,
    severity: "critical",
    description: "Dynamic code execution via new Function",
    category: "eval",
  },
  {
    id: "shell-exec",
    pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/g,
    severity: "critical",
    description: "Shell execution via child_process module",
    category: "shell-execute",
  },
  {
    id: "shell-spawn",
    pattern: /spawn\s*\(\s*['"`](bash|sh|cmd|powershell|python)[^)]*\)/g,
    severity: "critical",
    description: "Shell execution via spawn with shell interpreter",
    category: "shell-execute",
  },
  {
    id: "shell-exec-file",
    pattern: /execFile\s*\(\s*['"`].*['"`]\s*,\s*\[.*\]/g,
    severity: "warn",
    description: "Potential shell execution via execFile",
    category: "shell-execute",
  },
  {
    id: "reverse-shell",
    pattern: /net\.Socket|connect\s*\(\s*['"`][^'"]*:[\d]+['"`]/g,
    severity: "critical",
    description: "Potential reverse shell connection",
    category: "backdoor",
  },
  {
    id: "crypto-mining",
    pattern: /stratum|coinhive|cryptonight|xmrig|miner/g,
    severity: "critical",
    description: "Crypto mining code detected",
    category: "malware",
  },
];

export function getMaliciousPatterns(): MaliciousPattern[] {
  return [...MALICIOUS_PATTERNS];
}

export function detectCommandInjection(code: string): MaliciousPattern[] {
  const injectionPatterns = MALICIOUS_PATTERNS.filter(
    (p) => p.category === "command-injection",
  );
  return injectionPatterns.filter((pattern) => pattern.pattern.test(code));
}

export function detectXSS(code: string): MaliciousPattern[] {
  const xssPatterns = MALICIOUS_PATTERNS.filter((p) => p.category === "xss");
  return xssPatterns.filter((pattern) => pattern.pattern.test(code));
}

export function detectPathTraversal(code: string): MaliciousPattern[] {
  const traversalPatterns = MALICIOUS_PATTERNS.filter(
    (p) => p.category === "path-traversal",
  );
  return traversalPatterns.filter((pattern) => pattern.pattern.test(code));
}

export function detectEval(code: string): MaliciousPattern[] {
  const evalPatterns = MALICIOUS_PATTERNS.filter((p) => p.category === "eval");
  return evalPatterns.filter((pattern) => pattern.pattern.test(code));
}

export function detectShellExecute(code: string): MaliciousPattern[] {
  const shellPatterns = MALICIOUS_PATTERNS.filter(
    (p) => p.category === "shell-execute",
  );
  return shellPatterns.filter((pattern) => pattern.pattern.test(code));
}

export function scanForMaliciousCode(
  content: string,
  skillName: string,
): MaliciousScanResult {
  const findings: MaliciousScanResult["findings"] = [];
  const lines = content.split("\n");

  logger.debug(`[MaliciousScanner] Scanning skill: ${skillName}`);

  for (const pattern of MALICIOUS_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const match = pattern.pattern.exec(line);
      if (!match) continue;

      findings.push({
        patternId: pattern.id,
        severity: pattern.severity,
        category: pattern.category,
        description: pattern.description,
        line: i + 1,
        evidence: line.trim().slice(0, 120),
      });

      logger.warn(
        `[MaliciousScanner] Found malicious pattern: ${pattern.id} in ${skillName} at line ${i + 1}`,
      );
      break;
    }
  }

  logger.info(
    `[MaliciousScanner] Scan completed for ${skillName}: ${findings.length} findings`,
  );

  return {
    skillName,
    findings,
  };
}