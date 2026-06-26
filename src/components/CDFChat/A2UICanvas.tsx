import React from 'react';
import { A2UIRenderer } from './A2UIRenderer';
import type { A2UICanvasProps, A2UICanvasState, A2UIEventHandler } from './a2uiTypes';

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const StatusDot: React.FC<{ status: A2UICanvasState['status'] }> = ({ status }) => {
  const colorMap: Record<string, string> = {
    idle: '#9CA3AF',
    loading: '#F97316',
    rendering: '#3B82F6',
    error: '#EF4444',
  };

  return (
    <span
      className="a2ui-canvas__status-dot"
      style={{
        background: colorMap[status] || '#9CA3AF',
      }}
    />
  );
};

export const A2UICanvas: React.FC<A2UICanvasProps> = ({
  canvases,
  activeCanvasId,
  isOpen,
  darkMode = false,
  onToggle,
  onClose,
  onMinimize,
  onMaximize,
  onCanvasChange,
  onEvent,
  isMaximized = false,
}) => {
  const activeCanvas = canvases.find(c => c.id === activeCanvasId);

  const handleEvent: A2UIEventHandler = (event) => {
    if (onEvent) {
      onEvent(event);
    }
  };

  if (!isOpen) {
    return (
      <button
        className={`a2ui-canvas-toggle ${darkMode ? 'cdf-dark' : ''}`}
        onClick={onToggle}
        title="A2UI 实时画布"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        {canvases.length > 0 && (
          <span className="a2ui-canvas-toggle__badge">{canvases.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className={`a2ui-canvas-panel ${darkMode ? 'cdf-dark' : ''} ${isMaximized ? 'a2ui-canvas-panel--maximized' : ''}`}>
      <div className="a2ui-canvas-panel__header">
        <div className="a2ui-canvas-panel__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          <span>A2UI 实时画布</span>
          {canvases.length > 0 && (
            <span className="a2ui-canvas-panel__count">{canvases.length}</span>
          )}
        </div>
        <div className="a2ui-canvas-panel__actions">
          {onMinimize && (
            <button
              className="a2ui-canvas-panel__action-btn"
              onClick={onMinimize}
              title="最小化"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          {onMaximize && (
            <button
              className="a2ui-canvas-panel__action-btn"
              onClick={onMaximize}
              title={isMaximized ? '还原' : '最大化'}
            >
              {isMaximized ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
              )}
            </button>
          )}
          <button
            className="a2ui-canvas-panel__action-btn"
            onClick={onClose}
            title="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {canvases.length > 1 && (
        <div className="a2ui-canvas-panel__tabs">
          {canvases.map(canvas => (
            <button
              key={canvas.id}
              className={`a2ui-canvas-tab ${canvas.id === activeCanvasId ? 'a2ui-canvas-tab--active' : ''}`}
              onClick={() => onCanvasChange(canvas.id)}
            >
              <StatusDot status={canvas.status} />
              <span className="a2ui-canvas-tab__title">{canvas.title}</span>
            </button>
          ))}
        </div>
      )}

      {activeCanvas && (
        <div className="a2ui-canvas-panel__meta">
          <div className="a2ui-canvas-panel__meta-title">
            {activeCanvas.title}
          </div>
          <div className="a2ui-canvas-panel__meta-time">
            更新于 {formatTime(activeCanvas.updatedAt)}
          </div>
        </div>
      )}

      <div className="a2ui-canvas-panel__content">
        {canvases.length === 0 ? (
          <div className="a2ui-canvas-panel__empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <div className="a2ui-canvas-panel__empty-title">暂无画布</div>
            <div className="a2ui-canvas-panel__empty-desc">
              Agent 生成的 UI 组件将在这里显示
            </div>
          </div>
        ) : activeCanvas ? (
          activeCanvas.status === 'error' ? (
            <div className="a2ui-canvas-panel__error">
              <div className="a2ui-canvas-panel__error-icon">⚠️</div>
              <div className="a2ui-canvas-panel__error-title">画布渲染错误</div>
              <div className="a2ui-canvas-panel__error-message">
                {activeCanvas.error || '未知错误'}
              </div>
            </div>
          ) : activeCanvas.content ? (
            <A2UIRenderer
              a2uiContent={JSON.stringify(activeCanvas.content)}
              onEvent={handleEvent}
              darkMode={darkMode}
            />
          ) : (
            <div className="a2ui-canvas-panel__empty-content">
              <div className="a2ui-canvas-panel__empty-content-icon">📝</div>
              <div className="a2ui-canvas-panel__empty-content-text">等待内容...</div>
            </div>
          )
        ) : null}
      </div>

      <style>{`
        .a2ui-canvas-panel {
          width: 400px;
          height: 100%;
          background: var(--cdf-bg-panel);
          border-left: 1px solid var(--cdf-border);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          font-family: var(--cdf-font);
          position: relative;
        }

        .a2ui-canvas-panel--maximized {
          width: 100%;
          position: absolute;
          top: 0;
          right: 0;
          height: 100%;
          z-index: 100;
        }

        .a2ui-canvas-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--cdf-border);
          flex-shrink: 0;
        }

        .a2ui-canvas-panel__title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--cdf-text-primary);
        }

        .a2ui-canvas-panel__count {
          background: var(--cdf-bg-hover);
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 500;
          color: var(--cdf-text-secondary);
        }

        .a2ui-canvas-panel__actions {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .a2ui-canvas-panel__action-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--cdf-text-muted);
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          padding: 0;
        }

        .a2ui-canvas-panel__action-btn:hover {
          background: var(--cdf-bg-hover);
          color: var(--cdf-text-primary);
        }

        .a2ui-canvas-panel__tabs {
          display: flex;
          gap: 2px;
          padding: 8px 8px 0;
          border-bottom: 1px solid var(--cdf-border);
          overflow-x: auto;
          flex-shrink: 0;
        }

        .a2ui-canvas-panel__tabs::-webkit-scrollbar {
          height: 4px;
        }

        .a2ui-canvas-panel__tabs::-webkit-scrollbar-track {
          background: transparent;
        }

        .a2ui-canvas-panel__tabs::-webkit-scrollbar-thumb {
          background: var(--cdf-border-darker);
          border-radius: 2px;
        }

        .a2ui-canvas-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: var(--cdf-text-muted);
          font-size: 12px;
          font-weight: 500;
          font-family: var(--cdf-font);
          cursor: pointer;
          border-radius: 6px 6px 0 0;
          white-space: nowrap;
          transition: all 0.15s ease;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }

        .a2ui-canvas-tab:hover {
          color: var(--cdf-text-primary);
          background: var(--cdf-bg-hover);
        }

        .a2ui-canvas-tab--active {
          color: #f97316;
          border-bottom-color: #f97316;
          background: transparent;
        }

        .a2ui-canvas-tab__title {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .a2ui-canvas__status-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .a2ui-canvas-panel__meta {
          padding: 8px 16px;
          border-bottom: 1px solid var(--cdf-border-lighter);
          flex-shrink: 0;
        }

        .a2ui-canvas-panel__meta-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--cdf-text-primary);
          margin-bottom: 2px;
        }

        .a2ui-canvas-panel__meta-time {
          font-size: 11px;
          color: var(--cdf-text-disabled);
        }

        .a2ui-canvas-panel__content {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }

        .a2ui-canvas-panel__content::-webkit-scrollbar {
          width: 6px;
        }

        .a2ui-canvas-panel__content::-webkit-scrollbar-track {
          background: transparent;
        }

        .a2ui-canvas-panel__content::-webkit-scrollbar-thumb {
          background: var(--cdf-border-darker);
          border-radius: 3px;
        }

        .a2ui-canvas-panel__content::-webkit-scrollbar-thumb:hover {
          background: var(--cdf-text-disabled);
        }

        .a2ui-canvas-panel__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          color: var(--cdf-text-muted);
          gap: 12px;
          text-align: center;
        }

        .a2ui-canvas-panel__empty-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--cdf-text-secondary);
        }

        .a2ui-canvas-panel__empty-desc {
          font-size: 12px;
          color: var(--cdf-text-muted);
          max-width: 200px;
          line-height: 1.5;
        }

        .a2ui-canvas-panel__empty-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          color: var(--cdf-text-muted);
          gap: 8px;
        }

        .a2ui-canvas-panel__empty-content-icon {
          font-size: 32px;
        }

        .a2ui-canvas-panel__empty-content-text {
          font-size: 13px;
          color: var(--cdf-text-muted);
        }

        .a2ui-canvas-panel__error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          text-align: center;
          gap: 8px;
        }

        .a2ui-canvas-panel__error-icon {
          font-size: 32px;
          margin-bottom: 4px;
        }

        .a2ui-canvas-panel__error-title {
          font-size: 14px;
          font-weight: 600;
          color: #ef4444;
        }

        .a2ui-canvas-panel__error-message {
          font-size: 12px;
          color: var(--cdf-text-muted);
          max-width: 300px;
          word-break: break-word;
        }

        .a2ui-canvas-toggle {
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 72px;
          border: 1px solid var(--cdf-border);
          border-right: none;
          background: var(--cdf-bg-panel);
          color: var(--cdf-text-secondary);
          cursor: pointer;
          border-radius: 8px 0 0 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          z-index: 10;
        }

        .a2ui-canvas-toggle:hover {
          background: var(--cdf-bg-hover);
          color: var(--cdf-text-primary);
          width: 40px;
        }

        .a2ui-canvas-toggle__badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #f97316;
          color: white;
          font-size: 10px;
          font-weight: 600;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }
      `}</style>
    </div>
  );
};

export default A2UICanvas;
