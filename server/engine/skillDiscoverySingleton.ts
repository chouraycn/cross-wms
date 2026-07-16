/**
 * Skill Discovery Singleton — Skill 发现系统单例
 *
 * 提供全局的 Skill 发现与索引服务，供各模块使用。
 */

import { SkillDiscovery } from './skillDiscovery.js';
import { skillRegistry } from './skillRegistry.js';
import { logger } from '../logger.js';

// ===================== 单例实例 =====================

/** Skill 发现系统单例 */
export const skillDiscovery = new SkillDiscovery();

// ===================== 初始化函数 =====================

/**
 * 初始化 Skill 发现系统
 *
 * 从 skillRegistry 加载所有已注册的 Skill 并构建索引。
 * 应在 skillRegistry 初始化完成后调用。
 */
export function initSkillDiscovery(): void {
  const skills = skillRegistry.getAllSkills();
  skillDiscovery.buildIndex(skills);
  logger.info('[SkillDiscoverySingleton] Initialized from registry.');
}

/**
 * 重新构建 Skill 索引
 *
 * 在 Skill 注册表变更后调用，以同步索引。
 */
export function rebuildSkillIndex(): void {
  const skills = skillRegistry.getAllSkills();
  skillDiscovery.buildIndex(skills);
  logger.info('[SkillDiscoverySingleton] Index rebuilt.');
}

export const skillDiscoverySingleton = skillDiscovery;
