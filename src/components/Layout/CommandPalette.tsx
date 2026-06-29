import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  useTheme,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import { getGrayScale } from '../../constants/theme';
import { useNavigate } from 'react-router-dom';
import { useChatSidebar } from '../../contexts/ChatContext';
import type { Session } from '../../types/chat';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.getDay()];
  } else {
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  }
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const { sessions } = useChatSidebar();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSessions = useMemo(() => {
    return sessions.filter(s => s.status !== 'archived' && s.status !== 'daily_reset');
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const sorted = [...activeSessions].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary?.toLowerCase().includes(q)
    );
  }, [activeSessions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const handleSessionClick = useCallback(
    (session: Session) => {
      navigate(`/chat?session=${encodeURIComponent(session.id)}`);
      onClose();
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(filteredSessions.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredSessions.length) % Math.max(filteredSessions.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredSessions[activeIndex]) {
          handleSessionClick(filteredSessions[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, filteredSessions, handleSessionClick, onClose]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          bgcolor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
          boxShadow: isDark
            ? '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
            : '0 16px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          mt: '12vh',
          overflow: 'hidden',
        },
      }}
      BackdropProps={{
        sx: { bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)' },
      }}
    >
      <DialogContent sx={{ p: 0, '&:first-of-type': { pt: 0 } }}>
        {/* Search bar */}
        <Box
          sx={{
            px: 2,
            pt: 2,
            pb: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <SearchIcon sx={{ color: gs.textMuted, fontSize: 20, flexShrink: 0, ml: 0.5 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索历史对话"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '15px',
              fontWeight: 400,
              color: gs.textPrimary,
              fontFamily: 'inherit',
              padding: '6px 0',
            }}
          />
          <IconButton
            size="small"
            onClick={onClose}
            sx={{
              color: gs.textMuted,
              p: 0.5,
              '&:hover': {
                backgroundColor: gs.bgHover,
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Result count */}
        <Box sx={{ px: 2.5, pb: 1 }}>
          <Typography
            sx={{
              fontSize: '13px',
              fontWeight: 500,
              color: gs.textMuted,
            }}
          >
            {query
              ? `找到 ${filteredSessions.length} 个结果`
              : `搜索到 ${filteredSessions.length} 个对话`}
          </Typography>
        </Box>

        {/* Session list */}
        <Box
          sx={{
            maxHeight: 400,
            overflowY: 'auto',
            px: 1,
            pb: 1,
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
              borderRadius: '3px',
            },
          }}
        >
          {filteredSessions.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '14px' }}>
                {query ? '没有找到匹配的对话' : '暂无历史对话'}
              </Typography>
            </Box>
          ) : (
            filteredSessions.map((session, index) => {
              const isActive = index === activeIndex;
              return (
                <Box
                  key={session.id}
                  onClick={() => handleSessionClick(session)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 1.5,
                    py: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: isActive ? gs.bgActive : 'transparent',
                    transition: 'background-color 0.15s ease',
                    '&:hover': {
                      backgroundColor: isActive ? gs.bgActive : gs.bgHover,
                    },
                  }}
                >
                  {/* Left: session title + summary */}
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '15px',
                        fontWeight: 500,
                        color: gs.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.3,
                      }}
                    >
                      {session.title || '新对话'}
                    </Typography>
                    {session.summary && (
                      <Typography
                        sx={{
                          fontSize: '13px',
                          color: gs.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.3,
                        }}
                      >
                        {session.summary}
                      </Typography>
                    )}
                  </Box>

                  {/* Right: folder icon + time/category */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexShrink: 0,
                    }}
                  >
                    {session.isPinned ? (
                      <PushPinIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                    ) : (
                      <FolderOutlinedIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
                    )}
                    <Typography
                      sx={{
                        fontSize: '13px',
                        color: gs.textMuted,
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTime(session.updatedAt || session.createdAt)}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
