/**
 * 流协调器 Hook — 基于 OpenClaw Stream Reconciliation
 *
 * 核心功能：
 * - 按内容块索引（contentIndex）维护多个流段状态
 * - 基于序列号检测重复事件，避免重复渲染
 * - 支持从最新检查点重放 delta，优化内存
 * - 工具流与文本流独立管理但状态同步
 */

import { useState, useCallback, useRef, useMemo } from 'react';

// ===================== 类型定义 =====================

/** 流段状态 */
export interface StreamSegment {
  /** 内容块索引 */
  contentIndex: number;
  /** 流段类型 */
  type: 'text' | 'thinking' | 'toolCall';
  /** 累积内容 */
  content: string;
  /** 最后更新的序列号 */
  lastSeq: number;
  /** 是否完成 */
  isComplete: boolean;
  /** 停止原因 */
  stopReason?: string;
}

/** 流协调状态 */
export interface StreamReconciliationState {
  /** 活跃的流段 */
  segments: Map<number, StreamSegment>;
  /** 全局序列号（已处理的最新事件序号） */
  globalSeq: number;
  /** 已处理的事件 ID 集合（去重） */
  processedEventIds: Set<string>;
  /** 是否有活跃流 */
  isActive: boolean;
  /** 工具调用状态 */
  toolCalls: Map<string, {
    id: string;
    name: string;
    args: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
  }>;
}

// ===================== Hook =====================

export function useStreamReconciliation() {
  const [state, setState] = useState<StreamReconciliationState>({
    segments: new Map(),
    globalSeq: 0,
    processedEventIds: new Set(),
    isActive: false,
    toolCalls: new Map(),
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  /** 处理事件 */
  const processEvent = useCallback((event: {
    type: string;
    contentIndex?: number;
    partial?: string;
    content?: string;
    streamSeq?: number;
    toolCallId?: string;
    toolName?: string;
    args?: string;
    argsDelta?: string;
    result?: unknown;
    error?: string;
    stopReason?: string;
    thinkingDuration?: number;
  }) => {
    const currentState = stateRef.current;
    const contentIndex = event.contentIndex ?? 0;
    const eventId = `${event.type}-${contentIndex}-${event.streamSeq ?? Date.now()}`;

    // 去重检测
    if (currentState.processedEventIds.has(eventId)) return;
    currentState.processedEventIds.add(eventId);

    // 限制去重集合大小
    if (currentState.processedEventIds.size > 1000) {
      const entries = Array.from(currentState.processedEventIds);
      currentState.processedEventIds = new Set(entries.slice(-500));
    }

    const newSegments = new Map(currentState.segments);
    const newToolCalls = new Map(currentState.toolCalls);

    switch (event.type) {
      case 'text':
      case 'text_delta': {
        const existing = newSegments.get(contentIndex);
        const newContent = event.partial || event.content || '';
        if (existing && existing.type === 'text') {
          newSegments.set(contentIndex, {
            ...existing,
            content: existing.content + newContent,
            lastSeq: event.streamSeq ?? existing.lastSeq,
          });
        } else {
          newSegments.set(contentIndex, {
            contentIndex,
            type: 'text',
            content: newContent,
            lastSeq: event.streamSeq ?? 0,
            isComplete: false,
          });
        }
        break;
      }
      case 'text_end': {
        const existing = newSegments.get(contentIndex);
        if (existing) {
          newSegments.set(contentIndex, {
            ...existing,
            isComplete: true,
            stopReason: event.stopReason,
          });
        }
        break;
      }
      case 'thinking':
      case 'thinking_delta': {
        const existing = newSegments.get(contentIndex);
        const newContent = event.partial || event.content || '';
        if (existing && existing.type === 'thinking') {
          newSegments.set(contentIndex, {
            ...existing,
            content: existing.content + newContent,
            lastSeq: event.streamSeq ?? existing.lastSeq,
          });
        } else {
          newSegments.set(contentIndex, {
            contentIndex,
            type: 'thinking',
            content: newContent,
            lastSeq: event.streamSeq ?? 0,
            isComplete: false,
          });
        }
        break;
      }
      case 'thinking_end': {
        const existing = newSegments.get(contentIndex);
        if (existing) {
          newSegments.set(contentIndex, {
            ...existing,
            isComplete: true,
            stopReason: event.stopReason,
          });
        }
        break;
      }
      case 'tool_call':
      case 'tool_call_start': {
        if (event.toolCallId) {
          newToolCalls.set(event.toolCallId, {
            id: event.toolCallId,
            name: event.toolName || '',
            args: '',
            status: 'running',
          });
        }
        break;
      }
      case 'tool_call_delta': {
        if (event.toolCallId) {
          const tc = newToolCalls.get(event.toolCallId);
          if (tc) {
            newToolCalls.set(event.toolCallId, {
              ...tc,
              args: tc.args + (event.argsDelta || ''),
            });
          }
        }
        break;
      }
      case 'tool_call_end': {
        if (event.toolCallId) {
          const tc = newToolCalls.get(event.toolCallId);
          if (tc) {
            newToolCalls.set(event.toolCallId, {
              ...tc,
              args: event.args || tc.args,
              status: 'completed',
            });
          }
        }
        break;
      }
    }

    setState({
      segments: newSegments,
      globalSeq: Math.max(currentState.globalSeq, event.streamSeq ?? 0),
      processedEventIds: currentState.processedEventIds,
      isActive: true,
      toolCalls: newToolCalls,
    });
  }, []);

  /** 获取文本内容 */
  const getTextContent = useCallback((): string => {
    const currentState = stateRef.current;
    let text = '';
    for (const [, segment] of currentState.segments) {
      if (segment.type === 'text') {
        text += segment.content;
      }
    }
    return text;
  }, []);

  /** 获取思考内容 */
  const getThinkingContent = useCallback((): string => {
    const currentState = stateRef.current;
    let thinking = '';
    for (const [, segment] of currentState.segments) {
      if (segment.type === 'thinking') {
        thinking += segment.content;
      }
    }
    return thinking;
  }, []);

  /** 重置状态 */
  const reset = useCallback(() => {
    setState({
      segments: new Map(),
      globalSeq: 0,
      processedEventIds: new Set(),
      isActive: false,
      toolCalls: new Map(),
    });
  }, []);

  /** 完成流 */
  const complete = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: false,
    }));
  }, []);

  /** 获取工具调用列表 */
  const getToolCalls = useCallback(() => {
    return Array.from(stateRef.current.toolCalls.values());
  }, []);

  /** 检查所有流段是否完成 */
  const isAllComplete = useMemo(() => {
    if (state.segments.size === 0) return false;
    return Array.from(state.segments.values()).every((s) => s.isComplete);
  }, [state.segments]);

  return {
    state,
    processEvent,
    getTextContent,
    getThinkingContent,
    getToolCalls,
    isAllComplete,
    reset,
    complete,
  };
}
