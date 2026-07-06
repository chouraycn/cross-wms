export type VersionCompatibilityLevel = 'major' | 'minor' | 'patch' | 'prerelease';

export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  raw: string;
}

export interface VersionUpdate {
  fromVersion: string;
  toVersion: string;
  level: VersionCompatibilityLevel;
  breaking: boolean;
  changes: VersionChange[];
  timestamp: number;
}

export interface VersionChange {
  type: 'added' | 'modified' | 'removed' | 'fixed' | 'deprecated';
  path: string;
  description: string;
}

export class VersionManager {
  private versionHistory: Map<string, VersionInfo[]> = new Map();

  parse(version: string): VersionInfo {
    const cleanVersion = version.replace(/^v/, '');
    const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);

    if (!match) {
      return {
        version: cleanVersion,
        major: 0,
        minor: 0,
        patch: 0,
        prerelease: [],
        raw: version,
      };
    }

    return {
      version: cleanVersion,
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] ? match[4].split('.') : [],
      raw: version,
    };
  }

  compare(a: string, b: string): number {
    const versionA = this.parse(a);
    const versionB = this.parse(b);

    if (versionA.major !== versionB.major) {
      return versionA.major - versionB.major;
    }
    if (versionA.minor !== versionB.minor) {
      return versionA.minor - versionB.minor;
    }
    if (versionA.patch !== versionB.patch) {
      return versionA.patch - versionB.patch;
    }

    if (versionA.prerelease.length === 0 && versionB.prerelease.length > 0) {
      return 1;
    }
    if (versionA.prerelease.length > 0 && versionB.prerelease.length === 0) {
      return -1;
    }
    return versionA.prerelease.join('.').localeCompare(versionB.prerelease.join('.'));
  }

  getCompatibilityLevel(fromVersion: string, toVersion: string): VersionCompatibilityLevel {
    const from = this.parse(fromVersion);
    const to = this.parse(toVersion);

    if (from.major !== to.major) return 'major';
    if (from.minor !== to.minor) return 'minor';
    if (from.patch !== to.patch) return 'patch';
    if (from.prerelease.join('.') !== to.prerelease.join('.')) return 'prerelease';
    return 'patch';
  }

  isBreakingChange(fromVersion: string, toVersion: string): boolean {
    return this.getCompatibilityLevel(fromVersion, toVersion) === 'major';
  }

  isCompatible(fromVersion: string, toVersion: string): boolean {
    return this.compare(fromVersion, toVersion) >= 0;
  }

  recordVersion(skillId: string, version: string): void {
    const history = this.versionHistory.get(skillId) || [];
    const versionInfo = this.parse(version);
    
    const existingIndex = history.findIndex(v => v.version === versionInfo.version);
    if (existingIndex === -1) {
      history.push(versionInfo);
      history.sort((a, b) => this.compare(a.version, b.version));
      this.versionHistory.set(skillId, history);
    }
  }

  getVersionHistory(skillId: string): VersionInfo[] {
    return [...(this.versionHistory.get(skillId) || [])];
  }

  getLatestVersion(skillId: string): VersionInfo | undefined {
    const history = this.versionHistory.get(skillId);
    if (!history || history.length === 0) return undefined;
    return history[history.length - 1];
  }

  detectUpdate(fromVersion: string, toVersion: string): VersionUpdate {
    const level = this.getCompatibilityLevel(fromVersion, toVersion);
    const breaking = this.isBreakingChange(fromVersion, toVersion);

    return {
      fromVersion,
      toVersion,
      level,
      breaking,
      changes: [],
      timestamp: Date.now(),
    };
  }

  needsUpdate(currentVersion: string, targetVersion: string): boolean {
    return this.compare(currentVersion, targetVersion) < 0;
  }

  getNextVersion(currentVersion: string, level: VersionCompatibilityLevel): string {
    const version = this.parse(currentVersion);
    switch (level) {
      case 'major':
        return `${version.major + 1}.0.0`;
      case 'minor':
        return `${version.major}.${version.minor + 1}.0`;
      case 'patch':
        return `${version.major}.${version.minor}.${version.patch + 1}`;
      case 'prerelease':
        return `${version.major}.${version.minor}.${version.patch}-${version.prerelease.join('.') || 'rc.0'}`;
      default:
        return currentVersion;
    }
  }

  clearHistory(skillId: string): void {
    this.versionHistory.delete(skillId);
  }

  clearAll(): void {
    this.versionHistory.clear();
  }
}

export const versionManager = new VersionManager();