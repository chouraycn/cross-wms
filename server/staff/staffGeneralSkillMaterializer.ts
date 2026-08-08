/**
 * 数字员工「通用技能」物化器。
 *
 * 数字员工的通用技能（sd_general_skills）以 markdown（SKILL.md 形态）存储，未注册进
 * 主程序的 skillRegistry 全局单例，因此员工聊天执行时无法真正运行（原 `/:slug/run` 是 stub）。
 *
 * 本模块在员工会话启动时，把该租户下 `published` 的通用技能**物化**为引擎可识别的
 * `SkillDefinition[]`，并提供一个 `executor`：分发时若全局 skillRegistry 未命中，
 * 则回退到这里执行——做到「接真执行」而不污染全局单例（强隔离）。
 *
 * 执行语义（与主程序声明式 skill 一致，见 skillRegistry.createDeclarativeHandler）：
 * - 无 `__adapter` 时，默认把 markdown 指令作为 prompt 文本回传模型，由模型遵循其
 *   已有工具（builtin/mcp）去干活；
 * - runtime_config 中声明 `parameters` 时，作为工具入参 schema，模型可主动以
 *   `skill_<id>` 形式调用。
 */

import type { SkillDefinition, SkillContext, SkillResult } from '../types/skill-runtime.js';
import { createSkillContext } from '../engine/skillContextFactory.js';
import type { GeneralSkillRow } from '../types/staff.js';
import * as generalSkillDao from '../dao/staff/staffGeneralSkillDao.js';
import { logger } from '../logger.js';

/** 物化结果：技能定义列表 + 执行器（供 per-call 注入执行链路） */
export interface MaterializedGeneralSkills {
  definitions: SkillDefinition[];
  executor: (id: string, params: Record<string, any>, ctx?: SkillContext) => Promise<SkillResult>;
}

/** 从 markdown 提取指令块（简化：整体作为单条指令；非空才有效） */
function extractInstructionBlocks(markdown: string): string[] {
  const text = (markdown || '').trim();
  return text ? [text] : [];
}

function safeParseJson(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/** 将一条 published 通用技能行物化为 SkillDefinition（id 加租户命名空间防撞） */
function toSkillDefinition(row: GeneralSkillRow, tenantId: string): SkillDefinition {
  // id 形如 staff-${tenant}-${slug}（可能同时含 '-' 与 '_'）。工具名/还原不再用字符
  // 替换，而是由 skillToolBridge.encodeSkillIdToToolName 对整段 id 做 base64url 编码
  // （带 '_S_' 边界哨兵），还原端 decodeToolNameToSkillId 精确取回，完全可逆，不再受
  // slug 是否含 '-'/'_' 影响。
  const id = `staff-${tenantId}-${row.slug}`;
  const markdown = row.skill_markdown || '';
  const runtimeConfig = safeParseJson(row.runtime_config_json as string);
  return {
    id,
    name: row.name,
    description: row.description ?? row.name,
    group: 'wms',
    source: 'user',
    skillMdContent: markdown,
    instructionBlocks: extractInstructionBlocks(markdown),
    parameters: (runtimeConfig.parameters as Record<string, any>) ?? {
      type: 'object',
      properties: {},
      required: [],
    },
    userInvocable: true,
    native: false,
  };
}

/** 声明式执行：默认把 markdown 指令作为 prompt 文本回传，由模型消费后使用其已有工具执行 */
function runDeclarative(def: SkillDefinition, params: Record<string, any>): SkillResult {
  const instructions = def.instructionBlocks ?? [];
  if (instructions.length === 0) {
    return { success: false, error: '通用技能无指令内容', metadata: { durationMs: 0 } };
  }
  return {
    success: true,
    data: { type: 'prompt', instructions, params },
    metadata: { durationMs: 0 },
  };
}

/**
 * 物化某租户下所有 published 的通用技能。
 * 若没有任何 published 技能，返回空 definitions + 恒返回「未找到」的 executor（调用方仍注入无害）。
 */
export function materializeGeneralSkills(tenantId: string): MaterializedGeneralSkills {
  const rows = generalSkillDao
    .listGeneralSkills({ tenantId, status: 'published' })
    .filter((r) => (r.skill_markdown || '').trim().length > 0);

  const definitions: SkillDefinition[] = rows.map((r) => toSkillDefinition(r, tenantId));
  const byId = new Map(definitions.map((d) => [d.id, d]));

  const executor = async (
    id: string,
    params: Record<string, any>,
    ctx?: SkillContext,
  ): Promise<SkillResult> => {
    const def = byId.get(id);
    if (!def) {
      return { success: false, error: `通用技能 '${id}' 未找到` };
    }
    const skillCtx =
      ctx ??
      createSkillContext({
        skillId: id,
        sessionId: id,
        agentId: 'staff',
        workspace: process.cwd(),
      });
    logger.debug(`[StaffSkill] 执行物化通用技能: ${id}`);
    return runDeclarative(def, params);
  };

  return { definitions, executor };
}
