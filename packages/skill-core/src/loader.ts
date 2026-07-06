import EventEmitter from 'eventemitter3';
import type { SkillDefinition, SkillHandler, SkillLifecycle, SkillContext, SkillResult } from './types';

export interface SkillLoaderEvents {
  skill_loaded: [skillId: string, path: string];
  skill_load_failed: [path: string, error: Error];
  directory_scanned: [path: string, count: number];
}

export interface SkillLoadOptions {
  validate?: boolean;
  enableOnLoad?: boolean;
  recursive?: boolean;
  includePattern?: RegExp;
  excludePattern?: RegExp;
}

export class SkillLoader extends EventEmitter<SkillLoaderEvents> {
  private loadedPaths: Set<string> = new Set();
  private skills: Map<string, {
    definition: SkillDefinition;
    handler: SkillHandler;
    lifecycle?: SkillLifecycle;
    sourcePath: string;
  }> = new Map();

  async loadFromDirectory(
    dirPath: string,
    options: SkillLoadOptions = {},
  ): Promise<SkillDefinition[]> {
    const loaded: SkillDefinition[] = [];
    const { recursive = true, enableOnLoad = false, validate = true } = options;

    const fs = await import('fs');
    const path = await import('path');

    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const files = fs.readdirSync(dirPath);
    let count = 0;

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && recursive) {
        const subSkills = await this.loadFromDirectory(fullPath, options);
        loaded.push(...subSkills);
      } else if (this.isSkillFile(file, options)) {
        try {
          const skill = await this.loadSkillFile(fullPath, validate);
          if (skill) {
            loaded.push(skill.definition);
            count++;
          }
        } catch (error) {
          this.emit('skill_load_failed', fullPath, error as Error);
        }
      }
    }

    this.emit('directory_scanned', dirPath, count);
    return loaded;
  }

  private isSkillFile(file: string, options: SkillLoadOptions): boolean {
    if (options.excludePattern && options.excludePattern.test(file)) {
      return false;
    }
    if (options.includePattern) {
      return options.includePattern.test(file);
    }
    return file === 'SKILL.md' || file.endsWith('.skill.ts') || file.endsWith('.skill.js');
  }

  private async loadSkillFile(
    filePath: string,
    validate: boolean,
  ): Promise<{ definition: SkillDefinition; handler: SkillHandler; lifecycle?: SkillLifecycle } | null> {
    const path = await import('path');
    const fs = await import('fs');

    if (this.loadedPaths.has(filePath)) {
      return null;
    }

    const fileName = path.basename(filePath);

    if (fileName === 'SKILL.md') {
      const content = fs.readFileSync(filePath, 'utf-8');
      const definition = this.parseSkillMd(content, filePath);
      if (!definition) return null;

      if (validate) {
        this.validateSkillDefinition(definition);
      }

      const handler = this.createDeclarativeHandler(definition);
      const skill = { definition, handler };
      this.skills.set(definition.id, { ...skill, sourcePath: filePath });
      this.loadedPaths.add(filePath);

      this.emit('skill_loaded', definition.id, filePath);
      return skill;
    }

    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      const skillModule = await import(filePath);
      const definition: SkillDefinition = skillModule.default || skillModule.definition;

      if (!definition || !definition.id) {
        return null;
      }

      if (validate) {
        this.validateSkillDefinition(definition);
      }

      const handler: SkillHandler = skillModule.handler || skillModule.default?.handler;
      const lifecycle: SkillLifecycle | undefined = skillModule.lifecycle;

      this.skills.set(definition.id, { definition, handler, lifecycle, sourcePath: filePath });
      this.loadedPaths.add(filePath);

      this.emit('skill_loaded', definition.id, filePath);
      return { definition, handler, lifecycle };
    }

    return null;
  }

  private parseSkillMd(content: string, filePath: string): SkillDefinition | null {
    const lines = content.split('\n');
    const frontmatter: Record<string, unknown> = {};
    let inFrontmatter = false;
    let frontmatterEnd = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '---' && i === 0) {
        inFrontmatter = true;
        continue;
      }
      if (line === '---' && inFrontmatter) {
        frontmatterEnd = i;
        break;
      }
      if (inFrontmatter) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          frontmatter[key] = value;
        }
      }
    }

    const id = frontmatter.id || frontmatter.name;
    if (!id) return null;

    const instructionContent = lines
      .slice(frontmatterEnd + 1)
      .join('\n')
      .trim();

    return {
      id: String(id),
      name: String(frontmatter.name || id),
      version: String(frontmatter.version || '1.0.0'),
      description: String(frontmatter.description || instructionContent.slice(0, 200)),
      type: 'declarative',
      category: frontmatter.category as string | undefined,
      tags: frontmatter.tags ? String(frontmatter.tags).split(',').map((t) => t.trim()) : undefined,
      author: frontmatter.author as string | undefined,
      triggers: frontmatter.triggers
        ? [{ type: 'keyword', keywords: String(frontmatter.triggers).split(',').map((t) => t.trim()) }]
        : [{ type: 'manual' }],
    };
  }

  private createDeclarativeHandler(definition: SkillDefinition): SkillHandler {
    return async (params: Record<string, unknown>, context: SkillContext): Promise<SkillResult> => {
      return {
        success: true,
        data: {
          skillId: definition.id,
          params,
          message: `Declarative skill ${definition.name} executed`,
        },
      };
    };
  }

  private validateSkillDefinition(definition: SkillDefinition): void {
    if (!definition.id) {
      throw new Error('Skill definition missing id');
    }
    if (!definition.name) {
      throw new Error('Skill definition missing name');
    }
    if (!definition.version) {
      throw new Error('Skill definition missing version');
    }
    if (!definition.description) {
      throw new Error('Skill definition missing description');
    }
    if (!definition.triggers || definition.triggers.length === 0) {
      throw new Error('Skill definition missing triggers');
    }
  }

  getLoadedSkill(skillId: string): typeof this.skills extends Map<string, infer V> ? V | undefined : never {
    return this.skills.get(skillId);
  }

  listLoadedSkills(): SkillDefinition[] {
    return Array.from(this.skills.values()).map((s) => s.definition);
  }

  isLoaded(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  unloadSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    this.loadedPaths.delete(skill.sourcePath);
    return this.skills.delete(skillId);
  }

  clear(): void {
    this.skills.clear();
    this.loadedPaths.clear();
  }

  size(): number {
    return this.skills.size;
  }
}

export const skillLoader = new SkillLoader();
