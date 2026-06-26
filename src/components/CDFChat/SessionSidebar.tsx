import React, { useState, useEffect, useRef } from 'react';
import { getSessions, deleteSession, updateSession } from '../../services/api';
import type { Session } from '../../types/chat';

interface SessionSidebarProps {
  sessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  darkMode?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return '今天';
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (year === today.getFullYear()) {
    return `${month}-${day}`;
  }
  return `${year}-${month}-${day}`;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  darkMode = false,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await getSessions('active', searchQuery || undefined);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [searchQuery]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      onDeleteSession(id);
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const startRename = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title);
    setContextMenu(null);
  };

  const finishRename = async () => {
    if (!editingId) return;
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== sessions.find(s => s.id === editingId)?.title) {
      try {
        const updated = await updateSession(editingId, { title: trimmed });
        setSessions(prev => prev.map(s => s.id === editingId ? updated : s));
        onRenameSession(editingId, trimmed);
      } catch (err) {
        console.error('Failed to rename session:', err);
      }
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const handleDoubleClick = (session: Session) => {
    startRename(session);
  };

  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  if (collapsed) {
    return (
      <div
        className={`cdf-session-sidebar ${darkMode ? 'cdf-dark' : ''}`}
        style={{
          width: 48,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 8px',
          gap: 8,
          background: 'var(--cdf-bg-panel)',
          borderRight: '1px solid var(--cdf-border)',
          height: '100%',
          flexShrink: 0,
          fontFamily: 'var(--cdf-font)',
        }}
      >
        <button
          onClick={onNewSession}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--cdf-text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--cdf-bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="新建会话"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div style={{ width: 24, height: 1, background: 'var(--cdf-border)' }} />
        <button
          onClick={onToggleCollapse}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--cdf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s ease',
            marginTop: 'auto',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--cdf-bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="展开侧边栏"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={sidebarRef}
      className={`cdf-session-sidebar ${darkMode ? 'cdf-dark' : ''}`}
      style={{
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--cdf-bg-panel)',
        borderRight: '1px solid var(--cdf-border)',
        height: '100%',
        flexShrink: 0,
        fontFamily: 'var(--cdf-font)',
        position: 'relative',
      }}
    >
      <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onNewSession}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--cdf-border)',
            background: 'var(--cdf-bg-panel)',
            color: 'var(--cdf-text-primary)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'var(--cdf-font)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--cdf-bg-hover)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--cdf-bg-panel)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建会话
        </button>
        <button
          onClick={onToggleCollapse}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--cdf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--cdf-bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="折叠侧边栏"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '0 12px 8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'var(--cdf-bg-hover)',
            border: '1px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--cdf-text-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="搜索会话"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              color: 'var(--cdf-text-primary)',
              fontFamily: 'var(--cdf-font)',
              minWidth: 0,
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 8px 12px',
        }}
        className="scrollbar-visible"
      >
        {loading ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--cdf-text-muted)', fontSize: 13 }}>
            加载中...
          </div>
        ) : sortedSessions.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--cdf-text-muted)' }}>
              {searchQuery ? '没有找到匹配的会话' : '暂无会话'}
            </div>
          </div>
        ) : (
          sortedSessions.map(session => {
            const isSelected = session.id === sessionId;
            const isEditing = editingId === session.id;
            const dateLabel = session.updatedAt || session.createdAt
              ? formatDate(session.updatedAt || session.createdAt!)
              : '';

            return (
              <div
                key={session.id}
                style={{
                  position: 'relative',
                  marginBottom: 2,
                }}
              >
                <div
                  onClick={() => !isEditing && onSelectSession(session.id)}
                  onDoubleClick={() => !isEditing && handleDoubleClick(session)}
                  onContextMenu={e => !isEditing && handleContextMenu(e, session.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                    background: isSelected ? 'var(--cdf-bg-active)' : 'transparent',
                    position: 'relative',
                  }}
                  className="cdf-session-item"
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--cdf-bg-hover)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: isSelected ? '#FFF7ED' : 'var(--cdf-bg-input)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: isSelected ? '#F97316' : 'var(--cdf-text-muted)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onBlur={finishRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') finishRename();
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setEditTitle('');
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: '100%',
                          border: '1px solid var(--cdf-border-darker)',
                          outline: 'none',
                          background: 'var(--cdf-bg-panel)',
                          fontSize: 13,
                          color: 'var(--cdf-text-primary)',
                          fontFamily: 'var(--cdf-font)',
                          padding: '2px 6px',
                          borderRadius: 6,
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? '#F97316' : 'var(--cdf-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.4,
                        }}
                      >
                        {session.title || '未命名会话'}
                      </div>
                    )}
                    {!isEditing && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--cdf-text-disabled)',
                          marginTop: 2,
                        }}
                      >
                        {dateLabel}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (confirm('确定要删除这个会话吗？')) {
                        handleDelete(session.id);
                      }
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--cdf-text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                      padding: 0,
                    }}
                    className="cdf-session-item__delete"
                    onMouseEnter={e => {
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.opacity = '0';
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--cdf-text-muted)';
                    }}
                    title="删除会话"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--cdf-bg-panel)',
            border: '1px solid var(--cdf-border)',
            borderRadius: 10,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
            padding: 4,
            zIndex: 1500,
            minWidth: 120,
          }}
        >
          <button
            onClick={() => {
              const session = sessions.find(s => s.id === contextMenu.id);
              if (session) startRename(session);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 10px',
              border: 'none',
              background: 'transparent',
              color: 'var(--cdf-text-primary)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--cdf-font)',
              borderRadius: 6,
              textAlign: 'left',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--cdf-bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            重命名
          </button>
          <button
            onClick={() => {
              if (confirm('确定要删除这个会话吗？')) {
                handleDelete(contextMenu.id);
              }
              setContextMenu(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 10px',
              border: 'none',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--cdf-font)',
              borderRadius: 6,
              textAlign: 'left',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            删除
          </button>
        </div>
      )}

      <style>{`
        .cdf-session-sidebar .cdf-session-item:hover .cdf-session-item__delete {
          opacity: 1 !important;
        }
        
        .cdf-session-sidebar::-webkit-scrollbar {
          width: 6px;
        }
        
        .cdf-session-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .cdf-session-sidebar::-webkit-scrollbar-thumb {
          background: var(--cdf-border-darker);
          border-radius: 3px;
        }
        
        .cdf-session-sidebar::-webkit-scrollbar-thumb:hover {
          background: var(--cdf-text-disabled);
        }
      `}</style>
    </div>
  );
};

export default SessionSidebar;
