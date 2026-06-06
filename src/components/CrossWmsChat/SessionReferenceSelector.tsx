import React, { useState, useRef, useEffect } from 'react';
import { Paper, List, ListItem, ListItemText, ListItemIcon, Typography, Box, TextField, InputAdornment } from '@mui/material';
import { Session } from '../../types/chat';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SearchIcon from '@mui/icons-material/Search';

/** 与 ChatPage 共享的 localStorage key */
const SESSIONS_STORAGE_KEY = 'crosswms-chat-sessions';

/** 从 localStorage 加载会话列表（与 ChatPage/NavList 使用同一数据源） */
function loadSessionsFromStorage(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s: Record<string, unknown>) => ({
          ...s,
          messages: Array.isArray(s.messages)
            ? s.messages.map((m: Record<string, unknown>) => ({
                ...m,
                timestamp: new Date(m.timestamp as string),
              }))
            : [],
          // 确保 title/updatedAt 存在
          title: typeof s.title === 'string' ? s.title : '',
          updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : typeof s.createdAt === 'string' ? s.createdAt : undefined,
        })) as Session[];
      }
    }
  } catch { /* 数据损坏时静默返回空数组 */ }
  return [];
}

interface SessionReferenceSelectorProps {
  anchorEl: HTMLElement | null;
  onSelect: (session: Session) => void;
  onClose: () => void;
}

/** 简易时间格式化：N 分钟前 / N 小时前 / N 天前 */
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

export function SessionReferenceSelector({ anchorEl, onSelect, onClose }: SessionReferenceSelectorProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [allSessions, setAllSessions] = useState<Session[]>([]);

  // 从 localStorage 加载（与 NavList 侧边栏使用同一数据源）
  useEffect(() => {
    setAllSessions(loadSessionsFromStorage());
  }, []);

  // 前端过滤（按标题模糊匹配）
  const sessions = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSessions;
    return allSessions.filter(s =>
      (s.title || '').toLowerCase().includes(q)
    );
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

  // Close on click outside
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
    <Paper
      ref={listRef}
      elevation={4}
      sx={{
        position: 'fixed',
        bottom: `calc(100vh - ${anchorRect.top}px + 8)`,
        left: popupLeft,
        width: popupWidth,
        maxHeight: 400,
        overflow: 'auto',
        zIndex: 1400,
        borderRadius: '10px',
        border: '1px solid #E5E7EB',
        bgcolor: '#FFFFFF',
        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* 标题栏 + 搜索框 */}
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #F3F4F6' }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#6B7280', mb: 0.5 }}>
          引用历史对话
        </Typography>
        <TextField
          size="small"
          fullWidth
          placeholder="搜索对话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: 13,
              bgcolor: '#F9FAFB',
              borderRadius: '6px',
              '& fieldset': { borderColor: '#E5E7EB' },
              '&:hover fieldset': { borderColor: '#D1D5DB' },
              '&.Mui-focused fieldset': { borderColor: '#3B82F6' },
            },
          }}
        />
      </Box>

      {sessions.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>未找到对话记录</Typography>
        </Box>
      ) : (
        <List sx={{ py: 0.5, px: 0 }}>
          {sessions.map((session, index) => (
            <ListItem
              key={session.id}
              data-session-index={index}
              onClick={() => onSelect(session)}
              onMouseEnter={() => setHoveredIndex(index)}
              sx={{
                py: 1,
                px: 1.5,
                cursor: 'pointer',
                bgcolor: hoveredIndex === index ? '#F3F4F6' : 'transparent',
                borderRadius: 1,
                mx: 0.5,
                transition: 'background-color 0.1s',
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 20, color: '#6B7280' }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#111827' }} noWrap>
                    {session.title}
                  </Typography>
                }
                secondary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                    <Typography sx={{ fontSize: 11, color: '#9CA3AF' }} noWrap>
                      {session.model}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: '#D1D5DB' }}>
                      ·
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: '#9CA3AF' }} noWrap>
                      {session.updatedAt ? formatTimeAgo(session.updatedAt) : '未知时间'}
                    </Typography>
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
