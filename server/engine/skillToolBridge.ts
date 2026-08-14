/**
 * Skill Tool Bridge — 技能工具桥接层
 *
 * 将技能转换为可执行工具，供 AI Agent 调用。
 */

import { logger } from '../logger.js';
import { skillRegistry } from './skillRegistry.js';
import { createSkillContext } from './skillContextFactory.js';
import { performSecurityChecks } from './skillSecurityGuard.js';
import { getBuiltinPatches } from '../dao/skills.js';
import type { RegisteredSkill, SkillContext, SkillResult } from '../types/skill-runtime.js';
import type { ToolDefinition } from '../aiClient.js';

/**
 * 拉取当前 builtin status patches，供工具桥接层判断某技能是否被用户停用
 * 被打 patch=available 的技能即使已在 skillRegistry 注册，也不会出现在 AI 工具列表/不可被执行
 */
function getDisabledBuiltinSkillIds(): Set<string> {
  try {
    const patches = getBuiltinPatches();
    const disabled = new Set<string>();
    for (const [id, status] of Object.entries(patches)) {
      if (status === 'available') disabled.add(id);
    }
    return disabled;
  } catch {
    return new Set();
  }
}

const SKILL_TOOL_PREFIX = 'skill_';

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  skillId: string;
  params: Record<string, any>;
  sessionId?: string;
  agentId?: string;
  workspace?: string;
}

/**
 * 工具调用响应
 */
export interface ToolCallResponse {
  success: boolean;
  data?: any;
  error?: string;
  content?: string;
  metadata?: Record<string, any>;
}

/**
 * OpenAI 工具定义格式
 */
export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/**
 * 将技能转换为工具定义列表
 *
 * R2b-3：除 skillRegistry 内部 state 外，额外应用 builtin status patches —
 *        被用户手动停用（patch=available）的内置技能不出现在 AI 工具列表里。
 *
 * @param skills - 技能列表（可选，默认全部已注册技能）
 * @returns OpenAI 工具定义列表
 */
export function getSkillToolDefinitions(skills?: RegisteredSkill[] | { allow?: string[]; deny?: string[]; elevated?: { enabled?: string } }): OpenAIToolDefinition[] {
  const disabledBuiltinIds = getDisabledBuiltinSkillIds();
  const isRunnableState = (s: RegisteredSkill) =>
    (s.state === 'enabled' || s.state === 'active' || s.state === 'idle') &&
    !disabledBuiltinIds.has(s.definition.id);

  if (!skills || Array.isArray(skills)) {
    const targetSkills = skills ?? skillRegistry.getAllSkills();

    return targetSkills
      .filter(isRunnableState)
      .map((s) => ({
        type: 'function' as const,
        function: {
          name: `${SKILL_TOOL_PREFIX}${s.definition.id.replace(/-/g, '_')}`,
          description: s.definition.description || s.definition.name,
          parameters: s.definition.parameters || {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      }));
  }
  
  const targetSkills = skillRegistry.getAllSkills();
  return targetSkills
    .filter(isRunnableState)
    .map((s) => ({
      type: 'function' as const,
      function: {
        name: `${SKILL_TOOL_PREFIX}${s.definition.id.replace(/-/g, '_')}`,
        description: s.definition.description || s.definition.name,
        parameters: s.definition.parameters || {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    }));
}

/**
 * 执行技能工具调用
 *
 * @param request - 工具调用请求
 * @returns 工具调用响应
 */
export async function handleSkillToolCall(request: ToolCallRequest | { id: string; type: string; function: { name: string; arguments: string } }, skillConfig?: { allow?: string[]; deny?: string[]; elevated?: { enabled?: string } }, sessionId?: string, extraSkillExecutor?: (id: string, params: Record<string, any>, ctx?: SkillContext) => Promise<SkillResult>): Promise<ToolCallResponse> {
  let skillId: string;
  let params: Record<string, any> = {};
  
  if ('skillId' in request) {
    skillId = request.skillId;
    params = request.params;
  } else {
    skillId = request.function.name.replace(SKILL_TOOL_PREFIX, '').replace(/_/g, '-');
    try {
      params = typeof request.function.arguments === 'string' ? JSON.parse(request.function.arguments) : request.function.arguments;
    } catch {
      params = {};
    }
  }

  try {
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) {
      // 全局注册表未命中 —— 回退到数字员工物化技能执行器（per-call 注入）
      if (extraSkillExecutor) {
        const ctx = createSkillContext({
          skillId,
          sessionId: sessionId || skillId,
          agentId: 'staff',
          workspace: process.cwd(),
        });
        const result = await extraSkillExecutor(skillId, params, ctx);
        return {
          success: result.success,
          data: result.data,
          content: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
          error: result.error,
          metadata: result.metadata,
        };
      }
      return {
        success: false,
        error: `技能 '${skillId}' 未找到`,
      };
    }

    if (skill.state !== 'enabled' && skill.state !== 'active' && skill.state !== 'idle') {
      return {
        success: false,
        error: `技能 '${skillId}' 当前状态不可执行: ${skill.state}`,
      };
    }

    // R2b-3：技能执行前再次核对 builtin status patches — 用户已停用（patch=available）的技能拒绝执行
    const disabledBuiltinIds = getDisabledBuiltinSkillIds();
    if (disabledBuiltinIds.has(skillId)) {
      logger.info(`[SkillToolBridge] 拒绝执行已停用技能: ${skillId}`);
      return {
        success: false,
        error: `技能 '${skill.definition.name || skillId}' 已被用户停用，如需使用请到「技能 → 内置」页面启用`,
      };
    }

    const ctx = createSkillContext({
      skillId,
      sessionId: sessionId || skillId,
      agentId: 'unknown',
      workspace: process.cwd(),
    });

    const config = skillConfig || { allow: [], deny: [], elevated: { enabled: 'auto' } };
    const securityCheck = await performSecurityChecks(skill.definition, params, { 
      allow: config.allow || [], 
      deny: config.deny || [], 
      elevated: { enabled: (config.elevated?.enabled || 'auto') as 'auto' | 'ask' | 'deny' } 
    }, ctx);
    if (!securityCheck.allowed) {
      return {
        success: false,
        error: `技能安全检查未通过：${securityCheck.reason}`,
        metadata: { security: securityCheck },
      };
    }

    const result = await skill.lifecycle.execute(params, ctx);

    return {
      success: result.success,
      data: result.data,
      content: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
      error: result.error,
      metadata: result.metadata,
    };
  } catch (e) {
    logger.error(`[SkillToolBridge] handleSkillToolCall error for '${skillId}':`, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 判断工具名称是否为技能工具
 *
 * @param toolName - 工具名称
 * @returns 是否为技能工具
 */
export function isSkillToolName(toolName: string): boolean {
  return typeof toolName === 'string' && toolName.startsWith(SKILL_TOOL_PREFIX);
}

/**
 * 从 Skill Tool name 提取 skill id
 *
 * @param toolName - 工具名称（如 `skill_fs_read`）
 * @returns skill id（如 `fs_read`），如果不是 Skill Tool 则返回 null
 */
export function extractSkillId(toolName: string): string | null {
  if (!isSkillToolName(toolName)) {
    return null;
  }
  return toolName.slice(SKILL_TOOL_PREFIX.length);
}

export const skillToolBridge = {
  getSkillToolDefinitions,
  handleSkillToolCall,
  isSkillToolName,
  extractSkillId,
};