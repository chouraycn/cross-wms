/**
 * CDFChat 前端消息类型定义（四层对话架构 — 第3层：前端组件类型）
 *
 * 与后端 envelope.ts（第1层）的 MessageEnvelope 对齐，
 * 但面向前端渲染需求做了简化，去掉了 session 级别的 meta。
 */

// ===================== 工具调用块 =====================

/** 工具调用块（对应后端 ToolBlock） */
export interface CDFToolBlock {
  id: string;
  type: 'skill' | 'mcp';
  name: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

// ===================== 消息 =====================

/** 前端消息（对应后端 MessageEnvelope） */
export interface CDFMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 思考内容（模型推理过程） */
  thinking?: string;
  /** 思考阶段是否完成（解决"卡在思考中"的核心字段） */
  thinkingDone?: boolean;
  /** 使用的模型名称 */
  model?: string;
  /** 响应耗时（ms） */
  elapsedMs?: number;
  /** 输入 token 数 */
  tokenIn?: number;
  /** 输出 token 数 */
  tokenOut?: number;
  /** 自动推理策略 */
  autoReason?: string;
  /** 工具调用块列表 */
  toolBlocks?: CDFToolBlock[];
  /** 消息时间戳 */
  timestamp: number;
}

// ===================== 会话 =====================

/** 前端对话会话 */
export interface CDFChatSession {
  id: string;
  title: string;
  messages: CDFMessage[];
  createdAt: number;
  updatedAt: number;
}

// ===================== Hook 状态 =====================

/** useCDFChat 的状态 */
export interface CDFChatState {
  messages: CDFMessage[];
  isStreaming: boolean;
  error: string | null;
  model: string;
  elapsedMs: number;
}

/** useReducer Action 类型 */
export type CDFChatAction =
  | { type: 'ADD_MESSAGE'; payload: CDFMessage }
  | { type: 'UPDATE_STREAMING'; payload: { messageId: string; content: string } }
  | { type: 'SET_THINKING'; payload: { messageId: string; thinking: string; thinkingDone?: boolean } }
  | { type: 'ADD_TOOL_BLOCK'; payload: { messageId: string; toolBlock: CDFToolBlock } }
  | { type: 'UPDATE_TOOL_BLOCK'; payload: { messageId: string; toolBlockId: string; updates: Partial<CDFToolBlock> } }
  | { type: 'DONE'; payload: { messageId: string; meta?: { model?: string; elapsedMs?: number; tokenIn?: number; tokenOut?: number; autoReason?: string } } }
  | { type: 'ERROR'; payload: { messageId: string; error: string } }
  | { type: 'RESET' }
  | { type: 'SET_ELAPSED'; payload: number };

// ===================== 组件 Props =====================

/** MarkdownRenderer Props */
export interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

/** ToolCard Props */
export interface ToolCardProps {
  toolBlock: CDFToolBlock;
}

/** MessageBubble Props */
export interface MessageBubbleProps {
  message: CDFMessage;
  showMeta?: boolean;
}

/** ChatThread Props */
export interface ChatThreadProps {
  messages: CDFMessage[];
  isStreaming: boolean;
  showMeta?: boolean;
}

/** ChatInput Props */
export interface ChatInputProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** CDFChatContainer Props */
export interface CDFChatContainerProps {
  /** API 端点（默认 /api/chat/stream） */
  apiEndpoint?: string;
  /** 初始模型 */
  defaultModel?: string;
  /** 是否显示底部元数据（模型名、耗时、Token） */
  showMeta?: boolean;
  /** 空状态提示文字 */
  emptyText?: string;
  /** 输入框占位符 */
  placeholder?: string;
}
