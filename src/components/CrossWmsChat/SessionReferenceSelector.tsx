import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { Paper, List, ListItem, ListItemText, ListItemIcon, Typography, Box, useTheme } from '@mui/material';
import { Session } from '../../types/chat';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SearchInput from '../Common/SearchInput';
import { getGrayScale } from '../../constants/theme';
import { subscribeSessions, getSessionsSnapshot } from '../../utils/sessionStore';

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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  // 使用 useSyncExternalStore 统一读取 sessions
  const allSessions = useSyncExternalStore(subscribeSessions, getSessionsSnapshot);

  // 过滤 + 搜索（与 NavList 侧边栏保持一致：只显示有消息的会话）
  const sessions = React.useMemo(() => {
    // 1. 与 NavList 一致：只显示有消息的会话
    const withMessages = allSessions.filter(s => s.messages.length > 0);
    // 2. 前端搜索过滤（按标题 + 首条消息内容模糊匹配）
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
        border: `1px solid ${gs.border}`,
        bgcolor: gs.bgPanel,
        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* 标题栏 + 搜索框 */}
      <Box sx={{ px: 1.5, py: 1, borderBottom: `1px solid ${gs.bgHover}` }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: gs.textMuted, mb: 0.5 }}>
          引用历史对话
        </Typography>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索对话..."
          fullWidth
          autoFocus
        />
      </Box>

      {sessions.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 13, color: gs.textDisabled }}>未找到对话记录</Typography>
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
                bgcolor: hoveredIndex === index ? gs.bgHover : 'transparent',
                borderRadius: 1,
                mx: 0.5,
                transition: 'background-color 0.1s',
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 20, color: gs.textMuted }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: gs.textPrimary }} noWrap>
                    {session.title || '新对话'}
                  </Typography>
                }
                secondary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                    <Typography sx={{ fontSize: 11, color: gs.textDisabled }} noWrap>
                      {session.model}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: gs.borderDarker }}>
                      ·
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: gs.textDisabled }} noWrap>
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
