/**
 * Matching Service — 语义匹配核心服务
 *
 * 支持四种匹配模式：
 * - semantic: 语义向量匹配（cosine similarity）
 * - keyword: 关键词模糊匹配（移植自 TopBarChatInput.matchSkillFromInput）
 * - hybrid: 语义 + 关键词加权融合
 * - context: 上下文增强匹配（结合对话历史）
 *
 * 核心职责：
 * - 统一匹配入口 match()
 * - 关键词匹配算法（fuzzyMatch + 加权记分）
 * - Hybrid 模式结果融合
 * - 匹配反馈记录与学习
 */

import { initDb } from '../db.js';
import { BUILTIN_SKILLS } from '@src/types/skill-core';
import type {
  MatchMode,
  MatchResult,
  MatchQuery,
  MatchEngineRuntimeConfig,
} from '@src/types/semantic';
import { DEFAULT_MATCH_ENGINE_CONFIG } from '@src/types/semantic';

// MatchFeedback type inlined after marketplace.ts removal
interface MatchFeedback {
  id: number;
  query: string;
  skillId: string;
  matchMode: string;
  matchScore: number;
  isRelevant: boolean;
  userFeedback: number | null;
  createdAt: string;
}

import { mergeHybridResults } from '@src/services/skill/embeddingUtils';
import {
  generateEmbedding,
  semanticSearch,
  invalidateCache,
  batchGenerateEmbeddings,
} from './embeddingService.js';
import {
  createMatchFeedback,
  getMatchEngineConfigValue,
  setMatchEngineConfigValue,
  getAverageFeedbackScore,
  batchUpdateMatchEngineConfig,
  resetMatchEngineConfig,
  getMatchFeedback,
} from '../dao/matchingDao.js';

// ===================== 配置读取 =====================

/**
 * 从数据库读取匹配引擎运行时配置
 */
export function getRuntimeConfig(): MatchEngineRuntimeConfig {
  try {
    return {
      semanticWeight: parseFloat(getMatchEngineConfigValue('semantic_weight') ?? '0.6'),
      keywordWeight: parseFloat(getMatchEngineConfigValue('keyword_weight') ?? '0.4'),
      defaultThreshold: parseFloat(getMatchEngineConfigValue('default_threshold') ?? '0.3'),
      defaultTopK: parseInt(getMatchEngineConfigValue('default_top_k') ?? '10', 10),
      cacheTtlMs: parseInt(getMatchEngineConfigValue('cache_ttl_ms') ?? '300000', 10),
      enableFeedbackLearning: getMatchEngineConfigValue('enable_feedback_learning') === '1',
      contextWindowSize: parseInt(getMatchEngineConfigValue('context_window_size') ?? '5', 10),
    };
  } catch {
    return DEFAULT_MATCH_ENGINE_CONFIG;
  }
}

/**
 * 更新匹配引擎运行时配置
 */
export function updateRuntimeConfig(
  updates: Partial<MatchEngineRuntimeConfig>
): MatchEngineRuntimeConfig {
  const configs: Array<{ key: string; value: string }> = [];

  if (updates.semanticWeight !== undefined) {
    configs.push({ key: 'semantic_weight', value: String(updates.semanticWeight) });
  }
  if (updates.keywordWeight !== undefined) {
    configs.push({ key: 'keyword_weight', value: String(updates.keywordWeight) });
  }
  if (updates.defaultThreshold !== undefined) {
    configs.push({ key: 'default_threshold', value: String(updates.defaultThreshold) });
  }
  if (updates.defaultTopK !== undefined) {
    configs.push({ key: 'default_top_k', value: String(updates.defaultTopK) });
  }
  if (updates.cacheTtlMs !== undefined) {
    configs.push({ key: 'cache_ttl_ms', value: String(updates.cacheTtlMs) });
  }
  if (updates.enableFeedbackLearning !== undefined) {
    configs.push({ key: 'enable_feedback_learning', value: updates.enableFeedbackLearning ? '1' : '0' });
  }
  if (updates.contextWindowSize !== undefined) {
    configs.push({ key: 'context_window_size', value: String(updates.contextWindowSize) });
  }

  if (configs.length > 0) {
    batchUpdateMatchEngineConfig(configs);
  }

  return getRuntimeConfig();
}

/**
 * 重置匹配引擎配置为默认值
 */
export function resetConfig(): MatchEngineRuntimeConfig {
  resetMatchEngineConfig();
  return getRuntimeConfig();
}

// ===================== 技能收集 =====================

/**
 * 收集所有可用技能（内置 + 用户自建）
 * 返回统一格式数组
 */
function collectAllSkills(): Array<{
  id: string;
  name: string;
  desc: string;
  trigger?: string;
  tags?: string[];
  detail?: string;
  category: string;
  status: string;
}> {
  const skills: Array<{
    id: string;
    name: string;
    desc: string;
    trigger?: string;
    tags?: string[];
    detail?: string;
    category: string;
    status: string;
  }> = [];

  // 内置技能
  for (const s of BUILTIN_SKILLS) {
    skills.push({
      id: s.id,
      name: s.name,
      desc: s.desc,
      trigger: s.trigger,
      tags: s.tags,
      detail: s.detail,
      category: s.category,
      status: s.status,
    });
  }

  // 用户自建技能
  try {
    const db = initDb();
    const rows = db.prepare('SELECT * FROM user_skills ORDER BY installedAt DESC').all() as Array<{
      id: string;
      name: string;
      desc: string;
      trigger: string | null;
      tags: string | null;
      detail: string | null;
      category: string;
      status: string;
    }>;
    for (const row of rows) {
      let tags: string[] = [];
      try {
        if (row.tags) tags = JSON.parse(row.tags);
      } catch { /* ignore */ }

      skills.push({
        id: row.id,
        name: row.name,
        desc: row.desc ?? '',
        trigger: row.trigger ?? undefined,
        tags: tags.length > 0 ? tags : undefined,
        detail: row.detail ?? undefined,
        category: row.category,
        status: row.status,
      });
    }
  } catch {
    // 数据库查询失败时只返回内置技能
  }

  return skills;
}

// ===================== 关键词匹配算法 =====================

/**
 * 简易模糊匹配：字符依次出现即算部分匹配（0~1）
 * 移植自 TopBarChatInput.fuzzyMatch
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 1;
  if (t.startsWith(q)) return 0.9;
  const qWords = q.split(/\s+/);
  const tWords = t.split(/\s+/);
  let max = 0;
  for (const qw of qWords) {
    for (const tw of tWords) {
      if (tw.includes(qw)) {
        max = Math.max(max, qw.length / (tw.length || 1));
      }
    }
  }
  if (max > 0) return Math.max(max, 0.5);
  // 子序列匹配
  let i = 0;
  for (const c of q) {
    const idx = t.indexOf(c, i);
    if (idx === -1) return 0;
    i = idx + 1;
  }
  return 0.4;
}

/**
 * 关键词匹配算法
 * 移植自 TopBarChatInput.matchSkillFromInput，加权记分
 *
 * 记分规则：
 * - trigger: sim≥0.8 → +2/+3, 首词匹配再 +1
 * - tags: sim≥0.7 → +1/+2
 * - name: sim≥0.6 → +2/+3/+4
 * - desc: sim≥0.8 → +1
 * - 阈值 ≥3 才返回结果
 */
function keywordMatch(
  input: string,
  skills: Array<{
    id: string;
    name: string;
    desc: string;
    trigger?: string;
    tags?: string[];
    detail?: string;
    category: string;
  }>,
  topK: number = 10,
  threshold: number = 3
): Array<{ skillId: string; score: number; reasons: string[] }> {
  if (!input.trim()) return [];

  const text = input.toLowerCase();
  const words = text.split(/\s+/);
  const results: Array<{ skillId: string; score: number; reasons: string[] }> = [];

  for (const skill of skills) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Trigger 匹配
    if (skill.trigger) {
      const triggers = skill.trigger.split('/').map(t => t.trim()).filter(Boolean);
      for (const kw of triggers) {
        const sim = fuzzyMatch(kw, text);
        if (sim >= 0.8 && kw.length >= 2) {
          const points = sim >= 1 ? 3 : 2;
          score += points;
          reasons.push(`trigger "${kw}" 匹配 +${points}`);
          if (words[0] && fuzzyMatch(words[0], kw) >= 0.8) {
            score += 1;
            reasons.push('trigger 首词匹配 +1');
          }
        }
      }
    }

    // 2. Tags 匹配
    if (skill.tags && skill.tags.length > 0) {
      for (const tag of skill.tags) {
        const sim = fuzzyMatch(tag, text);
        if (sim >= 0.7) {
          const points = sim >= 0.9 ? 2 : 1;
          score += points;
          reasons.push(`tag "${tag}" 匹配 +${points}`);
        }
      }
    }

    // 3. Name 匹配
    const nameSim = fuzzyMatch(skill.name, text);
    if (nameSim >= 0.6) {
      const points = nameSim >= 1 ? 4 : nameSim >= 0.8 ? 3 : 2;
      score += points;
      reasons.push(`name "${skill.name}" 匹配 +${points}`);
    }

    // 4. Desc 匹配
    if (skill.desc) {
      const descSim = fuzzyMatch(skill.desc.slice(0, 20), text);
      if (descSim >= 0.8) {
        score += 1;
        reasons.push(`desc 匹配 +1`);
      }
    }

    // 阈值过滤
    if (score >= threshold) {
      results.push({ skillId: skill.id, score, reasons });
    }
  }

  // 按 score 降序排列，取 topK
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ===================== 上下文增强匹配 =====================

/**
 * 上下文增强匹配：将最近 N 条对话与用户查询拼接后进行语义搜索
 */
function contextSearch(
  query: string,
  contextMessages: string[],
  topK: number,
  threshold: number,
  contextWindowSize: number
): Array<{ skillId: string; similarity: number }> {
  // 拼接上下文
  const recentMessages = contextMessages.slice(-contextWindowSize);
  const enrichedQuery = [...recentMessages, query].join(' | ');

  // 复用语义搜索
  return semanticSearch(enrichedQuery, topK, threshold);
}

// ===================== 匹配反馈 =====================

/**
 * 记录匹配反馈
 */
export function recordFeedback(
  query: string,
  skillId: string,
  matchMode: MatchMode,
  matchScore: number,
  isRelevant: boolean,
  userFeedback?: number
): number {
  const feedback: Omit<MatchFeedback, 'id'> = {
    query,
    skillId,
    matchMode,
    matchScore,
    isRelevant,
    userFeedback: userFeedback ?? null,
    createdAt: new Date().toISOString(),
  };

  return createMatchFeedback(feedback);
}

/**
 * 获取匹配反馈记录
 */
export function getFeedbackHistory(filters?: {
  skillId?: string;
  matchMode?: string;
  limit?: number;
}): MatchFeedback[] {
  return getMatchFeedback(filters);
}

// ===================== 统一匹配入口 =====================

/**
 * 构建技能名称映射（skillId → name）
 */
function buildSkillNameMap(): Map<string, string> {
  const nameMap = new Map<string, string>();
  for (const s of BUILTIN_SKILLS) {
    nameMap.set(s.id, s.name);
  }
  try {
    const db = initDb();
    const rows = db.prepare('SELECT id, name FROM user_skills').all() as Array<{ id: string; name: string }>;
    for (const row of rows) {
      nameMap.set(row.id, row.name);
    }
  } catch {
    // 忽略
  }
  return nameMap;
}

/**
 * 统一匹配入口
 * 根据匹配模式选择语义/关键词/混合/上下文匹配
 *
 * @param matchQuery 匹配查询参数
 * @param contextMessages 上下文消息（仅 context 模式使用）
 * @returns 匹配结果列表
 */
export function match(
  matchQuery: MatchQuery,
  contextMessages?: string[]
): MatchResult[] {
  const config = getRuntimeConfig();
  const {
    query,
    matchMode,
    topK = config.defaultTopK,
    threshold = config.defaultThreshold,
  } = matchQuery;

  if (!query.trim()) return [];

  const allSkills = collectAllSkills();
  const activeSkills = allSkills.filter(s => s.status === 'active');
  const nameMap = buildSkillNameMap();

  let results: MatchResult[] = [];

  switch (matchMode) {
    case 'semantic': {
      const semanticResults = semanticSearch(query, topK, threshold);
      results = semanticResults.map(r => ({
        skillId: r.skillId,
        skillName: nameMap.get(r.skillId) ?? r.skillId,
        score: r.similarity,
        matchMode: 'semantic' as MatchMode,
        reasons: [`语义相似度: ${r.similarity.toFixed(4)}`],
      }));
      break;
    }

    case 'keyword': {
      const keywordResults = keywordMatch(query, activeSkills, topK, 3);
      results = keywordResults.map(r => ({
        skillId: r.skillId,
        skillName: nameMap.get(r.skillId) ?? r.skillId,
        score: Math.min(r.score / 10, 1), // 归一化到 [0, 1]
        matchMode: 'keyword' as MatchMode,
        reasons: r.reasons,
      }));
      break;
    }

    case 'hybrid': {
      // 语义搜索
      const semanticResults = semanticSearch(query, topK * 2, 0);
      // 关键词搜索
      const keywordResults = keywordMatch(query, activeSkills, topK * 2, 0);

      // 加权融合
      const merged = mergeHybridResults(
        semanticResults,
        keywordResults,
        config.semanticWeight,
        config.keywordWeight
      );

      // 反馈学习调整（如果启用）
      let finalResults = merged;
      if (config.enableFeedbackLearning) {
        finalResults = applyFeedbackLearning(merged);
      }

      results = finalResults
        .filter(r => r.finalScore >= threshold)
        .slice(0, topK)
        .map(r => ({
          skillId: r.skillId,
          skillName: nameMap.get(r.skillId) ?? r.skillId,
          score: r.finalScore,
          matchMode: 'hybrid' as MatchMode,
          reasons: [
            `语义: ${r.semanticScore.toFixed(4)} (权重${config.semanticWeight})`,
            `关键词: ${r.keywordScore.toFixed(4)} (权重${config.keywordWeight})`,
            `综合: ${r.finalScore.toFixed(4)}`,
          ],
        }));
      break;
    }

    case 'context': {
      const messages = contextMessages ?? [];
      const contextResults = contextSearch(
        query,
        messages,
        topK,
        threshold,
        config.contextWindowSize
      );
      results = contextResults.map(r => ({
        skillId: r.skillId,
        skillName: nameMap.get(r.skillId) ?? r.skillId,
        score: r.similarity,
        matchMode: 'context' as MatchMode,
        reasons: [
          `上下文语义相似度: ${r.similarity.toFixed(4)}`,
          `上下文窗口: ${Math.min(messages.length, config.contextWindowSize)} 条`,
        ],
      }));
      break;
    }

    default: {
      // 未知模式，fallback 到 hybrid
      const semanticResults = semanticSearch(query, topK, threshold);
      const keywordResults = keywordMatch(query, activeSkills, topK, 3);
      const merged = mergeHybridResults(
        semanticResults,
        keywordResults,
        config.semanticWeight,
        config.keywordWeight
      );
      results = merged
        .filter(r => r.finalScore >= threshold)
        .slice(0, topK)
        .map(r => ({
          skillId: r.skillId,
          skillName: nameMap.get(r.skillId) ?? r.skillId,
          score: r.finalScore,
          matchMode: 'hybrid' as MatchMode,
          reasons: [`综合: ${r.finalScore.toFixed(4)}`],
        }));
    }
  }

  // 排除指定技能
  if (matchQuery.excludeSkillIds && matchQuery.excludeSkillIds.length > 0) {
    const excludeSet = new Set(matchQuery.excludeSkillIds);
    results = results.filter(r => !excludeSet.has(r.skillId));
  }

  // 分类过滤
  if (matchQuery.categoryFilter && matchQuery.categoryFilter.length > 0) {
    const categorySet = new Set(matchQuery.categoryFilter);
    results = results.filter(r => {
      const skill = allSkills.find(s => s.id === r.skillId);
      return skill ? categorySet.has(skill.category) : true;
    });
  }

  return results;
}

// ===================== 反馈学习 =====================

/**
 * 根据历史反馈分数调整混合匹配结果
 * 对高反馈分数的技能给予加权，低反馈的降权
 */
function applyFeedbackLearning(
  results: Array<{
    skillId: string;
    finalScore: number;
    semanticScore: number;
    keywordScore: number;
  }>
): Array<{
  skillId: string;
  finalScore: number;
  semanticScore: number;
  keywordScore: number;
}> {
  return results.map(r => {
    const avgFeedback = getAverageFeedbackScore(r.skillId);

    // 反馈分数范围 [0, 1]，0.5 为中性
    // 偏差 = avgFeedback - 0.5，范围 [-0.5, 0.5]
    // 调整系数 = 1 + 偏差（即 [0.5, 1.5]）
    const bias = avgFeedback - 0.5;
    const adjustment = 1 + bias;

    return {
      ...r,
      finalScore: r.finalScore * adjustment,
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

// ===================== 初始化 =====================

/**
 * 初始化匹配引擎
 * 确保所有技能已有嵌入向量
 */
export function initMatchingEngine(): {
  embeddingStats: ReturnType<typeof batchGenerateEmbeddings>;
} {
  const embeddingStats = batchGenerateEmbeddings(false);
  return { embeddingStats };
}

/**
 * 强制重建所有嵌入向量
 */
export function rebuildAllEmbeddings(): ReturnType<typeof batchGenerateEmbeddings> {
  invalidateCache();
  return batchGenerateEmbeddings(true);
}
