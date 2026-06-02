import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, Session } from '../types/chat';

export interface SendMessageOptions {
  /** 技能上下文：注入到 AI 对话的 prompt 模板 */
  skillContext?: string;
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
      model: 'claude-sonnet-4',
      messages: []
    };

    const userMsg: Message = { id: uuidv4(), role: 'user', content, timestamp: new Date() };
    const updatedSession = { ...session, messages: [...session.messages, userMsg] };
    onSessionUpdate(updatedSession);

    try {
      const body: Record<string, unknown> = {
        sessionId: session.id,
        message: content,
        model: session.model,
      };
      // 如果有技能上下文，传递给后端
      if (options?.skillContext) {
        body.skillContext = options.skillContext;
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
    } catch (e) { console.error(e); }
    setIsLoading(false);
    setInputValue('');
  }, [currentSession, isLoading, onSessionUpdate]);

  return { isLoading, inputValue, setInputValue, sendMessage };
}
