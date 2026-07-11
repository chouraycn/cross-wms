/**
 * PolicyPipeline — 策略管道中间件
 *
 * 将 ToolPolicy + ACP + Sandbox 三个策略阶段链式组合为单一管道，
 * 统一覆盖所有工具（内置/MCP/插件）的策略评估流程。
 *
 * 阶段执行顺序：ToolPolicy → ACP → Sandbox
 *   - allow: 继续执行下一阶段
 *   - deny: 立即停止，返回拒绝
 *   - require-approval: 暂停管道，等待用户审批
 *
 * 使用方式：
 *   import policyPipeline from './policyPipeline.js';
 *   const result = policyPipeline.evaluate(toolName, args, { sessionId, userId });
 *   if (!result.allowed) { ... }
 *   if (result.requireApproval) { ... }
 */

import toolPolicyEngine from './toolPolicyEngine.js';
import { policyEngine as acpPolicyEngine } from './acp/policy.js';
import { evaluateSandboxPolicy, type SandboxContext, type SandboxResult } from './sandboxPolicy.js';

// ===================== 接口定义 =====================

/** 策略阶段接口 */
export interface PolicyStage {
  /** 阶段名称（用于审计与日志） */
  name: string;
  /** 评估单个工具调用上下文，返回该阶段的决策 */
  evaluate(ctx: PolicyContext): PolicyStageResult;
}

/** 工具调用上下文（贯穿所有阶段） */
export interface PolicyContext {
  toolName: string;
  args: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  source?: 'builtin' | 'mcp' | 'plugin';
}

/** 单个阶段的评估结果 */
export interface PolicyStageResult {
  decision: 'allow' | 'deny' | 'require-approval';
  reason?: string;
  riskLevel?: string;
  metadata?: Record<string, unknown>;
}

/** 管道整体评估结果 */
export interface PipelineResult {
  allowed: boolean;
  requireApproval: boolean;
  reason?: string;
  riskLevel?: string;
  stages: Array<{ name: string; decision: string; reason?: string }>;
}

// ===================== 默认阶段实现 =====================

/**
 * ToolPolicy 阶段
 *
 * 包装 toolPolicyEngine.evaluateTool()，
 * 负责风险分级、速率限制、参数黑白名单、超时控制。
 */
export const toolPolicyStage: PolicyStage = {
  name: 'tool-policy',
  evaluate(ctx: PolicyContext): PolicyStageResult {
    const result = toolPolicyEngine.evaluateTool(ctx.toolName, ctx.args, {
      source: ctx.source,
      sessionId: ctx.sessionId,
      userId: ctx.userId,
    });

    // 被策略拒绝（速率超限 / 参数黑名单 / ACP 阻止等）
    if (!result.allowed) {
      return {
        decision: 'deny',
        reason: result.reason ?? `工具 '${ctx.toolName}' 被 ToolPolicy 拒绝`,
        riskLevel: result.riskLevel,
        metadata: { acpClass: result.acpClass, deniedParams: result.deniedParams },
      };
    }

    // 允许执行但需要用户审批
    if (result.requireApproval) {
      return {
        decision: 'require-approval',
        reason: result.reason ?? `工具 '${ctx.toolName}' 需要用户审批`,
        riskLevel: result.riskLevel,
        metadata: { acpClass: result.acpClass, sandboxConfig: result.sandboxConfig },
      };
    }

    // 直接放行，附带沙箱配置供后续阶段使用
    return {
      decision: 'allow',
      reason: result.reason,
      riskLevel: result.riskLevel,
      metadata: { acpClass: result.acpClass, sandboxConfig: result.sandboxConfig },
    };
  },
};

/**
 * ACP 阶段
 *
 * 包装 acpPolicyEngine.evaluateToolCall()，
 * 负责基于权限配置文件的规则匹配与审批等级判定。
 */
export const acpStage: PolicyStage = {
  name: 'acp',
  evaluate(ctx: PolicyContext): PolicyStageResult {
    const result = acpPolicyEngine.evaluateToolCall(ctx.toolName, ctx.args);

    // deny 级别：明确拒绝
    if (result.level === 'deny') {
      return {
        decision: 'deny',
        reason: result.approvalReason ?? `工具 '${ctx.toolName}' 被 ACP 策略拒绝`,
        riskLevel: 'critical',
        metadata: { blockedBy: result.blockedBy },
      };
    }

    // prompt 级别：需要用户确认
    if (result.level === 'prompt' || result.requiresApproval) {
      return {
        decision: 'require-approval',
        reason: result.approvalReason ?? `工具 '${ctx.toolName}' 需要 ACP 审批`,
        riskLevel: 'high',
        metadata: { matchedRules: result.matchedRules },
      };
    }

    // allow 级别：直接放行
    return {
      decision: 'allow',
      reason: result.approvalReason,
      riskLevel: 'low',
      metadata: { matchedRules: result.matchedRules },
    };
  },
};

/**
 * Sandbox 阶段
 *
 * 从工具策略结果中读取沙箱配置（sandboxConfig），
 * 对命令类工具调用执行沙箱策略检查（危险命令 / 路径限制 / 命令注入检测）。
 *
 * 注：由于阶段接口不直接传递前序结果，此处重新调用 evaluateTool()
 * 获取 sandboxConfig。evaluateTool() 仅做规则匹配与只读校验，无副作用。
 */
export const sandboxStage: PolicyStage = {
  name: 'sandbox',
  evaluate(ctx: PolicyContext): PolicyStageResult {
    // 读取匹配规则的沙箱配置
    const toolPolicyResult = toolPolicyEngine.evaluateTool(ctx.toolName, ctx.args, {
      source: ctx.source,
      sessionId: ctx.sessionId,
      userId: ctx.userId,
    });

    const sandboxConfig = toolPolicyResult.sandboxConfig;

    // 无沙箱配置，跳过沙箱检查
    if (!sandboxConfig) {
      return {
        decision: 'allow',
        reason: '无沙箱配置，跳过沙箱检查',
        riskLevel: toolPolicyResult.riskLevel,
      };
    }

    // 从参数中提取命令字符串（兼容 command / cmd 字段）
    const command =
      typeof ctx.args.command === 'string'
        ? ctx.args.command
        : typeof ctx.args.cmd === 'string'
          ? ctx.args.cmd
          : '';

    // 无命令可评估时，仅记录沙箱限制说明
    if (!command) {
      const restrictions: string[] = [];
      if (sandboxConfig.filesystem) {
        restrictions.push(`文件系统: ${sandboxConfig.filesystem}`);
      }
      if (sandboxConfig.network) {
        restrictions.push(`网络: ${sandboxConfig.network}`);
      }
      return {
        decision: 'allow',
        reason: `沙箱配置已应用（无命令需检查）`,
        riskLevel: toolPolicyResult.riskLevel,
        metadata: { sandboxConfig, restrictions },
      };
    }

    // 构建沙箱上下文并执行沙箱策略评估
    const sandboxCtx: SandboxContext = {
      command,
      toolName: ctx.toolName,
      sessionKey: ctx.sessionId,
      userId: ctx.userId,
      metadata: ctx.args,
    };

    const sandboxResult: SandboxResult = evaluateSandboxPolicy(sandboxCtx);

    // 沙箱策略拒绝（危险命令 / 命令注入 / 路径限制等）
    if (!sandboxResult.allowed) {
      return {
        decision: 'deny',
        reason: sandboxResult.reason,
        riskLevel: 'critical',
        metadata: {
          sandboxConfig,
          restrictions: sandboxResult.restrictions,
          warnings: sandboxResult.warnings,
        },
      };
    }

    // 沙箱检查通过，附带限制说明
    return {
      decision: 'allow',
      reason: sandboxResult.reason,
      riskLevel: toolPolicyResult.riskLevel,
      metadata: {
        sandboxConfig,
        restrictions: sandboxResult.restrictions,
        warnings: sandboxResult.warnings,
      },
    };
  },
};

// ===================== PolicyPipeline 类 =====================

/**
 * 策略管道
 *
 * 将多个 PolicyStage 按顺序组合，统一评估工具调用。
 * 默认阶段顺序：ToolPolicy → ACP → Sandbox。
 */
export class PolicyPipeline {
  private stages: PolicyStage[];

  constructor(stages: PolicyStage[] = [toolPolicyStage, acpStage, sandboxStage]) {
    this.stages = [...stages];
  }

  /** 追加阶段到管道末尾 */
  addStage(stage: PolicyStage): void {
    this.stages.push(stage);
  }

  /** 获取当前所有阶段（只读副本） */
  getStages(): PolicyStage[] {
    return [...this.stages];
  }

  /**
   * 评估工具调用 — 按顺序执行所有阶段
   *
   * 执行规则：
   * - allow: 继续下一阶段
   * - deny: 立即停止，返回拒绝
   * - require-approval: 暂停管道，返回需审批状态
   *
   * @param toolName 工具名称
   * @param args 工具参数
   * @param context 调用上下文（sessionId / userId / source）
   * @returns 管道整体评估结果
   */
  evaluate(
    toolName: string,
    args: Record<string, unknown>,
    context?: Partial<PolicyContext>,
  ): PipelineResult {
    const ctx: PolicyContext = {
      toolName,
      args,
      sessionId: context?.sessionId,
      userId: context?.userId,
      source: context?.source,
    };

    const stageResults: Array<{ name: string; decision: string; reason?: string }> = [];
    let allowed = true;
    let requireApproval = false;
    let reason: string | undefined;
    let riskLevel: string | undefined;

    for (const stage of this.stages) {
      const result = stage.evaluate(ctx);

      stageResults.push({
        name: stage.name,
        decision: result.decision,
        reason: result.reason,
      });

      // 持续更新风险等级（后续阶段覆盖前期）
      if (result.riskLevel) {
        riskLevel = result.riskLevel;
      }

      // 拒绝：立即停止管道
      if (result.decision === 'deny') {
        allowed = false;
        requireApproval = false;
        reason = result.reason;
        break;
      }

      // 需审批：暂停管道，等待用户确认
      if (result.decision === 'require-approval') {
        allowed = false;
        requireApproval = true;
        if (!reason) {
          reason = result.reason;
        }
        break;
      }

      // allow：继续下一阶段
    }

    return {
      allowed,
      requireApproval,
      reason,
      riskLevel,
      stages: stageResults,
    };
  }
}

// ===================== 单例导出 =====================

const policyPipeline = new PolicyPipeline();

export default policyPipeline;
