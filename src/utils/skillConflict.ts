/**
 * 技能冲突检测工具库
 * 纯函数，用于计算技能之间的相似度和冲突
 */

import type { Skill, ConflictResult, SkillSuggestionItem } from '../types/skill';

// ===================== Jaccard 相似度 =====================

/**
 * 计算两个字符串集合的 Jaccard 相似度
 * @param setA 第一个集合
 * @param setB 第二个集合
 * @returns 相似度 (0-1)
 */
export function jaccard(setA: string[], setB: string[]): number {
  const a = new Set(setA.map(s => s.toLowerCase().trim()).filter(Boolean));
  const b = new Set(setB.map(s => s.toLowerCase().trim()).filter(Boolean));

  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ===================== 冲突检测 =====================

/**
 * 检查两个技能之间的冲突程度
 * @param skillA 第一个技能
 * @param skillB 第二个技能
 * @returns 冲突检测结果
 */
export function checkConflict(skillA: Skill, skillB: Skill): ConflictResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. 名称相似度（权重 0.4）
  const nameSimilarity = calculateStringSimilarity(skillA.name, skillB.name);
  if (nameSimilarity > 0.5) {
    score += nameSimilarity * 0.4;
    reasons.push(`名称相似度: ${(nameSimilarity * 100).toFixed(1)}%`);
  }

  // 2. 触发词相似度（权重 0.3）
  if (skillA.trigger && skillB.trigger) {
    const triggerSimilarity = calculateStringSimilarity(skillA.trigger, skillB.trigger);
    if (triggerSimilarity > 0.3) {
      score += triggerSimilarity * 0.3;
      reasons.push(`触发词相似度: ${(triggerSimilarity * 100).toFixed(1)}%`);
    }
  }

  // 3. 标签重叠度（权重 0.3）
  const tagsA = skillA.tags || [];
  const tagsB = skillB.tags || [];
  if (tagsA.length > 0 && tagsB.length > 0) {
    const tagSimilarity = jaccard(tagsA, tagsB);
    if (tagSimilarity > 0.3) {
      score += tagSimilarity * 0.3;
      reasons.push(`标签重叠度: ${(tagSimilarity * 100).toFixed(1)}%`);
    }
  }

  // 4. 描述相似度（权重 0.2）
  if (skillA.desc && skillB.desc) {
    const descSimilarity = calculateStringSimilarity(skillA.desc, skillB.desc);
    if (descSimilarity > 0.4) {
      score += descSimilarity * 0.2;
      reasons.push(`描述相似度: ${(descSimilarity * 100).toFixed(1)}%`);
    }
  }

  return {
    skillId: skillB.id,
    skillName: skillB.name,
    score: Math.min(score, 1), // 确保不超过 1
    reasons,
  };
}

/**
 * 查找与指定技能冲突的所有现有技能
 * @param skill 要检查的技能
 * @param allSkills 所有现有技能
 * @param threshold 冲突阈值 (0-1)，默认 0.4
 * @returns 冲突检测结果数组，按冲突分数降序排序
 */
export function findAllConflicts(
  skill: Skill,
  allSkills: Skill[],
  threshold: number = 0.4
): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  for (const existingSkill of allSkills) {
    // 跳过自己
    if (existingSkill.id === skill.id) continue;

    const result = checkConflict(skill, existingSkill);
    if (result.score >= threshold) {
      conflicts.push(result);
    }
  }

  // 按冲突分数降序排序
  return conflicts.sort((a, b) => b.score - a.score);
}

// ===================== 模糊搜索建议 =====================

/**
 * 根据输入字符串，查找可能想要的技能
 * @param input 用户输入
 * @param skills 所有技能
 * @param threshold 匹配阈值 (0-1)，默认 0.3
 * @returns 建议技能数组，按匹配分数降序排序
 */
export function getCloseCandidates(
  input: string,
  skills: Skill[],
  threshold: number = 0.3
): SkillSuggestionItem[] {
  const suggestions: SkillSuggestionItem[] = [];

  for (const skill of skills) {
    // 计算综合匹配分数
    let matchScore = 0;
    const reasons: string[] = [];

    // 名称匹配
    const nameSimilarity = calculateStringSimilarity(input, skill.name);
    if (nameSimilarity > threshold) {
      matchScore += nameSimilarity * 0.5;
      reasons.push(`名称匹配: ${(nameSimilarity * 100).toFixed(1)}%`);
    }

    // 触发词匹配
    if (skill.trigger) {
      const triggerSimilarity = calculateStringSimilarity(input, skill.trigger);
      if (triggerSimilarity > threshold) {
        matchScore += triggerSimilarity * 0.3;
        reasons.push(`触发词匹配: ${(triggerSimilarity * 100).toFixed(1)}%`);
      }
    }

    // 标签匹配
    if (skill.tags && skill.tags.length > 0) {
      for (const tag of skill.tags) {
        const tagSimilarity = calculateStringSimilarity(input, tag);
        if (tagSimilarity > 0.5) {
          matchScore += tagSimilarity * 0.2;
          reasons.push(`标签匹配: ${tag}`);
          break;
        }
      }
    }

    if (matchScore > 0) {
      suggestions.push({
        id: skill.id,
        name: skill.name,
        matchScore: Math.min(matchScore, 1),
        reason: reasons.join('; '),
      });
    }
  }

  // 按匹配分数降序排序
  return suggestions.sort((a, b) => b.matchScore - a.matchScore);
}

// ===================== 辅助函数 =====================

/**
 * 计算两个字符串的相似度（基于字符级别的 Jaccard）
 */
function calculateStringSimilarity(strA: string, strB: string): number {
  if (!strA || !strB) return 0;

  const a = strA.toLowerCase().split('');
  const b = strB.toLowerCase().split('');

  return jaccard(a, b);
}

/**
 * 计算编辑距离（Levenshtein Distance）
 */
function levenshteinDistance(strA: string, strB: string): number {
  const a = strA.toLowerCase();
  const b = strB.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // 删除
        matrix[i][j - 1] + 1,      // 插入
        matrix[i - 1][j - 1] + cost // 替换
      );
    }
  }

  return matrix[a.length][b.length];
}
