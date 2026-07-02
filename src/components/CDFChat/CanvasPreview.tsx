/**
 * Canvas 交互预览组件 — 基于 OpenClaw Canvas 设计
 *
 * 支持：
 * - iframe 嵌入预览
 * - 沙箱模式（禁用脚本/表单）
 * - 折叠/展开
 * - 在新窗口打开
 */

import React, { useState, useMemo } from 'react';

interface CanvasPreviewProps {
  /** Canvas URL */
  url: string;
  /** 标题 */
  title: string;
  /** 高度 */
  height?: number;
  /** 是否启用沙箱模式 */
  sandbox?: boolean;
  /** 点击展开回调 */
  onExpand?: () => void;
}

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({
  url,
  title,
  height = 300,
  sandbox = true,
  onExpand,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const sandboxAttr = useMemo(() => {
    if (!sandbox) return undefined;
    return 'allow-scripts allow-same-origin allow-popups allow-forms';
  }, [sandbox]);

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleOpenNew = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (hasError) {
    return (
      <div className="cdf-canvas-preview cdf-canvas-preview--error">
        <div className="cdf-canvas-preview__header">
          <span className="cdf-canvas-preview__icon">🖥</span>
          <span className="cdf-canvas-preview__title">{title}</span>
        </div>
        <div className="cdf-canvas-preview__error">
          <p>无法在此处预览该内容</p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            在新窗口中打开
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="cdf-canvas-preview">
      <div className="cdf-canvas-preview__header">
        <span className="cdf-canvas-preview__icon">🖥</span>
        <span className="cdf-canvas-preview__title">{title}</span>
        <div className="cdf-canvas-preview__actions">
          <button onClick={handleToggle} aria-label={isCollapsed ? '展开' : '折叠'}>
            {isCollapsed ? '▼' : '▲'}
          </button>
          <button onClick={handleOpenNew} aria-label="在新窗口打开">
            ↗
          </button>
          {onExpand && (
            <button onClick={onExpand} aria-label="展开到侧边栏">
              ⬜
            </button>
          )}
        </div>
      </div>
      {!isCollapsed && (
        <div className="cdf-canvas-preview__body" style={{ height }}>
          {isLoading && (
            <div className="cdf-canvas-preview__loading">加载中...</div>
          )}
          <iframe
            src={url}
            title={title}
            sandbox={sandboxAttr}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: isLoading ? 'none' : 'block',
            }}
            onLoad={() => setIsLoading(false)}
            onError={() => setHasError(true)}
          />
        </div>
      )}
    </div>
  );
};
