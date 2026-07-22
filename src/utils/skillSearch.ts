import type { SkillEntry } from './skillRegistry';
import { skillRegistry } from './skillRegistry';

export interface SearchResult {
  skill: SkillEntry;
  score: number;
  matches: Array<{
    field: 'name' | 'description' | 'tag' | 'trigger' | 'content';
    text: string;
    highlight: string;
  }>;
}

export interface SearchOptions {
  sources?: SkillEntry['source'][];
  enabledOnly?: boolean;
  limit?: number;
  minScore?: number;
  fuzzy?: boolean;
  /** 按健康度筛选: healthy(>=80) | warning(60-79) | critical(<60) */
  healthFilter?: 'healthy' | 'warning' | 'critical';
  /** 只返回有依赖声明的技能 */
  hasDependencies?: boolean;
  /** 排序方式 */
  sortBy?: 'score' | 'name' | 'recent' | 'health';
}

export class SkillSearch {
  private index: Map<string, SkillEntry[]> = new Map();

  buildIndex(skills: SkillEntry[]): void {
    this.index.clear();

    for (const skill of skills) {
      const tokens = this.tokenize(skill);
      for (const token of tokens) {
        const existing = this.index.get(token) || [];
        existing.push(skill);
        this.index.set(token, existing);
      }
    }
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const results: Map<string, SearchResult> = new Map();
    const queryTokens = this.tokenizeQuery(query);
    const lowerQuery = query.toLowerCase();

    // 如果没有查询词，使用所有技能作为基础（只应用过滤）
    const baseSkills = queryTokens.length === 0
      ? skillRegistry.list()
      : new Set<SkillEntry>();

    if (queryTokens.length === 0) {
      for (const skill of baseSkills as Set<SkillEntry>) {
        if (options.sources && !options.sources.includes(skill.source)) continue;
        if (options.enabledOnly && !skill.enabled) continue;
        results.set(skill.id, { skill, score: 0, matches: [] });
      }
    } else {
      for (const token of queryTokens) {
        let matchingSkills = this.index.get(token) || [];

        // fuzzy fallback: if no exact token match, search by substring
        if (matchingSkills.length === 0 && options.fuzzy) {
          matchingSkills = skillRegistry.list().filter(skill => {
            const name = skill.name.toLowerCase();
            const desc = skill.description.toLowerCase();
            return name.includes(token) || desc.includes(token);
          });
        }

        for (const skill of matchingSkills) {
          if (options.sources && !options.sources.includes(skill.source)) continue;
          if (options.enabledOnly && !skill.enabled) continue;

          let existing = results.get(skill.id);
          if (!existing) {
            existing = {
              skill,
              score: 0,
              matches: [],
            };
            results.set(skill.id, existing);
          }

          const match = this.findMatch(skill, lowerQuery, token);
          if (match && !existing.matches.some(m => m.field === match.field)) {
            existing.matches.push(match);
          }

          existing.score += this.calculateScore(skill, lowerQuery, token);
        }
      }

      let finalResults = Array.from(results.values());
      
      if (!options.fuzzy && !query.includes('*')) {
        finalResults = finalResults.filter(r => 
          r.skill.name.toLowerCase().includes(lowerQuery) ||
          r.skill.description.toLowerCase().includes(lowerQuery)
        );
      }

      // 将结果重新放回 results map
      results.clear();
      for (const r of finalResults) {
        results.set(r.skill.id, r);
      }
    }

    let finalResults = Array.from(results.values());

    // 应用高级过滤
    if (options.hasDependencies) {
      finalResults = finalResults.filter(r => {
        const meta = r.skill.metadata as Record<string, unknown> | undefined;
        return !!meta?.dependencies || !!meta?.conflicts;
      });
    }

    if (options.healthFilter) {
      finalResults = finalResults.filter(r => {
        const meta = r.skill.metadata as Record<string, unknown> | undefined;
        // 简单启发式：基于 description 长度和 metadata 完整性计算
        const hasDesc = r.skill.description.length >= 20;
        const hasMeta = !!meta?.name && !!meta?.description;
        const hasDeps = !!meta?.dependencies;
        const score = (hasDesc ? 40 : 0) + (hasMeta ? 30 : 0) + (hasDeps ? 30 : 0);
        if (options.healthFilter === 'healthy') return score >= 80;
        if (options.healthFilter === 'warning') return score >= 60 && score < 80;
        return score < 60;
      });
    }

    // 排序
    const sortBy = options.sortBy ?? 'score';
    if (sortBy === 'name') {
      finalResults.sort((a, b) => a.skill.name.localeCompare(b.skill.name, 'zh-CN'));
    } else if (sortBy === 'recent') {
      finalResults.sort((a, b) => {
        const aTime = (a.skill as unknown as Record<string, number>)?.lastUsed ?? 0;
        const bTime = (b.skill as unknown as Record<string, number>)?.lastUsed ?? 0;
        return bTime - aTime;
      });
    } else if (sortBy === 'health') {
      finalResults.sort((a, b) => {
        const scoreA = (a.skill.metadata ? 50 : 0) + (a.skill.description.length >= 20 ? 50 : 0);
        const scoreB = (b.skill.metadata ? 50 : 0) + (b.skill.description.length >= 20 ? 50 : 0);
        return scoreB - scoreA;
      });
    } else {
      finalResults.sort((a, b) => b.score - a.score);
    }

    const minScore = options.minScore ?? 10;
    // 空查询时不按 score 过滤（score 都为 0）
    if (queryTokens.length > 0) {
      finalResults = finalResults.filter(r => r.score >= minScore);
    }

    const limit = options.limit ?? 20;
    return finalResults.slice(0, limit);
  }

  autocomplete(query: string, options?: { limit?: number; sources?: SkillEntry['source'][] }): Array<{
    id: string;
    name: string;
    description: string;
    type: 'skill' | 'tag';
  }> {
    const results: Array<{
      id: string;
      name: string;
      description: string;
      type: 'skill' | 'tag';
    }> = [];

    const lowerQuery = query.toLowerCase();
    const limit = options?.limit ?? 10;

    const skills = skillRegistry.list({
      source: options?.sources?.[0],
    });

    for (const skill of skills) {
      if (skill.name.toLowerCase().startsWith(lowerQuery)) {
        results.push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          type: 'skill',
        });
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  findByTag(tag: string): SkillEntry[] {
    return skillRegistry.list().filter(skill => {
      const tags = (skill.metadata?.requires?.bins || []).concat(skill.metadata?.requires?.env || []);
      return tags.some(t => t.toLowerCase() === tag.toLowerCase());
    });
  }

  suggestTags(query: string, limit: number = 5): string[] {
    const tags = new Set<string>();
    const lowerQuery = query.toLowerCase();

    for (const skill of skillRegistry.list()) {
      const skillTags = (skill.metadata?.requires?.bins || []).concat(skill.metadata?.requires?.env || []);
      for (const tag of skillTags) {
        if (tag.toLowerCase().includes(lowerQuery)) {
          tags.add(tag);
        }
      }
    }

    return Array.from(tags).slice(0, limit);
  }

  private tokenize(skill: SkillEntry): string[] {
    const tokens = new Set<string>();

    const nameTokens = skill.name.toLowerCase().split(/[\s_/-]+/).filter(Boolean);
    nameTokens.forEach(t => tokens.add(t));

    const descTokens = skill.description.toLowerCase().split(/[\s_/.,-]+/).filter(Boolean);
    descTokens.forEach(t => tokens.add(t));

    if (skill.metadata?.requires?.bins) {
      skill.metadata.requires.bins.forEach(b => tokens.add(b.toLowerCase()));
    }
    if (skill.metadata?.requires?.env) {
      skill.metadata.requires.env.forEach(e => tokens.add(e.toLowerCase()));
    }

    return Array.from(tokens);
  }

  private tokenizeQuery(query: string): string[] {
    return query.toLowerCase().split(/[\s_/-]+/).filter(Boolean);
  }

  private findMatch(skill: SkillEntry, lowerQuery: string, token: string): SearchResult['matches'][0] | null {
    if (skill.name.toLowerCase().includes(lowerQuery)) {
      return {
        field: 'name',
        text: skill.name,
        highlight: this.highlightMatch(skill.name, lowerQuery),
      };
    }

    if (skill.description.toLowerCase().includes(lowerQuery)) {
      return {
        field: 'description',
        text: skill.description.substring(0, 100),
        highlight: this.highlightMatch(skill.description, lowerQuery),
      };
    }

    if (skill.metadata?.requires?.bins?.some(b => b.toLowerCase().includes(token))) {
      const bin = skill.metadata.requires.bins.find(b => b.toLowerCase().includes(token));
      return {
        field: 'tag',
        text: bin || '',
        highlight: this.highlightMatch(bin || '', token),
      };
    }

    return null;
  }

  private calculateScore(skill: SkillEntry, lowerQuery: string, token: string): number {
    let score = 0;

    if (skill.name.toLowerCase() === lowerQuery) score += 100;
    else if (skill.name.toLowerCase().startsWith(lowerQuery)) score += 80;
    else if (skill.name.toLowerCase().includes(lowerQuery)) score += 50;

    if (skill.name.toLowerCase().includes(token)) score += 20;
    if (skill.description.toLowerCase().includes(token)) score += 10;

    if (skill.metadata?.requires?.bins?.includes(token)) score += 15;
    if (skill.metadata?.requires?.env?.includes(token)) score += 10;

    return score;
  }

  private highlightMatch(text: string, query: string): string {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
}

export const skillSearch = new SkillSearch();
