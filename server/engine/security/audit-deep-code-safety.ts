import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type DeepCodeSafetyCheck = {
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  check: (code: string, filename?: string) => DeepCodeSafetyFinding[];
};

export type DeepCodeSafetyFinding = {
  line?: number;
  column?: number;
  message: string;
  code?: string;
  suggestion?: string;
};

const DANGEROUS_CODE_PATTERNS = [
  {
    name: 'eval',
    description: 'eval() usage is a security risk',
    severity: 'critical' as const,
    pattern: /\beval\s*\(/g,
    suggestion: 'Use Function constructor with sanitized input or refactor to avoid dynamic code execution',
  },
  {
    name: 'Function',
    description: 'Function constructor can execute arbitrary code',
    severity: 'critical' as const,
    pattern: /\bnew\s+Function\s*\(/g,
    suggestion: 'Avoid creating functions dynamically. Use static code instead.',
  },
  {
    name: 'setTimeout_string',
    description: 'setTimeout with string argument can execute arbitrary code',
    severity: 'high' as const,
    pattern: /\bsetTimeout\s*\(\s*['"`]/g,
    suggestion: 'Pass a function reference instead of a string to setTimeout.',
  },
  {
    name: 'setInterval_string',
    description: 'setInterval with string argument can execute arbitrary code',
    severity: 'high' as const,
    pattern: /\bsetInterval\s*\(\s*['"`]/g,
    suggestion: 'Pass a function reference instead of a string to setInterval.',
  },
  {
    name: 'execSync',
    description: 'Synchronous command execution',
    severity: 'critical' as const,
    pattern: /\bexecSync\s*\(/g,
    suggestion: 'Use async alternatives and validate all inputs.',
  },
  {
    name: 'execFileSync',
    description: 'Synchronous file-based command execution',
    severity: 'critical' as const,
    pattern: /\bexecFileSync\s*\(/g,
    suggestion: 'Use async alternatives and validate all inputs.',
  },
  {
    name: 'spawnSync',
    description: 'Synchronous process spawning',
    severity: 'critical' as const,
    pattern: /\bspawnSync\s*\(/g,
    suggestion: 'Use async alternatives and validate all inputs.',
  },
  {
    name: 'child_process',
    description: 'Direct child_process module import',
    severity: 'high' as const,
    pattern: /require\(['"`]child_process['"`]\)|import\s+.*from\s+['"`]child_process['"`]/g,
    suggestion: 'Use the security-audited tool execution instead.',
  },
  {
    name: 'fs.writeFileSync',
    description: 'Synchronous file write',
    severity: 'medium' as const,
    pattern: /\bwriteFileSync\s*\(/g,
    suggestion: 'Use async file operations to avoid blocking the event loop.',
  },
  {
    name: 'process.env',
    description: 'Direct process.env access',
    severity: 'medium' as const,
    pattern: /process\.env\s*\[?\s*['"`][A-Z_]+['"`]\s*\]?/g,
    suggestion: 'Use a configuration manager with type safety and validation.',
  },
  {
    name: 'Buffer.from_string',
    description: 'Buffer.from with string encoding can be unsafe',
    severity: 'medium' as const,
    pattern: /Buffer\.from\s*\(\s*[^,]+,\s*['"`]base64['"`]\s*\)/g,
    suggestion: 'Validate base64 input before decoding.',
  },
];

function findPatternMatches(code: string, pattern: RegExp): { line: number; column: number; match: string }[] {
  const matches: { line: number; column: number; match: string }[] = [];
  let match;

  while ((match = pattern.exec(code)) !== null) {
    const before = code.substring(0, match.index);
    const lines = before.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    matches.push({ line, column, match: match[0] });
  }

  return matches;
}

export function auditDeepCodeSafety(code: string, filename?: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const pattern of DANGEROUS_CODE_PATTERNS) {
    const matches = findPatternMatches(code, pattern.pattern);

    for (const match of matches) {
      findings.push({
        id: `deep-code-${pattern.name}-${match.line}-${match.column}`,
        title: `${pattern.description}: ${match.match.trim()}`,
        severity: pattern.severity,
        category: 'command',
        description: `Found dangerous code pattern "${pattern.name}" at line ${match.line}, column ${match.column}. ${pattern.description}.`,
        recommendation: pattern.suggestion,
        metadata: {
          pattern: pattern.name,
          line: match.line,
          column: match.column,
          matchedCode: match.match,
          filename,
        },
      });
    }
  }

  logger.debug(`[Security:DeepCodeSafety] Audited code, found ${findings.length} findings`);

  return findings;
}

export function scanCodeForInjectionVectors(code: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const injectionPatterns = [
    {
      name: 'string_concat_exec',
      description: 'String concatenation before execution',
      severity: 'critical' as const,
      pattern: /(\bexec\b|\bshell\b|\bspawn\b)\s*\(\s*["'`].*\+.*["'`]/g,
      suggestion: 'Never concatenate user input into command strings. Use parameterized commands.',
    },
    {
      name: 'template_literal_exec',
      description: 'Template literal in command execution',
      severity: 'critical' as const,
      pattern: /(\bexec\b|\bshell\b|\bspawn\b)\s*\(\s*`.*\${.*}`/g,
      suggestion: 'Never use template literals with user input in command execution.',
    },
    {
      name: 'url_query_exec',
      description: 'URL query parameters in command',
      severity: 'critical' as const,
      pattern: /(\bexec\b|\bshell\b|\bspawn\b)\s*\(\s*.*query\..*\+.*\)/g,
      suggestion: 'Sanitize and validate all URL parameters before use.',
    },
  ];

  for (const pattern of injectionPatterns) {
    const matches = findPatternMatches(code, pattern.pattern);

    for (const match of matches) {
      findings.push({
        id: `injection-${pattern.name}-${match.line}-${match.column}`,
        title: `Code injection vector: ${pattern.description}`,
        severity: pattern.severity,
        category: 'command',
        description: `Found potential code injection vector at line ${match.line}, column ${match.column}.`,
        recommendation: pattern.suggestion,
        metadata: {
          pattern: pattern.name,
          line: match.line,
          column: match.column,
          matchedCode: match.match,
        },
      });
    }
  }

  return findings;
}

export function analyzeCodeImports(code: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const dangerousImports = [
    { name: 'child_process', severity: 'critical' as const, reason: 'Direct process execution' },
    { name: 'fs', severity: 'high' as const, reason: 'File system access' },
    { name: 'net', severity: 'high' as const, reason: 'Raw network access' },
    { name: 'dgram', severity: 'high' as const, reason: 'UDP network access' },
    { name: 'tls', severity: 'medium' as const, reason: 'SSL/TLS operations' },
    { name: 'crypto', severity: 'medium' as const, reason: 'Cryptographic operations' },
    { name: 'http', severity: 'medium' as const, reason: 'HTTP server/client' },
    { name: 'https', severity: 'medium' as const, reason: 'HTTPS server/client' },
  ];

  for (const imp of dangerousImports) {
    const importPattern = new RegExp(
      `(require\\(['"]${imp.name}['"]\\)|import\\s+.*from\\s+['"]${imp.name}['"]|import\\s*['"]${imp.name}['"])`,
      'g',
    );
    const matches = findPatternMatches(code, importPattern);

    for (const match of matches) {
      findings.push({
        id: `import-${imp.name}-${match.line}`,
        title: `Dangerous module import: ${imp.name}`,
        severity: imp.severity,
        category: 'config',
        description: `Import of dangerous module "${imp.name}" detected at line ${match.line}. ${imp.reason}.`,
        recommendation: 'Review and restrict usage of dangerous modules. Use security-audited alternatives where available.',
        metadata: { module: imp.name, line: match.line, matchedCode: match.match },
      });
    }
  }

  return findings;
}

export function performFullDeepCodeAudit(code: string, filename?: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  findings.push(...auditDeepCodeSafety(code, filename));
  findings.push(...scanCodeForInjectionVectors(code));
  findings.push(...analyzeCodeImports(code));

  return findings;
}