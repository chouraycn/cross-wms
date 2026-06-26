/**
 * 轻量版会话引用选择器 — 纯 CSS + React，无 MUI 依赖
 *
 * - @ 触发：输入 "@" 后弹出
 * - 支持搜索过滤
 * - 支持键盘导航（↑↓ Enter Esc）
 * - 显示会话标题和时间
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChatSidebar } from '../../contexts/ChatContext.js';
import type { Session } from '../../types/chat.js';

interface Props {
  /** 触发弹出的锚点元素 */
  anchorEl: HTMLElement | null;
  /** 选中回调 */
  onSelect: (session: Session) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/** 简易时间格式化 */
function formatTimeAgo(dateStr: string): string {
  try {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 30) return `${days} 天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
  } catch {
    return dateStr;
  }
}

export const SessionRefSelectorLite: React.FC<Props> = ({
  anchorEl,
  onSelect,
  onClose,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  // 从 ChatSidebarContext 获取会话列表
  const { sessions: allSessions } = useChatSidebar();

  // 过滤：只显示有消息的会话 + 搜索
  const sessions = useMemo(() => {
    const withMessages = allSessions.filter(s => (s.messageCount ?? s.messages.length) > 0);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return withMessages;
    return withMessages.filter(s => {
      const title = s.title || '新对话';
      return title.toLowerCase().includes(q);
    });
  }, [allSessions, searchQuery]);

  // 滚动到高亮项
  useEffect(() => {
    if (hoveredIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-session-index]');
      const target = items[hoveredIndex] as HTMLElement;
      if (target) target.scrollIntoView({ block: 'nearest' });
    }
  }, [hoveredIndex]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHoveredIndex(prev => Math.min(prev + 1, sessions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHoveredIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && hoveredIndex >= 0) {
        e.preventDefault();
        onSelect(sessions[hoveredIndex]);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hoveredIndex, sessions, onSelect, onClose]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (anchorEl && !anchorEl.contains(e.target as Node) && listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;

  const anchorRect = anchorEl.getBoundingClientRect();
  const popupWidth = 380;
  const popupLeft = Math.max(8, Math.min(
    anchorRect.left + (anchorRect.width - popupWidth) / 2,
    window.innerWidth - popupWidth - 8
  ));

  return (
    <div
      ref={listRef}
      className="cdf-session-selector"
      style={{
        position: 'fixed',
        bottom: `calc(100vh - ${anchorRect.top}px + 8px)`,
        left: popupLeft,
        width: popupWidth,
        maxHeight: 400,
        overflow: 'auto',
        zIndex: 1400,
      }}
    >
      {/* 搜索框 */}
      <div className="cdf-session-selector__search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {sessions.length === 0 ? (
        <div className="cdf-session-selector__empty">
          {searchQuery ? '未找到匹配的会话' : '暂无历史会话'}
        </div>
      ) : (
        <div className="cdf-session-selector__list">
          {sessions.map((session, index) => {
            const isHovered = index === hoveredIndex;
            return (
              <div
                key={session.id}
                data-session-index={index}
                className={`cdf-session-selector__item ${isHovered ? 'cdf-session-selector__item--hover' : ''}`}
                onClick={() => onSelect(session)}
                onMouseEnter={() => setHoveredIndex(index)}
              >
                <div className="cdf-session-selector__icon">💬</div>
                <div className="cdf-session-selector__info">
                  <div className="cdf-session-selector__title">{session.title || '新对话'}</div>
                  <div className="cdf-session-selector__time">{formatTimeAgo(session.updatedAt || session.createdAt || '')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
