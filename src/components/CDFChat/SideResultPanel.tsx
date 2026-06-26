import React, { useState } from 'react';

export interface SideResultItem {
  id: string;
  type: 'file' | 'code' | 'image' | 'link' | 'text';
  title: string;
  content?: string;
  url?: string;
  timestamp: number;
  status: 'success' | 'error' | 'running';
}

interface SideResultPanelProps {
  items: SideResultItem[];
  darkMode?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onItemClick?: (item: SideResultItem) => void;
}

const FileIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const CodeIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const ImageIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const LinkIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const ChevronRightIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const getTypeIcon = (type: SideResultItem['type']) => {
  switch (type) {
    case 'file': return <FileIcon />;
    case 'code': return <CodeIcon />;
    case 'image': return <ImageIcon />;
    case 'link': return <LinkIcon />;
    default: return <FileIcon />;
  }
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const SideResultPanel: React.FC<SideResultPanelProps> = ({
  items,
  darkMode = false,
  isOpen,
  onToggle,
  onItemClick,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const runningCount = items.filter(i => i.status === 'running').length;

  if (!isOpen) {
    return (
      <button
        className={`cdf-side-result-toggle ${darkMode ? 'cdf-dark' : ''}`}
        onClick={onToggle}
        title="副作用结果"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        {items.length > 0 && (
          <span className="cdf-side-result-badge">{items.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className={`cdf-side-result-panel ${darkMode ? 'cdf-dark' : ''}`}>
      <div className="cdf-side-result-panel__header">
        <div className="cdf-side-result-panel__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span>副作用结果</span>
          {items.length > 0 && (
            <span className="cdf-side-result-panel__count">{items.length}</span>
          )}
        </div>
        <button
          className="cdf-side-result-panel__close"
          onClick={onToggle}
          title="关闭"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {items.length > 0 && (
        <div className="cdf-side-result-panel__stats">
          {successCount > 0 && <span className="cdf-side-result-panel__stat cdf-side-result-panel__stat--success">成功 {successCount}</span>}
          {errorCount > 0 && <span className="cdf-side-result-panel__stat cdf-side-result-panel__stat--error">失败 {errorCount}</span>}
          {runningCount > 0 && <span className="cdf-side-result-panel__stat cdf-side-result-panel__stat--running">进行中 {runningCount}</span>}
        </div>
      )}

      <div className="cdf-side-result-panel__list">
        {items.length === 0 ? (
          <div className="cdf-side-result-panel__empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span>暂无副作用结果</span>
          </div>
        ) : (
          items.map(item => {
            const isExpanded = expandedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`cdf-side-result-item cdf-side-result-item--${item.status}`}
                onClick={() => {
                  toggleExpand(item.id);
                  onItemClick?.(item);
                }}
              >
                <div className="cdf-side-result-item__header">
                  <div className="cdf-side-result-item__icon">
                    {getTypeIcon(item.type)}
                  </div>
                  <div className="cdf-side-result-item__info">
                    <div className="cdf-side-result-item__title">{item.title}</div>
                    <div className="cdf-side-result-item__time">{formatTime(item.timestamp)}</div>
                  </div>
                  <ChevronRightIcon open={isExpanded} />
                </div>
                {isExpanded && item.content && (
                  <div className="cdf-side-result-item__content">
                    {item.type === 'code' ? (
                      <pre>{item.content}</pre>
                    ) : (
                      <p>{item.content}</p>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="cdf-side-result-item__link"
                      >
                        打开链接
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .cdf-side-result-panel {
          width: 320px;
          height: 100%;
          background: var(--cdf-bg-panel);
          border-left: 1px solid var(--cdf-border);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          font-family: var(--cdf-font);
        }

        .cdf-side-result-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--cdf-border);
        }

        .cdf-side-result-panel__title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--cdf-text-primary);
        }

        .cdf-side-result-panel__count {
          background: var(--cdf-bg-hover);
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 500;
          color: var(--cdf-text-secondary);
        }

        .cdf-side-result-panel__close {
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
        }

        .cdf-side-result-panel__close:hover {
          background: var(--cdf-bg-hover);
          color: var(--cdf-text-primary);
        }

        .cdf-side-result-panel__stats {
          display: flex;
          gap: 8px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--cdf-border);
        }

        .cdf-side-result-panel__stat {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: 500;
        }

        .cdf-side-result-panel__stat--success {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .cdf-side-result-panel__stat--error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .cdf-side-result-panel__stat--running {
          background: rgba(249, 115, 22, 0.1);
          color: #f97316;
        }

        .cdf-side-result-panel__list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .cdf-side-result-panel__list::-webkit-scrollbar {
          width: 6px;
        }

        .cdf-side-result-panel__list::-webkit-scrollbar-track {
          background: transparent;
        }

        .cdf-side-result-panel__list::-webkit-scrollbar-thumb {
          background: var(--cdf-border-darker);
          border-radius: 3px;
        }

        .cdf-side-result-panel__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 16px;
          color: var(--cdf-text-muted);
          gap: 12px;
          font-size: 13px;
        }

        .cdf-side-result-item {
          border-radius: 8px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: background-color 0.15s ease;
          border: 1px solid transparent;
        }

        .cdf-side-result-item:hover {
          background: var(--cdf-bg-hover);
        }

        .cdf-side-result-item--error {
          border-left: 3px solid #ef4444;
        }

        .cdf-side-result-item--success {
          border-left: 3px solid #10b981;
        }

        .cdf-side-result-item--running {
          border-left: 3px solid #f97316;
        }

        .cdf-side-result-item__header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
        }

        .cdf-side-result-item__icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: var(--cdf-bg-input);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--cdf-text-secondary);
          flex-shrink: 0;
        }

        .cdf-side-result-item__info {
          flex: 1;
          min-width: 0;
        }

        .cdf-side-result-item__title {
          font-size: 13px;
          font-weight: 500;
          color: var(--cdf-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cdf-side-result-item__time {
          font-size: 11px;
          color: var(--cdf-text-disabled);
          margin-top: 2px;
        }

        .cdf-side-result-item__content {
          padding: 0 12px 12px;
          padding-left: 50px;
        }

        .cdf-side-result-item__content pre {
          background: var(--cdf-bg-input);
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 12px;
          overflow-x: auto;
          margin: 0;
          color: var(--cdf-text-primary);
          font-family: 'SF Mono', Monaco, 'Courier New', monospace;
        }

        .cdf-side-result-item__content p {
          font-size: 13px;
          color: var(--cdf-text-secondary);
          margin: 0 0 8px 0;
          line-height: 1.5;
          word-break: break-word;
        }

        .cdf-side-result-item__link {
          font-size: 12px;
          color: #3b82f6;
          text-decoration: none;
        }

        .cdf-side-result-item__link:hover {
          text-decoration: underline;
        }

        .cdf-side-result-toggle {
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

        .cdf-side-result-toggle:hover {
          background: var(--cdf-bg-hover);
          color: var(--cdf-text-primary);
          width: 40px;
        }

        .cdf-side-result-badge {
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

export default SideResultPanel;
