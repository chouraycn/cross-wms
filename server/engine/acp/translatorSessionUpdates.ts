/**
 * ACP Translator - Session Updates
 * 会话更新转换（openclaw 兼容）
 *
 * 参考 openclaw/src/acp/translator.session-updates.ts 设计
 *
 * 功能：将 ACP session update 事件转换为 OpenAI 兼容的消息增量
 */

import type { AcpTurnEvent } from "./acpTypes.js";

/** OpenAI delta 消息格式 */
export interface OpenAiDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

/** Session update 事件 */
export type SessionUpdateEvent =
  | { kind: "text"; text: string; sequence: number }
  | { kind: "thinking"; thinking: string; sequence: number }
  | { kind: "tool_call"; id: string; name: string; input: unknown; sequence: number }
  | { kind: "tool_result"; id: string; output: unknown; sequence: number }
  | { kind: "user_message"; content: string; sequence: number }
  | { kind: "done"; finishReason: string; sequence: number };

/** Session 更新选项 */
export interface SessionUpdateOptions {
  includeThinking?: boolean;
  sequenceNumber?: boolean;
}

/** 将 ACP turn event 转换为 session update event */
export function toSessionUpdate(event: AcpTurnEvent, sequence: number): SessionUpdateEvent | null {
  const evt = event as unknown as {
    type: string;
    content?: string;
    id?: string;
    name?: string;
    input?: unknown;
    output?: unknown;
    finishReason?: string;
  };
  switch (evt.type) {
    case "message":
      return { kind: "text", text: evt.content ?? "", sequence };
    case "reasoning":
    case "thinking":
      return { kind: "thinking", thinking: evt.content ?? "", sequence };
    case "tool_use":
      return {
        kind: "tool_call",
        id: evt.id ?? "",
        name: evt.name ?? "",
        input: evt.input,
        sequence,
      };
    case "tool_result":
      return { kind: "tool_result", id: evt.id ?? "", output: evt.output, sequence };
    case "done":
    case "completion":
      return { kind: "done", finishReason: evt.finishReason ?? "stop", sequence };
    default:
      return null;
  }
}

/** 将 session update 转换为 OpenAI delta */
export function sessionUpdateToOpenAiDelta(
  update: SessionUpdateEvent,
  options: SessionUpdateOptions = {},
): OpenAiDelta | null {
  if (update.kind === "thinking" && !options.includeThinking) {
    return null;
  }

  switch (update.kind) {
    case "text":
      return { role: "assistant", content: update.text };
    case "thinking":
      return { role: "assistant", content: update.thinking };
    case "tool_call":
      return {
        role: "assistant",
        content: null,
        tool_calls: [{
          index: 0,
          id: update.id,
          type: "function",
          function: {
            name: update.name,
            arguments: typeof update.input === "string" ? update.input : JSON.stringify(update.input),
          },
        }],
      };
    case "user_message":
      return { role: "user", content: update.content };
    case "tool_result":
      return { role: "tool", content: typeof update.output === "string" ? update.output : JSON.stringify(update.output) };
    case "done":
      return null;
    default:
      return null;
  }
}

/** Session lineage - 跟踪会话衍生关系 */
export interface SessionLineage {
  parentSessionId?: string;
  childSessionIds: string[];
  rootSessionId: string;
  depth: number;
}

/** Session lineage 管理器 */
export class SessionLineageManager {
  private lineageMap = new Map<string, SessionLineage>();

  /** 注册 session 关系 */
  register(params: { sessionId: string; parentSessionId?: string }): SessionLineage {
    const rootSessionId = params.parentSessionId
      ? this.getRootSessionId(params.parentSessionId) ?? params.parentSessionId
      : params.sessionId;
    const depth = params.parentSessionId
      ? (this.lineageMap.get(params.parentSessionId)?.depth ?? 0) + 1
      : 0;

    const lineage: SessionLineage = {
      parentSessionId: params.parentSessionId,
      childSessionIds: [],
      rootSessionId,
      depth,
    };

    this.lineageMap.set(params.sessionId, lineage);

    if (params.parentSessionId) {
      const parent = this.lineageMap.get(params.parentSessionId);
      if (parent) {
        parent.childSessionIds.push(params.sessionId);
      }
    }

    return lineage;
  }

  /** 获取 session lineage */
  get(sessionId: string): SessionLineage | undefined {
    return this.lineageMap.get(sessionId);
  }

  /** 获取根 session id */
  getRootSessionId(sessionId: string): string | undefined {
    const lineage = this.lineageMap.get(sessionId);
    if (!lineage) return undefined;
    if (lineage.rootSessionId === sessionId) return sessionId;
    return lineage.rootSessionId;
  }

  /** 获取所有子 session */
  getChildren(sessionId: string): string[] {
    return this.lineageMap.get(sessionId)?.childSessionIds ?? [];
  }

  /** 获取 lineage 深度 */
  getDepth(sessionId: string): number {
    return this.lineageMap.get(sessionId)?.depth ?? 0;
  }

  /** 移除 session */
  remove(sessionId: string): void {
    const lineage = this.lineageMap.get(sessionId);
    if (lineage?.parentSessionId) {
      const parent = this.lineageMap.get(lineage.parentSessionId);
      if (parent) {
        parent.childSessionIds = parent.childSessionIds.filter(id => id !== sessionId);
      }
    }
    this.lineageMap.delete(sessionId);
  }

  /** 清空所有 lineage */
  clear(): void {
    this.lineageMap.clear();
  }
}

let lineageManagerInstance: SessionLineageManager | null = null;

/** 获取全局 Session lineage 管理器 */
export function getSessionLineageManager(): SessionLineageManager {
  if (!lineageManagerInstance) {
    lineageManagerInstance = new SessionLineageManager();
  }
  return lineageManagerInstance;
}

/** 重置 Session lineage 管理器（用于测试） */
export function resetSessionLineageManager(): void {
  lineageManagerInstance = null;
}
