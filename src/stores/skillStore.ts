/**
 * 技能注册中心 — 统一管理内置技能与用户自定义技能
 * 使用事件总线模式（参照 warehouseStore.ts）
 *
 * 内置技能数据（~30 KB）从 `./types/builtin-skills` 异步懒加载，初始
 * bundle 不含该数据。仅在第一次调用 `getAllSkills()` 或注册用户技能
 * 时才会触发动态 import。
 *
 * 改造策略：
 * - getUserSkills / builtinStatusPatches 从 API 初始化
 * - 写操作调用 API → 成功后更新缓存 → notifyAll()
 * - 新增 initFromApi()，应用启动时调用
 * - updateRecentSkills 仍使用 localStorage（P1 范围，不在 SQLite 迁移中）
 * - T02: 新增 usageStatsCache、loadAllUsageStats、refreshFromRemote
 */

import type { Skill, SkillAudit, UsageStats } from '../types/skill';
import { getBuiltinSkillsSync, loadBuiltinSkills } from '../types/skill';
import * as api from '../services/api';

// ====== 内存缓存 ======

let userSkills: Skill[] = [];
let builtinStatusPatches: Record<string, string> = {};

/** 使用统计缓存：key 为 skill.id */
const usageStatsCache = new Map<string, UsageStats>();

/** 安全审查状态缓存：key 为 skill.id */
const auditStatusCache = new Map<string, SkillAudit>();

// 事件总线：技能变更监听
type SkillsChangeListener = () => void;
const listeners = new Set<SkillsChangeListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // console.error('[skillStore] listener error:', e);
    }
  });
}

// ====== 公开 API ======

/** 获取所有技能（内置 + 用户安装），内置技能应用状态覆盖 */
export function getAllSkills(): Skill[] {
  const patchedBuiltins = getBuiltinSkillsSync().map((s) => {
    const patch = builtinStatusPatches[s.id];
    return patch ? { ...s, status: patch as Skill['status'] } : s;
  });
  return [...patchedBuiltins, ...userSkills];
}

/**
 * Returns all builtin skills, loading them on first call.
 * Returns a Promise so callers can await the data and re-render with the full
 * catalog the first time it is needed.
 */
export async function getAllSkillsAsync(): Promise<Skill[]> {
  await loadBuiltinSkills();
  return getAllSkills();
}

/** 获取所有技能，按使用次数从多到少排序（使用次数相同则按最近使用时间排序） */
export function getAllSkillsSortedByUsage(): Skill[] {
  const all = getAllSkills();
  return [...all].sort((a, b) => {
    const statsA = usageStatsCache.get(a.id);
    const statsB = usageStatsCache.get(b.id);
    const usesA = statsA?.totalUses ?? 0;
    const usesB = statsB?.totalUses ?? 0;
    if (usesB !== usesA) return usesB - usesA;
    const lastA = statsA?.lastUsedAt ? new Date(statsA.lastUsedAt).getTime() : 0;
    const lastB = statsB?.lastUsedAt ? new Date(statsB.lastUsedAt).getTime() : 0;
    return lastB - lastA;
  });
}

/** 根据 ID 获取单个技能 */
export function getSkillById(id: string): Skill | undefined {
  return getAllSkills().find((s) => s.id === id);
}

/** 获取技能使用统计（同步读缓存） */
export function getUsageStats(id: string): UsageStats | undefined {
  return usageStatsCache.get(id);
}

/** 批量加载所有技能使用统计，写入缓存 */
export async function loadAllUsageStats(): Promise<void> {
  try {
    const statsMap = await api.fetchSkillUsageStats();
    usageStatsCache.clear();
    for (const [skillId, stats] of Object.entries(statsMap)) {
      usageStatsCache.set(skillId, stats);
    }
    notifyAll();
  } catch (e) {
    // console.error('[skillStore] loadAllUsageStats failed:', e);
  }
}

/** 全量从 API 刷新技能列表，触发 notifyAll() */
export async function refreshFromRemote(): Promise<void> {
  try {
    const [skills, patches] = await Promise.all([
      api.getUserSkills(),
      api.getBuiltinPatches(),
    ]);
    userSkills = skills;
    builtinStatusPatches = patches;
    await loadAllUsageStats();
    notifyAll();
  } catch (e) {
    // console.error('[skillStore] refreshFromRemote failed:', e);
  }
}

/** 添加用户自定义技能 */
export async function addSkill(skill: Omit<Skill, 'id' | 'source' | 'installedAt'>): Promise<Skill> {
  const newSkill: Skill = {
    ...skill,
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'user',
    installedAt: Date.now(),
  };
  // console.log('[skillStore] addSkill: creating skill', { id: newSkill.id, name: newSkill.name, hasPromptTemplate: !!newSkill.promptTemplate, promptTemplateLength: newSkill.promptTemplate?.length ?? 0, executionMode: newSkill.executionMode });
  try {
    const created = await api.createUserSkill(newSkill);
    // console.log('[skillStore] addSkill: server response', { id: created.id, name: created.name, hasPromptTemplate: !!created.promptTemplate, promptTemplateLength: created.promptTemplate?.length ?? 0, executionMode: created.executionMode });
    userSkills = [...userSkills, created];
    notifyAll();
    return created;
  } catch (e) {
    // console.error('[skillStore] addSkill failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'addSkill', error: e } }));
    throw e;
  }
}

/** 更新用户自定义技能（仅限 source: 'user'） */
export async function updateSkill(id: string, updates: Partial<Omit<Skill, 'id' | 'source'>>): Promise<boolean> {
  const idx = userSkills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  try {
    const updated = await api.updateUserSkill(id, updates);
    userSkills[idx] = updated;
    notifyAll();
    return true;
  } catch (e) {
    // console.error('[skillStore] updateSkill failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'updateSkill', error: e } }));
    throw e;
  }
}

/** 设置技能状态（内置+用户技能均可） */
export async function setSkillStatus(id: string, status: Skill['status']): Promise<boolean> {
  // 先查用户技能
  const uIdx = userSkills.findIndex((s) => s.id === id);
  if (uIdx !== -1) {
    try {
      const updated = await api.updateUserSkill(id, { status });
      userSkills[uIdx] = updated;
      notifyAll();
      return true;
    } catch (e) {
      // console.error('[skillStore] setSkillStatus (user) failed:', e);
      window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'setSkillStatus', error: e } }));
      throw e;
    }
  }
  // 内置技能：通过 patch map 覆盖
  try {
    await api.setBuiltinPatch(id, status);
    builtinStatusPatches[id] = status;
    notifyAll();
    return true;
  } catch (e) {
    // console.error('[skillStore] setSkillStatus (builtin) failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'setSkillStatus', error: e } }));
    throw e;
  }
}

/** 删除技能（只能删除 source: 'user' 的技能，内置技能禁止删除） */
export async function removeSkill(id: string): Promise<boolean> {
  const skill = userSkills.find((s) => s.id === id);
  if (!skill) return false;
  if (skill.source === 'builtin') {
    // console.warn('[skillStore] removeSkill: 内置技能禁止删除', id);
    return false;
  }
  try {
    await api.deleteUserSkill(id);
    userSkills = userSkills.filter((s) => s.id !== id);
    notifyAll();
    return true;
  } catch (e) {
    // console.error('[skillStore] removeSkill failed:', e);
    window.dispatchEvent(new CustomEvent('cdf-know-clow-api-error', { detail: { action: 'removeSkill', error: e } }));
    throw e;
  }
}

/** 按名称查找技能 */
export function findSkillByName(name: string): Skill | undefined {
  return getAllSkills().find((s) => s.name === name);
}

/** 按触发词匹配技能（用于斜杠命令） */
export function findSkillByTrigger(query: string): Skill[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllSkills().filter((s) => s.status === 'active');
  return getAllSkills().filter((s) =>
    s.status === 'active' && (
      s.name.toLowerCase().includes(q) ||
      (s.trigger || '').toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      s.id.replace('builtin-', '').includes(q)
    )
  );
}

/** 按类别获取技能 */
export function getSkillsByCategory(category: string): Skill[] {
  return getAllSkills().filter((s) => s.category === category);
}

/** 更新最近使用技能（仍使用 localStorage，P1 范围） */
export function updateRecentSkills(skillName: string): void {
  let recentNames: string[] = [];
  try {
    const raw = localStorage.getItem('cdf-know-clow-recent-skills');
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      recentNames = parsed.filter((n: unknown) => typeof n === 'string');
    }
  } catch { /* ignore */ }
  const updated = [skillName, ...recentNames.filter((n) => n !== skillName)].slice(0, 6);
  try { localStorage.setItem('cdf-know-clow-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
}

/** 订阅技能数据变化 */
export function onSkillsChange(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

// ===================== 安全审查 =====================

/** 获取技能审计状态（同步读缓存） */
export function getAuditStatus(skillId: string): SkillAudit | undefined {
  return auditStatusCache.get(skillId);
}

/** 批量加载所有技能的审计状态 */
export async function loadAuditStatuses(): Promise<void> {
  const skills = getAllSkills();
  for (const skill of skills) {
    try {
      if (skill.source === 'builtin') {
        // 内置技能：无需外部文件审查，默认标记为安全
        if (!auditStatusCache.has(skill.id)) {
          auditStatusCache.set(skill.id, {
            id: `builtin-audit-${skill.id}`,
            skillId: skill.id,
            skillVersion: skill.version || '1.0',
            score: 100,
            level: 'safe',
            reportJson: JSON.stringify({ summary: { level: 'safe', score: 100, skillName: skill.name }, findings: [] }),
            reportMarkdown: `# 安全审计报告\n\n## 执行摘要\n- **审计对象**: ${skill.name}\n- **审计结果**: 安全\n- **评分**: 100/100\n\n该技能为系统内置，已通过安全审查。`,
            triggeredBy: 'import',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        const audit = await api.fetchSkillAudit(skill.id);
        if (audit) {
          auditStatusCache.set(skill.id, audit);
        }
      }
    } catch {
      // 静默处理单个技能的审计查询失败
    }
  }
  notifyAll();
}

/** 手动设置技能的审计状态（供 SkillAuditPage 等外部组件同步缓存） */
export function setAuditStatus(skillId: string, audit: SkillAudit): void {
  auditStatusCache.set(skillId, audit);
  notifyAll();
}

/** 刷新单个技能的审计状态 */
export async function refreshAuditForSkill(skillId: string): Promise<void> {
  const audit = await api.triggerSkillAudit(skillId, '', true);
  auditStatusCache.set(skillId, audit);
  notifyAll();
}

/** 从 API 初始化缓存（启动路径：只加载技能列表，不加载非关键的使用统计） */
export async function initFromApi(): Promise<void> {
  try {
    const [skills, patches] = await Promise.all([
      api.getUserSkills(),
      api.getBuiltinPatches(),
    ]);
    userSkills = skills;
    builtinStatusPatches = patches;
    notifyAll();
    // 使用统计由 SkillsPage / CommandPalette 等按需延迟加载，避免启动时额外请求
  } catch (e) {
    // console.error('[skillStore] initFromApi failed:', e);
  }
}
