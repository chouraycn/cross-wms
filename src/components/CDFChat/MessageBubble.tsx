/**
 * CDFChat 消息气泡组件（轻量版）
 *
 * - React.memo 优化，避免流式更新时全局重渲染
 * - 用户消息右对齐（蓝色气泡），AI 消息左对齐（白色/灰色气泡）
 * - 流式输出时显示闪烁光标 |
 * - 底部元数据栏（模型标签、耗时、Token 数）
 * - 支持深色/浅色模式（通过 CSS 变量）
 * - 内容使用简单正则 Markdown 渲染（不引入 react-markdown）
 * - 加载态判断：isStreaming && !content → 显示 spinner + "思考中..."
 * - 工具卡片内嵌在消息内容中
 * - 纯 CSS + React，无 MUI 依赖
 */
import React, { memo } from 'react';
import type { MessageEnvelope } from '../../types/message-envelope.js';
import ToolCard from './ToolCard.js';

interface Props {
  msg: MessageEnvelope;
  darkMode?: boolean;
}

// ===================== 简单 Markdown 渲染 =====================

/** HTML 转义 */
function escapeHtmlSimple(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 简单 Markdown → HTML（纯正则，无依赖） */
function renderSimpleMarkdown(md: string): string {
  if (!md) return '';
  let html = escapeHtmlSimple(md);

  // 代码块（```lang\n...```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 无序列表
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 换行
  html = html.replace(/\n/g, '<br/>');

  return html;
}

// ===================== 组件 =====================

const MessageBubble: React.FC<Props> = memo(function MessageBubble({ msg, darkMode = false }) {
  const isUser = msg.role === 'user';
  const isLoading = msg.isStreaming && !msg.content;
  const showCursor = msg.isStreaming && !!msg.content;

  // 简单 Markdown 渲染
  const renderedContent = renderSimpleMarkdown(msg.content);

  return (
    <div className={`cdf-msg ${isUser ? 'cdf-msg--user' : 'cdf-msg--assistant'} ${darkMode ? 'cdf-dark' : ''}`}>
      <div className="cdf-bubble">
        {/* 加载态 */}
        {isLoading && (
          <div className="cdf-loading">
            <span className="cdf-spinner" /> 思考中...
          </div>
        )}

        {/* 消息内容 */}
        {msg.content && (
          <div className="cdf-content" dangerouslySetInnerHTML={{ __html: renderedContent }} />
        )}

        {/* 流式光标 */}
        {showCursor && <span className="cdf-cursor">|</span>}

        {/* 工具卡片 */}
        {msg.toolBlocks?.map(block => (
          <ToolCard key={block.id} block={block} />
        ))}

        {/* 底部元数据 */}
        {!msg.isStreaming && msg.meta && (
          <div className="cdf-meta">
            {msg.meta.model && <span className="cdf-meta__model">{msg.meta.model}</span>}
            {msg.meta.elapsedMs > 0 && <span className="cdf-meta__elapsed">{msg.meta.elapsedMs}ms</span>}
            {msg.meta.tokenIn > 0 && (
              <span className="cdf-meta__token">{msg.meta.tokenIn}/{msg.meta.tokenOut}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
