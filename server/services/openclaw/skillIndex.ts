import fs from 'fs';
import path from 'path';
import { parseSkillMdWithMetadata, ParsedSkillMdWithMetadata } from './skillMetadata';

export interface SkillIndexEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  trigger: string;
  triggers: string[];
  version: string;
  status: string;
  featured: boolean;
  userInvocable: boolean;
  requires: {
    bins: string[];
    env: string[];
  };
  os: string[];
  directory: string;
  hasMd: boolean;
  lastModified: number;
}

export interface SkillFilterOptions {
  search?: string;
  category?: string;
  tags?: string[];
  os?: string;
  featured?: boolean;
  userInvocable?: boolean;
  hasMd?: boolean;
}

export interface SkillSearchResult {
  entries: SkillIndexEntry[];
  total: number;
  query: string;
}

export class SkillIndex {
  private entries: SkillIndexEntry[] = [];
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  build(): void {
    this.entries = [];
    if (!fs.existsSync(this.skillsDir)) return;

    const processDir = (dirPath: string, prefix = '') => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

          const fullPath = path.join(dirPath, entry.name);
          const skillId = prefix ? `${prefix}/${entry.name}` : entry.name;

          const skillMdPath = path.join(fullPath, 'SKILL.md');
          const skillMdLowerPath = path.join(fullPath, 'skill.md');

          let parsed: ParsedSkillMdWithMetadata | null = null;
          let hasMd = false;

          if (fs.existsSync(skillMdPath)) {
            hasMd = true;
            parsed = parseSkillMdWithMetadata(fs.readFileSync(skillMdPath, 'utf-8'));
          } else if (fs.existsSync(skillMdLowerPath)) {
            hasMd = true;
            parsed = parseSkillMdWithMetadata(fs.readFileSync(skillMdLowerPath, 'utf-8'));
          }

          const stat = fs.statSync(fullPath);

          const skillEntry: SkillIndexEntry = {
            id: skillId,
            name: parsed?.name || entry.name,
            description: parsed?.description || '',
            category: parsed?.category || 'tool',
            icon: parsed?.icon || 'Extension',
            tags: parsed?.tags || [],
            trigger: parsed?.trigger || '',
            triggers: parsed?.triggers || [],
            version: parsed?.version || '1.0.0',
            status: parsed?.status || 'available',
            featured: parsed?.featured || false,
            userInvocable: parsed?.userInvocable || false,
            requires: {
              bins: parsed?.metadata?.requires?.bins || parsed?.openclaw?.requires?.bins || [],
              env: parsed?.metadata?.requires?.env || parsed?.openclaw?.requires?.env || [],
            },
            os: parsed?.metadata?.os || parsed?.openclaw?.os || [],
            directory: fullPath,
            hasMd,
            lastModified: stat.mtime.getTime(),
          };

          this.entries.push(skillEntry);
        }
      } catch {
      }
    };

    processDir(this.skillsDir);

    const importedDir = path.join(this.skillsDir, '_imported');
    if (fs.existsSync(importedDir)) {
      const importerEntries = fs.readdirSync(importedDir, { withFileTypes: true });
      for (const importer of importerEntries) {
        if (!importer.isDirectory()) continue;
        if (importer.name.startsWith('.')) continue;
        processDir(path.join(importedDir, importer.name), importer.name);
      }
    }
  }

  getAll(): SkillIndexEntry[] {
    return this.entries;
  }

  getById(id: string): SkillIndexEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  filter(options: SkillFilterOptions): SkillIndexEntry[] {
    return this.entries.filter(entry => {
      if (options.search) {
        const q = options.search.toLowerCase();
        const match =
          entry.id.toLowerCase().includes(q) ||
          entry.name.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          entry.tags.some(t => t.toLowerCase().includes(q)) ||
          entry.trigger.toLowerCase().includes(q) ||
          entry.triggers.some(t => t.toLowerCase().includes(q));
        if (!match) return false;
      }

      if (options.category && entry.category !== options.category) return false;
      if (options.featured !== undefined && entry.featured !== options.featured) return false;
      if (options.userInvocable !== undefined && entry.userInvocable !== options.userInvocable) return false;
      if (options.hasMd !== undefined && entry.hasMd !== options.hasMd) return false;

      if (options.tags && options.tags.length > 0) {
        const hasAllTags = options.tags.every(t => entry.tags.includes(t));
        if (!hasAllTags) return false;
      }

      if (options.os && entry.os.length > 0 && !entry.os.includes(options.os)) return false;

      return true;
    });
  }

  search(query: string): SkillSearchResult {
    const results = this.filter({ search: query });
    return {
      entries: results,
      total: results.length,
      query,
    };
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const entry of this.entries) {
      categories.add(entry.category);
    }
    return Array.from(categories).sort();
  }

  getTags(): string[] {
    const tags = new Set<string>();
    for (const entry of this.entries) {
      for (const tag of entry.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  count(): number {
    return this.entries.length;
  }
}
