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
  // 性能优化：目录扫描结果缓存（按 skillsDir 粒度）
  // 避免 GET /list、/search、/filter、/categories、/tags 等多次重复扫描 fs
  private static readonly cacheByDir = new Map<string, {
    entries: SkillIndexEntry[];
    snapshot: { mtime: number; size: number; count: number } | null;
  }>();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /** 读取 skillsDir 根目录的 mtime/size/子目录数量快照，用于判断缓存是否失效 */
  private readDirSnapshot(): { mtime: number; size: number; count: number } | null {
    try {
      if (!fs.existsSync(this.skillsDir)) return null;
      const stat = fs.statSync(this.skillsDir);
      const names = fs.readdirSync(this.skillsDir).filter(n => !n.startsWith('.'));
      return { mtime: stat.mtimeMs, size: stat.size, count: names.length };
    } catch {
      return null;
    }
  }

  build(): void {
    this.entries = [];
    if (!fs.existsSync(this.skillsDir)) return;

    // ====== 命中缓存且快照未变化 → 直接复用 ======
    const snapshot = this.readDirSnapshot();
    const cached = SkillIndex.cacheByDir.get(this.skillsDir);
    if (cached && snapshot && cached.snapshot
      && cached.snapshot.mtime === snapshot.mtime
      && cached.snapshot.size === snapshot.size
      && cached.snapshot.count === snapshot.count) {
      this.entries = cached.entries;
      return;
    }

    // 过滤无效技能：名字/ID 以 "skill" 开头（含带版本号的噪音：skill-v1.2.3 / skill-1.0.0 等）
    const INVALID_SKILL_RE = /^skill[-_]?/i;

    const processDir = (dirPath: string, prefix = '') => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;

          const fullPath = path.join(dirPath, entry.name);
          const skillId = prefix ? `${prefix}/${entry.name}` : entry.name;

          // 底层过滤：ID 或目录名以 skill 开头的条目全部跳过
          if (INVALID_SKILL_RE.test(skillId) || INVALID_SKILL_RE.test(entry.name)) continue;

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

    // ====== 写入缓存 + 快照 ======
    SkillIndex.cacheByDir.set(this.skillsDir, {
      entries: [...this.entries],
      snapshot: this.readDirSnapshot(),
    });
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
