/**
 * 数字员工「程序技能」执行门控
 *
 * 把数字员工工具目录里 tool_type='skill' 的启用状态，转换为主程序 skill 运行时
 * 的 SkillPermissionConfig（opt-in：仅已启用的程序技能可被模型调用）。
 *
 * 规则：
 *  - 工具目录中无任何 program-skill 工具 → 返回 null（不干预，沿用全局默认 allow:['*']，
 *    保持"从未配置过"的员工行为不变）
 *  - 有 program-skill 工具但全部禁用 → allow 设为不匹配任何技能的模式，等于全部拒绝
 *  - 有且部分启用 → allow 仅含已启用的 skillId
 */
import { DEFAULT_TENANT_ID } from '../db-staff.js';
import * as toolDao from '../dao/staff/staffToolDao.js';
import type { SkillPermissionConfig } from '../types/skill-runtime.js';

const NO_SKILL_PATTERN = '__no_program_skill_enabled__';

export function resolveStaffSkillPermissionConfig(
  tenantId: string = DEFAULT_TENANT_ID,
): SkillPermissionConfig | undefined {
  const tools = toolDao.listTools(tenantId).filter((t) => t.tool_type === 'skill');
  if (tools.length === 0) return undefined;

  const enabledIds: string[] = [];
  for (const t of tools) {
    if (t.enabled !== 1) continue;
    try {
      const config = JSON.parse(t.config_json || '{}') as Record<string, any>;
      const skillId = config.skillId;
      if (typeof skillId === 'string' && skillId) enabledIds.push(skillId);
    } catch {
      /* 忽略损坏的 config */
    }
  }

  return {
    allow: enabledIds.length > 0 ? enabledIds : [NO_SKILL_PATTERN],
    deny: [],
    elevated: { enabled: 'ask' },
  };
}
