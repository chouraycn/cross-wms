/**
 * 技能注册中心 — 统一管理内置技能与用户自定义技能
 * 使用事件总线模式（参照 warehouseStore.ts）
 *
 * 改造策略：
 * - getUserSkills / builtinStatusPatches 从 API 初始化
 * - 写操作调用 API → 成功后更新缓存 → notifyAll()
 * - 新增 initFromApi()，应用启动时调用
 * - updateRecentSkills 仍使用 localStorage（P1 范围，不在 SQLite 迁移中）
 */

import type { Skill } from '../types/skill';
import { BUILTIN_SKILLS } from '../types/skill';
import * as api from '../services/api';

// ====== 内存缓存 ======

let userSkills: Skill[] = [];
let builtinStatusPatches: Record<string, string> = {};

// 事件总线：技能变更监听
type SkillsChangeListener = () => void;
const listeners = new Set<SkillsChangeListener>();

/** 通知所有监听者 */
function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[skillStore] listener error:', e);
    }
  });
}

// ====== 公开 API ======

/** 获取所有技能（内置 + 用户安装），内置技能应用状态覆盖 */
export function getAllSkills(): Skill[] {
  const patchedBuiltins = BUILTIN_SKILLS.map((s) => {
    const patch = builtinStatusPatches[s.id];
    return patch ? { ...s, status: patch as Skill['status'] } : s;
  });
  return [...patchedBuiltins, ...userSkills];
}

/** 根据 ID 获取单个技能 */
export function getSkillById(id: string): Skill | undefined {
  return getAllSkills().find((s) => s.id === id);
}

/** 添加用户自定义技能 */
export async function addSkill(skill: Omit<Skill, 'id' | 'source' | 'installedAt'>): Promise<Skill> {
  const newSkill: Skill = {
    ...skill,
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'user',
    installedAt: Date.now(),
  };
  try {
    const created = await api.createUserSkill(newSkill);
    userSkills = [...userSkills, created];
    notifyAll();
    return created;
  } catch (e) {
    console.error('[skillStore] addSkill failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'addSkill', error: e } }));
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
    console.error('[skillStore] updateSkill failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'updateSkill', error: e } }));
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
      console.error('[skillStore] setSkillStatus (user) failed:', e);
      window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'setSkillStatus', error: e } }));
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
    console.error('[skillStore] setSkillStatus (builtin) failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'setSkillStatus', error: e } }));
    throw e;
  }
}

/** 删除技能（只能删除 source: 'user' 的技能，内置技能禁止删除） */
export async function removeSkill(id: string): Promise<boolean> {
  const skill = userSkills.find((s) => s.id === id);
  if (!skill) return false;
  if (skill.source === 'builtin') {
    console.warn('[skillStore] removeSkill: 内置技能禁止删除', id);
    return false;
  }
  try {
    await api.deleteUserSkill(id);
    userSkills = userSkills.filter((s) => s.id !== id);
    notifyAll();
    return true;
  } catch (e) {
    console.error('[skillStore] removeSkill failed:', e);
    window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'removeSkill', error: e } }));
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
    const raw = localStorage.getItem('crosswms-recent-skills');
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      recentNames = parsed.filter((n: unknown) => typeof n === 'string');
    }
  } catch { /* ignore */ }
  const updated = [skillName, ...recentNames.filter((n) => n !== skillName)].slice(0, 6);
  try { localStorage.setItem('crosswms-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
}

/** 订阅技能数据变化 */
export function onSkillsChange(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** 从 API 初始化缓存 */
export async function initFromApi(): Promise<void> {
  try {
    const [skills, patches] = await Promise.all([
      api.getUserSkills(),
      api.getBuiltinPatches(),
    ]);
    userSkills = skills;
    builtinStatusPatches = patches;
    notifyAll();
  } catch (e) {
    console.error('[skillStore] initFromApi failed:', e);
  }
}
