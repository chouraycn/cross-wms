import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { isSensitiveFilePath, scanPathForRisks } from './scan-paths.js';
import type { PathSecurityCheckResult, SecurityFinding, SecurityLevel } from './types.js';

export type PermissionCheck = {
  ok: boolean;
  isDir: boolean;
  isFile: boolean;
  isSymlink: boolean;
  worldWritable: boolean;
  groupWritable: boolean;
  ownerReadable: boolean;
  ownerWritable: boolean;
  ownerExecutable: boolean;
  groupReadable: boolean;
  groupExecutable: boolean;
  worldReadable: boolean;
  worldExecutable: boolean;
  mode?: number;
  uid?: number;
  gid?: number;
  source: 'stat' | 'unknown';
  error?: string;
};

export type PermissionCheckOptions = {
  followSymlinks?: boolean;
  checkParents?: boolean;
};

export type FsAuditEntry = {
  path: string;
  operation: 'read' | 'write' | 'delete' | 'execute' | 'create';
  timestamp: number;
  success: boolean;
  actor?: string;
  details?: Record<string, unknown>;
};

const auditLog: FsAuditEntry[] = [];
const MAX_AUDIT_LOG_ENTRIES = 10000;

export async function safeStat(filePath: string): Promise<PermissionCheck> {
  try {
    const stat = await fs.lstat(filePath);
    const mode = stat.mode;

    return {
      ok: true,
      isDir: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink: stat.isSymbolicLink(),
      worldWritable: (mode & 0o002) !== 0,
      groupWritable: (mode & 0o020) !== 0,
      ownerReadable: (mode & 0o400) !== 0,
      ownerWritable: (mode & 0o200) !== 0,
      ownerExecutable: (mode & 0o100) !== 0,
      groupReadable: (mode & 0o040) !== 0,
      groupExecutable: (mode & 0o010) !== 0,
      worldReadable: (mode & 0o004) !== 0,
      worldExecutable: (mode & 0o001) !== 0,
      mode,
      uid: stat.uid,
      gid: stat.gid,
      source: 'stat',
    };
  } catch (err) {
    return {
      ok: false,
      isDir: false,
      isFile: false,
      isSymlink: false,
      worldWritable: false,
      groupWritable: false,
      ownerReadable: false,
      ownerWritable: false,
      ownerExecutable: false,
      groupReadable: false,
      groupExecutable: false,
      worldReadable: false,
      worldExecutable: false,
      source: 'unknown',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function inspectPathPermissions(
  filePath: string,
  options: PermissionCheckOptions = {},
): Promise<PermissionCheck> {
  const { followSymlinks = false } = options;

  let check = await safeStat(filePath);

  if (check.ok && check.isSymlink && followSymlinks) {
    try {
      const realPath = await fs.realpath(filePath);
      check = await safeStat(realPath);
    } catch (err) {
      check.error = err instanceof Error ? err.message : String(err);
    }
  }

  return check;
}

export function formatPermissionDetail(perm: PermissionCheck): string {
  if (!perm.ok) {
    return `Unable to check permissions: ${perm.error ?? 'unknown error'}`;
  }

  const parts: string[] = [];
  if (perm.worldWritable) parts.push('world-writable');
  if (perm.groupWritable) parts.push('group-writable');
  if (perm.isSymlink) parts.push('symlink');
  if (perm.mode !== undefined) parts.push(`mode=${perm.mode.toString(8)}`);

  return parts.length > 0 ? parts.join(', ') : 'permissions appear safe';
}

export function formatPermissionRemediation(perm: PermissionCheck, filePath: string): string {
  if (!perm.ok) {
    return 'Verify the file exists and is accessible.';
  }

  const remediations: string[] = [];

  if (perm.worldWritable) {
    remediations.push(`Remove world-writable permission: chmod o-w ${filePath}`);
  }
  if (perm.groupWritable) {
    remediations.push(`Review group-writable permission: consider chmod g-w ${filePath}`);
  }
  if (perm.isSymlink) {
    remediations.push('Verify symlink target is safe and trusted.');
  }

  return remediations.length > 0 ? remediations.join(' ') : 'No action needed.';
}

export async function auditSensitiveFiles(
  filePaths: string[],
  options: { allowedRoots?: string[] } = {},
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  for (const filePath of filePaths) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const pathCheck = scanPathForRisks(filePath, {
      allowedRoots: options.allowedRoots,
      checkSensitive: true,
    });

    if (!pathCheck.safe && pathCheck.risk) {
      const severity: SecurityLevel = pathCheck.risk;
      findings.push({
        id: `fs-sensitive-${filePath}`,
        title: `Sensitive file access detected: ${path.basename(filePath)}`,
        severity,
        category: 'filesystem',
        description: pathCheck.reason ?? 'Access to potentially sensitive file.',
        recommendation: 'Restrict access to sensitive files. Ensure proper file permissions.',
        metadata: { path: filePath, details: pathCheck.details },
      });
    }

    const permCheck = await inspectPathPermissions(filePath);
    if (permCheck.ok && (permCheck.worldWritable || permCheck.groupWritable)) {
      findings.push({
        id: `fs-perms-${filePath}`,
        title: `Insecure file permissions: ${path.basename(filePath)}`,
        severity: 'medium',
        category: 'filesystem',
        description: formatPermissionDetail(permCheck),
        recommendation: formatPermissionRemediation(permCheck, filePath),
        metadata: { path: filePath, permissions: permCheck },
      });
    }
  }

  logger.debug(`[Security:AuditFs] Audited ${filePaths.length} files, found ${findings.length} findings`);

  return findings;
}

export function logFsAccess(entry: FsAuditEntry): void {
  auditLog.push(entry);

  if (auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    auditLog.shift();
  }

  if (isSensitiveFilePath(entry.path) && !entry.success) {
    logger.warn(`[Security:AuditFs] Sensitive file access attempt: ${entry.operation} on ${entry.path}`);
  }
}

export function getFsAuditLog(limit = 100): FsAuditEntry[] {
  return auditLog.slice(-limit);
}

export function clearFsAuditLog(): void {
  auditLog.length = 0;
}

export async function auditDirectoryPermissions(
  dirPath: string,
  options: { recursive?: boolean; maxDepth?: number } = {},
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const { recursive = false, maxDepth = 2 } = options;

  async function auditDir(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        const permCheck = await inspectPathPermissions(fullPath);
        if (permCheck.ok && (permCheck.worldWritable || permCheck.groupWritable)) {
          findings.push({
            id: `fs-dir-perms-${fullPath}`,
            title: `Insecure permissions: ${entry.name}`,
            severity: 'medium',
            category: 'filesystem',
            description: formatPermissionDetail(permCheck),
            recommendation: formatPermissionRemediation(permCheck, fullPath),
            metadata: { path: fullPath, entryType: entry.isDirectory() ? 'directory' : 'file' },
          });
        }

        if (recursive && entry.isDirectory() && !entry.name.startsWith('.')) {
          await auditDir(fullPath, depth + 1);
        }
      }
    } catch (err) {
      logger.debug(`[Security:AuditFs] Error reading directory ${currentPath}:`, err);
    }
  }

  await auditDir(dirPath, 0);

  return findings;
}

export async function checkPathSecurity(
  filePath: string,
  options: { allowedRoots?: string[]; requireSafePermissions?: boolean } = {},
): Promise<PathSecurityCheckResult> {
  const { allowedRoots, requireSafePermissions = false } = options;

  const pathCheck = scanPathForRisks(filePath, { allowedRoots });
  if (!pathCheck.safe) {
    return pathCheck;
  }

  if (requireSafePermissions) {
    const permCheck = await inspectPathPermissions(filePath);
    if (permCheck.ok && permCheck.worldWritable) {
      return {
        safe: false,
        reason: 'File is world-writable',
        risk: 'high',
        details: ['World-writable files can be modified by any user'],
      };
    }
  }

  return { safe: true };
}
