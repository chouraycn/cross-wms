import path from 'path';
import { logger } from '../../logger.js';
import type { PathSecurityCheckResult, SecurityFinding, SecurityLevel } from './types.js';

const DANGEROUS_PATH_PATTERNS = [
  { pattern: /\.\./, name: 'parent directory traversal', severity: 'high' as const },
  { pattern: /^~/, name: 'home directory access', severity: 'medium' as const },
  { pattern: /^\/etc\//, name: 'system config directory', severity: 'high' as const },
  { pattern: /^\/proc\//, name: 'proc filesystem access', severity: 'high' as const },
  { pattern: /^\/sys\//, name: 'sys filesystem access', severity: 'high' as const },
  { pattern: /^\/dev\//, name: 'device filesystem access', severity: 'high' as const },
  { pattern: /^\/root\//, name: 'root user directory', severity: 'critical' as const },
  { pattern: /\.pem$|\.key$|\.pfx$|\.p12$|\.crt$|\.cer$/i, name: 'certificate/key file', severity: 'high' as const },
  { pattern: /\.env(\.|$)/i, name: 'environment variable file', severity: 'high' as const },
  { pattern: /id_rsa|id_ed25519|id_dsa|id_ecdsa/i, name: 'SSH private key', severity: 'critical' as const },
];

const SENSITIVE_FILE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /credential/i,
  /config\.json$/i,
  /settings\.json$/i,
];

export function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function normalizePath(inputPath: string): string {
  let normalized = inputPath.replace(/\\/g, '/');
  while (normalized.includes('//')) {
    normalized = normalized.replace(/\/\//g, '/');
  }
  return normalized;
}

export function detectPathTraversal(inputPath: string): PathSecurityCheckResult {
  const details: string[] = [];
  let highestRisk: SecurityLevel | undefined;

  for (const dangerous of DANGEROUS_PATH_PATTERNS) {
    if (dangerous.pattern.test(inputPath)) {
      details.push(dangerous.name);
      if (!highestRisk || compareSeverity(dangerous.severity, highestRisk) > 0) {
        highestRisk = dangerous.severity;
      }
    }
  }

  if (details.length > 0) {
    return {
      safe: false,
      reason: `Potentially dangerous path pattern detected: ${details.join(', ')}`,
      risk: highestRisk,
      details,
    };
  }

  return { safe: true };
}

export function isSensitiveFilePath(filePath: string): boolean {
  const basename = path.basename(filePath);
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

export function validatePathWithinBounds(
  targetPath: string,
  allowedRoots: string[],
): PathSecurityCheckResult {
  const resolvedTarget = path.resolve(targetPath);

  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);
    if (isPathInside(resolvedRoot, resolvedTarget) || resolvedRoot === resolvedTarget) {
      return { safe: true };
    }
  }

  return {
    safe: false,
    reason: `Path is outside allowed directories: ${targetPath}`,
    risk: 'high',
    details: [`Allowed roots: ${allowedRoots.join(', ')}`],
  };
}

function compareSeverity(a: SecurityLevel, b: SecurityLevel): number {
  const order: SecurityLevel[] = ['info', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(a) - order.indexOf(b);
}

export function scanPathForRisks(
  inputPath: string,
  options: { allowedRoots?: string[]; checkSensitive?: boolean } = {},
): PathSecurityCheckResult {
  const traversalCheck = detectPathTraversal(inputPath);
  if (!traversalCheck.safe) {
    return traversalCheck;
  }

  if (options.allowedRoots && options.allowedRoots.length > 0) {
    const boundsCheck = validatePathWithinBounds(inputPath, options.allowedRoots);
    if (!boundsCheck.safe) {
      return boundsCheck;
    }
  }

  if (options.checkSensitive && isSensitiveFilePath(inputPath)) {
    return {
      safe: false,
      reason: 'Path points to a potentially sensitive file',
      risk: 'medium',
      details: ['File name matches sensitive file patterns'],
    };
  }

  return { safe: true };
}

export function auditFilePaths(
  filePaths: string[],
  options: { allowedRoots?: string[]; checkSensitive?: boolean } = {},
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  for (const filePath of filePaths) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const check = scanPathForRisks(filePath, options);

    if (!check.safe && check.risk) {
      findings.push({
        id: `path-risk-${filePath}`,
        title: `Potential security risk in path: ${filePath}`,
        severity: check.risk,
        category: 'filesystem',
        description: check.reason ?? 'Unknown path security risk',
        recommendation: 'Validate and sanitize all file paths before use. Ensure paths are within allowed directories.',
        metadata: { path: filePath, details: check.details, risk: check.risk },
      });
    }
  }

  logger.debug(`[Security:ScanPaths] Audited ${filePaths.length} paths, found ${findings.length} findings`);

  return findings;
}

export function sanitizePath(inputPath: string): string {
  let sanitized = path.normalize(inputPath);
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\.[\\/]/g, '');
    sanitized = path.normalize(sanitized);
  }
  return sanitized;
}

export function safeJoinPath(...parts: string[]): string {
  const joined = path.join(...parts);
  const normalized = path.normalize(joined);
  if (normalized.includes('..')) {
    throw new Error('Path traversal detected in safeJoinPath');
  }
  return normalized;
}
