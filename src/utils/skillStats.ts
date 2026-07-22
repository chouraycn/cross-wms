import type { SkillEntry } from './skillRegistry';
import { skillRegistry } from './skillRegistry';
import { skillCategoryManager } from './skillCategory';
import { getFavoriteSkills, getRecentSkills } from './skillFavorites';
import { skillChainManager } from './skillChain';
import { skillWorkshop } from './skillWorkshop';

export interface SkillStats {
  total: number;
  enabled: number;
  disabled: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  favorites: number;
  recent: number;
  chains: number;
  proposals: number;
  avgSize?: number;
  oldestSkill?: { name: string; installedAt: number };
  newestSkill?: { name: string; installedAt: number };
}

export interface SkillUsageStats {
  skillId: string;
  skillName: string;
  usageCount: number;
  lastUsed: number;
  avgDuration: number;
}

export interface SecurityStats {
  totalScanned: number;
  passed: number;
  failed: number;
  criticalIssues: number;
  warningIssues: number;
}

export interface SkillTrend {
  date: string;
  added: number;
  removed: number;
  enabled: number;
}

export class SkillStatsManager {
  getOverviewStats(): SkillStats {
    const allSkills = skillRegistry.list();
    const enabled = allSkills.filter(s => s.enabled).length;
    const disabled = allSkills.length - enabled;

    const bySource: Record<string, number> = {};
    for (const skill of allSkills) {
      bySource[skill.source] = (bySource[skill.source] || 0) + 1;
    }

    const byCategory: Record<string, number> = {};
    for (const skill of allSkills) {
      const category = skillCategoryManager.getSkillCategory(skill.id);
      if (category) {
        byCategory[category.name] = (byCategory[category.name] || 0) + 1;
      }
    }

    const favorites = getFavoriteSkills().length;
    const recent = getRecentSkills().length;
    const chains = skillChainManager.list().length;
    const proposals = skillWorkshop.getProposalCount().total;

    let oldest: { name: string; installedAt: number } | undefined;
    let newest: { name: string; installedAt: number } | undefined;

    for (const skill of allSkills) {
      if (skill.installedAt) {
        if (!oldest || skill.installedAt < oldest.installedAt) {
          oldest = { name: skill.name, installedAt: skill.installedAt };
        }
        if (!newest || skill.installedAt > newest.installedAt) {
          newest = { name: skill.name, installedAt: skill.installedAt };
        }
      }
    }

    return {
      total: allSkills.length,
      enabled,
      disabled,
      bySource,
      byCategory,
      favorites,
      recent,
      chains,
      proposals,
      oldestSkill: oldest,
      newestSkill: newest,
    };
  }

  getCategoryBreakdown(): Array<{
    categoryId: string;
    categoryName: string;
    icon: string;
    color: string;
    count: number;
    percentage: number;
  }> {
    const stats = skillCategoryManager.getCategoryStats();
    const total = stats.reduce((sum, s) => sum + s.skillCount, 0);

    return stats.map(s => {
      const category = skillCategoryManager.getCategory(s.categoryId);
      return {
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        icon: category?.icon || '📦',
        color: category?.color || '#6B7280',
        count: s.skillCount,
        percentage: total > 0 ? (s.skillCount / total) * 100 : 0,
      };
    });
  }

  getSourceBreakdown(): Array<{
    source: string;
    label: string;
    count: number;
    percentage: number;
  }> {
    const stats = this.getOverviewStats();
    const total = stats.total;

    const sourceLabels: Record<string, string> = {
      builtin: '内置',
      market: '市场',
      user: '用户',
      workspace: '工作区',
    };

    return Object.entries(stats.bySource).map(([source, count]) => ({
      source,
      label: sourceLabels[source] || source,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));
  }

  getTopSkills(limit: number = 10): Array<{
    skill: SkillEntry;
    categoryName: string;
    isFavorite: boolean;
    isRecent: boolean;
  }> {
    const favorites = new Set(getFavoriteSkills());
    const recent = new Set(getRecentSkills());

    return skillRegistry.list()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
      .map(skill => ({
        skill,
        categoryName: skillCategoryManager.getSkillCategory(skill.id)?.name || '其他',
        isFavorite: favorites.has(skill.id),
        isRecent: recent.has(skill.id),
      }));
  }

  getSecurityStats(): SecurityStats {
    return {
      totalScanned: 0,
      passed: 0,
      failed: 0,
      criticalIssues: 0,
      warningIssues: 0,
    };
  }

  getProposalsStats(): {
    total: number;
    pending: number;
    applied: number;
    rejected: number;
    quarantined: number;
  } {
    return skillWorkshop.getProposalCount();
  }

  getChainStats(): {
    total: number;
    avgSteps: number;
    avgSkills: number;
  } {
    const chains = skillChainManager.list();
    let totalSteps = 0;
    let totalSkills = 0;

    for (const chain of chains) {
      totalSteps += Object.keys(chain.steps).length;
      totalSkills += skillChainManager.getRequiredSkills(chain).length;
    }

    return {
      total: chains.length,
      avgSteps: chains.length > 0 ? totalSteps / chains.length : 0,
      avgSkills: chains.length > 0 ? totalSkills / chains.length : 0,
    };
  }

  /** 获取技能健康度概览（依赖完整性 + 启用率） */
  getHealthOverview(): {
    total: number;
    enabled: number;
    disabled: number;
    enabledRate: number;
    withDependencies: number;
    withConflicts: number;
    withDocumentation: number;
    healthScore: number;
  } {
    const allSkills = skillRegistry.list();
    const enabled = allSkills.filter(s => s.enabled).length;
    const disabled = allSkills.length - enabled;

    let withDeps = 0;
    let withConflicts = 0;
    let withDocs = 0;

    for (const skill of allSkills) {
      // metadata 中可能包含 dependencies 信息
      const meta = skill.metadata;
      if (meta && typeof meta === 'object') {
        const m = meta as Record<string, unknown>;
        if (m.dependencies) withDeps++;
        if (m.conflicts) withConflicts++;
      }
      // 检查是否有文档（description 字段长度 >= 20）
      if (skill.description && skill.description.length >= 20) withDocs++;
    }

    const enabledRate = allSkills.length > 0 ? enabled / allSkills.length : 0;
    const docRate = allSkills.length > 0 ? withDocs / allSkills.length : 0;

    // 健康度评分（0-100）：启用率(40) + 文档完整率(40) + 依赖声明(20)
    const healthScore = Math.round(enabledRate * 40 + docRate * 40 + (withDeps / Math.max(allSkills.length, 1)) * 20);

    return {
      total: allSkills.length,
      enabled,
      disabled,
      enabledRate,
      withDependencies: withDeps,
      withConflicts,
      withDocumentation: withDocs,
      healthScore,
    };
  }

  /** 获取技能源分类的统计摘要 */
  getSourceSummary(): Array<{ source: string; count: number; percentage: number; label: string }> {
    const stats = this.getOverviewStats();
    const total = stats.total || 1;

    const labels: Record<string, string> = {
      builtin: '内置',
      market: '市场',
      user: '用户',
      workspace: '工作区',
    };

    return Object.entries(stats.bySource).map(([source, count]) => ({
      source,
      label: labels[source] || source,
      count,
      percentage: (count / total) * 100,
    })).sort((a, b) => b.count - a.count);
  }

  /** 获取最近活跃的技能 */
  getRecentlyActiveSkills(limit: number = 5): Array<{ id: string; name: string; lastUsed: number | null }> {
    const recent = getRecentSkills();
    return recent.slice(0, limit).map((id) => {
      const skill = skillRegistry.list().find(s => s.id === id);
      // lastUsed 不是 SkillEntry 的标准字段，通过 metadata 或额外属性查找
      const lastUsed = skill ? ((skill as unknown as Record<string, unknown>)?.lastUsed as number | undefined) ?? null : null;
      return {
        id,
        name: skill?.name || id,
        lastUsed,
      };
    });
  }

  /** 获取推荐的技能（基于当前最常用 + 最近活跃） */
  getRecommendedSkills(limit: number = 5): Array<{ id: string; name: string; reason: string }> {
    const recent = new Set(getRecentSkills());
    const favorites = new Set(getFavoriteSkills());

    const recs: Array<{ id: string; name: string; reason: string; score: number }> = [];

    for (const skill of skillRegistry.list()) {
      if (!skill.enabled) continue;
      let score = 0;
      let reason = '可用';
      if (favorites.has(skill.id)) {
        score += 10;
        reason = '已收藏';
      }
      if (recent.has(skill.id)) {
        score += 5;
        reason = reason === '可用' ? '最近使用' : reason + ' · 最近使用';
      }
      if (score > 0) {
        recs.push({ id: skill.id, name: skill.name, reason, score });
      }
    }

    return recs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ id, name, reason }) => ({ id, name, reason }));
  }

  generateReport(): string {
    const stats = this.getOverviewStats();
    const categoryStats = skillCategoryManager.getCategoryStats();
    const proposalStats = this.getProposalsStats();
    const chainStats = this.getChainStats();

    const lines = [
      '=== Skill System Report ===',
      '',
      `Total Skills: ${stats.total}`,
      `  - Enabled: ${stats.enabled}`,
      `  - Disabled: ${stats.disabled}`,
      '',
      'Source Distribution:',
      ...Object.entries(stats.bySource).map(([source, count]) => 
        `  - ${source}: ${count} (${((count / stats.total) * 100).toFixed(1)}%)`
      ),
      '',
      'Category Distribution:',
      ...categoryStats.map(c => 
        `  - ${c.categoryName}: ${c.skillCount} skills, ${c.enabledCount} enabled`
      ),
      '',
      'Favorites: ${stats.favorites}',
      'Recent: ${stats.recent}',
      '',
      'Skill Chains:',
      `  - Total: ${chainStats.total}`,
      `  - Avg Steps: ${chainStats.avgSteps.toFixed(1)}`,
      `  - Avg Skills: ${chainStats.avgSkills.toFixed(1)}`,
      '',
      'Proposals:',
      `  - Total: ${proposalStats.total}`,
      `  - Pending: ${proposalStats.pending}`,
      `  - Applied: ${proposalStats.applied}`,
      `  - Rejected: ${proposalStats.rejected}`,
      `  - Quarantined: ${proposalStats.quarantined}`,
      '',
      'Generated at: ${new Date().toISOString()}',
    ];

    return lines.join('\n');
  }
}

export const skillStatsManager = new SkillStatsManager();
