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
}

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
}
