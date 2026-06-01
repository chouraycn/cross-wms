/**
 * 技能注册中心 — 统一管理内置技能与用户自定义技能
 * 使用事件总线模式（参照 warehouseStore.ts）
 *
 * localStorage key: 'crosswms-user-skills'
 * 存储: Skill[] (仅 source: 'user' 的技能)
 */

import type { Skill } from '../types/skill';
import { BUILTIN_SKILLS } from '../types/skill';

// ====== 持久化配置 ======

const STORAGE_KEY = 'crosswms-user-skills';

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
  } catch {
    // 存储满或不可用时静默失败
  }
}

// ====== 内存存储 ======

// 启动时从 localStorage 恢复用户技能
let userSkills: Skill[] = loadUserSkills();

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

/** 获取所有技能（内置 + 用户安装） */
export function getAllSkills(): Skill[] {
  return [...BUILTIN_SKILLS, ...userSkills];
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

/** 按类别获取技能 */
export function getSkillsByCategory(category: string): Skill[] {
  return getAllSkills().filter((s) => s.category === category);
}

/** 订阅技能数据变化 */
export function onSkillsChange(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
