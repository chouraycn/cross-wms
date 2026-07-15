import type {
  ChatEvent,
  AssistantMessageEvent,
  SystemEvent,
  AssistantMessageSnapshot,
  ContentBlock,
  ToolCallInfo,
  PlanStep,
} from '../../types/openclaw-events';

/**
 * 当前 SSE wire 格式（后端发送的原始事件）。
 *
 * 后端按 `stream` 字段区分事件类型，data 内为该流的具体负载。
 * 示例:
 * {"runId":"...","seq":1,"stream":"assistant","ts":1784091600826,"data":{"content":"您好"},"sessionKey":"..."}
 */
export interface SSEWireEvent {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
}

type StreamKind = 'text' | 'thinking' | 'tool' | null;

/**
 * 事件适配器 — 将当前 SSE wire 格式（`stream` 字段）转换为 OpenClaw ChatEvent（`type` 字段）。
 *
 * 核心职责:
 * 1. lifecycle/assistant/thinking/tool/error → OpenClaw 标准 AssistantMessageEvent
 * 2. 其余 stream → SystemEvent
 * 3. 维护 text/thinking/tool 流的 start/delta/end 边界状态机:
 *    - 首次进入某流时发射 _start（分配新的 contentIndex）
 *    - 切换流时发射上一流的 _end 并推进 contentIndex
 *    - done/error 时关闭所有未关闭的流
 *
 * 这是前端 SSE 事件消费层迁移到 OpenClaw 架构的第一步，
 * 当前 useAgentChat.ts 仍直接消费 wire 格式，本适配器供逐步切换使用。
 */
export class EventAdapter {
  private contentIndex = 0;
  private currentStream: StreamKind = null;
  private accumulatedText = '';
  private accumulatedThinking = '';
  private contentBlocks: ContentBlock[] = [];
  private hadToolCalls = false;

  /** 将一条 SSE wire event 转换为零到多条 ChatEvent。 */
  adapt(event: SSEWireEvent): ChatEvent | ChatEvent[] {
    const data = event.data || {};
    switch (event.stream) {
      case 'lifecycle':
        return this.adaptLifecycle(data);
      case 'assistant':
        return this.adaptAssistant(data);
      case 'thinking':
        return this.adaptThinking(data);
      case 'tool':
        return this.adaptTool(data);
      case 'error':
        return this.adaptError(data);
      case 'budget_exceeded':
        return this.adaptBudgetExceeded(data);
      case 'plan':
        return this.adaptPlan(data, 'plan_created');
      case 'plan_revised':
        return this.adaptPlan(data, 'plan_revised');
      case 'heartbeat':
        return { type: 'heartbeat' } as SystemEvent;
      case 'item':
      case 'debug':
        return this.adaptItem(data);
      case 'approval':
        return this.adaptApproval(data);
      case 'compaction':
        return this.adaptCompaction(data);
      case 'compaction_notification':
        return this.adaptCompactionNotification(data);
      case 'complexity_assessment':
        return this.adaptComplexityAssessment(data);
      case 'circuit_breaker_triggered':
        return this.adaptCircuitBreaker(data);
      case 'command_output':
        return this.adaptCommandOutput(data);
      case 'patch':
        return this.adaptPatch(data);
      case 'output_review':
        return this.adaptOutputReview(data);
      case 'react_phase':
        return this.adaptReactPhase(data);
      case 'tool_execution_started':
        return this.adaptToolExecution(data, 'tool_execution_started');
      case 'tool_execution_completed':
        return this.adaptToolExecution(data, 'tool_execution_completed');
      default:
        // 未识别的 stream（如 file 等）暂不映射，跳过
        return [];
    }
  }

  /** 重置内部状态，应在新的 run（lifecycle start）开始时调用。 */
  reset(): void {
    this.contentIndex = 0;
    this.currentStream = null;
    this.accumulatedText = '';
    this.accumulatedThinking = '';
    this.contentBlocks = [];
    this.hadToolCalls = false;
  }

  // ===================== 快照构建 =====================

  private buildSnapshot(): AssistantMessageSnapshot {
    return {
      role: 'assistant',
      content: [...this.contentBlocks],
      text: this.accumulatedText || undefined,
      thinking: this.accumulatedThinking || undefined,
    };
  }

  // ===================== 流边界状态机 =====================

  /** 关闭当前打开的 text/thinking 流，返回对应的 _end 事件（如有）。 */
  private closeCurrentStream(): ChatEvent | null {
    if (this.currentStream === 'text' && this.accumulatedText) {
      const content = this.accumulatedText;
      this.contentBlocks.push({ type: 'text', text: content });
      const ev: AssistantMessageEvent = {
        type: 'text_end',
        contentIndex: this.contentIndex,
        content,
        partial: this.buildSnapshot(),
      };
      this.contentIndex++;
      this.accumulatedText = '';
      this.currentStream = null;
      return ev;
    }
    if (this.currentStream === 'thinking' && this.accumulatedThinking) {
      const content = this.accumulatedThinking;
      this.contentBlocks.push({ type: 'thinking', thinking: content });
      const ev: AssistantMessageEvent = {
        type: 'thinking_end',
        contentIndex: this.contentIndex,
        content,
        partial: this.buildSnapshot(),
      };
      this.contentIndex++;
      this.accumulatedThinking = '';
      this.currentStream = null;
      return ev;
    }
    this.currentStream = null;
    return null;
  }

  // ===================== OpenClaw 标准事件适配 =====================

  /** lifecycle: start/init → start 事件；done → done 事件 */
  private adaptLifecycle(data: Record<string, unknown>): ChatEvent | ChatEvent[] {
    const phase = (data.phase as string) || '';
    if (phase === 'start' || phase === 'init') {
      this.reset();
      return { type: 'start', partial: this.buildSnapshot() };
    }
    if (phase === 'done') {
      const events: ChatEvent[] = [];
      const closing = this.closeCurrentStream();
      if (closing) events.push(closing);
      // 若本次 run 发生过工具调用，按 OpenClaw 语义标记为 toolUse
      const reason: 'stop' | 'length' | 'toolUse' = this.hadToolCalls ? 'toolUse' : 'stop';
      events.push({ type: 'done', reason, message: this.buildSnapshot() });
      return events;
    }
    return [];
  }

  /** assistant: data.content 为文本增量，按需发射 text_start/text_delta */
  private adaptAssistant(data: Record<string, unknown>): ChatEvent | ChatEvent[] {
    const delta = (data.content as string) || '';
    if (!delta) return [];
    const events: ChatEvent[] = [];
    if (this.currentStream !== 'text') {
      const closing = this.closeCurrentStream();
      if (closing) events.push(closing);
      this.currentStream = 'text';
      events.push({
        type: 'text_start',
        contentIndex: this.contentIndex,
        partial: this.buildSnapshot(),
      });
    }
    this.accumulatedText += delta;
    events.push({ type: 'text_delta', contentIndex: this.contentIndex, delta });
    return events;
  }

  /** thinking: data.content 为思考增量，按需发射 thinking_start/thinking_delta */
  private adaptThinking(data: Record<string, unknown>): ChatEvent | ChatEvent[] {
    const delta = (data.content as string) || '';
    if (!delta) return [];
    const events: ChatEvent[] = [];
    if (this.currentStream !== 'thinking') {
      const closing = this.closeCurrentStream();
      if (closing) events.push(closing);
      this.currentStream = 'thinking';
      events.push({
        type: 'thinking_start',
        contentIndex: this.contentIndex,
        partial: this.buildSnapshot(),
      });
    }
    this.accumulatedThinking += delta;
    events.push({ type: 'thinking_delta', contentIndex: this.contentIndex, delta });
    return events;
  }

  /**
   * tool: 当前 wire 格式在单条事件中携带完整工具调用（name/args/result），
   * 因此发射 toolcall_start + toolcall_end 两条事件。
   */
  private adaptTool(data: Record<string, unknown>): ChatEvent | ChatEvent[] {
    const events: ChatEvent[] = [];
    const closing = this.closeCurrentStream();
    if (closing) events.push(closing);

    const id = (data.toolCallId as string) || `tc_${Date.now()}`;
    const name = (data.name as string) || (data.toolName as string) || '';
    const argsStr = (data.args as string) || (data.toolArgs as string) || '{}';
    const args = parseArgs(argsStr);
    const result = (data.result as string) || undefined;

    this.currentStream = 'tool';
    events.push({
      type: 'toolcall_start',
      contentIndex: this.contentIndex,
      partial: this.buildSnapshot(),
    });

    const toolCall: ToolCallInfo = { id, name, arguments: args, result };
    this.contentBlocks.push({ type: 'tool_use', id, name, arguments: args });
    events.push({
      type: 'toolcall_end',
      contentIndex: this.contentIndex,
      toolCall,
      partial: this.buildSnapshot(),
    });

    this.hadToolCalls = true;
    this.contentIndex++;
    this.currentStream = null;
    return events;
  }

  /** error: 关闭未关闭的流后发射 error 事件 */
  private adaptError(data: Record<string, unknown>): ChatEvent | ChatEvent[] {
    const events: ChatEvent[] = [];
    const closing = this.closeCurrentStream();
    if (closing) events.push(closing);

    const errorMsg = (data.message as string) || (data.error as string) || '发生错误';
    const snapshot = this.buildSnapshot();
    snapshot.stopReason = 'error';
    if (!snapshot.text) {
      snapshot.text = errorMsg;
      snapshot.content = [{ type: 'text', text: errorMsg }];
    }
    events.push({ type: 'error', reason: 'error', error: snapshot });
    return events;
  }

  // ===================== 系统扩展事件适配 =====================

  private adaptBudgetExceeded(data: Record<string, unknown>): SystemEvent {
    return {
      type: 'budget_exceeded',
      reason: (data.reason as string) || '',
      consumedTurns: (data.consumedTurns as number) ?? 0,
      maxTurns: (data.maxTurns as number) ?? 0,
      consumedTokens: (data.consumedTokens as number) ?? 0,
      maxTokens: (data.maxTokens as number) ?? 0,
    };
  }

  /** plan/plan_revised: 将 wire 的 steps 数组规范化为 PlanStep[] */
  private adaptPlan(
    data: Record<string, unknown>,
    type: 'plan_created' | 'plan_revised',
  ): SystemEvent | [] {
    const plan = data.plan as
      | { steps?: Array<{ step?: number; description?: string; status?: string; toolName?: string }> }
      | undefined;
    if (!plan?.steps) return [];
    const steps: PlanStep[] = plan.steps.map((s) => ({
      id: String(s.step ?? ''),
      title: s.description ?? '',
      status: normalizePlanStatus(s.status),
      description: s.toolName,
    }));
    return { type, plan: steps };
  }

  private adaptItem(data: Record<string, unknown>): SystemEvent | [] {
    const itemId = (data.itemId as string) || '';
    if (!itemId) return [];
    const phase = (data.phase as 'start' | 'update' | 'end') || 'update';
    return {
      type: 'item',
      itemId,
      phase,
      kind: (data.kind as string) || undefined,
      title: (data.title as string) || undefined,
      status: (data.status as string) || undefined,
      summary: (data.summary as string) || undefined,
      error: (data.error as string) || undefined,
      name: (data.name as string) || undefined,
      meta: (data.meta as string) || undefined,
      toolCallId: (data.toolCallId as string) || undefined,
      startedAt: (data.startedAt as number) || undefined,
      endedAt: (data.endedAt as number) || undefined,
      progressText: (data.progressText as string) || undefined,
      progressPercent: (data.progressPercent as number) || undefined,
    };
  }

  private adaptApproval(data: Record<string, unknown>): SystemEvent {
    const toolName = (data.toolName as string) || '';
    const approvalId = (data.requestId as string) || `appr_${Date.now()}`;
    const command = (data.command as string) || undefined;
    const filePath = (data.filePath as string) || undefined;
    const toolArgs: Record<string, unknown> = {};
    if (command) toolArgs.command = command;
    if (filePath) toolArgs.filePath = filePath;
    const details = (data.details as Record<string, unknown>) || undefined;
    if (details) Object.assign(toolArgs, details);
    return {
      type: 'approval_request',
      toolName,
      toolArgs,
      approvalId,
      description: (data.description as string) || undefined,
      riskLevel: (data.riskLevel as string) || undefined,
      reason: (data.reason as string) || undefined,
    };
  }

  private adaptCompaction(data: Record<string, unknown>): SystemEvent {
    return {
      type: 'compaction',
      summary: '',
      retainedMessages: 0,
      tokensBefore: (data.tokensBefore as number) ?? undefined,
      tokensAfter: (data.tokensAfter as number) ?? undefined,
      reductionRatio: (data.reductionRatio as number) ?? undefined,
    };
  }

  private adaptCompactionNotification(data: Record<string, unknown>): SystemEvent | [] {
    const notification = data.notification as
      | {
          id: string;
          message: string;
          details?: {
            tokensBefore?: number;
            tokensAfter?: number;
            reductionRatio?: number;
            summary?: string;
          };
          timestamp: number;
          read?: boolean;
        }
      | undefined;
    if (!notification) return [];
    return {
      type: 'compaction_notification',
      id: notification.id,
      message: notification.message,
      tokensBefore: notification.details?.tokensBefore,
      tokensAfter: notification.details?.tokensAfter,
      reductionRatio: notification.details?.reductionRatio,
      summary: notification.details?.summary,
      timestamp: notification.timestamp,
    };
  }

  private adaptComplexityAssessment(data: Record<string, unknown>): SystemEvent {
    const estimatedSteps = (data.estimatedSteps as number) ?? 0;
    return {
      type: 'complexity_assessment',
      level: (data.level as string) || 'moderate',
      // wire 格式无独立 score 字段，以 estimatedSteps 作为数值指标
      score: estimatedSteps,
      estimatedSteps,
      reason: (data.reason as string) || undefined,
      recommendedMode: (data.recommendedMode as string) || undefined,
    };
  }

  private adaptCircuitBreaker(data: Record<string, unknown>): SystemEvent {
    const toolName = (data.toolName as string) || '';
    const failureCount = (data.failureCount as number) ?? 0;
    const state = (data.state as string) || 'open';
    const alternativeTool = (data.alternativeTool as string) || undefined;
    return {
      type: 'circuit_breaker_triggered',
      reason: alternativeTool
        ? `${toolName} 触发熔断 (${state}, 失败 ${failureCount} 次), 备选: ${alternativeTool}`
        : `${toolName} 触发熔断 (${state}, 失败 ${failureCount} 次)`,
    };
  }

  private adaptCommandOutput(data: Record<string, unknown>): SystemEvent {
    return {
      type: 'command_output',
      output: (data.output as string) || '',
    };
  }

  private adaptPatch(data: Record<string, unknown>): SystemEvent {
    const added = (data.added as string[]) || [];
    const modified = (data.modified as string[]) || [];
    const deleted = (data.deleted as string[]) || [];
    return {
      type: 'patch',
      files: [...added, ...modified, ...deleted],
    };
  }

  private adaptOutputReview(data: Record<string, unknown>): SystemEvent {
    return {
      type: 'output_review',
      quality: (data.quality as 'A' | 'B' | 'C' | 'D') || 'C',
      issues: (data.issues as string[]) || [],
      suggestion: (data.suggestion as string) || '',
    };
  }

  private adaptReactPhase(data: Record<string, unknown>): SystemEvent {
    return {
      type: 'react_phase',
      phase: (data.phase as 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done') || 'reasoning',
      step: (data.step as number) ?? undefined,
      totalSteps: (data.totalSteps as number) ?? undefined,
      description: (data.description as string) ?? undefined,
    };
  }

  private adaptToolExecution(
    data: Record<string, unknown>,
    type: 'tool_execution_started' | 'tool_execution_completed',
  ): SystemEvent {
    return {
      type,
      toolName: (data.toolName as string) || '',
      toolCallId: (data.toolCallId as string) || '',
    };
  }
}

// ===================== 工具函数 =====================

/** 解析工具参数 JSON 字符串，失败时回退为 { _raw: 原字符串 } */
function parseArgs(argsStr: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { _raw: argsStr };
  } catch {
    return { _raw: argsStr };
  }
}

/** 将 wire 计划步骤状态规范化为 PlanStep.status */
function normalizePlanStatus(status: string | undefined): PlanStep['status'] {
  switch (status) {
    case 'in_progress':
    case 'completed':
    case 'failed':
      return status;
    case 'pending':
      return 'pending';
    default:
      // skipped 等未定义状态回退为 pending
      return 'pending';
  }
}
