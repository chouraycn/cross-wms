export const CURRENT_SCHEMA_VERSION = '1.0.0';

export const VERSIONS: Record<string, string> = {
  '0.9': 'Initial version',
  '1.0.0': 'First stable version with proper schema',
  '1.1.0': 'Added transcript SQLite storage',
  '1.2.0': 'Added multi-workspace support',
};

export function getVersionDescription(version: string): string {
  return VERSIONS[version] || 'Unknown version';
}

export function versionCompare(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export function isVersionGreaterOrEqual(current: string, target: string): boolean {
  return versionCompare(current, target) >= 0;
}

export function isVersionLessThan(current: string, target: string): boolean {
  return versionCompare(current, target) < 0;
}

export function getAvailableVersions(): string[] {
  return Object.keys(VERSIONS).sort(versionCompare);
}