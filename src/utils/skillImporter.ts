import type { SkillEntry } from './skillRegistry';
import { skillResolver } from './skillResolver';
import { securityScanner, type SecurityScanResult } from './securityScanner';

export type ImportFormat = 'json' | 'zip' | 'tar';

export interface SkillExport {
  version: string;
  exportedAt: string;
  skills: Array<{
    entry: SkillEntry;
    content: string;
    scanResult?: SecurityScanResult;
  }>;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
  };
}

export interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ skillName: string; reason: string }>;
  warning: Array<{ skillName: string; reason: string }>;
}

export interface ExportResult {
  success: boolean;
  data: string;
  format: ImportFormat;
  skillCount: number;
}

export class SkillImporter {
  private readonly EXPORT_VERSION = '1.0.0';

  async exportSkills(skills: SkillEntry[], options?: {
    includeContent?: boolean;
    includeScanResults?: boolean;
    metadata?: SkillExport['metadata'];
  }): Promise<ExportResult> {
    const exportData: SkillExport = {
      version: this.EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      skills: [],
      metadata: options?.metadata,
    };

    for (const skill of skills) {
      const exportSkill: SkillExport['skills'][0] = {
        entry: skill,
        content: '',
      };

      if (options?.includeContent !== false) {
        exportSkill.content = await this.getSkillContent(skill);
      }

      if (options?.includeScanResults !== false && exportSkill.content) {
        exportSkill.scanResult = securityScanner.scanSkillMd(skill.id, exportSkill.content);
      }

      exportData.skills.push(exportSkill);
    }

    return {
      success: true,
      data: JSON.stringify(exportData, null, 2),
      format: 'json',
      skillCount: skills.length,
    };
  }

  async importSkills(jsonData: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      warning: [],
    };

    let exportData: SkillExport;
    try {
      exportData = JSON.parse(jsonData) as SkillExport;
    } catch {
      result.success = false;
      result.errors.push({ skillName: 'N/A', reason: 'Invalid JSON format' });
      return result;
    }

    if (exportData.version !== this.EXPORT_VERSION) {
      result.warning.push({ skillName: 'All', reason: `Export format version mismatch: expected ${this.EXPORT_VERSION}, got ${exportData.version}` });
    }

    for (const skillData of exportData.skills) {
      try {
        if (!skillData.entry || !skillData.entry.id) {
          result.errors.push({ skillName: 'Unknown', reason: 'Missing skill entry or ID' });
          continue;
        }

        const content = skillData.content || '';
        if (!content) {
          result.skipped++;
          result.warning.push({ skillName: skillData.entry.name, reason: 'No content to import' });
          continue;
        }

        const scanResult = skillData.scanResult || securityScanner.scanSkillMd(skillData.entry.id, content);
        if (!scanResult.passed) {
          result.errors.push({ skillName: skillData.entry.name, reason: 'Security scan failed' });
          continue;
        }

        const resolved = await skillResolver.resolveFromContent(
          skillData.entry.id,
          content,
          skillData.entry.filePath,
          { source: 'user' }
        );

        const isUpdate = skillResolver.hasCache(skillData.entry.id, skillData.entry.filePath);
        if (isUpdate) {
          result.updated++;
        } else {
          result.imported++;
        }

        if (scanResult.warn > 0) {
          result.warning.push({ skillName: skillData.entry.name, reason: `${scanResult.warn} warnings detected` });
        }
      } catch (error) {
        result.errors.push({
          skillName: skillData.entry?.name || 'Unknown',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  validateExportFormat(jsonData: string): { valid: boolean; errors: string[]; version?: string; skillCount?: number } {
    const errors: string[] = [];

    try {
      const data = JSON.parse(jsonData) as SkillExport;

      if (!data.version) {
        errors.push('Missing version field');
      }
      if (!data.exportedAt) {
        errors.push('Missing exportedAt field');
      }
      if (!data.skills || !Array.isArray(data.skills)) {
        errors.push('Missing or invalid skills array');
      } else {
        for (const skill of data.skills) {
          if (!skill.entry?.id) {
            errors.push('Skill entry missing ID');
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        version: data.version,
        skillCount: data.skills?.length,
      };
    } catch {
      return { valid: false, errors: ['Invalid JSON'] };
    }
  }

  getExportSize(skills: SkillEntry[]): Promise<number> {
    return Promise.resolve(skills.length * 1024);
  }

  private async getSkillContent(skill: SkillEntry): Promise<string> {
    return '';
  }
}

export const skillImporter = new SkillImporter();
