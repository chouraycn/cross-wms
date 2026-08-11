/**
 * OpenClaw 对齐的事件类型系统
 *
 * 将前端 SSE 事件消费层迁移到 OpenClaw 的 AssistantMessageEvent 标准。
 * 参考: openclaw/packages/llm-core/src/types.ts (AssistantMessageEvent, 行 369-390)
 *
 * 设计要点:
 * - AssistantMessageEvent: OpenClaw 标准 12 种事件（discriminated union，使用 `type` 字段）
 *   对应原 SSE 的 `stream` 字段中与消息正文/思考/工具调用相关的部分。
 * - SystemEvent: 系统扩展事件（非 OpenClaw 标准，但前端需要），覆盖原 SSE 中
 *   预算/计划/审批/压缩/心跳等流。
 * - ChatEvent: 统一事件类型 = AssistantMessageEvent | SystemEvent。
 *
 * 与原 `stream` 字段的对应关系见 src/utils/sse/eventAdapter.ts。
 */

// ===================== 消息快照与内容块 =====================

/** OpenClaw 风格的内容块（简化版，用于 AssistantMessageSnapshot） */
export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, any>;
}

/** 助手消息快照 — 流式过程中的部分/最终消息状态 */
export interface AssistantMessageSnapshot {
  role: 'assistant';
  content: ContentBlock[];
  stopReason?: string;
  thinking?: string;
  text?: string;
}

/** 工具调用信息 */
export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: string;
  error?: string;
}

/** 计划步骤 */
export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  description?: string;
}

// ===================== OpenClaw 标准 AssistantMessageEvent（12 种） =====================

/**
 * OpenClaw 标准 AssistantMessageEvent。
 *
 * 流应先发射 `start`，再发射部分更新，最后以 `done`（成功）或 `error` 结束。
 * 参考 openclaw/packages/llm-core/src/types.ts。
 */
export type AssistantMessageEvent =
  | {
      type: 'start';
      partial: AssistantMessageSnapshot;
      // cross-wms 生命周期扩展字段
      phase?: string;
      modelName?: string;
      model?: string;
      autoReason?: string;
      autoReasonType?: string;
      autoSemanticMethod?: string;
      autoSemanticConfidence?: number;
    }
  | { type: 'text_start'; contentIndex: number; partial: AssistantMessageSnapshot }
  | {
      type: 'text_delta';
      contentIndex: number;
      delta: string;
      partial?: AssistantMessageSnapshot;
    }
  | { type: 'text_end'; contentIndex: number; content: string; partial: AssistantMessageSnapshot }
  | { type: 'thinking_start'; contentIndex: number; partial: AssistantMessageSnapshot }
  | {
      type: 'thinking_delta';
      contentIndex: number;
      delta: string;
      partial?: AssistantMessageSnapshot;
      // cross-wms 扩展字段
      thinkingSignature?: string;
      redacted?: boolean;
    }
  | {
      type: 'thinking_end';
      contentIndex: number;
      content: string;
      partial: AssistantMessageSnapshot;
    }
  | { type: 'toolcall_start'; contentIndex: number; partial: AssistantMessageSnapshot }
  | {
      type: 'toolcall_delta';
      contentIndex: number;
      delta: string;
      partial?: AssistantMessageSnapshot;
    }
  | {
      type: 'toolcall_end';
      contentIndex: number;
      toolCall: ToolCallInfo;
      partial: AssistantMessageSnapshot;
    }
  | {
      type: 'done';
      reason: 'stop' | 'length' | 'toolUse';
      message: AssistantMessageSnapshot;
      // cross-wms 生命周期扩展字段
      thinkingDuration?: number;
      usage?: Record<string, any>;
      fallbackModel?: string;
      fallbackReason?: 'key_rotation' | 'model_downgrade' | 'model_not_supported' | 'request_failed';
      errorMessage?: string;
      errorCode?: string;
      sessionKey?: string;
      sessionId?: string;
    }
  | {
      type: 'error';
      reason: 'aborted' | 'error';
      error: AssistantMessageSnapshot;
      // cross-wms 扩展：原始错误消息（当快照未包含错误文本时使用）
      message?: string;
    };

// ===================== 多级审批链（SystemEvent.approval_request 子结构） =====================

/** 链整体状态：pending 等待启动 / in_progress 进行中 / approved 通过 / rejected 被拒 / timeout 超时 / cancelled 取消 / paused 暂停 */
export type ApprovalChainStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'timeout' | 'cancelled' | 'paused';

/** 单级状态：waiting 未触发 / in_progress 正在等审批 / approved 已通过 / rejected 被拒 / timeout 超时 */
export type ApprovalLevelStatus = 'waiting' | 'in_progress' | 'approved' | 'rejected' | 'timeout';

/** 审批链中每个级别的实时状态（随 SSE 事件渐进更新） */
export interface ApprovalChainLevelStatus {
  /** 级别索引（0-based） */
  index: number;
  /** 级别名称，如 L1 / L2 */
  name: string;
  /** 触发该级别的最低风险等级（medium/high...） */
  minRiskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  /** 该级别的审批超时（毫秒） */
  timeoutMs: number;
  /** 是否因为当前风险不够而跳过（未触发） */
  skipped: boolean;
  /** 该级状态 */
  status: ApprovalLevelStatus;
  /** 需要的批准人数 */
  requiredApprovers: number;
  /** 已批准的人（如果记录了） */
  approvers: string[];
  /** 级别被拒原因（若 status === rejected / timeout） */
  rejectReason?: string;
  /** 级别开始时间戳（毫秒，用于前端独立倒计时） */
  startedAt?: number;
  /** 级别结束时间戳（毫秒，approved/rejected/timeout 时填充） */
  finishedAt?: number;
}

// ===================== 系统扩展事件（非 OpenClaw 标准） =====================

/**
 * 系统扩展事件 — 覆盖原 SSE 中 OpenClaw 标准未包含的 `stream` 类型。
 * 这些事件不参与 AssistantMessage 的内容构建，仅驱动 UI 副作用。
 */
export type SystemEvent =
  // 预算超出
  | {
      type: 'budget_exceeded';
      reason: string;
      consumedTurns: number;
      maxTurns: number;
      consumedTokens: number;
      maxTokens: number;
    }
  // 计划创建/更新/修订
  | { type: 'plan_created' | 'plan_updated' | 'plan_revised'; plan: PlanStep[] }
  // 审批请求
  | {
      type: 'approval_request';
      toolName: string;
      toolArgs: Record<string, any>;
      approvalId: string;
      description?: string;
      riskLevel?: string;
      reason?: string;
      command?: string;
      filePath?: string;
      timeout?: number;
      expiresAt?: number;
      // v1.7.204: 多级审批链字段（high/critical 走 L1→L2）。单级审批所有字段为 undefined。
      /** 是否启用多级审批链（true 时前端显示 L1/L2 进度条） */
      multiLevel?: boolean;
      /** 审批链 ID（用于前端 chainId 展示和审计） */
      chainId?: string;
      /** 审批链所有级别，含每级状态、名称、已批准人等 */
      levels?: ApprovalChainLevelStatus[];
      /** 链整体状态（用于前端显示最终审批/拒绝/升级中徽章） */
      chainStatus?: ApprovalChainStatus;
      /** 链级拒绝原因（若某级被拒） */
      chainRejectReason?: string;
    }
  // 上下文压缩
  | {
      type: 'compaction';
      summary: string;
      retainedMessages: number;
      tokensBefore?: number;
      tokensAfter?: number;
      reductionRatio?: number;
    }
  // 复杂度评估
  | {
      type: 'complexity_assessment';
      level: string;
      score: number;
      estimatedSteps?: number;
      reason?: string;
      recommendedMode?: string;
    }
  // 熔断器触发
  | {
      type: 'circuit_breaker_triggered';
      reason?: string;
      toolName?: string;
      failureCount?: number;
      state?: string;
      alternativeTool?: string;
    }
  // 心跳
  | { type: 'heartbeat' }
  // 工具执行开始
  | {
      type: 'tool_execution_started';
      toolName: string;
      toolCallId: string;
      originalToolName?: string;
    }
  // 工具执行完成
  | {
      type: 'tool_execution_completed';
      toolName: string;
      toolCallId: string;
      success?: boolean;
      errorType?: string;
      durationMs?: number;
      retryCount?: number;
      truncated?: boolean;
    }
  // 命令输出
  | { type: 'command_output'; output: string; title?: string }
  // 代码补丁
  | {
      type: 'patch';
      files: string[];
      title?: string;
      summary?: string;
      added?: string[];
      modified?: string[];
      deleted?: string[];
    }
  // 任务监控项
  | {
      type: 'item';
      itemId: string;
      phase: 'start' | 'update' | 'end';
      kind?: string;
      title?: string;
      status?: string;
      summary?: string;
      error?: string;
      name?: string;
      meta?: string;
      toolCallId?: string;
      startedAt?: number;
      endedAt?: number;
      progressText?: string;
      progressPercent?: number;
    }
  // 输出审查
  | {
      type: 'output_review';
      quality: 'A' | 'B' | 'C' | 'D';
      issues: string[];
      suggestion: string;
    }
  // ReAct 阶段
  | {
      type: 'react_phase';
      phase: 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done';
      step?: number;
      totalSteps?: number;
      description?: string;
    }
  // 反思置信度（每轮自评估结果；confidenceScore≥7 建议早停）
  | {
      type: 'reflection_confidence';
      confidenceScore: number;
      selfScore: number;
      shouldEarlyStop: boolean;
      reason?: string;
    }
  // 动态重规划触发（plan drift / 连续失败等情形）
  | {
      type: 'replan_triggered';
      reason?: string;
      oldPlanId?: string;
      newPlanId?: string;
    }
  // 压缩通知
  | {
      type: 'compaction_notification';
      id: string;
      message: string;
      tokensBefore?: number;
      tokensAfter?: number;
      reductionRatio?: number;
      summary?: string;
      timestamp: number;
    }
  // 工具/技能产出文件
  | {
      type: 'file';
      fileId?: string;
      fileName: string;
      fileSize?: number;
      mimeType?: string;
      description?: string;
      downloadUrl?: string;
      previewUrl?: string;
      sessionId?: string;
      createdAt?: string;
    };

// ===================== 统一事件类型 =====================

/** 统一事件类型 = OpenClaw 标准事件 | 系统扩展事件 */
export type ChatEvent = AssistantMessageEvent | SystemEvent;
