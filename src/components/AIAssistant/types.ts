/**
 * AI 助手类型定义
 * 对接 CodeBuddy SDK 后端 API 的前端类型
 */

export interface Model {
  modelId: string;
  name: string;
  description?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  /** 纯文本快速访问字段，从 contentBlocks 派生（如果存在）或单独设置 */
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  /** 结构化内容块：如果存在，content 字段应与之保持一致（content = 所有 text 类型 block 的文本拼接） */
  contentBlocks?: ContentBlock[];
}

export interface Session {
  id: string;
  title: string;
  model: string;
  sdkSessionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  /** 时间戳，后端返回 Unix 毫秒时间戳，在前端转换为 Date 类型 */
  timestamp: Date;
}

export interface LoginStatus {
  isLoggedIn: boolean;
  method?: 'env' | 'cli' | 'none';
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
}

/** 结构化 API 错误 */
export interface ApiError {
  code: string;
  message: string;
}
