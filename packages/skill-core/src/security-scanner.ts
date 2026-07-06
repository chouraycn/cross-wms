export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityThreat {
  id: string;
  severity: ThreatSeverity;
  category: string;
  message: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityScanResult {
  safe: boolean;
  threats: SecurityThreat[];
  warnings: string[];
  scannedAt: number;
  duration: number;
  patterns: string[];
}

export interface SecurityScanOptions {
  strictMode?: boolean;
  maxThreatSeverity?: ThreatSeverity;
  customPatterns?: SecurityPattern[];
  enableAstScan?: boolean;
}

export interface SecurityPattern {
  id: string;
  name: string;
  severity: ThreatSeverity;
  regex: RegExp;
  description: string;
  category: string;
}

const DEFAULT_PATTERNS: SecurityPattern[] = [
  {
    id: 'exec-eval',
    name: 'Eval/Exec Execution',
    severity: 'critical',
    category: 'code-execution',
    description: 'Use of eval() or Function() constructor for dynamic code execution',
    regex: /\beval\s*\(|\bnew\s+Function\s*\(/g,
  },
  {
    id: 'child-process',
    name: 'Child Process Spawn',
    severity: 'high',
    category: 'system-access',
    description: 'Spawning child processes',
    regex: /\bchild_process|\bspawn\s*\(|\bexec\s*\(|\bexecSync\s*\(/g,
  },
  {
    id: 'fs-write',
    name: 'File System Write',
    severity: 'medium',
    category: 'file-access',
    description: 'Writing to file system',
    regex: /\bwriteFile\s*\(|\bwriteFileSync\s*\(|\bfs\.write/g,
  },
  {
    id: 'network-fetch',
    name: 'Network Request',
    severity: 'medium',
    category: 'network-access',
    description: 'Making outbound network requests',
    regex: /\bfetch\s*\(|\baxios\.|bhttp\.get|bhttps\.request|\brequest\s*\(/g,
  },
  {
    id: 'env-access',
    name: 'Environment Variable Access',
    severity: 'low',
    category: 'data-access',
    description: 'Accessing environment variables',
    regex: /\bprocess\.env\b/g,
  },
  {
    id: 'obfuscation',
    name: 'Code Obfuscation',
    severity: 'high',
    category: 'obfuscation',
    description: 'Potential code obfuscation detected',
    regex: /\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|atob\s*\(|btoa\s*\(/g,
  },
  {
    id: 'shell-injection',
    name: 'Shell Injection Risk',
    severity: 'high',
    category: 'code-execution',
    description: 'Potential shell injection vulnerability',
    regex: /\bexec\s*\(\s*[`'"]|\bsystem\s*\(\s*[`'"]/g,
  },
  {
    id: 'sql-injection',
    name: 'SQL Injection Risk',
    severity: 'high',
    category: 'data-access',
    description: 'Potential SQL injection vulnerability',
    regex: /\$\{[^}]*\}.*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/i,
  },
  {
    id: 'secrets-hardcoded',
    name: 'Hardcoded Secrets',
    severity: 'critical',
    category: 'secrets',
    description: 'Potential hardcoded secret detected',
    regex: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i,
  },
  {
    id: 'crypto-mining',
    name: 'Crypto Mining Detection',
    severity: 'critical',
    category: 'malicious',
    description: 'Potential cryptocurrency mining code',
    regex: /(?:coinhive|cryptonight|minero|webminer)/i,
  },
];

export class SecurityScanner {
  private patterns: SecurityPattern[];

  constructor(options?: { customPatterns?: SecurityPattern[] }) {
    this.patterns = [...DEFAULT_PATTERNS];
    if (options?.customPatterns) {
      this.patterns.push(...options.customPatterns);
    }
  }

  scan(content: string, options: SecurityScanOptions = {}): SecurityScanResult {
    const startTime = Date.now();
    const threats: SecurityThreat[] = [];
    const warnings: string[] = [];
    const matchedPatterns: string[] = [];

    const maxSeverity = options.maxThreatSeverity || 'high';
    const severityLevels: Record<ThreatSeverity, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    for (const pattern of this.patterns) {
      const matches = content.match(pattern.regex);
      if (matches && matches.length > 0) {
        matchedPatterns.push(pattern.id);
        const threat: SecurityThreat = {
          id: `${pattern.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          severity: pattern.severity,
          category: pattern.category,
          message: pattern.description,
          metadata: {
            patternId: pattern.id,
            patternName: pattern.name,
            matchCount: matches.length,
            sampleMatch: matches[0].substring(0, 100),
          },
        };
        threats.push(threat);

        if (severityLevels[pattern.severity] > severityLevels[maxSeverity]) {
          warnings.push(`Pattern ${pattern.name} exceeds max severity ${maxSeverity}`);
        }
      }
    }

    const safe = threats.length === 0 || (options.strictMode ? false : threats.every((t) => t.severity !== 'critical'));

    return {
      safe,
      threats,
      warnings,
      scannedAt: startTime,
      duration: Date.now() - startTime,
      patterns: matchedPatterns,
    };
  }

  addPattern(pattern: SecurityPattern): void {
    this.patterns.push(pattern);
  }

  removePattern(patternId: string): boolean {
    const index = this.patterns.findIndex((p) => p.id === patternId);
    if (index === -1) return false;
    this.patterns.splice(index, 1);
    return true;
  }

  getPatterns(): SecurityPattern[] {
    return [...this.patterns];
  }

  scanFile(filePath: string, content: string, options?: SecurityScanOptions): SecurityScanResult {
    const result = this.scan(content, options);
    result.threats.forEach((t) => {
      if (!t.location) t.location = filePath;
    });
    return result;
  }

  generateReport(result: SecurityScanResult): string {
    const lines: string[] = [];
    lines.push('=== Security Scan Report ===');
    lines.push(`Status: ${result.safe ? 'SAFE' : 'UNSAFE'}`);
    lines.push(`Scanned At: ${new Date(result.scannedAt).toISOString()}`);
    lines.push(`Duration: ${result.duration}ms`);
    lines.push(`Patterns Matched: ${result.patterns.length}`);
    lines.push(`Threats Found: ${result.threats.length}`);
    lines.push('');

    if (result.warnings.length > 0) {
      lines.push('--- Warnings ---');
      for (const warning of result.warnings) {
        lines.push(`  - ${warning}`);
      }
      lines.push('');
    }

    if (result.threats.length > 0) {
      lines.push('--- Threats ---');
      for (const threat of result.threats) {
        lines.push(`  [${threat.severity.toUpperCase()}] ${threat.category}: ${threat.message}`);
        if (threat.location) {
          lines.push(`    Location: ${threat.location}`);
        }
      }
    }

    return lines.join('\n');
  }
}

export const securityScanner = new SecurityScanner();