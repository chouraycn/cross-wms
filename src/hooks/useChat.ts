import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, ReferencedSession, Session } from '../types/chat';

/** 从 localStorage 读取默认模型 ID */
function getDefaultModelId(): string {
  try {
    const raw = localStorage.getItem('cdf-know-clow-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaultModelId = parsed?.models?.defaultModelId;
      if (defaultModelId && typeof defaultModelId === 'string') {
        return defaultModelId;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return 'auto';
}

export interface SendMessageOptions {
  /** 技能上下文：注入到 AI 对话的 prompt 模板 */
  skillContext?: string;
  /** 技能 ID：发送到后端用于统计与追踪 */
  skillId?: string;
  /** 引用的会话 ID 列表：用于关联历史对话 */
  referencedSessionIds?: string[];
  /** 引用的会话详情：用于前端展示 chip */
  referencedSessions?: ReferencedSession[];
  /** 指定使用的模型 ID（优先于 session.model） */
  model?: string;
}

export function useChat(currentSession: Session | undefined, onSessionUpdate: (session: Session) => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const sendMessage = useCallback(async (content: string, options?: SendMessageOptions) => {
    if (!content.trim() || isLoading) return;
    setIsLoading(true);

    const session = currentSession || {
      id: uuidv4(),
      title: content.slice(0, 30),
      model: getDefaultModelId(),
      messages: []
    };

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
      referencedSessions: options?.referencedSessions,
    };
    const updatedSession = { ...session, messages: [...session.messages, userMsg] };
    onSessionUpdate(updatedSession);

    try {
      // 优先使用 options.model，否则使用 session.model
      const effectiveModel = options?.model || session.model;

      const body: Record<string, unknown> = {
        sessionId: session.id,
        message: content,
        model: effectiveModel,
      };
      // 如果有技能上下文，传递给后端
      if (options?.skillContext) {
        body.skillContext = options.skillContext;
      }
      // 如果有技能 ID，传递给后端
      if (options?.skillId) {
        body.skillId = options.skillId;
      }
      // 如果有引用的会话 ID，传递给后端
      if (options?.referencedSessionIds && options.referencedSessionIds.length > 0) {
        body.referencedSessionIds = options.referencedSessionIds;
      }
      // 如果有历史消息，添加到请求体（用于多轮对话）
      if (session.messages.length > 0) {
        body.conversationHistory = session.messages.map(m => ({
          role: m.role,
          content: m.content,
        }));
      }

      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) { // eslint-disable-line no-constant-condition
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'text') fullContent += data.content;
                if (data.type === 'done') {
                  const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: fullContent, timestamp: new Date() };
                  const updatedSession = { ...session, messages: [...session.messages, assistantMsg] };
                  onSessionUpdate(updatedSession);
                }
              } catch { /* stream parse error, skip */ }
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      // 改善错误处理：添加用户可见的错误提示
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '抱歉，发送消息失败，请稍后重试。',
        timestamp: new Date(),
      };
      const updatedSession = { ...session, messages: [...session.messages, errorMsg] };
      onSessionUpdate(updatedSession);
    }
    setIsLoading(false);
    setInputValue('');
  }, [currentSession, isLoading, onSessionUpdate]);

  return { isLoading, inputValue, setInputValue, sendMessage };
}
