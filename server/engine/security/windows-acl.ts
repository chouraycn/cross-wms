import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type WindowsAclEntry = {
  trustee: string;
  trusteeType: 'user' | 'group' | 'well-known' | 'unknown';
  accessMask: number;
  accessType: 'allow' | 'deny';
  inheritance: string;
  isInherited: boolean;
};

export type WindowsAclSecurityCheckResult = {
  safe: boolean;
  reason?: string;
  risk?: 'critical' | 'high' | 'medium' | 'low';
  dangerousEntries: WindowsAclEntry[];
  warningEntries: WindowsAclEntry[];
};

const DANGEROUS_ACCESS_MASKS = [
  { mask: 0x100000, name: 'DELETE', severity: 'critical' as const },
  { mask: 0x20000, name: 'WRITE_DAC', severity: 'critical' as const },
  { mask: 0x40000, name: 'WRITE_OWNER', severity: 'critical' as const },
  { mask: 0x80000, name: 'SYNCHRONIZE', severity: 'medium' as const },
  { mask: 0x100001, name: 'GENERIC_READ', severity: 'low' as const },
  { mask: 0x100002, name: 'GENERIC_WRITE', severity: 'high' as const },
  { mask: 0x100004, name: 'GENERIC_EXECUTE', severity: 'high' as const },
  { mask: 0x100008, name: 'GENERIC_ALL', severity: 'critical' as const },
];

const DANGEROUS_TRUSTEES = [
  { name: 'Everyone', severity: 'critical' as const },
  { name: 'Authenticated Users', severity: 'high' as const },
  { name: 'Users', severity: 'medium' as const },
  { name: 'Administrators', severity: 'medium' as const },
  { name: 'SYSTEM', severity: 'low' as const },
  { name: 'CREATOR OWNER', severity: 'low' as const },
];

function getTrusteeType(trustee: string): WindowsAclEntry['trusteeType'] {
  if (trustee.includes('S-1-5-1')) return 'well-known';
  if (trustee.includes('S-1-5-32')) return 'group';
  if (trustee.includes('S-1-5-21')) return 'user';
  return 'unknown';
}

function getTrusteeName(trustee: string): string {
  const wellKnown: Record<string, string> = {
    'S-1-5-1': 'Everyone',
    'S-1-5-32-545': 'Users',
    'S-1-5-32-500': 'Administrator',
    'S-1-5-32-501': 'Guest',
    'S-1-5-18': 'SYSTEM',
    'S-1-3-0': 'CREATOR OWNER',
    'S-1-5-11': 'Authenticated Users',
  };

  for (const [sid, name] of Object.entries(wellKnown)) {
    if (trustee.includes(sid)) {
      return name;
    }
  }

  return trustee;
}

function parseAclEntry(rawEntry: string): WindowsAclEntry | null {
  try {
    const parts = rawEntry.split('|');
    if (parts.length < 4) return null;

    const trustee = parts[0].trim();
    const accessMask = parseInt(parts[1].trim(), 16);
    const accessType = parts[2].trim().toLowerCase() === 'deny' ? 'deny' : 'allow';
    const inheritance = parts[3].trim();
    const isInherited = parts.length > 4 && parts[4].trim().toLowerCase() === 'inherited';

    return {
      trustee,
      trusteeType: getTrusteeType(trustee),
      accessMask,
      accessType,
      inheritance,
      isInherited,
    };
  } catch {
    return null;
  }
}

export function parseWindowsAclOutput(aclOutput: string): WindowsAclEntry[] {
  const entries: WindowsAclEntry[] = [];
  const lines = aclOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(' ') || trimmed.startsWith('NT AUTHORITY')) {
      continue;
    }

    const entry = parseAclEntry(trimmed);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

export function analyzeWindowsAcl(entries: WindowsAclEntry[], filePath: string): WindowsAclSecurityCheckResult {
  const dangerousEntries: WindowsAclEntry[] = [];
  const warningEntries: WindowsAclEntry[] = [];
  let highestRisk: 'critical' | 'high' | 'medium' | 'low' | undefined;

  for (const entry of entries) {
    const trusteeName = getTrusteeName(entry.trustee);
    let entryRisk: 'critical' | 'high' | 'medium' | 'low' | undefined;

    for (const { name, severity } of DANGEROUS_TRUSTEES) {
      if (trusteeName === name) {
        entryRisk = severity;
        break;
      }
    }

    for (const { mask, severity } of DANGEROUS_ACCESS_MASKS) {
      if ((entry.accessMask & mask) !== 0) {
        if (!entryRisk || severity === 'critical' || (severity === 'high' && entryRisk === 'medium')) {
          entryRisk = severity;
        }
      }
    }

    if (entry.accessType === 'allow') {
      if (entryRisk === 'critical') {
        dangerousEntries.push(entry);
        highestRisk = 'critical';
      } else if (entryRisk === 'high') {
        dangerousEntries.push(entry);
        if (!highestRisk || highestRisk === 'medium' || highestRisk === 'low') {
          highestRisk = 'high';
        }
      } else if (entryRisk === 'medium') {
        warningEntries.push(entry);
        if (!highestRisk || highestRisk === 'low') {
          highestRisk = 'medium';
        }
      }
    }
  }

  if (dangerousEntries.length > 0) {
    return {
      safe: false,
      reason: `Found ${dangerousEntries.length} dangerous ACL entries for ${filePath}`,
      risk: highestRisk,
      dangerousEntries,
      warningEntries,
    };
  }

  if (warningEntries.length > 0) {
    return {
      safe: true,
      reason: `Found ${warningEntries.length} warning ACL entries`,
      risk: 'low',
      dangerousEntries,
      warningEntries,
    };
  }

  return {
    safe: true,
    dangerousEntries,
    warningEntries,
  };
}

export function aclToSecurityFindings(
  result: WindowsAclSecurityCheckResult,
  filePath: string,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const entry of result.dangerousEntries) {
    const trusteeName = getTrusteeName(entry.trustee);
    const accessNames: string[] = [];

    for (const { mask, name } of DANGEROUS_ACCESS_MASKS) {
      if ((entry.accessMask & mask) !== 0) {
        accessNames.push(name);
      }
    }

    findings.push({
      id: `acl-dangerous-${filePath}-${trusteeName}`,
      title: `Dangerous ACL permission: ${trusteeName} on ${filePath}`,
      severity: result.risk ?? 'high',
      category: 'filesystem',
      description: `Trustee "${trusteeName}" has dangerous permissions (${accessNames.join(', ')}) on ${filePath}.`,
      recommendation: 'Review and restrict ACL permissions for this file/directory.',
      metadata: {
        filePath,
        trustee: entry.trustee,
        trusteeName,
        accessMask: entry.accessMask.toString(16),
        accessNames,
        isInherited: entry.isInherited,
      },
    });
  }

  for (const entry of result.warningEntries) {
    const trusteeName = getTrusteeName(entry.trustee);
    findings.push({
      id: `acl-warning-${filePath}-${trusteeName}`,
      title: `Warning ACL permission: ${trusteeName} on ${filePath}`,
      severity: 'medium',
      category: 'filesystem',
      description: `Trustee "${trusteeName}" has potentially excessive permissions on ${filePath}.`,
      recommendation: 'Review ACL permissions to ensure principle of least privilege.',
      metadata: {
        filePath,
        trustee: entry.trustee,
        trusteeName,
        isInherited: entry.isInherited,
      },
    });
  }

  return findings;
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function getRecommendedWindowsAcl(filePath: string, options?: {
  allowUsersRead?: boolean;
  allowUsersWrite?: boolean;
}): string[] {
  const { allowUsersRead = false, allowUsersWrite = false } = options ?? {};
  const recommendations: string[] = [];

  if (isWindows()) {
    recommendations.push(`icacls "${filePath}" /inheritance:e`);

    if (allowUsersRead) {
      recommendations.push(`icacls "${filePath}" /grant "Users:(R)"`);
    }

    if (allowUsersWrite) {
      recommendations.push(`icacls "${filePath}" /grant "Users:(W)"`);
    }

    recommendations.push(`icacls "${filePath}" /remove "Everyone"`);
    recommendations.push(`icacls "${filePath}" /setowner "Administrators"`);
  }

  logger.debug(`[Security:WindowsACL] Generated ${recommendations.length} ACL recommendations`);

  return recommendations;
}