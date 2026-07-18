import { logger } from '../../logger.js';
import type { SecurityFinding, SecurityLevel, SecurityCategory } from './types.js';

export type ProbeFinding = {
  probeId: string;
  probeName: string;
  category: SecurityCategory;
  severity: SecurityLevel;
  message: string;
  location?: string;
  evidence?: string;
  remediation?: string;
  confidence: 'high' | 'medium' | 'low';
};

export type ProbeResult = {
  probeId: string;
  probeName: string;
  findings: ProbeFinding[];
  passed: boolean;
  duration: number;
};

export type DeepProbeConfig = {
  enabledProbes: string[];
  maxDepth: number;
  timeoutMs: number;
  includeExperimental: boolean;
};

const PROBES: {
  id: string;
  name: string;
  category: ProbeFinding['category'];
  check: (input: string, config?: DeepProbeConfig) => ProbeFinding[];
}[] = [
  {
    id: 'probe-env-exposure',
    name: 'Environment Variable Exposure',
    category: 'secrets',
    check: (code: string) => {
      const findings: ProbeFinding[] = [];
      const envPatterns = [
        /console\.(log|info|debug|warn)\s*\(\s*process\.env/g,
        /return\s+process\.env\./g,
        /JSON\.stringify\s*\(\s*process\.env/g,
      ];

      for (const pattern of envPatterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          const before = code.substring(0, match.index);
          const line = before.split('\n').length;
          findings.push({
            probeId: 'probe-env-exposure',
            probeName: 'Environment Variable Exposure',
            category: 'secrets',
            severity: 'high',
            message: `Potential environment variable exposure at line ${line}`,
            location: `line ${line}`,
            evidence: match[0],
            remediation: 'Avoid logging or exposing process.env directly. Access environment variables through a secure configuration manager.',
            confidence: 'high',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'probe-path-traversal',
    name: 'Path Traversal Patterns',
    category: 'filesystem',
    check: (code: string) => {
      const findings: ProbeFinding[] = [];
      const traversalPatterns = [
        { pattern: /path\.join\s*\(\s*['"`].*['"`]\s*,\s*.*user.*\)/gi, severity: 'critical' as SecurityLevel },
        { pattern: /path\.resolve\s*\(\s*.*\.\.\s*.*\)/g, severity: 'high' as SecurityLevel },
        { pattern: /fs\.\w+\s*\(\s*.*\+.*\.\.\s*.*\)/g, severity: 'critical' as SecurityLevel },
      ];

      for (const { pattern, severity } of traversalPatterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          const before = code.substring(0, match.index);
          const line = before.split('\n').length;
          findings.push({
            probeId: 'probe-path-traversal',
            probeName: 'Path Traversal Patterns',
            category: 'filesystem',
            severity,
            message: `Potential path traversal vulnerability at line ${line}`,
            location: `line ${line}`,
            evidence: match[0],
            remediation: 'Use safe path joining functions and validate all user-controlled path inputs.',
            confidence: 'high',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'probe-ssrf',
    name: 'Server-Side Request Forgery',
    category: 'network',
    check: (code: string) => {
      const findings: ProbeFinding[] = [];
      const ssrfPatterns = [
        { pattern: /fetch\s*\(\s*.*user.*\)/gi, severity: 'high' as SecurityLevel },
        { pattern: /http\.get\s*\(\s*.*url.*\)/gi, severity: 'high' as SecurityLevel },
        { pattern: /https\.get\s*\(\s*.*url.*\)/gi, severity: 'high' as SecurityLevel },
        { pattern: /axios\.get\s*\(\s*.*url.*\)/gi, severity: 'medium' as SecurityLevel },
        { pattern: /request\s*\(\s*.*url.*\)/gi, severity: 'medium' as SecurityLevel },
      ];

      for (const { pattern, severity } of ssrfPatterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          const before = code.substring(0, match.index);
          const line = before.split('\n').length;
          findings.push({
            probeId: 'probe-ssrf',
            probeName: 'Server-Side Request Forgery',
            category: 'network',
            severity,
            message: `Potential SSRF vulnerability at line ${line}`,
            location: `line ${line}`,
            evidence: match[0],
            remediation: 'Validate and sanitize all URLs before making HTTP requests. Block internal IP ranges.',
            confidence: 'medium',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'probe-sql-injection',
    name: 'SQL Injection Patterns',
    category: 'code',
    check: (code: string) => {
      const findings: ProbeFinding[] = [];
      const sqlPatterns = [
        { pattern: /SELECT.*FROM.*WHERE.*=\s*['"`].*\+.*['"`]/gi, severity: 'critical' as SecurityLevel },
        { pattern: /INSERT.*INTO.*VALUES\s*\(\s*['"`].*\+.*['"`]/gi, severity: 'critical' as SecurityLevel },
        { pattern: /UPDATE.*SET.*=\s*['"`].*\+.*['"`]/gi, severity: 'critical' as SecurityLevel },
        { pattern: /DELETE.*FROM.*WHERE.*=\s*['"`].*\+.*['"`]/gi, severity: 'critical' as SecurityLevel },
        { pattern: /\$\{.*\}\s*\+\s*['"`].*SQL/i, severity: 'critical' as SecurityLevel },
      ];

      for (const { pattern, severity } of sqlPatterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          const before = code.substring(0, match.index);
          const line = before.split('\n').length;
          findings.push({
            probeId: 'probe-sql-injection',
            probeName: 'SQL Injection Patterns',
            category: 'code',
            severity,
            message: `Potential SQL injection vulnerability at line ${line}`,
            location: `line ${line}`,
            evidence: match[0],
            remediation: 'Use parameterized queries or ORM with built-in protection. Never concatenate user input into SQL strings.',
            confidence: 'high',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'probe-xss',
    name: 'XSS Vulnerability Patterns',
    category: 'code',
    check: (code: string) => {
      const findings: ProbeFinding[] = [];
      const xssPatterns = [
        { pattern: /innerHTML\s*=\s*['"`].*\+.*['"`]/gi, severity: 'high' as SecurityLevel },
        { pattern: /document\.write\s*\(\s*['"`].*\+.*['"`]/gi, severity: 'high' as SecurityLevel },
        { pattern: /eval\s*\(\s*.*user.*\)/gi, severity: 'critical' as SecurityLevel },
        { pattern: /setTimeout\s*\(\s*['"`].*\+.*['"`]/gi, severity: 'high' as SecurityLevel },
      ];

      for (const { pattern, severity } of xssPatterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          const before = code.substring(0, match.index);
          const line = before.split('\n').length;
          findings.push({
            probeId: 'probe-xss',
            probeName: 'XSS Vulnerability Patterns',
            category: 'code',
            severity,
            message: `Potential XSS vulnerability at line ${line}`,
            location: `line ${line}`,
            evidence: match[0],
            remediation: 'Use textContent instead of innerHTML. Sanitize all user input before rendering.',
            confidence: 'high',
          });
        }
      }

      return findings;
    },
  },
];

export function runDeepProbe(code: string, config?: DeepProbeConfig): ProbeResult[] {
  const results: ProbeResult[] = [];
  const enabledProbes = config?.enabledProbes ?? PROBES.map((p) => p.id);

  for (const probe of PROBES) {
    if (!enabledProbes.includes(probe.id)) continue;

    const startTime = Date.now();
    const findings = probe.check(code, config);
    const duration = Date.now() - startTime;

    results.push({
      probeId: probe.id,
      probeName: probe.name,
      findings,
      passed: findings.length === 0,
      duration,
    });
  }

  const totalFindings = results.reduce((acc, r) => acc + r.findings.length, 0);
  logger.debug(`[Security:DeepProbe] Ran ${results.length} probes, found ${totalFindings} findings`);

  return results;
}

export function probeFindingsToSecurityFindings(probeResults: ProbeResult[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const result of probeResults) {
    for (const probeFinding of result.findings) {
      findings.push({
        id: `${probeFinding.probeId}-${probeFinding.location?.replace(/\s/g, '-') || 'unknown'}`,
        title: `${probeFinding.probeName}: ${probeFinding.message}`,
        severity: probeFinding.severity,
        category: probeFinding.category,
        description: `${probeFinding.message}. Evidence: ${probeFinding.evidence ?? 'not available'}`,
        recommendation: probeFinding.remediation ?? 'Review the code for potential security issues.',
        metadata: {
          probeId: probeFinding.probeId,
          probeName: probeFinding.probeName,
          location: probeFinding.location,
          confidence: probeFinding.confidence,
          evidence: probeFinding.evidence,
        },
      });
    }
  }

  return findings;
}

export function getProbeSummary(probeResults: ProbeResult[]): {
  totalProbes: number;
  passedProbes: number;
  failedProbes: number;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
} {
  const summary = {
    totalProbes: probeResults.length,
    passedProbes: probeResults.filter((r) => r.passed).length,
    failedProbes: probeResults.filter((r) => !r.passed).length,
    totalFindings: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const result of probeResults) {
    for (const finding of result.findings) {
      summary.totalFindings++;
      summary[finding.severity]++;
    }
  }

  return summary;
}

export function listAvailableProbes(): { id: string; name: string; category: ProbeFinding['category'] }[] {
  return PROBES.map((p) => ({ id: p.id, name: p.name, category: p.category }));
}