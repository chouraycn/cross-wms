/**
 * Skill Tool Bridge — Skill <-> Tool Calling 桥接层（`skill_<id>` 逐技能入口）
 *
 * 将**每个**可执行 Skill 注册为一个独立的 OpenAI Tool Calling 函数（`skill_<id>`），
 * 使 Agent ReAct 循环可以像调用普通函数工具一样直接调用 Skill。
 *
 * 命名规范：
 * - Skill Tool:  `skill_<id>`（如 `skill_fs_read`, `skill_calc`）
 * - MCP Tool:    `mcp__<server>__<tool>`（现有格式）
 * - Builtin Tool: 直接使用原名（如 `read_file`, `execute_command`）
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 技能系统双入口边界（务必先读，避免与 skillRuntimeBridge 混淆）              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ 本项目技能对 Agent 有两条并存的暴露路径，分工如下：                        │
 * │                                                                           │
 * │ 1) skillToolBridge（本文件）——「逐技能函数工具」入口                       │
 * │    • 形态：每个技能 = 一个 `skill_<id>` 函数工具，参数即技能入参。          │
 * │    • 适用：**带可执行 handler** 的技能（skillRegistry 中有 handler 的项）。 │
 * │    • 接线：当前仅被 toolExecutor.ts 使用                                    │
 * │      （getSkillToolDefinitions 注入工具列表 + handleSkillToolCall 分发）。  │
 * │                                                                           │
 * │ 2) skillRuntimeBridge——「单一元工具」入口（渐进式披露）                     │
 * │    • 形态：全部技能共用一个 `skill` 元工具（list / use 两个动作）。         │
 * │    • 适用：**声明式 SKILL.md 文档**技能（openclaw/业务 34 个），            │
 * │      它们是指令文档而非可执行函数，逐个注册会撑爆工具列表且调用即报错。     │
 * │    • 接线：toolRegistry(注册 skill 元工具) / skillRouter /                 │
 * │      skillLifecycle / matchingService —— 是当前的主力/权威路径。           │
 * │                                                                           │
 * │ 选择规则：技能有真实可执行 handler → skill_<id>（本文件）；                 │
 * │           技能是 SKILL.md 指令文档 → skill 元工具（skillRuntimeBridge）。   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 使用方式：
 *   // 获取 Skill Tool 定义（添加到 tools 列表）
 *   const skillTools = getSkillToolDefinitions(permissionConfig);
 *
 *   // 处理 Tool Call 请求
 *   const result = await handleSkillToolCall(toolCall, permissionConfig, sessionId);
 */

import { skillRegistry } from './skillRegistry.js';
import { performSecurityChecks } from './skillSecurityGuard.js';
import { createSkillContext } from './skillContextFactory.js';
import { isMcpToolName } from './mcpTypes.js';
import { mcpClientManager } from './mcpClientManager.js';
import { logger } from '../logger.js';
import type { SkillPermissionConfig } from '../types/skill-runtime.js';

// ===================== 常量 =====================

/** Skill Tool 名称前缀 */
const SKILL_TOOL_PREFIX = 'skill_';

// ===================== 类型定义 =====================

/** OpenAI Tool Call 格式 */
export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Tool Call 响应格式 */
export interface ToolCallResponse {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/** OpenAI Tool 定义格式 */
export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ===================== Skill Tool 定义转换 =====================

/**
 * 将允许的 Skill 转换为 OpenAI Tool 定义格式
 *
 * 仅包含通过权限过滤的 Skill，命名格式为 `skill_<id>`。
 * 用于在 Agent ReAct 循环中将 Skill 作为 Tool Calling 目标。
 *
 * @param permissionConfig - 权限配置
 * @returns OpenAI Tool 定义数组
 */
export function getSkillToolDefinitions(
  permissionConfig: SkillPermissionConfig,
): OpenAIToolDefinition[] {
  // 获取权限过滤后的 Skill 列表
  const allowedSkills = skillRegistry.getSkillsForAgent(permissionConfig);

  return allowedSkills.map((skill) => ({
    type: 'function' as const,
    function: {
      name: `${SKILL_TOOL_PREFIX}${skill.definition.id}`,
      description: buildToolDescription(skill.definition),
      parameters: skill.definition.parameters || {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  }));
}

/**
 * 构建 Tool Description
 *
 * 在 Skill 原始描述基础上追加元信息，帮助 LLM 理解 Skill 的能力范围。
 */
function buildToolDescription(definition: {
  description: string;
  name: string;
  group: string;
  version?: string;
  tags?: string[];
}): string {
  const parts: string[] = [];

  // 主描述
  parts.push(definition.description || definition.name);

  // 追加权限分组信息
  parts.push(`[group: ${definition.group}]`);

  // 追加版本（如果有）
  if (definition.version) {
    parts.push(`[v${definition.version}]`);
  }

  // 追加标签（如果有）
  if (definition.tags && definition.tags.length > 0) {
    parts.push(`[tags: ${definition.tags.join(', ')}]`);
  }

  return parts.join(' ');
}

// ===================== Tool Call 分发处理 =====================

/**
 * 处理 Tool Call 请求（统一分发入口）
 *
 * 根据 tool name 前缀判断调用目标：
 * - `skill_*` → 调用 skillRegistry.executeSkill()（含三层安全校验）
 * - `mcp__*` → 转发到 MCP Client（现有逻辑）
 * - 其他 → 返回未找到提示（由上层 toolExecutor 转发到 toolRegistry）
 *
 * @param toolCall - Tool Call 请求
 * @param permissionConfig - 权限配置
 * @param sessionId - 会话 ID
 * @param agentId - Agent ID（可选）
 * @returns Tool Call 响应
 */
export async function handleSkillToolCall(
  toolCall: ToolCallRequest,
  permissionConfig: SkillPermissionConfig,
  sessionId: string,
  agentId?: string,
): Promise<ToolCallResponse> {
  const { id: toolCallId, function: { name: toolName, arguments: argsStr } } = toolCall;

  // 解析参数
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(argsStr);
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      params = {};
    }
  } catch {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({
        error: `参数 JSON 解析失败: ${argsStr.substring(0, 200)}`,
      }),
    };
  }

  // 1. Skill Tool 调用
  if (toolName.startsWith(SKILL_TOOL_PREFIX)) {
    return handleSkillExecution(toolName, params, toolCallId, permissionConfig, sessionId, agentId);
  }

  // 2. MCP Tool 转发
  if (isMcpToolName(toolName)) {
    return handleMcpForward(toolName, params, toolCallId);
  }

  // 3. 非 Skill/MCP Tool，返回未处理提示
  //    上层 toolExecutor 会继续转发到 toolRegistry
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify({
      _bridge: 'unhandled',
      message: `Tool '${toolName}' 不是 Skill 或 MCP 工具，需由 toolRegistry 处理`,
    }),
  };
}

// ===================== Skill 执行处理 =====================

/**
 * 处理 Skill Tool 执行
 *
 * 流程：
 * 1. 从 tool name 提取 skill id
 * 2. 从注册表获取 skill 定义
 * 3. 创建 SkillContext
 * 4. 执行三层安全校验
 * 5. 调用 skillRegistry.executeSkill()
 * 6. 格式化结果为 Tool Call 响应
 */
async function handleSkillExecution(
  toolName: string,
  params: Record<string, unknown>,
  toolCallId: string,
  permissionConfig: SkillPermissionConfig,
  sessionId: string,
  agentId?: string,
): Promise<ToolCallResponse> {
  // 提取 skill id
  const skillId = toolName.slice(SKILL_TOOL_PREFIX.length);

  // 获取 skill
  const registered = skillRegistry.getSkill(skillId);
  if (!registered) {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({
        error: `Skill '${skillId}' 未注册或不存在`,
      }),
    };
  }

  // 创建执行上下文
  const ctx = createSkillContext({
    skillId,
    sessionId,
    agentId,
    workspace: registered.definition.sourcePath || process.cwd(),
    sandboxScope: registered.definition.sandboxScope,
  });

  // 三层安全校验
  const securityResult = await performSecurityChecks(
    registered.definition,
    params,
    permissionConfig,
    ctx,
  );

  if (!securityResult.allowed) {
    logger.warn(`[SkillToolBridge] Skill '${skillId}' 安全校验失败: ${securityResult.reason}`);

    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({
        error: `Skill 执行被安全拦截: ${securityResult.reason}`,
        securityChecks: {
          permission: securityResult.checks.permission.passed,
          sandbox: securityResult.checks.sandbox.passed,
          params: securityResult.checks.params.passed,
        },
      }),
    };
  }

  // 执行 Skill
  logger.debug(`[SkillToolBridge] Executing skill '${skillId}' (toolCall: ${toolCallId})`);

  const startTime = Date.now();
  try {
    const result = await skillRegistry.executeSkill(skillId, params, ctx);
    const duration = Date.now() - startTime;

    if (result.success) {
      logger.debug(`[SkillToolBridge] Skill '${skillId}' 执行成功 (${duration}ms)`);

      return {
        role: 'tool',
        tool_call_id: toolCallId,
        content: formatSuccessResult(result),
      };
    } else {
      logger.warn(`[SkillToolBridge] Skill '${skillId}' 执行失败 (${duration}ms): ${result.error}`);

      return {
        role: 'tool',
        tool_call_id: toolCallId,
        content: JSON.stringify({
          error: result.error || 'Skill 执行失败',
          durationMs: duration,
          metadata: result.metadata,
        }),
      };
    }
  } catch (e) {
    const duration = Date.now() - startTime;
    const errorMsg = e instanceof Error ? e.message : String(e);

    logger.error(`[SkillToolBridge] Skill '${skillId}' 执行异常 (${duration}ms):`, e);

    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({
        error: `Skill 执行异常: ${errorMsg}`,
        durationMs: duration,
      }),
    };
  }
}

// ===================== MCP 转发处理 =====================

/**
 * 转发 MCP Tool 调用
 *
 * 将 MCP 工具调用转发到 mcpClientManager，保持与 toolExecutor 现有逻辑一致。
 */
async function handleMcpForward(
  toolName: string,
  params: Record<string, unknown>,
  toolCallId: string,
): Promise<ToolCallResponse> {
  try {
    const result = await mcpClientManager.executeMcpTool(toolName, params);
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: result,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({
        error: `MCP 工具执行失败: ${errorMsg}`,
      }),
    };
  }
}

// ===================== 结果格式化 =====================

/**
 * 格式化 Skill 成功结果为 Tool Call 响应内容
 *
 * 将 SkillResult.data 序列化为 JSON 字符串，确保内容可被 LLM 消费。
 */
function formatSuccessResult(result: { data?: unknown; metadata?: Record<string, unknown> }): string {
  if (result.data === undefined || result.data === null) {
    return JSON.stringify({ success: true, data: null, metadata: result.metadata });
  }

  // 如果 data 已经是字符串，直接返回
  if (typeof result.data === 'string') {
    return result.data;
  }

  // 否则序列化为 JSON
  try {
    return JSON.stringify({
      success: true,
      data: result.data,
      metadata: result.metadata,
    });
  } catch {
    // 序列化失败时返回字符串化
    return String(result.data);
  }
}

// ===================== 辅助函数 =====================

/**
 * 判断 tool name 是否为 Skill Tool
 *
 * @param toolName - 工具名称
 * @returns 是否为 Skill Tool
 */
export function isSkillToolName(toolName: string): boolean {
  return toolName.startsWith(SKILL_TOOL_PREFIX);
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
