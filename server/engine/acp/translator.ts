/**
 * ACP Translator
 * 协议翻译器 - OpenAI API <-> ACP 协议转换
 *
 * 参考 openclaw/src/acp/translator.ts 设计
 * 将外部 API 请求转换为 ACP 内部格式，反之亦然
 *
 * v2.0: 新增 session 管理、permission relay 集成、event ledger 集成
 */

import type { AcpTurnRequest, AcpTurnEvent, TurnResult, ToolCall, ToolResult } from "./acpTypes.js";
import type { PolicyEvaluationResult } from "./policy.js";
import type { ApprovalRequest } from "./permissionRelay.js";
import type { AcpEventLedger, AcpEventLedgerReplay } from "./eventLedger.js";
import { createInMemoryAcpEventLedger } from "./eventLedger.js";
import { sessionMapper } from "./sessionMapper.js";

export interface OpenAiChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

export interface OpenAiChatCompletionRequest {
  model: string;
  messages: OpenAiChatMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: "none" | "auto" | { type: "function"; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  n?: number;
}

export interface OpenAiChatCompletionResponse {
  id: string;
  object: "chat.completion" | "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: OpenAiChatMessage;
    delta?: Partial<OpenAiChatMessage> & { tool_calls?: OpenAiToolCall[] };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ===================== Session 管理相关 =====================

export interface AcpSessionInfo {
  sessionId: string;
  sessionKey: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  complete: boolean;
}

export interface AcpSessionConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cwd?: string;
}

// ===================== 主 Translator 类 =====================

export class AcpTranslator {
  private eventLedger: AcpEventLedger;

  constructor(eventLedger?: AcpEventLedger) {
    this.eventLedger = eventLedger ?? createInMemoryAcpEventLedger();
  }

  translateOpenAiToAcp(request: OpenAiChatCompletionRequest): AcpTurnRequest {
    const acpTools = request.tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      inputSchema: t.function.parameters,
    }));

    let toolChoice: string | Record<string, unknown> | undefined;
    if (request.tool_choice === "none") {
      toolChoice = "none";
    } else if (request.tool_choice === "auto") {
      toolChoice = "auto";
    } else if (request.tool_choice && typeof request.tool_choice === "object") {
      toolChoice = {
        type: "function",
        function: request.tool_choice.function,
      };
    }

    return {
      sessionId: `openai_${Date.now()}`,
      messages: request.messages.map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      model: request.model,
      tools: acpTools,
      tool_choice: toolChoice,
      temperature: request.temperature,
      maxTokens: request.max_tokens,
    };
  }

  translateAcpTurnToOpenAi(
    turnResult: TurnResult,
    requestId: string,
    model: string,
  ): OpenAiChatCompletionResponse {
    const now = Math.floor(Date.now() / 1000);

    let content: string | undefined;
    let toolCalls: OpenAiToolCall[] = [];

    if (turnResult.content) {
      content = turnResult.content;
    }

    if (turnResult.toolCalls && turnResult.toolCalls.length > 0) {
      toolCalls = turnResult.toolCalls.map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
        },
      }));
    }

    const message: OpenAiChatMessage = {
      role: "assistant",
      content: content ?? "",
    };

    if (toolCalls.length > 0) {
      (message as OpenAiChatMessage & { tool_calls?: unknown }).tool_calls = toolCalls;
    }

    return {
      id: requestId,
      object: "chat.completion",
      created: now,
      model,
      choices: [{
        index: 0,
        message,
        finish_reason: turnResult.finishReason,
      }],
      usage: turnResult.usage ? {
        prompt_tokens: turnResult.usage.promptTokens,
        completion_tokens: turnResult.usage.completionTokens,
        total_tokens: turnResult.usage.totalTokens,
      } : undefined,
    };
  }

  translateAcpEventToOpenAiChunk(
    event: AcpTurnEvent,
    requestId: string,
    model: string,
  ): OpenAiChatCompletionResponse | null {
    const now = Math.floor(Date.now() / 1000);

    switch (event.type) {
      case "text_delta": {
        return {
          id: requestId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              content: event.text,
            },
            finish_reason: null,
          }],
        };
      }

      case "tool_call": {
        return {
          id: requestId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                id: event.id,
                type: "function",
                function: {
                  name: event.name,
                  arguments: typeof event.input === "string" ? event.input : JSON.stringify(event.input),
                },
              }],
            },
            finish_reason: null,
          }],
        };
      }

      case "tool_result": {
        return {
          id: requestId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: null,
          }],
        };
      }

      case "done": {
        return {
          id: requestId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: event.finishReason ?? "stop",
          }],
          usage: event.usage ? {
            prompt_tokens: event.usage.promptTokens,
            completion_tokens: event.usage.completionTokens,
            total_tokens: event.usage.totalTokens,
          } : undefined,
        };
      }

      case "error": {
        return null;
      }

      default:
        return null;
    }
  }

  translateToolResultToMessage(toolResult: ToolResult): OpenAiChatMessage {
    return {
      role: "tool",
      content: JSON.stringify(toolResult.result),
      tool_call_id: toolResult.id,
    };
  }

  translatePolicyEvaluationToOpenAiError(
    evaluation: PolicyEvaluationResult,
  ): OpenAiChatCompletionResponse {
    const now = Math.floor(Date.now() / 1000);
    const errorMessage = evaluation.blockedBy
      ? `${evaluation.approvalReason}: ${evaluation.blockedBy.name}`
      : evaluation.approvalReason;

    return {
      id: `error_${now}`,
      object: "chat.completion",
      created: now,
      model: "policy-block",
      choices: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  translateApprovalRequestToOpenAiError(
    request: ApprovalRequest,
  ): OpenAiChatCompletionResponse {
    const now = Math.floor(Date.now() / 1000);

    return {
      id: `approval_${request.id}`,
      object: "chat.completion",
      created: now,
      model: "approval-pending",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: `⚠️ 需要人工审批\n\n工具: ${request.toolName}\n请求ID: ${request.id}\n原因: ${request.evaluation.approvalReason}`,
        },
        finish_reason: "approval_required",
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  // ===================== Session 管理方法 =====================

  async startSession(params: {
    sessionId: string;
    sessionKey: string;
    cwd: string;
    complete?: boolean;
    reset?: boolean;
  }): Promise<void> {
    await this.eventLedger.startSession({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      cwd: params.cwd,
      complete: params.complete ?? false,
      reset: params.reset,
    });

    sessionMapper.bindSession(params.sessionId, {
      userId: params.sessionKey.split(":")[0] ?? "unknown",
      policyProfileId: "default",
    });
  }

  async recordUserPrompt(params: {
    sessionId: string;
    sessionKey: string;
    runId: string;
    prompt: readonly { type: string; text?: string; [key: string]: unknown }[];
  }): Promise<void> {
    await this.eventLedger.recordUserPrompt({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      runId: params.runId,
      prompt: params.prompt,
    });
  }

  async recordUpdate(params: {
    sessionId: string;
    sessionKey: string;
    runId?: string;
    update: { sessionUpdate: string; [key: string]: unknown };
  }): Promise<void> {
    await this.eventLedger.recordUpdate({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      runId: params.runId,
      update: params.update as any,
    });
  }

  async readReplay(params: {
    sessionId: string;
    sessionKey: string;
  }): Promise<AcpEventLedgerReplay> {
    return this.eventLedger.readReplay(params);
  }

  async readReplayBySessionId(sessionId: string): Promise<AcpEventLedgerReplay> {
    return this.eventLedger.readReplayBySessionId({ sessionId });
  }

  async readReplayBySessionKey(sessionKey: string): Promise<AcpEventLedgerReplay> {
    return this.eventLedger.readReplayBySessionKey({ sessionKey });
  }

  getEventLedger(): AcpEventLedger {
    return this.eventLedger;
  }
}

export const acpTranslator = new AcpTranslator();
