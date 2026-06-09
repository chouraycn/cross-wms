export interface ReferencedSession {
  id: string;
  title: string;
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
}

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
}
