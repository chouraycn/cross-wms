import type { SkillEntry } from './skillRegistry';
import { skillRegistry } from './skillRegistry';

export type UninstallStatus = 'not_installed' | 'installed' | 'uninstalling' | 'uninstalled' | 'error';

export interface UninstallOptions {
  removeData?: boolean;
  removeCache?: boolean;
  force?: boolean;
}

export interface UninstallResult {
  success: boolean;
  skillId: string;
  skillName: string;
  message: string;
  error?: Error;
}

export interface UninstallBatchResult {
  successful: UninstallResult[];
  failed: UninstallResult[];
  skipped: Array<{ skillId: string; reason: string }>;
  total: number;
}

export class SkillUninstaller {
  private uninstalling: Set<string> = new Set();

  async uninstallSkill(skill: SkillEntry, options: UninstallOptions = {}): Promise<UninstallResult> {
    if (this.uninstalling.has(skill.id)) {
      return {
        success: false,
        skillId: skill.id,
        skillName: skill.name,
        message: 'Uninstall already in progress',
      };
    }

    this.uninstalling.add(skill.id);

    try {
      if (!skillRegistry.has(skill.id)) {
        this.uninstalling.delete(skill.id);
        return {
          success: false,
          skillId: skill.id,
          skillName: skill.name,
          message: 'Skill not found in registry',
        };
      }

      if (!options.force && skill.source === 'builtin') {
        this.uninstalling.delete(skill.id);
        return {
          success: false,
          skillId: skill.id,
          skillName: skill.name,
          message: 'Built-in skills cannot be uninstalled without force option',
        };
      }

      const result = await this.performUninstall(skill, options);

      if (result.success) {
        skillRegistry.unregister(skill.id);
      }

      this.uninstalling.delete(skill.id);
      return {
        success: result.success,
        skillId: skill.id,
        skillName: skill.name,
        message: result.message,
      };
    } catch (error) {
      this.uninstalling.delete(skill.id);
      return {
        success: false,
        skillId: skill.id,
        skillName: skill.name,
        message: `Uninstall failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : undefined,
      };
    }
  }

  async batchUninstall(skills: SkillEntry[], options: UninstallOptions = {}): Promise<UninstallBatchResult> {
    const results: UninstallBatchResult = {
      successful: [],
      failed: [],
      skipped: [],
      total: skills.length,
    };

    for (const skill of skills) {
      if (this.uninstalling.has(skill.id)) {
        results.skipped.push({ skillId: skill.id, reason: 'Already uninstalling' });
        continue;
      }

      if (!skillRegistry.has(skill.id)) {
        results.skipped.push({ skillId: skill.id, reason: 'Not in registry' });
        continue;
      }

      if (!options.force && skill.source === 'builtin') {
        results.skipped.push({ skillId: skill.id, reason: 'Built-in skill' });
        continue;
      }

      const result = await this.uninstallSkill(skill, options);
      if (result.success) {
        results.successful.push(result);
      } else {
        results.failed.push(result);
      }
    }

    return results;
  }

  canUninstall(skill: SkillEntry): { canUninstall: boolean; reason?: string } {
    if (!skillRegistry.has(skill.id)) {
      return { canUninstall: false, reason: 'Skill not registered' };
    }

    if (skill.source === 'builtin') {
      return { canUninstall: false, reason: 'Built-in skill' };
    }

    return { canUninstall: true };
  }

  isUninstalling(skillId: string): boolean {
    return this.uninstalling.has(skillId);
  }

  cancelUninstall(skillId: string): boolean {
    return this.uninstalling.delete(skillId);
  }

  getUninstallingSkills(): string[] {
    return Array.from(this.uninstalling);
  }

  private async performUninstall(skill: SkillEntry, options: UninstallOptions): Promise<{ success: boolean; message: string }> {
    let cleanedFiles = 0;
    let cleanedDirs = 0;

    if (options.removeCache !== false) {
      cleanedFiles += await this.cleanCache(skill.id);
    }

    if (options.removeData !== false) {
      cleanedFiles += await this.cleanUserData(skill.id);
    }

    if (skill.source === 'user' || skill.source === 'workspace') {
      cleanedDirs += await this.cleanSkillDirectory(skill.baseDir);
    }

    return {
      success: true,
      message: `Successfully uninstalled ${skill.name}. Cleaned ${cleanedFiles} files and ${cleanedDirs} directories.`,
    };
  }

  private async cleanCache(_skillId: string): Promise<number> {
    return 0;
  }

  private async cleanUserData(_skillId: string): Promise<number> {
    return 0;
  }

  private async cleanSkillDirectory(_baseDir: string): Promise<number> {
    return 0;
  }
}

export const skillUninstaller = new SkillUninstaller();
