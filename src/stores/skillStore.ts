/**
 * 技能注册中心 — 统一管理内置技能与用户自定义技能
 * 使用事件总线模式（参照 warehouseStore.ts）
 *
 * localStorage keys:
 *   'crosswms-user-skills' — 用户自定义技能
 *   'crosswms-builtin-status-patches' — 内置技能运行时状态覆盖
 */

import type { Skill } from '../types/skill';
import { BUILTIN_SKILLS } from '../types/skill';

// ====== 持久化配置 ======

const STORAGE_KEY = 'crosswms-user-skills';
const BUILTIN_PATCHES_KEY = 'crosswms-builtin-status-patches';

/** 从 localStorage 读取用户自定义技能 */
function loadUserSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s: Skill) => s.source === 'user');
      }
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/** 写入 localStorage（仅保存 source: 'user' 的技能） */
function saveUserSkills(skills: Skill[]): void {
  try {
    const userSkills = skills.filter((s) => s.source === 'user');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSkills));
  } catch (e) {
    console.error(`[${STORAGE_KEY}] 保存失败:`, e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('crosswms-storage-warning', { detail: { key: STORAGE_KEY } }));
    }
  }
}

/** 从 localStorage 读取内置技能状态覆盖 */
function loadBuiltinPatches(): Record<string, Skill['status']> {
  try {
    const raw = localStorage.getItem(BUILTIN_PATCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch { /* ignore */ }
  return {};
}

/** 写入内置技能状态覆盖 */
function saveBuiltinPatches(): void {
  try {
    localStorage.setItem(BUILTIN_PATCHES_KEY, JSON.stringify(builtinStatusPatches));
  } catch (e) {
    console.error(`[${BUILTIN_PATCHES_KEY}] 保存失败:`, e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('crosswms-storage-warning', { detail: { key: BUILTIN_PATCHES_KEY } }));
    }
  }
}

// ====== 内存存储 ======

// 启动时从 localStorage 恢复用户技能
let userSkills: Skill[] = loadUserSkills();

// 内置技能运行时状态覆盖（不修改 BUILTIN_SKILLS 原始数据）
let builtinStatusPatches: Record<string, Skill['status']> = loadBuiltinPatches();

// 事件总线：技能变更监听
type SkillsChangeListener = () => void;
const listeners = new Set<SkillsChangeListener>();

/** 通知所有监听者 + 持久化 */
function notifyAndPersist(): void {
  saveUserSkills(userSkills);
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
    return patch ? { ...s, status: patch } : s;
  });
  return [...patchedBuiltins, ...userSkills];
}

/** 根据 ID 获取单个技能 */
export function getSkillById(id: string): Skill | undefined {
  return getAllSkills().find((s) => s.id === id);
}

/** 添加用户自定义技能 */
export function addSkill(skill: Omit<Skill, 'id' | 'source' | 'installedAt'>): Skill {
  const newSkill: Skill = {
    ...skill,
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'user',
    installedAt: Date.now(),
  };
  userSkills = [...userSkills, newSkill];
  notifyAndPersist();
  return newSkill;
}

/** 更新用户自定义技能（仅限 source: 'user'） */
export function updateSkill(id: string, updates: Partial<Omit<Skill, 'id' | 'source'>>): boolean {
  const idx = userSkills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  userSkills[idx] = { ...userSkills[idx], ...updates };
  notifyAndPersist();
  return true;
}

/** 设置技能状态（内置+用户技能均可） */
export function setSkillStatus(id: string, status: Skill['status']): boolean {
  // 先查用户技能
  const uIdx = userSkills.findIndex((s) => s.id === id);
  if (uIdx !== -1) {
    userSkills[uIdx] = { ...userSkills[uIdx], status };
    notifyAndPersist();
    return true;
  }
  // 内置技能：通过 patch map 覆盖
  builtinStatusPatches[id] = status;
  saveBuiltinPatches();
  notifyAndPersist();
  return true;
}

/** 删除技能（只能删除 source: 'user' 的技能） */
export function removeSkill(id: string): boolean {
  const idx = userSkills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  userSkills = userSkills.filter((s) => s.id !== id);
  notifyAndPersist();
  return true;
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

/** 更新最近使用技能 */
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
