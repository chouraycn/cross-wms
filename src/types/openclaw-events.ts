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
