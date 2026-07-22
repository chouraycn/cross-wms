/**
 * 技能推荐引擎
 *
 * 综合以下信号生成推荐：
 * - 共现关联：同一会话中一起使用的技能
 * - 内容相似度：名称、描述、标签的文本相似度
 * - 热度趋势：近期使用频率
 * - 协同过滤：基于用户-技能矩阵的相似用户偏好
 */

import fs from 'fs';
import path from 'path';
import { FileStorage } from '../storage/FileStorage.js';
import { scanWorkbuddySkills } from '../routes/skills.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export interface SkillRecommendation {
  skillId: string;
  skillName: string;
  score: number;
  reason: string;
  reasonType: 'cooccurrence' | 'similarity' | 'trending' | 'collaborative' | 'category' | 'default';
}

export interface RecommendationResult {
  targetSkillId?: string;
  recommendations: SkillRecommendation[];
  generatedAt: string;
}

// ===================== 工具函数 =====================

/** 字符 bigram 集合 */
function bigramSet(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < 2) return [normalized];
  const bigrams: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.substring(i, i + 2));
  }
  return bigrams;
}

/** Jaccard 相似度 */
function jaccardSimilarity(setA: string[], setB: string[]): number {
  const a = new Set(setA);
  const b = new Set(setB);
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** bigram 相似度 */
function bigramSimilarity(strA: string, strB: string): number {
  if (!strA || !strB) return 0;
  return jaccardSimilarity(bigramSet(strA), bigramSet(strB));
}

/** 多分隔符分词 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[/,，;；、\s|｜]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

// ===================== 数据加载 =====================

interface SkillUsageEvent {
  skillId: string;
  timestamp: string;
  sessionId: string;
  userId?: string;
}

function loadUsageEvents(days: number = 30): SkillUsageEvent[] {
  const events: SkillUsageEvent[] = [];
  const sinceMs = Date.now() - days * 86400000;

  try {
    const sessionIds = FileStorage.listSessionFiles();
    for (const sid of sessionIds) {
      try {
        const lines = FileStorage.readSessionLines(sid);
        const first = lines[0] as any;
        const messages: any[] = Array.isArray(first?.messages) ? first.messages : [];
        for (let i = 1; i < lines.length; i++) {
          const l = lines[i] as any;
          if (l && l.message) messages.push(l.message);
        }

        for (const msg of messages) {
          if (!msg.skillId) continue;
          const ts = msg.timestamp;
          const tsMs = ts ? new Date(ts).getTime() : 0;
          if (tsMs < sinceMs) continue;
          events.push({
            skillId: msg.skillId,
            timestamp: ts,
            sessionId: sid,
            userId: msg.userId || msg.sessionId || sid,
          });
        }
      } catch {
        // ignore per-session errors
      }
    }
  } catch (e) {
    logger.error('[Recommender] loadUsageEvents failed:', e);
  }

  return events;
}

// ===================== 推荐算法 =====================

/** 1. 共现关联推荐：基于同一会话中的技能共现 */
function cooccurrenceRecommendations(
  targetSkillId: string,
  events: SkillUsageEvent[],
  skillNames: Map<string, string>,
  topN: number = 5
): SkillRecommendation[] {
  const sessionSkills = new Map<string, Set<string>>();
  for (const e of events) {
    let set = sessionSkills.get(e.sessionId);
    if (!set) {
      set = new Set();
      sessionSkills.set(e.sessionId, set);
    }
    set.add(e.skillId);
  }

  const cooccurScores = new Map<string, number>();
  for (const [, skills] of sessionSkills) {
    if (!skills.has(targetSkillId)) continue;
    for (const sid of skills) {
      if (sid === targetSkillId) continue;
      cooccurScores.set(sid, (cooccurScores.get(sid) ?? 0) + 1);
    }
  }

  const results: SkillRecommendation[] = [];
  for (const [skillId, count] of cooccurScores) {
    results.push({
      skillId,
      skillName: skillNames.get(skillId) || skillId,
      score: Math.min(100, count * 10),
      reason: `曾与目标技能在同一会话中使用 ${count} 次`,
      reasonType: 'cooccurrence',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 2. 内容相似度推荐：基于名称和描述 */
function similarityRecommendations(
  targetSkillId: string,
  skillNames: Map<string, string>,
  skillDescs: Map<string, string>,
  skillTags: Map<string, string[]>,
  topN: number = 5
): SkillRecommendation[] {
  const targetName = skillNames.get(targetSkillId) || '';
  const targetDesc = skillDescs.get(targetSkillId) || '';
  const targetTags = skillTags.get(targetSkillId) || [];

  const results: SkillRecommendation[] = [];
  for (const [skillId, name] of skillNames) {
    if (skillId === targetSkillId) continue;
    const desc = skillDescs.get(skillId) || '';
    const tags = skillTags.get(skillId) || [];

    const nameSim = bigramSimilarity(targetName, name);
    const descSim = bigramSimilarity(targetDesc, desc);
    const tagSim = jaccardSimilarity(targetTags, tags);

    const score = Math.round((nameSim * 0.4 + descSim * 0.4 + tagSim * 0.2) * 100);
    if (score < 15) continue;

    let reason = '内容相似度匹配';
    if (nameSim > 0.3) reason = '名称高度相似';
    else if (descSim > 0.3) reason = '描述内容相似';
    else if (tagSim > 0.3) reason = '标签重叠度高';

    results.push({
      skillId,
      skillName: name,
      score,
      reason,
      reasonType: 'similarity',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 3. 热门趋势推荐 */
function trendingRecommendations(
  events: SkillUsageEvent[],
  skillNames: Map<string, string>,
  excludeIds: Set<string>,
  topN: number = 5
): SkillRecommendation[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (excludeIds.has(e.skillId)) continue;
    counts.set(e.skillId, (counts.get(e.skillId) ?? 0) + 1);
  }

  const maxCount = Math.max(1, ...counts.values());
  const results: SkillRecommendation[] = [];
  for (const [skillId, count] of counts) {
    results.push({
      skillId,
      skillName: skillNames.get(skillId) || skillId,
      score: Math.round((count / maxCount) * 100),
      reason: `近期使用 ${count} 次，热度较高`,
      reasonType: 'trending',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 5. 类别推荐：基于技能分类的同类推荐 */
function categoryRecommendations(
  targetSkillId: string,
  skillNames: Map<string, string>,
  skillDescs: Map<string, string>,
  skillTags: Map<string, string[]>,
  topN: number = 5
): SkillRecommendation[] {
  const targetTags = skillTags.get(targetSkillId) || [];
  if (targetTags.length === 0) return [];

  const results: SkillRecommendation[] = [];
  for (const [skillId, name] of skillNames) {
    if (skillId === targetSkillId) continue;
    const tags = skillTags.get(skillId) || [];
    const desc = skillDescs.get(skillId) || '';

    const tagSim = jaccardSimilarity(targetTags, tags);
    if (tagSim < 0.2) continue;

    const score = Math.round(tagSim * 100);
    results.push({
      skillId,
      skillName: name,
      score,
      reason: `与目标技能同属 ${targetTags.filter(t => tags.includes(t)).slice(0, 2).join('、')} 类别`,
      reasonType: 'category',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 6. 冷启动推荐：基于技能质量评分的默认推荐 */
function coldStartRecommendations(
  skillNames: Map<string, string>,
  skillDescs: Map<string, string>,
  topN: number = 5
): SkillRecommendation[] {
  const results: SkillRecommendation[] = [];

  for (const [skillId, name] of skillNames) {
    const desc = skillDescs.get(skillId) || '';
    let score = 30;

    if (name.length >= 2) score += 10;
    if (desc.length >= 20) score += 20;
    if (desc.length >= 100) score += 15;
    if (desc.includes('使用') || desc.includes('用法') || desc.includes('示例')) score += 15;
    if (desc.includes('参数') || desc.includes('配置')) score += 10;

    results.push({
      skillId,
      skillName: name,
      score: Math.min(100, score),
      reason: '基于技能质量的默认推荐',
      reasonType: 'default',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 4. 协同过滤：基于用户-技能矩阵 */
function collaborativeRecommendations(
  targetSkillId: string | undefined,
  events: SkillUsageEvent[],
  skillNames: Map<string, string>,
  topN: number = 5
): SkillRecommendation[] {
  // 构建用户-技能矩阵
  const userSkills = new Map<string, Set<string>>();
  for (const e of events) {
    const userId = e.userId || e.sessionId;
    let set = userSkills.get(userId);
    if (!set) {
      set = new Set();
      userSkills.set(userId, set);
    }
    set.add(e.skillId);
  }

  // 找到与目标技能用户群体相似的其他技能
  const skillUsers = new Map<string, Set<string>>();
  for (const [userId, skills] of userSkills) {
    for (const skillId of skills) {
      let set = skillUsers.get(skillId);
      if (!set) {
        set = new Set();
        skillUsers.set(skillId, set);
      }
      set.add(userId);
    }
  }

  const targetUsers = targetSkillId ? skillUsers.get(targetSkillId) : null;
  const scores = new Map<string, number>();

  for (const [skillId, users] of skillUsers) {
    if (targetSkillId && skillId === targetSkillId) continue;
    if (targetUsers) {
      const intersection = new Set([...users].filter(u => targetUsers.has(u)));
      const union = new Set([...users, ...targetUsers]);
      const jaccard = union.size === 0 ? 0 : intersection.size / union.size;
      scores.set(skillId, Math.round(jaccard * 100));
    } else {
      scores.set(skillId, users.size); // 全局模式下按用户覆盖度排序
    }
  }

  const results: SkillRecommendation[] = [];
  for (const [skillId, score] of scores) {
    if (score < 5) continue;
    results.push({
      skillId,
      skillName: skillNames.get(skillId) || skillId,
      score,
      reason: targetSkillId
        ? '相似用户群体也经常使用'
        : `被 ${score} 个不同用户/会话使用过`,
      reasonType: 'collaborative',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

// ===================== 主入口 =====================

export function generateRecommendations(
  targetSkillId?: string,
  options?: { topN?: number; days?: number }
): RecommendationResult {
  const topN = options?.topN ?? 10;
  const days = options?.days ?? 30;

  const events = loadUsageEvents(days);
  const scanned = scanWorkbuddySkills();

  const skillNames = new Map<string, string>();
  const skillDescs = new Map<string, string>();
  const skillTags = new Map<string, string[]>();

  for (const s of scanned) {
    skillNames.set(s.dirName, s.name);
    skillDescs.set(s.dirName, s.description);
    // 从 frontmatter 提取 tags（如果有）
    try {
      const fm = s.body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fm) {
        const yaml = fm[1];
        const tagsMatch = yaml.match(/tags:\s*\n((?:\s+-\s+.+\n?)+)/);
        if (tagsMatch) {
          const tags = tagsMatch[1]
            .split('\n')
            .map(l => l.replace(/^\s+-\s+/, '').trim())
            .filter(Boolean);
          skillTags.set(s.dirName, tags);
        }
      }
    } catch {
      // ignore
    }
  }

  const recommendations: SkillRecommendation[] = [];
  const seen = new Set<string>();
  const hasUsageData = events.length > 0;

  if (targetSkillId) {
    // 基于目标技能的关联推荐
    const cooccur = cooccurrenceRecommendations(targetSkillId, events, skillNames, topN);
    const similar = similarityRecommendations(targetSkillId, skillNames, skillDescs, skillTags, topN);
    const category = categoryRecommendations(targetSkillId, skillNames, skillDescs, skillTags, topN);
    const collab = collaborativeRecommendations(targetSkillId, events, skillNames, topN);

    // 合并并去重，按来源加权
    for (const r of cooccur) {
      if (seen.has(r.skillId)) continue;
      seen.add(r.skillId);
      recommendations.push({ ...r, score: Math.round(r.score * 1.2) });
    }
    for (const r of similar) {
      if (seen.has(r.skillId)) continue;
      seen.add(r.skillId);
      recommendations.push({ ...r, score: Math.round(r.score * 1.0) });
    }
    for (const r of category) {
      if (seen.has(r.skillId)) continue;
      seen.add(r.skillId);
      recommendations.push({ ...r, score: Math.round(r.score * 0.8) });
    }
    for (const r of collab) {
      if (seen.has(r.skillId)) continue;
      seen.add(r.skillId);
      recommendations.push({ ...r, score: Math.round(r.score * 0.9) });
    }
  } else {
    // 全局推荐
    if (hasUsageData) {
      const excludeIds = new Set<string>();
      const trending = trendingRecommendations(events, skillNames, excludeIds, topN);
      const collab = collaborativeRecommendations(undefined, events, skillNames, topN);

      for (const r of trending) {
        if (seen.has(r.skillId)) continue;
        seen.add(r.skillId);
        recommendations.push(r);
      }
      for (const r of collab) {
        if (seen.has(r.skillId)) continue;
        seen.add(r.skillId);
        recommendations.push(r);
      }
    }
  }

  // 冷启动处理：如果没有足够推荐，补充基于质量的默认推荐
  if (recommendations.length < topN / 2) {
    const coldStart = coldStartRecommendations(skillNames, skillDescs, topN);
    for (const r of coldStart) {
      if (seen.has(r.skillId)) continue;
      seen.add(r.skillId);
      recommendations.push({ ...r, score: Math.round(r.score * 0.6) });
    }
  }

  // 最终排序并截断
  recommendations.sort((a, b) => b.score - a.score);

  return {
    targetSkillId,
    recommendations: recommendations.slice(0, topN),
    generatedAt: new Date().toISOString(),
  };
}
