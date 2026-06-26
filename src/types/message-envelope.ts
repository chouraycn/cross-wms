/**
 * 前端 MessageEnvelope 类型（与 server/message/envelope.ts 对齐）
 *
 * 四层对话架构 — 第3层：前端组件类型
 * 用于前端渲染，与后端类型保持一致但面向 UI 需求。
 */

import type { Attachment } from '../types/chat.js';

export type MessageRole = 'user' | 'assistant' | 'system' | 'skill' | 'mcp';

/** 工具调用追踪记录 */
export interface ToolTraceEntry {
  type: 'skill' | 'mcp';
  name: string;
  success: boolean;
  duration: number;
}

/** 消息元数据 */
export interface MessageMeta {
  model: string;
  tokenIn: number;
  tokenOut: number;
  elapsedMs: number;
  sessionId: string;
  agentId?: string;
  autoReason?: string;
  toolTrace: ToolTraceEntry[];
}

/** 工具调用块 */
export interface ToolBlock {
  id: string;
  type: 'skill' | 'mcp';
  name: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

/** 统一消息信封（所有渠道通用） */
export interface MessageEnvelope {
  id: string;
  role: MessageRole;
  content: string;
  meta?: MessageMeta;
  toolBlocks?: ToolBlock[];
  isStreaming: boolean;
  timestamp: number;
  /** 附件列表（图片、文件等） */
  attachments?: Attachment[];
  /** 思考过程内容（仅 assistant 消息有） */
  thinking?: string;
}
