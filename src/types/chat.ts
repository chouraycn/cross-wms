export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
}
