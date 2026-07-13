import type { SkillEntry } from './skillRegistry';
import { skillRegistry } from './skillRegistry';

export interface SkillCategory {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  color?: string;
  skillCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryStats {
  categoryId: string;
  categoryName: string;
  skillCount: number;
  enabledCount: number;
  averageScore: number;
}

export class SkillCategoryManager {
  private categories: Map<string, SkillCategory> = new Map();
  private skillCategoryMap: Map<string, string> = new Map();

  private defaultCategories: SkillCategory[] = [
    { id: 'productivity', name: '效率工具', icon: '⚡', description: '提升工作效率的技能', color: '#F59E0B', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'development', name: '开发工具', icon: '💻', description: '软件开发相关技能', color: '#3B82F6', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'design', name: '设计创意', icon: '🎨', description: '设计和创意相关技能', color: '#EC4899', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'data', name: '数据分析', icon: '📊', description: '数据处理和分析技能', color: '#10B981', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'writing', name: '写作辅助', icon: '✍️', description: '写作和内容创作技能', color: '#8B5CF6', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'automation', name: '自动化', icon: '🤖', description: '自动化流程技能', color: '#06B6D4', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'security', name: '安全工具', icon: '🔒', description: '安全相关技能', color: '#EF4444', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'other', name: '其他', icon: '📦', description: '其他技能', color: '#6B7280', skillCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
  ];

  constructor() {
    for (const cat of this.defaultCategories) {
      this.categories.set(cat.id, cat);
    }
  }

  createCategory(name: string, options?: { icon?: string; description?: string; color?: string }): SkillCategory {
    const id = name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const category: SkillCategory = {
      id,
      name,
      icon: options?.icon,
      description: options?.description,
      color: options?.color || this.generateRandomColor(),
      skillCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.categories.set(id, category);
    return category;
  }

  updateCategory(categoryId: string, updates: Partial<Pick<SkillCategory, 'name' | 'icon' | 'description' | 'color'>>): SkillCategory | null {
    const category = this.categories.get(categoryId);
    if (!category) return null;

    const updated: SkillCategory = {
      ...category,
      ...updates,
      updatedAt: Date.now(),
    };

    this.categories.set(categoryId, updated);
    return updated;
  }

  deleteCategory(categoryId: string): boolean {
    if (!this.categories.has(categoryId)) return false;

    for (const [skillId, catId] of this.skillCategoryMap) {
      if (catId === categoryId) {
        this.skillCategoryMap.set(skillId, 'other');
      }
    }

    this.categories.delete(categoryId);
    return true;
  }

  getCategory(categoryId: string): SkillCategory | undefined {
    return this.categories.get(categoryId);
  }

  listCategories(): SkillCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => b.skillCount - a.skillCount);
  }

  assignSkillToCategory(skillId: string, categoryId: string): boolean {
    if (!skillRegistry.has(skillId)) return false;
    if (!this.categories.has(categoryId)) return false;

    const prevCategory = this.skillCategoryMap.get(skillId);
    if (prevCategory && this.categories.has(prevCategory)) {
      const prevCat = this.categories.get(prevCategory)!;
      this.categories.set(prevCategory, { ...prevCat, skillCount: prevCat.skillCount - 1 });
    }

    this.skillCategoryMap.set(skillId, categoryId);
    
    const category = this.categories.get(categoryId)!;
    this.categories.set(categoryId, { ...category, skillCount: category.skillCount + 1 });

    return true;
  }

  getSkillCategory(skillId: string): SkillCategory | undefined {
    const categoryId = this.skillCategoryMap.get(skillId) || 'other';
    return this.categories.get(categoryId);
  }

  getSkillsByCategory(categoryId: string): SkillEntry[] {
    if (!this.categories.has(categoryId)) return [];

    const skillIds = Array.from(this.skillCategoryMap.entries())
      .filter(([, catId]) => catId === categoryId)
      .map(([skillId]) => skillId);

    return skillIds.map(id => skillRegistry.getById(id)).filter(Boolean) as SkillEntry[];
  }

  getCategoryStats(): CategoryStats[] {
    const stats: CategoryStats[] = [];

    for (const [id, category] of this.categories) {
      const skills = this.getSkillsByCategory(id);
      const enabledCount = skills.filter(s => s.enabled).length;

      stats.push({
        categoryId: id,
        categoryName: category.name,
        skillCount: skills.length,
        enabledCount,
        averageScore: skills.length > 0 ? skills.filter(s => s.enabled).length / skills.length : 0,
      });
    }

    return stats.sort((a, b) => b.skillCount - a.skillCount);
  }

  autoCategorize(skill: SkillEntry): string {
    const name = skill.name.toLowerCase();
    const desc = skill.description.toLowerCase();

    const keywords: Record<string, string[]> = {
      productivity: ['效率', 'todo', 'task', 'calendar', 'schedule', 'time', 'clock', 'reminder', 'note', 'notebook'],
      development: ['code', 'git', 'github', 'terminal', 'shell', 'docker', 'kubernetes', 'api', 'server', 'dev', 'build', 'deploy', 'test'],
      design: ['design', 'image', 'photo', 'picture', 'graphic', 'icon', 'ui', 'ux', 'figma', 'sketch', 'canva'],
      data: ['data', 'analysis', 'chart', 'graph', 'excel', 'csv', 'sql', 'database', 'analytics', 'report'],
      writing: ['write', 'document', 'doc', 'article', 'blog', 'email', 'markdown', 'essay', 'letter', 'text'],
      automation: ['automate', 'script', 'bot', 'workflow', 'auto', 'trigger', 'action'],
      security: ['security', 'encrypt', 'decrypt', 'password', 'auth', 'token', 'key', 'secure'],
    };

    for (const [categoryId, keywordsList] of Object.entries(keywords)) {
      for (const keyword of keywordsList) {
        if (name.includes(keyword) || desc.includes(keyword)) {
          return categoryId;
        }
      }
    }

    return 'other';
  }

  batchAutoCategorize(skills: SkillEntry[]): void {
    for (const skill of skills) {
      const categoryId = this.autoCategorize(skill);
      this.assignSkillToCategory(skill.id, categoryId);
    }
  }

  private generateRandomColor(): string {
    const colors = ['#F59E0B', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#06B6D4', '#EF4444', '#6B7280'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

export const skillCategoryManager = new SkillCategoryManager();
