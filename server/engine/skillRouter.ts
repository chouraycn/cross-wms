/**
 * Skill Router — 智能技能路由（P2-1b）
 *
 * 把 openclaw 的 discovery + research 与 cdf 的 advanced-triggers 结合，
 * 形成 cdf 独有的「智能技能路由」：
 *
 *   用户 query（+ 最近对话上下文）→ matchingService.match → top-N 相关技能
 *   → 格式化为 <available_skills> 注入 system prompt
 *
 * 设计要点：
 * 1. 优先用 context 模式（结合对话历史），若向量未建导致语义为空则回退 hybrid
 *    （关键词兜底，P2-1a 已验证 keyword 命中 notion/trello/github）。
 * 2. 注入的调用指令指向 P0-A 已落地的 `skill use <id>` 元工具，而非
 *    getToolDefinitions() 生成的（无 handler 的）skill_<id> 工具。
 * 3. 全程 try/catch，路由失败绝不阻断主链路，仅回退到上游传入的 skillContext。
 */

import { match } from '../services/matchingService.js';
import { BUILTIN_SKILLS } from '@src/types/skill-core';
import { getUserSkills } from '../dao/skills.js';
import { getFolderSkillsForMatching } from './skillRuntimeBridge.js';
import { getOnnxStatus } from '../engine/onnxEmbedding.js';
import { logger } from '../logger.js';

// ===================== 类型 =====================

/** 路由后的单条技能（已补全展示信息） */
export interface RoutedSkill {
  id: string;
  name: string;
  description: string;
  group: string;
  tags: string[];
  score: number;
  matchMode: string;
}

// ===================== 技能信息索引 =====================

/**
 * 构建 id → 展示信息 的索引，覆盖 matchingService.match 可能返回的全部技能来源：
 * builtin（@src/types/skill-core）+ 用户自建（dao/skills）+ folder-skill（skillRuntimeBridge）。
 * 与 matchingService.collectAllSkills 的来源保持一致，避免命中技能因查不到展示信息被丢弃。
 */
function buildSkillLookup(): Map<string, Omit<RoutedSkill, 'score' | 'matchMode'>> {
  const map = new Map<string, Omit<RoutedSkill, 'score' | 'matchMode'>>();

  // 1. 内置技能
  try {
    for (const s of BUILTIN_SKILLS) {
      if (!s.id) continue;
      map.set(s.id, {
        id: s.id,
        name: s.name || s.id,
        description: s.desc || '',
        group: s.category || 'util',
        tags: Array.isArray(s.tags) ? s.tags : [],
      });
    }
  } catch (e) {
    logger.warn(`[SkillRouter] 构建内置技能索引失败: ${(e as Error).message}`);
  }

  // 2. 用户自建技能
  try {
    for (const row of getUserSkills()) {
      const id = row.id as string;
      if (!id) continue;
      let tags: string[] = [];
      try {
        if (row.tags) tags = JSON.parse(String(row.tags));
      } catch { /* ignore */ }
      map.set(id, {
        id,
        name: (row.name as string) || id,
        description: (row.desc as string) || '',
        group: (row.category as string) || 'util',
        tags: tags.length > 0 ? tags : [],
      });
    }
  } catch (e) {
    logger.warn(`[SkillRouter] 构建用户技能索引失败: ${(e as Error).message}`);
  }

  // 3. folder-skill（声明式 SKILL.md）
  try {
    for (const f of getFolderSkillsForMatching()) {
      if (!f.id || map.has(f.id)) continue;
      map.set(f.id, {
        id: f.id,
        name: f.name || f.id,
        description: f.desc || '',
        group: f.category || 'util',
        tags: Array.isArray(f.tags) ? f.tags : [],
      });
    }
  } catch (e) {
    logger.warn(`[SkillRouter] 构建 folder 技能索引失败: ${(e as Error).message}`);
  }

  return map;
}

// ===================== 核心路由 =====================

/**
 * 判断是否允许使用语义/上下文模式（避免在生产请求中触发 ONNX 模型下载阻塞）。
 *
 * - getOnnxStatus() 为同步调用，不会触发下载；
 * - 仅当本地 ONNX 模型已就绪（status==='ready'）时才启用语义增强，
 *   否则退化为纯关键词模式（瞬时、无需网络）。
 */
function isSemanticAvailable(): boolean {
  try {
    const status = getOnnxStatus();
    return status && status.status === 'ready';
  } catch {
    return false;
  }
}

/**
 * 根据用户 query 与对话上下文，自动匹配 top-N 相关技能。
 *
 * 路由策略（兼顾召回率与请求时延）：
 * 1. 关键词模式永远作为基础召回（瞬时、不触发模型下载，P2-1a 已验证命中）；
 * 2. 仅当本地 ONNX 模型已就绪（status==='ready'）时，额外叠加 context 语义增强，
 *    绝不因语义不可用而触发 ~90s 的模型下载阻塞；
 * 3. 结果按 skillId 去重合并（关键词优先保底，语义补充召回）。
 *
 * @param query 用户当前消息
 * @param contextMessages 最近对话文本（仅 context 模式使用）
 * @param opts.topK 最多返回数量（默认 6）
 * @param opts.threshold 匹配阈值（默认 0.25）
 * @returns 去重后的相关技能列表（含展示信息）
 */
export async function routeSkillsForPrompt(
  query: string,
  contextMessages: string[] = [],
  opts: { topK?: number; threshold?: number } = {},
): Promise<RoutedSkill[]> {
  const topK = opts.topK ?? 6;
  const threshold = opts.threshold ?? 0.25;

  if (!query || !query.trim()) return [];

  const safeContext = Array.isArray(contextMessages)
    ? contextMessages.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim())
    : [];

  type MatchResult = { skillId: string; score: number; matchMode: string };
  const merged: MatchResult[] = [];
  const seen = new Set<string>();
  const pushAll = (arr?: MatchResult[]) => {
    for (const r of arr ?? []) {
      if (!seen.has(r.skillId)) {
        seen.add(r.skillId);
        merged.push(r);
      }
    }
  };

  // 1) 关键词模式：永远安全执行，作为基础召回
  const keywordResults = await match(
    { query: query.trim(), matchMode: 'keyword', topK, threshold },
  );
  pushAll(keywordResults as MatchResult[]);

  // 2) 语义增强：仅当本地模型已就绪，避免触发下载阻塞
  if (isSemanticAvailable()) {
    const contextResults = await match(
      { query: query.trim(), matchMode: 'context', topK, threshold },
      safeContext,
    );
    pushAll(contextResults as MatchResult[]);
  }

  const lookup = buildSkillLookup();
  const routed: RoutedSkill[] = [];

  for (const r of merged) {
    const info = lookup.get(r.skillId);
    if (!info) continue; // 仅保留索引中真实存在的技能
    routed.push({ ...info, score: r.score, matchMode: r.matchMode });
  }

  return routed;
}

// ===================== 格式化 =====================

/**
 * 将路由结果格式化为注入 system prompt 的 XML 块。
 * 调用指令使用 P0-A 已落地的 `skill use <id>` 元工具。
 */
export function formatRoutedSkillsForPrompt(skills: RoutedSkill[]): string {
  if (!skills || skills.length === 0) return '';

  const lines: string[] = [];
  lines.push('<available_skills>');
  lines.push('以下是根据你的需求自动匹配到的相关技能（Skills）。当问题涉及这些能力时，请优先调用对应技能完成任务：');
  lines.push('');

  for (const s of skills) {
    lines.push(`<skill name="${s.id}">`);
    lines.push(`  <name>${s.name}</name>`);
    lines.push(`  <description>${s.description}</description>`);
    lines.push(`  <group>${s.group}</group>`);
    if (s.tags.length > 0) {
      lines.push(`  <tags>${s.tags.join(', ')}</tags>`);
    }
    lines.push(`  <usage>调用元工具 skill（action="use", id="${s.id}"）读取完整技能说明，再按说明用其它工具执行</usage>`);
    lines.push('</skill>');
    lines.push('');
  }

  lines.push('使用方法：先调用 skill 元工具（action="use", id="<skill-id>"）获取该技能的完整指令文档，然后按指令用其它工具（如 exec_command）完成任务。不要猜测技能内容，务必先 use 再执行。');
  lines.push('</available_skills>');

  return lines.join('\n');
}

// ===================== 上下文提取 =====================

/**
 * 从数据库消息列表中提取最近若干条对话文本，供路由作为上下文使用。
 * 仅取 user/assistant 角色、非空字符串内容，返回最近 limit 条。
 */
export function extractContextTexts(
  dbMessages: Array<{ role?: string; content?: unknown }> | undefined,
  limit = 6,
): string[] {
  if (!Array.isArray(dbMessages)) return [];
  return dbMessages
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        (m.content as string).trim(),
    )
    .map((m) => (m.content as string).trim())
    .slice(-limit);
}

// ===================== 对外便捷封装 =====================

/**
 * 解析最终的 skillContext：
 * - 保留上游（前端/队列）显式传入的 skillContext（用户主动选择的具体技能）；
 * - 追加自动路由匹配到的相关技能块；
 * - 任一环节失败均回退，绝不阻断主链路。
 *
 * @param upstreamSkillContext 上游传入的 skillContext（可能为空）
 * @param query 用户当前消息
 * @param contextMessages 最近对话文本
 */
export async function resolveSkillContext(
  upstreamSkillContext: string | undefined,
  query: string,
  contextMessages: string[] = [],
): Promise<string> {
  const upstream = upstreamSkillContext && upstreamSkillContext.trim() ? upstreamSkillContext.trim() : '';

  let routedBlock = '';
  try {
    const routed = await routeSkillsForPrompt(query, contextMessages, { topK: 6, threshold: 0.25 });
    routedBlock = formatRoutedSkillsForPrompt(routed);
    if (routed.length > 0) {
      logger.info(`[SkillRouter] 自动路由命中 ${routed.length} 个技能: ${routed.map((r) => r.id).join(', ')}`);
    }
  } catch (e) {
    logger.warn(`[SkillRouter] 自动路由失败，回退到上游 skillContext: ${(e as Error).message}`);
  }

  const parts: string[] = [];
  if (upstream) parts.push(upstream);
  if (routedBlock) parts.push(routedBlock);
  return parts.join('\n\n');
}
