/**
 * Goal Tools - 目标工具集
 *
 * 提供创建、获取、更新目标的工具，用于 AI Agent 管理会话目标
 * 参考 OpenClaw 的 goal-tools.ts 实现
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import {
  createGoal,
  getGoal,
  updateGoalStatus,
  formatGoalStatus,
} from './goalStore.js';
import { MODEL_UPDATABLE_GOAL_STATUSES, type GoalStatus } from './goalTypes.js';

/**
 * 工具选项（用于传入 sessionKey）
 */
export type GoalToolOptions = {
  sessionKey?: string;
};

/**
 * 解析 sessionKey（如果未提供，使用默认值）
 */
function resolveSessionKey(options: GoalToolOptions): string {
  const sessionKey = options.sessionKey?.trim();
  if (!sessionKey) {
    throw new Error('sessionKey 必需');
  }
  return sessionKey;
}

/**
 * JSON 结果格式化
 */
function jsonResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ===================== 工具定义 =====================

/**
 * 创建目标工具定义
 */
export function getCreateGoalToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'goal_create',
      description: '创建会话目标。仅在用户或系统明确请求时创建。如果目标已存在则失败。',
      parameters: {
        type: 'object',
        properties: {
          objective: {
            type: 'string',
            description: '要追求的具体目标描述',
          },
          token_budget: {
            type: 'number',
            description: '可选的 token 预算（正整数）',
          },
        },
        required: ['objective'],
      },
    },
  };
}

/**
 * 创建目标工具处理器
 */
export function createCreateGoalToolHandler(options: GoalToolOptions): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const sessionKey = resolveSessionKey(options);
      const objective = args.objective as string;
      const tokenBudget = args.token_budget as number | undefined;

      const goal = createGoal({
        sessionKey,
        objective,
        tokenBudget,
      });

      return jsonResult({ status: 'created', goal });
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * 获取目标工具定义
 */
export function getGetGoalToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'goal_get',
      description: '获取当前会话的目标，包括状态和 token 使用情况。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  };
}

/**
 * 获取目标工具处理器
 */
export function createGetGoalToolHandler(options: GoalToolOptions): ToolHandler {
  return async (_args: Record<string, unknown>) => {
    try {
      const sessionKey = resolveSessionKey(options);
      const snapshot = getGoal({ sessionKey });
      return jsonResult(snapshot);
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * 更新目标工具定义
 */
export function getUpdateGoalToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'goal_update',
      description: '更新目标状态。仅在目标达成时标记为 complete，或在阻塞条件连续出现至少三次后标记为 blocked。不要用于普通困难或缺少润色。',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['complete', 'blocked'],
            description: '目标状态：complete（已完成）或 blocked（已阻塞）',
          },
          note: {
            type: 'string',
            description: '可选的状态备注',
          },
        },
        required: ['status'],
      },
    },
  };
}

/**
 * 更新目标工具处理器
 */
export function createUpdateGoalToolHandler(options: GoalToolOptions): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const sessionKey = resolveSessionKey(options);
      const status = args.status as string;
      const note = args.note as string | undefined;

      // 验证 status 为模型可更新的状态
      if (!MODEL_UPDATABLE_GOAL_STATUSES.includes(status as GoalStatus)) {
        return jsonResult({
          error: `status 必须为 ${MODEL_UPDATABLE_GOAL_STATUSES.join(', ')}`,
        });
      }

      const goal = updateGoalStatus({
        sessionKey,
        status: status as 'complete' | 'blocked',
        note,
      });

      return jsonResult({ status: 'updated', goal });
    } catch (e) {
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

// ===================== 工具集合导出 =====================

/**
 * 获取所有目标工具定义
 */
export function getGoalToolDefinitions(): ToolDefinition[] {
  return [
    getCreateGoalToolDefinition(),
    getGetGoalToolDefinition(),
    getUpdateGoalToolDefinition(),
  ];
}

/**
 * 获取所有目标工具处理器
 */
export function getGoalToolHandlers(options: GoalToolOptions): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('goal_create', createCreateGoalToolHandler(options));
  handlers.set('goal_get', createGetGoalToolHandler(options));
  handlers.set('goal_update', createUpdateGoalToolHandler(options));
  return handlers;
}

export const goalTools = {
  getCreateGoalToolDefinition,
  createCreateGoalToolHandler,
  getGetGoalToolDefinition,
  createGetGoalToolHandler,
  getUpdateGoalToolDefinition,
  createUpdateGoalToolHandler,
  getGoalToolDefinitions,
  getGoalToolHandlers,
};