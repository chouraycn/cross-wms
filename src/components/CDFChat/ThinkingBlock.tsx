/**
 * CDFChat 思考过程展示组件
 *
 * - 折叠/展开的思考过程卡片
 * - 默认收起，显示"已深度思考，用时 X 秒"
 * - 点击展开显示完整的思考内容
 * - 思考中时显示动画（闪烁的思考中...）
 * - 纯 CSS + React，无 MUI 依赖
 */
import React, { useState } from 'react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
  durationMs?: number;
  darkMode?: boolean;
}

const LightbulbIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
);

const ChevronDownIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  isStreaming = false,
  durationMs,
  darkMode = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatDuration = (ms: number | undefined): string => {
    if (!ms || ms <= 0) return '';
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds} 秒`;
  };

  const hasContent = content && content.length > 0;

  return (
    <div className={`cdf-thinking-block ${darkMode ? 'cdf-dark' : ''}`}>
      <button
        className="cdf-thinking-block__header"
        onClick={() => !isStreaming && setIsOpen(!isOpen)}
        disabled={isStreaming}
      >
        <div className="cdf-thinking-block__header-left">
          <span className="cdf-thinking-block__icon">
            <LightbulbIcon />
          </span>
          <span className="cdf-thinking-block__label">
            {isStreaming ? (
              <span className="cdf-thinking-block__thinking">
                思考中
                <span className="cdf-thinking-block__dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </span>
            ) : (
              <>已深度思考{durationMs ? `，用时 ${formatDuration(durationMs)}` : ''}</>
            )}
          </span>
        </div>
        {!isStreaming && hasContent && (
          <span className="cdf-thinking-block__arrow">
            <ChevronDownIcon open={isOpen} />
          </span>
        )}
      </button>

      {isOpen && hasContent && (
        <div className="cdf-thinking-block__content">
          <pre className="cdf-thinking-block__text">{content}</pre>
        </div>
      )}
    </div>
  );
};

export default ThinkingBlock;
