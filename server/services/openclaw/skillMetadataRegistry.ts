/**
 * 技能元数据注册表（合并自 src/utils/skillRegistry.ts）
 *
 * 设计目标：
 *  1. 作为前端技能元数据索引的权威实现（register / getById / getByName / list / search）
 *  2. 与 server/engine/skillRegistry.ts（运行时执行注册表）职责区分：
 *     - 本文件：轻量级元数据索引，供前端 UI 查询/过滤/搜索技能
 *     - engine/skillRegistry.ts：完整生命周期管理（扫描/加载/执行/热重载/关闭）
 *  3. 通过 `src/utils/skillRegistry.ts` 的 re-export 保持前端 import 路径稳定
 *
 * 历史背景：原 src/utils/skillRegistry.ts 与 server/engine/skillRegistry.ts 同名但职责不同，
 * 容易造成「双实现」误解。此处将元数据索引实现迁移至 openclaw 文件夹作为单一权威源，
 * 消除命名混淆。
 */

import type { OpenClawSkillMetadata, SkillInvocationPolicy, SkillExposure } from '../../../src/utils/skillParser';

// ===================== 类型定义 =====================

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: 'builtin' | 'market' | 'user' | 'workspace';
  promptVersion?: string;
  contentHash?: string;
  metadata?: OpenClawSkillMetadata;
  invocation?: SkillInvocationPolicy;
  exposure?: SkillExposure;
  installedAt?: number;
  updatedAt?: number;
  enabled: boolean;
}

export interface SkillRegistryOptions {
  normalizeName?: (name: string) => string;
}

// ===================== SkillRegistry 类 =====================

export class SkillRegistry {
  private skills: Map<string, SkillEntry> = new Map();
  private nameIndex: Map<string, string> = new Map();
  private normalizeName: (name: string) => string;

  constructor(options?: SkillRegistryOptions) {
    this.normalizeName = options?.normalizeName || this.defaultNormalizeName;
  }

  private defaultNormalizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[\s_/]+/g, '-')
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  register(skill: SkillEntry): void {
    const normalizedName = this.normalizeName(skill.name);

    if (this.skills.has(skill.id)) {
      const existing = this.skills.get(skill.id)!;
      if (existing.name !== skill.name) {
        this.nameIndex.delete(this.normalizeName(existing.name));
      }
    }

    this.skills.set(skill.id, skill);
    this.nameIndex.set(normalizedName, skill.id);
  }

  unregister(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    const normalizedName = this.normalizeName(skill.name);
    this.nameIndex.delete(normalizedName);
    return this.skills.delete(skillId);
  }

  getById(skillId: string): SkillEntry | undefined {
    return this.skills.get(skillId);
  }

  getByName(name: string): SkillEntry | undefined {
    const normalized = this.normalizeName(name);
    const skillId = this.nameIndex.get(normalized);
    return skillId ? this.skills.get(skillId) : undefined;
  }

  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  hasName(name: string): boolean {
    return this.nameIndex.has(this.normalizeName(name));
  }

  list(filter?: {
    source?: SkillEntry['source'];
    enabled?: boolean;
    runtimeVisible?: boolean;
    promptVisible?: boolean;
    userInvocable?: boolean;
  }): SkillEntry[] {
    let entries = Array.from(this.skills.values());

    if (filter?.source !== undefined) {
      entries = entries.filter(s => s.source === filter.source);
    }
    if (filter?.enabled !== undefined) {
      entries = entries.filter(s => s.enabled === filter.enabled);
    }
    if (filter?.runtimeVisible !== undefined) {
      entries = entries.filter(s =>
        filter.runtimeVisible
          ? (s.exposure?.includeInRuntimeRegistry ?? true)
          : !(s.exposure?.includeInRuntimeRegistry ?? true)
      );
    }
    if (filter?.promptVisible !== undefined) {
      entries = entries.filter(s => {
        const visible = s.exposure?.includeInAvailableSkillsPrompt
          ?? s.invocation?.disableModelInvocation !== true;
        return filter.promptVisible ? visible : !visible;
      });
    }
    if (filter?.userInvocable !== undefined) {
      entries = entries.filter(s => {
        const invocable = s.exposure?.userInvocable
          ?? s.invocation?.userInvocable
          ?? true;
        return filter.userInvocable ? invocable : !invocable;
      });
    }

    return entries;
  }

  count(): number {
    return this.skills.size;
  }

  clear(): void {
    this.skills.clear();
    this.nameIndex.clear();
  }

  isRuntimeVisible(skill: SkillEntry): boolean {
    return skill.exposure?.includeInRuntimeRegistry ?? true;
  }

  isPromptVisible(skill: SkillEntry): boolean {
    if (skill.exposure) {
      return skill.exposure.includeInAvailableSkillsPrompt ?? true;
    }
    if (skill.invocation) {
      return !skill.invocation.disableModelInvocation;
    }
    return true;
  }

  isUserInvocable(skill: SkillEntry): boolean {
    if (skill.exposure) {
      return skill.exposure.userInvocable ?? true;
    }
    if (skill.invocation) {
      return skill.invocation.userInvocable ?? true;
    }
    return true;
  }

  getRuntimeVisibleSkills(): SkillEntry[] {
    return this.list({ runtimeVisible: true });
  }

  getPromptVisibleSkills(): SkillEntry[] {
    return this.list({ promptVisible: true });
  }

  getUserInvocableSkills(): SkillEntry[] {
    return this.list({ userInvocable: true });
  }

  bulkRegister(skills: SkillEntry[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  findBySource(source: SkillEntry['source']): SkillEntry[] {
    return this.list({ source });
  }

  search(query: string): SkillEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.list().filter(skill =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery)
    );
  }
}

// ===================== Module-level Singleton =====================

/** 技能元数据注册表单例（前端 UI 查询用） */
export const skillRegistry = new SkillRegistry();
