import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  useTheme,
  IconButton,
  Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import BoltIcon from '@mui/icons-material/Bolt';
import StarIcon from '@mui/icons-material/Star';
import LayersIcon from '@mui/icons-material/Layers';
import HistoryIcon from '@mui/icons-material/History';
import { getGrayScale } from '../../constants/theme';
import { useNavigate } from 'react-router-dom';
import { useChatSidebar } from '../../contexts/ChatContext';
import type { Session } from '../../types/chat';
import { useAppStore } from '../../stores/appStore';
import { AppSettingsContext } from '../../contexts/AppSettingsContext';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type ResultType = 'session' | 'skill' | 'action' | 'page';

interface CommandResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  tags?: string[];
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

const QUICK_ACTIONS: CommandResult[] = [
  {
    id: 'new-chat',
    type: 'action',
    title: '新建对话',
    subtitle: '创建全新的对话会话',
    icon: <StarIcon sx={{ fontSize: 16, color: '#8b5cf6' }} />,
    action: () => {
      window.dispatchEvent(new CustomEvent('new-chat'));
    },
  },
  {
    id: 'clear-chat',
    type: 'action',
    title: '清空对话',
    subtitle: '清除当前会话的所有消息',
    icon: <BoltIcon sx={{ fontSize: 16, color: '#f59e0b' }} />,
    action: () => {
      window.dispatchEvent(new CustomEvent('clear-chat'));
    },
  },
  {
    id: 'tui-terminal',
    type: 'action',
    title: '终端模式',
    subtitle: '切换到 TUI 终端界面',
    icon: <LayersIcon sx={{ fontSize: 16, color: '#10b981' }} />,
    action: () => {
      window.location.href = '/terminal';
    },
  },
];

const NAVIGATION_PAGES: CommandResult[] = [
  { id: 'dashboard', type: 'page', title: '仪表盘', subtitle: '查看仓库 KPI 和统计', icon: <LayersIcon sx={{ fontSize: 16, color: '#3b82f6' }} />, action: () => {} },
  { id: 'inventory', type: 'page', title: '库存管理', subtitle: '管理仓库库存', icon: <LayersIcon sx={{ fontSize: 16, color: '#3b82f6' }} />, action: () => {} },
  { id: 'skills', type: 'page', title: '技能中心', subtitle: '管理和发现技能', icon: <LayersIcon sx={{ fontSize: 16, color: '#3b82f6' }} />, action: () => {} },
  { id: 'memory', type: 'page', title: '记忆管理', subtitle: '管理会话记忆', icon: <LayersIcon sx={{ fontSize: 16, color: '#3b82f6' }} />, action: () => {} },
  { id: 'settings', type: 'page', title: '设置', subtitle: '配置应用选项', icon: <LayersIcon sx={{ fontSize: 16, color: '#3b82f6' }} />, action: () => {} },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const { sessions } = useChatSidebar();
  const { userSkills, loadAllUsageStats } = useAppStore();
  const ctx = useContext(AppSettingsContext);
  const aiEngine = ctx?.settings?.aiEngine;
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAllUsageStats();
  }, [loadAllUsageStats]);

  const activeSessions = useMemo(() => {
    return sessions.filter(s => s.status !== 'archived' && s.status !== 'daily_reset');
  }, [sessions]);

  const sessionResults = useMemo((): CommandResult[] => {
    const sorted = [...activeSessions].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return sorted.map((session) => ({
      id: session.id,
      type: 'session',
      title: session.title || '新对话',
      subtitle: session.summary || formatTime(session.updatedAt || session.createdAt),
      icon: session.isPinned ? (
        <PushPinIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
      ) : (
        <HistoryIcon sx={{ fontSize: 16, color: gs.textMuted }} />
      ),
      action: () => {
        navigate(`/chat?session=${encodeURIComponent(session.id)}`);
        onClose();
      },
    }));
  }, [activeSessions, navigate, onClose]);

  const skillResults = useMemo((): CommandResult[] => {
    return userSkills
      .filter(s => s.status === 'active')
      .map(skill => ({
        id: skill.id,
        type: 'skill',
        title: skill.name,
        subtitle: skill.desc || skill.trigger,
        icon: <StarIcon sx={{ fontSize: 16, color: '#8b5cf6' }} />,
        action: () => {
          window.dispatchEvent(new CustomEvent('trigger-skill', { detail: { skillId: skill.id } }));
          onClose();
        },
        tags: skill.tags,
      }));
  }, [userSkills]);

  const allResults = useMemo((): CommandResult[] => {
    const q = query.toLowerCase().trim();

    let results: CommandResult[] = [];

    if (!q) {
      results = [...QUICK_ACTIONS, ...NAVIGATION_PAGES, ...sessionResults, ...skillResults];
    } else {
      const matchQuery = (text: string) => text.toLowerCase().includes(q);
      results = [
        ...QUICK_ACTIONS.filter(a => matchQuery(a.title) || matchQuery(a.subtitle || '')),
        ...NAVIGATION_PAGES.filter(p => matchQuery(p.title) || matchQuery(p.subtitle || '')),
        ...sessionResults.filter(s => matchQuery(s.title) || matchQuery(s.subtitle || '')),
        ...skillResults.filter(s => matchQuery(s.title) || matchQuery(s.subtitle || '') || s.tags?.some(t => matchQuery(t))),
      ];
    }

    return results;
  }, [query, sessionResults, skillResults]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(allResults.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + allResults.length) % Math.max(allResults.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (allResults[activeIndex]) {
          allResults[activeIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const pageResult = allResults.find(r => r.type === 'page');
        if (pageResult) {
          pageResult.action();
        }
      }
    },
    [activeIndex, allResults, onClose]
  );

  const getTypeLabel = (type: ResultType) => {
    switch (type) {
      case 'session': return { label: '对话', color: 'primary' };
      case 'skill': return { label: '技能', color: 'secondary' };
      case 'action': return { label: '操作', color: 'warning' };
      case 'page': return { label: '页面', color: 'info' };
      default: return { label: '', color: 'default' };
    }
  };

  const getTypeColor = (type: ResultType) => {
    switch (type) {
      case 'session': return isDark ? '#60a5fa' : '#1d4ed8';
      case 'skill': return isDark ? '#c084fc' : '#7c3aed';
      case 'action': return isDark ? '#fbbf24' : '#d97706';
      case 'page': return isDark ? '#4ade80' : '#16a34a';
      default: return isDark ? '#9ca3af' : '#6b7280';
    }
  };

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
            placeholder="搜索对话、技能、页面或输入命令..."
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

        <Box sx={{ px: 2.5, pb: 1 }}>
          <Typography
            sx={{
              fontSize: '13px',
              fontWeight: 500,
              color: gs.textMuted,
            }}
          >
            {query
              ? `找到 ${allResults.length} 个结果`
              : `${allResults.length} 个可用项`}
            
          </Typography>
        </Box>

        <Box
          sx={{
            maxHeight: 450,
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
          {allResults.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '14px' }}>
                {query ? '没有找到匹配的内容' : '暂无可用项'}
              </Typography>
              <Typography variant="body2" sx={{ color: gs.textDisabled, fontSize: '12px', mt: 1 }}>
                尝试输入关键词搜索对话、技能或页面
              </Typography>
            </Box>
          ) : (
            allResults.map((result, index) => {
              const isActive = index === activeIndex;
              const typeInfo = getTypeLabel(result.type);
              const typeColor = getTypeColor(result.type);

              return (
                <Box
                  key={result.id}
                  onClick={result.action}
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
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                      flexShrink: 0,
                    }}
                  >
                    {result.icon}
                  </Box>

                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.25,
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
                      {result.title}
                    </Typography>
                    {result.subtitle && (
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
                        {result.subtitle}
                      </Typography>
                    )}
                    {result.tags && result.tags.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {result.tags.slice(0, 3).map(tag => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{
                              fontSize: '11px',
                              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                              color: 'inherit',
                              border: 'none',
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexShrink: 0,
                    }}
                  >
                    <Chip
                      label={typeInfo.label}
                      size="small"
                      sx={{
                        fontSize: '11px',
                        fontWeight: 500,
                        bgcolor: `${typeColor}20`,
                        color: typeColor,
                        border: 'none',
                      }}
                    />
                  </Box>
                </Box>
              );
            })
          )}
        </Box>

        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: `1px solid ${gs.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: gs.textDisabled,
          }}
        >
          <span>按 Enter 选择，Tab 切换，Esc 关闭</span>
          <span>v1.0</span>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
