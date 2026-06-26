/**
 * CDFChat 消息操作工具栏组件
 *
 * - 悬停在消息上时显示操作按钮
 * - AI 消息：复制、重新生成、编辑、删除
 * - 用户消息：复制、删除
 * - 按钮以图标形式显示，hover 时有 tooltip
 * - 纯 CSS + React，无 MUI 依赖
 */
import React from 'react';

interface MessageActionsProps {
  role: 'user' | 'assistant';
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  darkMode?: boolean;
}

const CopyIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const RegenerateIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const EditIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const DeleteIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const PinIcon: React.FC<{ pinned?: boolean }> = ({ pinned }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </svg>
);

const MessageActions: React.FC<MessageActionsProps> = ({
  role,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onPin,
  isPinned = false,
  darkMode = false,
}) => {
  const isAssistant = role === 'assistant';

  return (
    <div className={`cdf-msg-actions ${darkMode ? 'cdf-dark' : ''}`}>
      <button
        className="cdf-msg-actions__btn"
        onClick={onCopy}
        title="复制"
        aria-label="复制"
      >
        <CopyIcon />
        <span className="cdf-msg-actions__tooltip">复制</span>
      </button>

      {isAssistant && onRegenerate && (
        <button
          className="cdf-msg-actions__btn"
          onClick={onRegenerate}
          title="重新生成"
          aria-label="重新生成"
        >
          <RegenerateIcon />
          <span className="cdf-msg-actions__tooltip">重新生成</span>
        </button>
      )}

      {isAssistant && onEdit && (
        <button
          className="cdf-msg-actions__btn"
          onClick={onEdit}
          title="编辑"
          aria-label="编辑"
        >
          <EditIcon />
          <span className="cdf-msg-actions__tooltip">编辑</span>
        </button>
      )}

      {onPin && (
        <button
          className={`cdf-msg-actions__btn ${isPinned ? 'cdf-msg-actions__btn--active' : ''}`}
          onClick={onPin}
          title={isPinned ? '取消置顶' : '置顶'}
          aria-label={isPinned ? '取消置顶' : '置顶'}
        >
          <PinIcon pinned={isPinned} />
          <span className="cdf-msg-actions__tooltip">{isPinned ? '取消置顶' : '置顶'}</span>
        </button>
      )}

      {onDelete && (
        <button
          className="cdf-msg-actions__btn cdf-msg-actions__btn--delete"
          onClick={onDelete}
          title="删除"
          aria-label="删除"
        >
          <DeleteIcon />
          <span className="cdf-msg-actions__tooltip">删除</span>
        </button>
      )}
    </div>
  );
};

export default MessageActions;
