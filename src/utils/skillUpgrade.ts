import type { SkillEntry } from './skillRegistry';
import { skillResolver } from './skillResolver';

export type UpgradeStatus = 'up_to_date' | 'available' | 'pending' | 'installing' | 'error';

export interface SkillVersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  changelog?: string[];
  releaseDate?: string;
  author?: string;
}

export interface UpgradePlan {
  skillId: string;
  skillName: string;
  fromVersion: string;
  toVersion: string;
  estimatedSize?: number;
  dependencies?: string[];
  requiresRestart: boolean;
}

export interface UpgradeResult {
  success: boolean;
  skillId: string;
  previousVersion: string;
  newVersion: string;
  message: string;
  error?: Error;
}

export interface UpgradeBatchResult {
  successful: UpgradeResult[];
  failed: UpgradeResult[];
  skipped: Array<{ skillId: string; reason: string }>;
  total: number;
}

export class SkillUpgradeManager {
  private versionCache: Map<string, SkillVersionInfo> = new Map();
  private upgradeQueue: Set<string> = new Set();

  async checkVersion(skill: SkillEntry): Promise<SkillVersionInfo> {
    const cacheKey = `${skill.id}:${skill.contentHash || skill.promptVersion || ''}`;
    const cached = this.versionCache.get(cacheKey);
    if (cached) return cached;

    const currentVersion = skill.promptVersion || '0.0.0';
    let latestVersion = currentVersion;
    let updateAvailable = false;

    if (skill.source === 'market') {
      try {
        latestVersion = await this.fetchMarketVersion(skill.id);
        updateAvailable = this.compareVersions(currentVersion, latestVersion) < 0;
      } catch {
        latestVersion = currentVersion;
      }
    }

    const info: SkillVersionInfo = {
      currentVersion,
      latestVersion,
      updateAvailable,
    };

    this.versionCache.set(cacheKey, info);
    return info;
  }

  async checkAllVersions(skills: SkillEntry[]): Promise<Map<string, SkillVersionInfo>> {
    const results = new Map<string, SkillVersionInfo>();
    for (const skill of skills) {
      const info = await this.checkVersion(skill);
      results.set(skill.id, info);
    }
    return results;
  }

  getSkillsWithUpdates(skills: SkillEntry[]): Promise<SkillEntry[]> {
    return new Promise((resolve) => {
      const result: SkillEntry[] = [];
      let checked = 0;

      if (skills.length === 0) {
        resolve(result);
        return;
      }

      for (const skill of skills) {
        this.checkVersion(skill).then((info) => {
          if (info.updateAvailable) {
            result.push(skill);
          }
          checked++;
          if (checked === skills.length) {
            resolve(result);
          }
        }).catch(() => {
          checked++;
          if (checked === skills.length) {
            resolve(result);
          }
        });
      }
    });
  }

  createUpgradePlan(skill: SkillEntry, targetVersion: string): UpgradePlan | null {
    const currentVersion = skill.promptVersion || '0.0.0';
    
    return {
      skillId: skill.id,
      skillName: skill.name,
      fromVersion: currentVersion,
      toVersion: targetVersion,
      requiresRestart: this.compareVersions(currentVersion, targetVersion) >= 2,
    };
  }

  async upgradeSkill(skill: SkillEntry, targetVersion?: string): Promise<UpgradeResult> {
    if (this.upgradeQueue.has(skill.id)) {
      return {
        success: false,
        skillId: skill.id,
        previousVersion: skill.promptVersion || '',
        newVersion: skill.promptVersion || '',
        message: 'Upgrade already in progress',
      };
    }

    this.upgradeQueue.add(skill.id);

    try {
      const previousVersion = skill.promptVersion || '0.0.0';
      const versionInfo = await this.checkVersion(skill);
      const toVersion = targetVersion || versionInfo.latestVersion;

      if (!versionInfo.updateAvailable && !targetVersion) {
        this.upgradeQueue.delete(skill.id);
        return {
          success: false,
          skillId: skill.id,
          previousVersion,
          newVersion: previousVersion,
          message: 'Skill is already up to date',
        };
      }

      const updatedContent = await this.fetchSkillContent(skill.id, toVersion);
      if (!updatedContent) {
        this.upgradeQueue.delete(skill.id);
        return {
          success: false,
          skillId: skill.id,
          previousVersion,
          newVersion: previousVersion,
          message: 'Failed to fetch updated skill content',
        };
      }

      const resolved = await skillResolver.resolveFromContent(
        skill.id,
        updatedContent,
        skill.filePath,
        { source: skill.source }
      );

      if (!resolved.scanResult.passed) {
        this.upgradeQueue.delete(skill.id);
        return {
          success: false,
          skillId: skill.id,
          previousVersion,
          newVersion: previousVersion,
          message: 'Security scan failed for updated skill',
        };
      }

      this.versionCache.delete(`${skill.id}:${previousVersion}`);

      return {
        success: true,
        skillId: skill.id,
        previousVersion,
        newVersion: toVersion,
        message: `Successfully upgraded from ${previousVersion} to ${toVersion}`,
      };
    } catch (error) {
      this.upgradeQueue.delete(skill.id);
      return {
        success: false,
        skillId: skill.id,
        previousVersion: skill.promptVersion || '',
        newVersion: skill.promptVersion || '',
        message: `Upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : undefined,
      };
    }
  }

  async batchUpgrade(skills: SkillEntry[]): Promise<UpgradeBatchResult> {
    const results: UpgradeBatchResult = {
      successful: [],
      failed: [],
      skipped: [],
      total: skills.length,
    };

    for (const skill of skills) {
      const versionInfo = await this.checkVersion(skill);
      if (!versionInfo.updateAvailable) {
        results.skipped.push({ skillId: skill.id, reason: 'Already up to date' });
        continue;
      }

      const result = await this.upgradeSkill(skill);
      if (result.success) {
        results.successful.push(result);
      } else {
        results.failed.push(result);
      }
    }

    return results;
  }

  compareVersions(v1: string, v2: string): number {
    const parts1 = this.parseVersion(v1);
    const parts2 = this.parseVersion(v2);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 !== p2) return p1 - p2;
    }
    return 0;
  }

  parseVersion(version: string): number[] {
    const match = version.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[a-zA-Z0-9.-]+)?$/);
    if (!match) return [0, 0, 0];
    return [
      parseInt(match[1], 10) || 0,
      parseInt(match[2], 10) || 0,
      parseInt(match[3], 10) || 0,
    ];
  }

  isUpgradeInProgress(skillId: string): boolean {
    return this.upgradeQueue.has(skillId);
  }

  cancelUpgrade(skillId: string): boolean {
    return this.upgradeQueue.delete(skillId);
  }

  clearVersionCache(): void {
    this.versionCache.clear();
  }

  private async fetchMarketVersion(_skillId: string): Promise<string> {
    return '1.0.0';
  }

  private async fetchSkillContent(_skillId: string, _version: string): Promise<string | null> {
    return null;
  }
}

export const skillUpgradeManager = new SkillUpgradeManager();
