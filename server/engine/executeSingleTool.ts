/**
 * executeSingleTool — 独立共享的「单工具执行内核」
 *
 * ## 背景
 * 项目里工具执行内核被复制了三份：
 * - `toolExecutor.ts`（Legacy / AGENT 路径，装了 auto/confirm/high-risk 审批）
 * - `actionPhaseExecutor.ts`（ReAct 路径，历史上跳过审批）
 * - `workflow/executor.ts`（工作流路径，历史上跳过审批）
 * 「审批只装一处」是长期存在的安全缺口。
 *
 * ## 本模块目的
 * 把「策略评估 → 审批阻塞 → 分发执行 → 审计记录」这四步收敛成一个**独立、可复用、
 * 无侵入**的函数 `executeSingleTool()`，供三条路径在各自方便时按需接入，从根上让审批
 * 在任意路径都能一致生效。
 *
 * ## 设计原则（务必遵守）
 * 1. **纯组合，不重造**：直接复用已有单例 —— `toolPolicyEngine` / `approvalManager` /
 *    `toolAuditLog` / `toolRegistry.executeToolCall` / `mcpClientManager.executeMcpTool`。
 * 2. **零侵入**：本模块**不 import** 任何在途 WIP 引擎文件
 *    （`toolExecutor` / `actionPhaseExecutor` / `workflow/executor`），也不被它们强依赖。
 *    是否接入、何时接入，完全由各路径自行决定，互不覆盖同事未提交的改动。
 * 3. **可注入**：分发执行器 / 审批等待 / 时钟均可通过 `overrides` 注入，便于单元测试
 *    与将来扩展（如插入 toolCallReviewer、超时/重试包装）。
 */

import type { ToolCall } from '../aiClient.js';
import toolPolicyEngine, {
  type ToolRiskLevel,
  type AcpApprovalClass,
} from './toolPolicyEngine.js';
import approvalManager, { type ApprovalRiskLevel } from './approvalManager.js';
import { toolAuditLog } from './toolAuditLog.js';
import { executeToolCall } from './toolRegistry.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName } from './mcpTypes.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 单工具执行上下文 */
export interface ExecuteSingleToolContext {
  /** 会话 ID（用于审批限流、审计关联） */
  sessionId?: string;
  /** 调用来源：builtin / mcp / plugin（用于策略评估上下文） */
  source?: 'builtin' | 'mcp' | 'plugin';
  /** 调用者标识（如 skill id、agent id） */
  callerId?: string;
  /** 用户 ID */
  userId?: string;
  /** 用户角色列表（用于条件策略匹配） */
  userRoles?: string[];
  /** 会话标签列表（用于条件策略匹配） */
  sessionTags?: string[];
  /** 取消信号（透传给分发执行器） */
  signal?: AbortSignal;
  /** 覆盖策略默认超时（毫秒）；不传则使用策略规则里的 timeoutMs */
  timeoutMs?: number;
  /**
   * 跳过审批阻塞。
   * 供「上层已经做过审批」的路径复用「执行 + 审计」两步，避免重复审批。
   * 注意：策略评估中的 `allowed=false`（如 ACP 禁止 / 速率超限 / 参数黑名单）
   * 仍会拦截，`skipApproval` 只跳过「需用户确认」这一步。
   */
  skipApproval?: boolean;
  /** 审批请求者标识（写入审批请求，便于溯源） */
  requester?: string;
}

/** 执行结局 */
export type ExecuteSingleToolOutcome =
  | 'success' // 工具正常执行完成
  | 'error' // 工具执行抛错 / 参数解析失败
  | 'blocked' // 被策略拦截（ACP 禁止 / 速率超限 / 参数黑名单 / 审批取消）
  | 'rejected' // 用户拒绝审批
  | 'timeout'; // 审批超时

/** 单工具执行结果 */
export interface ExecuteSingleToolResult {
  /** 执行结局 */
  outcome: ExecuteSingleToolOutcome;
  /**
   * 结果字符串：
   * - success：工具原始输出
   * - 其他：错误 / 拦截说明的 JSON 串（形如 `{"error":"..."}`），可直接回传给 LLM
   */
  result: string;
  /** 工具名 */
  toolName: string;
  /** 风险等级 */
  riskLevel: ToolRiskLevel;
  /** ACP 审批等级 */
  acpClass: AcpApprovalClass;
  /** 策略是否要求审批 */
  requireApproval: boolean;
  /** 端到端耗时（毫秒） */
  durationMs: number;
  /** blocked / rejected / timeout 时的说明 */
  reason?: string;
  /** 审批请求 ID（若触发了审批流程） */
  approvalId?: string;
}

/** 分发执行器：给定 toolCall + 已解析参数 + 上下文，返回工具输出字符串 */
export type ToolDispatcher = (
  toolCall: ToolCall,
  args: Record<string, unknown>,
  context: ExecuteSingleToolContext,
  timeoutMs: number,
) => Promise<string>;

/** 可注入依赖（用于测试与扩展） */
export interface ExecuteSingleToolOverrides {
  /** 自定义分发执行器（默认按 MCP / 内置自动路由） */
  dispatch?: ToolDispatcher;
  /** 自定义时钟（默认 Date.now） */
  now?: () => number;
  /**
   * 自定义审批等待器。默认走 approvalManager.createRequest + waitForApproval。
   * 返回最终审批状态。
   */
  waitForApproval?: (
    toolName: string,
    args: Record<string, unknown>,
    riskLevel: ApprovalRiskLevel,
    reason: string,
    context: ExecuteSingleToolContext,
  ) => Promise<{ status: 'approved' | 'rejected' | 'timeout' | 'cancelled'; approvalId: string }>;
}

// ===================== 常量 =====================

/** 分发默认超时（毫秒），与 toolRegistry 保持一致 */
const DEFAULT_DISPATCH_TIMEOUT_MS = 30_000;

/** 审计结果截断长度（与 toolAuditLog 内部一致，避免超大 payload） */
const AUDIT_RESULT_MAX = 500;

// ===================== 默认分发执行器 =====================

/**
 * 默认分发：MCP 工具走 mcpClientManager，内置工具走 toolRegistry。
 * 插件工具当前统一由内置注册表承载（skill/plugin 元工具已注册进 builtinRegistry）。
 */
const defaultDispatch: ToolDispatcher = async (toolCall, args, context, timeoutMs) => {
  const toolName = toolCall.function.name;
  if (isMcpToolName(toolName)) {
    return mcpClientManager.executeMcpTool(toolName, args, { signal: context.signal });
  }
  return executeToolCall(toolCall, timeoutMs);
};

// ===================== 默认审批等待器 =====================

const defaultWaitForApproval: NonNullable<ExecuteSingleToolOverrides['waitForApproval']> = async (
  toolName,
  args,
  riskLevel,
  reason,
  context,
) => {
  const request = approvalManager.createRequest(
    toolName,
    args,
    riskLevel,
    reason,
    context.sessionId,
    context.requester,
  );
  // 已被自动批准（auto_approve 模式 / 白名单）时立即返回
  if (request.status !== 'pending') {
    return { status: normalizeApprovalStatus(request.status), approvalId: request.id };
  }
  const final = await approvalManager.waitForApproval(request.id, context.timeoutMs);
  return { status: normalizeApprovalStatus(final.status), approvalId: request.id };
};

function normalizeApprovalStatus(
  status: string,
): 'approved' | 'rejected' | 'timeout' | 'cancelled' {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'timeout') return 'timeout';
  return 'cancelled';
}

// ===================== 核心函数 =====================

/**
 * 执行单个工具，内置四步安全链路：
 * 1. **策略评估** — `toolPolicyEngine.evaluateTool()`：风险分级 / ACP 分类 / 速率限制 /
 *    参数黑白名单 / 条件匹配。`allowed=false` 直接拦截。
 * 2. **审批阻塞** — 若策略要求审批且未 `skipApproval`：创建审批请求并**阻塞等待**用户
 *    批准；拒绝 / 超时 / 取消则不执行。
 * 3. **分发执行** — MCP → `mcpClientManager`，内置 → `toolRegistry.executeToolCall`。
 * 4. **审计记录** — `toolAuditLog.log()`：工具名 / 脱敏参数 / 截断结果 / 成功标记 / 耗时 /
 *    会话 ID。
 *
 * 全程不抛异常（分发层异常也被兜底为 `error` 结局），调用方可安全地把 `result` 直接
 * 回传给 LLM。
 *
 * @param toolCall - 工具调用（含 name + JSON 参数串）
 * @param context - 执行上下文
 * @param overrides - 可注入依赖（测试 / 扩展用）
 */
export async function executeSingleTool(
  toolCall: ToolCall,
  context: ExecuteSingleToolContext = {},
  overrides: ExecuteSingleToolOverrides = {},
): Promise<ExecuteSingleToolResult> {
  const now = overrides.now ?? Date.now;
  const dispatch = overrides.dispatch ?? defaultDispatch;
  const waitForApproval = overrides.waitForApproval ?? defaultWaitForApproval;

  const started = now();
  const toolName = toolCall.function.name;

  // ---- 参数解析 ----
  let args: Record<string, unknown> = {};
  try {
    args = toolCall.function.arguments
      ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
      : {};
  } catch {
    const reason = `工具参数解析失败: ${toolCall.function.arguments}`;
    const result = JSON.stringify({ error: reason });
    audit(toolName, {}, result, false, now() - started, context, 'parse_error');
    return {
      outcome: 'error',
      result,
      toolName,
      riskLevel: 'medium',
      acpClass: 'A3',
      requireApproval: false,
      durationMs: now() - started,
      reason,
    };
  }

  // ---- 1) 策略评估 ----
  const policy = toolPolicyEngine.evaluateTool(toolName, args, {
    source: context.source,
    callerId: context.callerId,
    sessionId: context.sessionId,
    userId: context.userId,
    userRoles: context.userRoles,
    sessionTags: context.sessionTags,
  });

  if (!policy.allowed) {
    const reason = policy.reason ?? `工具 '${toolName}' 被策略拒绝`;
    const result = JSON.stringify({ error: reason, deniedParams: policy.deniedParams });
    logger.warn(`[executeSingleTool] 策略拦截 ${toolName}: ${reason}`);
    audit(toolName, args, result, false, now() - started, context, 'policy_blocked');
    return {
      outcome: 'blocked',
      result,
      toolName,
      riskLevel: policy.riskLevel,
      acpClass: policy.acpClass,
      requireApproval: policy.requireApproval,
      durationMs: now() - started,
      reason,
    };
  }

  // ---- 2) 审批阻塞 ----
  let approvalId: string | undefined;
  if (policy.requireApproval && !context.skipApproval) {
    const reason =
      policy.matchedRule?.description ?? `工具 '${toolName}' 需要用户审批（${policy.acpClass}）`;
    try {
      const { status, approvalId: id } = await waitForApproval(
        toolName,
        args,
        policy.riskLevel,
        reason,
        context,
      );
      approvalId = id;
      if (status !== 'approved') {
        const outcome: ExecuteSingleToolOutcome =
          status === 'rejected' ? 'rejected' : status === 'timeout' ? 'timeout' : 'blocked';
        const blockReason =
          status === 'rejected'
            ? `用户拒绝执行工具 '${toolName}'`
            : status === 'timeout'
              ? `工具 '${toolName}' 审批超时`
              : `工具 '${toolName}' 审批被取消`;
        const result = JSON.stringify({ error: blockReason });
        audit(toolName, args, result, false, now() - started, context, `approval_${status}`);
        return {
          outcome,
          result,
          toolName,
          riskLevel: policy.riskLevel,
          acpClass: policy.acpClass,
          requireApproval: true,
          durationMs: now() - started,
          reason: blockReason,
          approvalId,
        };
      }
    } catch (err) {
      // 审批流程自身异常（如待审批超上限）：保守拦截，不执行
      const reasonMsg = `工具 '${toolName}' 审批流程异常: ${err instanceof Error ? err.message : String(err)}`;
      const result = JSON.stringify({ error: reasonMsg });
      logger.warn(`[executeSingleTool] ${reasonMsg}`);
      audit(toolName, args, result, false, now() - started, context, 'approval_error');
      return {
        outcome: 'blocked',
        result,
        toolName,
        riskLevel: policy.riskLevel,
        acpClass: policy.acpClass,
        requireApproval: true,
        durationMs: now() - started,
        reason: reasonMsg,
        approvalId,
      };
    }
  }

  // ---- 3) 分发执行 ----
  const timeoutMs = context.timeoutMs ?? policy.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  toolPolicyEngine.recordCall(toolName); // 速率限制计数
  let result: string;
  let success = true;
  let errorType: string | undefined;
  try {
    result = await dispatch(toolCall, args, context, timeoutMs);
    // 分发器约定：错误以 {"error":...} JSON 串返回，这里探测以标记审计成功位
    if (looksLikeError(result)) {
      success = false;
      errorType = 'tool_error';
    }
  } catch (err) {
    success = false;
    errorType = 'exception';
    result = JSON.stringify({
      error: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.warn(`[executeSingleTool] 工具 ${toolName} 执行抛错: ${errorType}`);
  }

  // ---- 4) 审计记录 ----
  const durationMs = now() - started;
  audit(toolName, args, result, success, durationMs, context, errorType);

  return {
    outcome: success ? 'success' : 'error',
    result,
    toolName,
    riskLevel: policy.riskLevel,
    acpClass: policy.acpClass,
    requireApproval: policy.requireApproval,
    durationMs,
    approvalId,
  };
}

// ===================== 辅助函数 =====================

/** 探测分发结果是否为约定的错误 JSON 串（`{"error":...}`） */
function looksLikeError(result: string): boolean {
  if (!result || result.length > 4000) return false; // 超长必是正常业务输出
  const trimmed = result.trimStart();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;
    return typeof parsed.error === 'string' && parsed.error.length > 0;
  } catch {
    return false;
  }
}

/** 统一写审计（截断结果 + 兜底不抛错） */
function audit(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  success: boolean,
  durationMs: number,
  context: ExecuteSingleToolContext,
  errorType?: string,
): void {
  try {
    const truncated = result.length > AUDIT_RESULT_MAX;
    toolAuditLog.log({
      toolName,
      sessionId: context.sessionId,
      args,
      result: truncated ? result.slice(0, AUDIT_RESULT_MAX) + '...[truncated]' : result,
      success,
      durationMs,
      errorType,
      truncated,
    });
  } catch (err) {
    logger.warn(
      `[executeSingleTool] 审计写入失败(${toolName}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export default executeSingleTool;
