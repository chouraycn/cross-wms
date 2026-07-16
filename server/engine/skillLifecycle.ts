/*
 * Skill Lifecycle — 技能生命周期增强（P2 智能技能路由·lifecycle 块）
 *
 * 吸收 openclaw 的 skill lifecycle 方法论（doctor-skills 校验 / skills-cli 安装更新禁用 /
 * skill-discovery 扫描注册），落到 cdf 已有基建上：
 *  - skillRegistry 统一注册（builtin/user/workspace 三级）；
 *  - skillLoader 解析 SKILL.md；skillRuntimeBridge 启动时打通数据链路并持久化禁用集合到
 *    ~/.workbuddy/skills/.skills-disabled.json。
 *
 * 本模块提供统一生命周期入口：
 *  - doctorSkills()：校验每个已注册技能的可加载性（SKILL.md 存在/可解析、依赖满足），
 *    产出健康报告，等价 openclaw 的 doctor 能力。
 *  - reloadSkills()：热刷新（清空注册表 → 重新扫描三级目录），无需重启进程。
 *  - setSkillEnabled()：启用/禁用并持久化到 .skills-disabled.json。
 *  - getSkillLifecycleStatus()：聚合「可用列表 + 健康 + 版本/来源」供 Agent / CLI 查看。
 *
 * 所有操作均为只读校验或安全的状态变更，失败仅记录，不阻断主链路。
 */

import fs from 'fs';
import { skillRegistry } from './skillRegistry.js';
import { initSkillRuntime, resetSkillRuntime, setSkillDisabled, listAvailableSkills } from './skillRuntimeBridge.js';
import { auditSkillSecurity, type SecurityRiskLevel } from './skillSecurity.js';
import { logger } from '../logger.js';
import type { SkillPermissionGroup } from '../types/skill-runtime.js';

// ===================== 类型 =====================

export interface SkillHealth {
  id: string;
  name: string;
  source: 'builtin' | 'workspace' | 'user';
  group?: SkillPermissionGroup;
  version?: string;
  /** 是否启用（未被禁用集合排除） */
  enabled: boolean;
  /** 是否健康（可正常加载与执行） */
  healthy: boolean;
  /** 问题列表（空数组表示健康） */
  issues: string[];
  /** 安全风险评估 */
  securityRisk?: SecurityRiskLevel;
}

export interface LifecycleStatus {
  total: number;
  enabled: number;
  disabled: number;
  healthy: number;
  unhealthy: number;
  skills: SkillHealth[];
}

// ===================== 校验 =====================

/**
 * 校验单个技能的可加载性与依赖满足度。
 */
function checkSkillHealth(id: string): SkillHealth {
  const skill = skillRegistry.getSkill(id);
  const base: SkillHealth = {
    id,
    name: id,
    source: 'builtin',
    enabled: true,
    healthy: false,
    issues: [],
  };
  if (!skill) {
    base.issues.push('技能未在注册表中找到');
    return base;
  }

  const def = skill.definition;
  base.name = def.name || id;
  base.source = def.source;
  base.group = def.group;
  base.version = def.version;

  // 1. SKILL.md 正文存在且非空
  if (!def.sourcePath || !fs.existsSync(def.sourcePath)) {
    base.issues.push(`SKILL.md 路径缺失或不存在: ${def.sourcePath ?? '(unknown)'}`);
  } else if (!def.skillMdContent || def.skillMdContent.trim().length === 0) {
    base.issues.push('SKILL.md 内容为空或无法解析');
  }

  // 2. 基本字段完整性
  if (!def.name) base.issues.push('缺少 name');
  if (!def.description) base.issues.push('缺少 description');

  // 3. 依赖声明软校验
  const requires = def.requires;
  if (requires) {
    if (Array.isArray(requires.env) && requires.env.length > 0) {
      const missing = requires.env.filter((e) => !process.env[e]);
      if (missing.length > 0) {
        base.issues.push(`缺少环境变量: ${missing.join(', ')}`);
      }
    }
    if (Array.isArray(requires.skills) && requires.skills.length > 0) {
      const missing = requires.skills.filter((s) => !skillRegistry.getSkill(s));
      if (missing.length > 0) {
        base.issues.push(`缺少依赖技能: ${missing.join(', ')}`);
      }
    }
  }

  base.healthy = base.issues.length === 0;
  return base;
}

// ===================== 公开 API =====================

/**
 * 校验所有已注册技能，返回健康报告。
 */
export function doctorSkills(): SkillHealth[] {
  const ids = skillRegistry.getAllSkills().map((s) => s.definition.id);
  const results: SkillHealth[] = [];
  for (const id of ids) {
    try {
      const health = checkSkillHealth(id);
      const audit = auditSkillSecurity(id);
      if (audit.found) health.securityRisk = audit.riskLevel;
      results.push(health);
    } catch (e) {
      results.push({
        id,
        name: id,
        source: 'builtin',
        enabled: true,
        healthy: false,
        issues: [`健康检查异常: ${(e as Error).message}`],
      });
    }
  }
  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
}

/**
 * 聚合「可用列表 + 健康 + 安全」为统一生命周期状态。
 */
export function getSkillLifecycleStatus(): LifecycleStatus {
  const available = listAvailableSkills(true);
  const availableById = new Map(available.map((s) => [s.id, s]));
  const healthList = doctorSkills();
  const healthById = new Map(healthList.map((h) => [h.id, h]));

  const skills: SkillHealth[] = healthList.map((h) => {
    const avail = availableById.get(h.id);
    return {
      ...h,
      enabled: avail ? !avail.disabled : h.enabled,
    };
  });

  const total = skills.length;
  const enabled = skills.filter((s) => s.enabled).length;
  const disabled = total - enabled;
  const healthy = skills.filter((s) => s.healthy).length;
  const unhealthy = total - healthy;

  return { total, enabled, disabled, healthy, unhealthy, skills };
}

/**
 * 热刷新：清空注册表并重新扫描三级目录。
 * 等价于 openclaw 的 reload，无需重启进程即可拾取新增/修改的技能。
 *
 * @returns 重新加载的统计
 */
export async function reloadSkills(): Promise<{ loaded: number; dirs: number }> {
  try {
    await resetSkillRuntime();
    const res = await initSkillRuntime();
    logger.info(`[SkillLifecycle] 技能热刷新完成：装入 ${res.loaded} 个，扫描 ${res.dirs} 个目录`);
    return res;
  } catch (e) {
    logger.error(`[SkillLifecycle] 热刷新失败: ${(e as Error).message}`);
    throw e;
  }
}

/**
 * 启用 / 禁用技能，并持久化到 .skills-disabled.json。
 *
 * @param id 技能 ID
 * @param enabled true=启用，false=禁用
 */
export function setSkillEnabled(id: string, enabled: boolean): { success: boolean; disabled: boolean } {
  if (!skillRegistry.getSkill(id)) {
    return { success: false, disabled: !enabled };
  }
  setSkillDisabled(id, !enabled);
  logger.info(`[SkillLifecycle] 技能 '${id}' 已${enabled ? '启用' : '禁用'}`);
  return { success: true, disabled: !enabled };
}

export const skillLifecycle = {
  doctorSkills,
  getSkillLifecycleStatus,
  reloadSkills,
  setSkillEnabled,
};
