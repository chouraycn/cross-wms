/**
 * Tool Planner — 确定性工具规划器
 *
 * 参考 OpenClaw src/tools/planner.ts 设计。
 * 核心思想：fail loud on contract violation, fail soft on availability。
 * - 契约违反（duplicate name / missing executor）→ 抛错
 * - 可用性失败 → 静默进 hidden（带诊断信息）
 */

import type {
  ToolDescriptor,
  ToolPlan,
  ToolPlanEntry,
  HiddenToolPlanEntry,
  ToolAvailabilityExpression,
  ToolAvailabilitySignal,
  ToolUnavailableReason,
  ToolExecutorRef,
  ToolPlanContractError,
} from './types.js';

// ===================== 契约错误 =====================

/** 创建工具规划契约错误 */
export function createToolPlanContractError(error: ToolPlanContractError): Error {
  const message = error.code === 'duplicate-tool-name'
    ? `[ToolPlan] 重复的工具名称: "${error.name}"`
    : `[ToolPlan] 可见工具缺少执行器: "${error.name}"`;
  const err = new Error(message);
  Object.assign(err, { __toolPlanContractError: error });
  return err;
}

/** 判断是否为工具规划契约错误 */
export function isToolPlanContractError(err: unknown): err is { __toolPlanContractError: ToolPlanContractError } {
  return err instanceof Error && '__toolPlanContractError' in err;
}

// ===================== 确定性排序 =====================

/**
 * 比较两个工具描述符 — 确定性排序
 * 优先按 sortKey（省略时用 name），再按 name
 */
function compareDescriptors(a: ToolDescriptor, b: ToolDescriptor): number {
  const sortKeyA = a.sortKey ?? a.name;
  const sortKeyB = b.sortKey ?? b.name;
  const cmp = sortKeyA.localeCompare(sortKeyB);
  if (cmp !== 0) return cmp;
  return a.name.localeCompare(b.name);
}

// ===================== 唯一名校验 =====================

/** 断言工具名称唯一 */
function assertUniqueNames(descriptors: ToolDescriptor[]): void {
  const seen = new Set<string>();
  for (const desc of descriptors) {
    if (seen.has(desc.name)) {
      throw createToolPlanContractError({ code: 'duplicate-tool-name', name: desc.name });
    }
    seen.add(desc.name);
  }
}

// ===================== 可用性评估 =====================

/**
 * 评估单个可用性信号
 * 返回 diagnostics 数组（空 = 可用）
 */
function evaluateSignal(
  signal: ToolAvailabilitySignal,
  context: ToolPlanContext
): ToolUnavailableReason[] {
  switch (signal.kind) {
    case 'always':
      return [];

    case 'auth': {
      if (!context.authProviders?.has(signal.providerId)) {
        return [{ code: 'auth-missing', providerId: signal.providerId }];
      }
      return [];
    }

    case 'config': {
      const value = context.configValues?.[signal.path];
      const check = signal.check ?? 'exists';
      if (check === 'exists' && value == null) {
        return [{ code: 'config-missing', path: signal.path }];
      }
      if (check === 'non-empty' && (value == null || value === '' || value === false)) {
        return [{ code: 'config-missing', path: signal.path }];
      }
      if (check === 'available' && !value) {
        return [{ code: 'config-missing', path: signal.path }];
      }
      return [];
    }

    case 'env': {
      if (!process.env[signal.name]) {
        return [{ code: 'env-missing', name: signal.name }];
      }
      return [];
    }

    case 'plugin-enabled': {
      if (!context.enabledPlugins?.has(signal.pluginId)) {
        return [{ code: 'plugin-disabled', pluginId: signal.pluginId }];
      }
      return [];
    }

    case 'context': {
      const actual = context.contextValues?.[signal.key];
      if (signal.equals !== undefined) {
        if (actual !== signal.equals) {
          return [{ code: 'context-mismatch', key: signal.key, expected: signal.equals, actual: actual != null ? String(actual) : undefined }];
        }
      } else if (actual == null) {
        return [{ code: 'context-mismatch', key: signal.key }];
      }
      return [];
    }

    default: {
      // exhaustiveness 检查
      const _exhaustive: never = signal;
      return [{ code: 'unsupported-signal', kind: String((_exhaustive as Record<string, unknown>).kind) }];
    }
  }
}

/**
 * 评估可用性表达式（支持嵌套 AND/OR）
 * 返回 diagnostics 迭代器
 */
export function evaluateToolAvailability(
  expr: ToolAvailabilityExpression | undefined,
  context: ToolPlanContext
): ToolUnavailableReason[] {
  if (!expr) return [];

  // 单个 signal
  if ('kind' in expr) {
    return evaluateSignal(expr, context);
  }

  // allOf — 所有条件必须满足（合并所有 diagnostics）
  if ('allOf' in expr) {
    const results: ToolUnavailableReason[] = [];
    for (const child of expr.allOf) {
      results.push(...evaluateToolAvailability(child, context));
    }
    return results;
  }

  // anyOf — 任一条件满足即可（无 diagnostics = 可用）
  if ('anyOf' in expr) {
    for (const child of expr.anyOf) {
      const diags = evaluateToolAvailability(child, context);
      if (diags.length === 0) return [];
    }
    // 所有分支都不可用，返回最后一个的 diagnostics
    let lastDiags: ToolUnavailableReason[] = [];
    for (const child of expr.anyOf) {
      lastDiags = evaluateToolAvailability(child, context);
    }
    return lastDiags;
  }

  return [];
}

// ===================== 规划上下文 =====================

/**
 * 工具规划上下文 — 提供可用性评估所需的运行时信息
 */
export interface ToolPlanContext {
  /** 已认证的 provider ID 集合 */
  authProviders?: Set<string>;
  /** 已启用的插件 ID 集合 */
  enabledPlugins?: Set<string>;
  /** 配置值（按路径索引） */
  configValues?: Record<string, unknown>;
  /** 上下文值（运行时状态） */
  contextValues?: Record<string, unknown>;
}

// ===================== 核心规划器 =====================

/**
 * 构建工具规划 — 确定性排序 + 唯一名校验 + 可用性评估
 *
 * @param descriptors 工具描述符列表
 * @param context 规划上下文（可用性评估所需）
 * @returns ToolPlan（visible + hidden 双列表）
 * @throws ToolPlanContractError 契约违反时（重复名/缺少执行器）
 */
export function buildToolPlan(
  descriptors: ToolDescriptor[],
  context: ToolPlanContext = {}
): ToolPlan {
  // 1. 确定性排序
  const sorted = [...descriptors].sort(compareDescriptors);

  // 2. 唯一名校验
  assertUniqueNames(sorted);

  const visible: ToolPlanEntry[] = [];
  const hidden: HiddenToolPlanEntry[] = [];

  for (const desc of sorted) {
    // 3. 评估可用性
    const diagnostics = evaluateToolAvailability(desc.availability, context);

    if (diagnostics.length > 0) {
      // 不可用 → 进 hidden（带诊断）
      hidden.push({ descriptor: desc, diagnostics });
    } else if (!desc.executor) {
      // 可用但无执行器 → 契约违反
      throw createToolPlanContractError({ code: 'missing-executor', name: desc.name });
    } else {
      // 可用且有执行器 → 进 visible
      visible.push({ descriptor: desc, executor: desc.executor });
    }
  }

  return { visible, hidden };
}

// ===================== 执行器引用格式化 =====================

/**
 * 格式化工具执行器引用 — 用于诊断/日志
 * 注意：格式化字符串仅用于诊断，不应成为解析契约
 */
export function formatToolExecutorRef(ref: ToolExecutorRef): string {
  switch (ref.kind) {
    case 'core':
      return `core:${ref.executorId}`;
    case 'plugin':
      return `plugin:${ref.pluginId}:${ref.toolName}`;
    case 'channel':
      return `channel:${ref.channelId}:${ref.actionId}`;
    case 'mcp':
      return `mcp:${ref.serverId}:${ref.toolName}`;
    default: {
      // exhaustiveness 检查
      const _exhaustive: never = ref;
      return String(_exhaustive);
    }
  }
}
