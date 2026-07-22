import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import type { SkillEntry, SkillSource, ParsedSkillFrontmatter } from './types.js';
import { parseFrontmatter, resolveSkillMetadata } from './loading/frontmatter.js';
import { postLoadCheck, type BatchCheckResult } from './skill-dependency-checker.js';
import { loadSkillI18n, translateSkill, detectLocale, type SkillI18nEntry } from './i18n/index.js';

export type SkillLoadSource = 'bundled' | 'workspace' | 'plugin';

export interface SkillLoadOptions {
  agentId?: string;
  maxSkills?: number;
  includeDisabled?: boolean;
  sources?: SkillLoadSource[];
  checkDependencies?: boolean;
  locale?: string;
}

export interface SkillLoaderConfig {
  bundledSkillsDir?: string;
  workspaceSkillsDir?: string;
  pluginSkillsDir?: string;
}

export interface SkillLoadResult {
  skills: SkillEntry[];
  errors: Array<{ path: string; error: string }>;
  loadedCount: number;
  skippedCount: number;
  dependencyCheck?: BatchCheckResult;
}

function toSkillSource(source: SkillLoadSource): SkillSource {
  if (source === 'bundled') return 'bundled';
  if (source === 'workspace') return 'workspace';
  return 'unknown';
}

function parseFrontmatterTags(frontmatter: ParsedSkillFrontmatter): string[] {
  const raw = frontmatter.tags || frontmatter.tag;
  if (!raw) return [];
  const cleaned = raw.replace(/[\[\]]/g, '').trim();
  return cleaned
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export class SkillLoader {
  private bundledSkillsDir: string;
  private workspaceSkillsDir: string;
  private pluginSkillsDir: string;
  private loadedSkills = new Map<string, SkillEntry>();
  private i18nCache = new Map<string, SkillI18nEntry[]>();

  constructor(config?: SkillLoaderConfig) {
    this.bundledSkillsDir = config?.bundledSkillsDir ?? path.resolve(__dirname, '../../skills/bundled');
    this.workspaceSkillsDir = config?.workspaceSkillsDir ?? path.resolve(process.cwd(), 'skills');
    this.pluginSkillsDir = config?.pluginSkillsDir ?? path.resolve(__dirname, '../../skills/plugins');
  }

  async loadAll(options?: SkillLoadOptions): Promise<SkillLoadResult> {
    const errors: Array<{ path: string; error: string }> = [];
    const skills: SkillEntry[] = [];
    let skippedCount = 0;

    const sources = options?.sources ?? ['bundled', 'workspace', 'plugin'];
    const locale = options?.locale ?? detectLocale();

    for (const source of sources) {
      const dir = this.getSourceDir(source);
      if (!fs.existsSync(dir)) {
        continue;
      }

      const dirSkills = await this.loadFromDir(dir, source, locale);
      for (const entry of dirSkills) {
        const key = `${entry.skill.source}:${entry.skill.name}`;

        if (this.loadedSkills.has(key)) {
          skippedCount++;
          continue;
        }

        if (!options?.includeDisabled && entry.skill.disableModelInvocation) {
          skippedCount++;
          continue;
        }

        if (options?.maxSkills && skills.length >= options.maxSkills) {
          skippedCount++;
          continue;
        }

        this.loadedSkills.set(key, entry);
        skills.push(entry);
      }
    }

    let dependencyCheck: BatchCheckResult | undefined;
    if (options?.checkDependencies !== false && skills.length > 0) {
      dependencyCheck = postLoadCheck(skills);
      if (dependencyCheck.failed > 0) {
        logger.warn(`[SkillLoader] ${dependencyCheck.failed} skills failed dependency check:\n${dependencyCheck.report}`);
      }
    }

    return {
      skills,
      errors,
      loadedCount: skills.length,
      skippedCount,
      dependencyCheck,
    };
  }

  private getSourceDir(source: SkillLoadSource): string {
    switch (source) {
      case 'bundled':
        return this.bundledSkillsDir;
      case 'workspace':
        return this.workspaceSkillsDir;
      case 'plugin':
        return this.pluginSkillsDir;
      default:
        return this.workspaceSkillsDir;
    }
  }

  private async loadFromDir(dir: string, source: SkillLoadSource, locale: string): Promise<SkillEntry[]> {
    const skills: SkillEntry[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillDir = path.join(dir, entry.name);

        try {
          const skill = await this.loadSkill(skillDir, source, locale);
          if (skill) {
            skills.push(skill);
          }
        } catch (err) {
          logger.warn(`[SkillLoader] Failed to load skill from ${skillDir}: ${err}`);
        }
      }
    } catch (err) {
      logger.warn(`[SkillLoader] Failed to read directory ${dir}: ${err}`);
    }

    return skills;
  }

  private async loadSkill(skillDir: string, source: SkillLoadSource, locale: string): Promise<SkillEntry | undefined> {
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
      logger.debug(`[SkillLoader] Skipping ${skillDir} (no SKILL.md)`);
      return undefined;
    }

    try {
      const content = await fs.promises.readFile(skillFile, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      const metadata = resolveSkillMetadata(frontmatter);

      const skillName = frontmatter.name || path.basename(skillDir);
      const description = frontmatter.description || content.slice(0, 200);
      const disableModelInvocation =
        (frontmatter['disable-model-invocation'] || '').toLowerCase() === 'true';

      let entry: SkillEntry = {
        skill: {
          name: skillName,
          description,
          filePath: skillFile,
          baseDir: skillDir,
          source: toSkillSource(source),
          disableModelInvocation,
        },
        frontmatter,
        metadata,
      };

      const i18nEntries = this.loadSkillI18nCached(skillDir);
      if (i18nEntries.length > 0) {
        entry = translateSkill(entry, locale);
        logger.debug(`[SkillLoader] Loaded skill ${skillName} with locale ${locale}`);
      }

      return entry;
    } catch (err) {
      logger.error(`[SkillLoader] Error loading skill ${skillDir}: ${err}`);
      return undefined;
    }
  }

  private loadSkillI18nCached(skillDir: string): SkillI18nEntry[] {
    const cacheKey = skillDir;

    if (this.i18nCache.has(cacheKey)) {
      return this.i18nCache.get(cacheKey)!;
    }

    const entries = loadSkillI18n(skillDir);
    this.i18nCache.set(cacheKey, entries);

    return entries;
  }

  getLoadedSkills(): SkillEntry[] {
    return Array.from(this.loadedSkills.values());
  }

  getSkillByName(name: string): SkillEntry | undefined {
    return Array.from(this.loadedSkills.values()).find((entry) => entry.skill.name === name);
  }

  getSkillById(id: string): SkillEntry | undefined {
    return this.getSkillByName(id);
  }

  getSkillsByTag(tag: string): SkillEntry[] {
    return Array.from(this.loadedSkills.values()).filter((entry) =>
      parseFrontmatterTags(entry.frontmatter).includes(tag),
    );
  }

  getSkillsBySource(source: SkillSource): SkillEntry[] {
    return Array.from(this.loadedSkills.values()).filter((entry) => entry.skill.source === source);
  }

  getSkillsByVersion(version: string): SkillEntry[] {
    return Array.from(this.loadedSkills.values()).filter(
      (entry) => entry.frontmatter.version === version,
    );
  }

  refresh(options?: SkillLoadOptions): Promise<SkillLoadResult> {
    this.loadedSkills.clear();
    this.i18nCache.clear();
    return this.loadAll(options);
  }

  clear(): void {
    this.loadedSkills.clear();
    this.i18nCache.clear();
  }

  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    bySource: Record<SkillSource, number>;
  } {
    const skills = this.getLoadedSkills();
    return {
      total: skills.length,
      enabled: skills.filter((entry) => !entry.skill.disableModelInvocation).length,
      disabled: skills.filter((entry) => entry.skill.disableModelInvocation).length,
      bySource: {
        bundled: skills.filter((entry) => entry.skill.source === 'bundled').length,
        workspace: skills.filter((entry) => entry.skill.source === 'workspace').length,
        unknown: skills.filter((entry) => entry.skill.source === 'unknown').length,
      },
    };
  }
}

export const skillLoader = new SkillLoader();
