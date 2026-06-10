import type { QueryResult } from './inventory-query';

export interface ReferencedSession {
  id: string;
  title: string;
}

/** 消息元数据（可扩展） */
export interface MessageMetadata {
  /** 自然语言查询结果（仅 builtin-inventory-query 技能产生） */
  queryResult?: QueryResult;
  /** 是否正在加载查询结果 */
  loading?: boolean;
  /** 查询错误信息 */
  error?: string;
  /** v1.7.0: 查询错误码（如 SQL_EXEC_FAILED 用于前端 auto-retry 判断） */
  errorCode?: string;
  /** v1.7.0: 是否已自动重试（每会话仅重试一次） */
  autoRetried?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  /** 用户发送此消息时引用的历史会话（仅 user 消息携带） */
  referencedSessions?: ReferencedSession[];
  /** Auto 模式选型原因（如 "Claude Sonnet 4 · 检测到代码内容"） */
  autoReason?: string;
  /** Auto 选型原因类型 */
  autoReasonType?: 'code' | 'complex' | 'simple' | 'default';
  /** 当前使用的参数预设 */
  activePreset?: { id: string; label: string } | null;
  /** 消息元数据（可扩展，用于承载查询结果等附加信息） */
  metadata?: MessageMetadata;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
}
