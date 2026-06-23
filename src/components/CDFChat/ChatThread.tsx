/**
 * CDFChat 对话容器（轻量版）
 *
 * - 消息列表（使用简单的 div 滚动，不引入 react-virtuoso）
 * - 新消息自动滚动到底部
 * - 输入区域（textarea + 发送按钮）
 * - 通过 useChatV2 hook 管理消息状态
 * - 纯 CSS + React，无 MUI 依赖
 */
import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import type { MessageEnvelope } from '../../types/message-envelope.js';
import MessageBubble from './MessageBubble.js';
import { useChatV2 } from './useChatV2.js';

interface Props {
  /** API 端点 */
  apiEndpoint?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 是否深色模式 */
  darkMode?: boolean;
  /** 输入框占位符 */
  placeholder?: string;
}

const ChatThread: React.FC<Props> = memo(function ChatThread({
  apiEndpoint = '/api/chat/stream',
  defaultModel = '',
  darkMode = false,
  placeholder = '输入您的问题...',
}) {
  const { messages, state, sendMessage, stopGeneration, error } = useChatV2({
    apiEndpoint,
    defaultModel,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || state === 'streaming') return;
    sendMessage(trimmed);
    setInputValue('');
  }, [inputValue, state, sendMessage]);

  // 键盘事件：Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isStreaming = state === 'streaming';

  return (
    <div className={`cdf-thread ${darkMode ? 'cdf-dark' : ''}`}>
      {/* 错误提示 */}
      {error && (
        <div className="cdf-error-bar">
          <span className="cdf-error-bar__text">{error}</span>
          <button
            className="cdf-error-bar__close"
            onClick={() => {/* error 会在下次发送时清除 */}}
          >
            &#10005;
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="cdf-thread__list" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="cdf-empty">
            <div className="cdf-empty__icon">&#128172;</div>
            <div className="cdf-empty__title">开始一段新的对话</div>
            <div className="cdf-empty__desc">输入您的问题，我将为您提供智能回答</div>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} darkMode={darkMode} />
          ))
        )}
      </div>

      {/* 输入区域 */}
      <div className="cdf-input-area">
        <div className="cdf-input-area__inner">
          <textarea
            className="cdf-input-area__textarea"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isStreaming}
            rows={1}
          />
          {isStreaming ? (
            <button className="cdf-input-area__btn cdf-input-area__btn--stop" onClick={stopGeneration}>
              &#9632; 停止
            </button>
          ) : (
            <button
              className="cdf-input-area__btn cdf-input-area__btn--send"
              onClick={handleSend}
              disabled={!inputValue.trim()}
            >
              &#10148; 发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChatThread;
