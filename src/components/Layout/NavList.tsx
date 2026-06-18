import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Typography,
  Box,
  Tooltip,
  Collapse,
  IconButton,
  useTheme,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useChatSidebar } from '../../contexts/ChatContext';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FindInPageOutlinedIcon from '@mui/icons-material/FindInPageOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../constants/theme';
import { Session } from '../../types/chat';

// ===================== Helpers =====================

function getRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}个月前`;
  return `${Math.floor(month / 12)}年前`;
}

// ===================== Nav Item Types =====================

interface NavItemLeaf {
  label: string;
  path: string;
  icon: React.ReactNode;
  desc?: string;
}

interface NavItemGroup {
  label: string;
  icon: React.ReactNode;
  desc?: string;
  children: NavItemLeaf[];
}

type NavItem = NavItemLeaf | NavItemGroup;

function isGroup(item: NavItem): item is NavItemGroup {
  return 'children' in item;
}

// ===================== Nav Items Config =====================

const navItems: NavItem[] = [
  { label: 'AI 对话', path: '/chat', icon: <ChatBubbleOutlineIcon />, desc: '智能助手' },
  { label: '项目', path: '/projects', icon: <FolderOutlinedIcon />, desc: '项目总览' },
  { label: '技能', path: '/skills', icon: <AutoFixHighIcon />, desc: '能力管理' },
  { label: '自动化', path: '/automation', icon: <ScheduleIcon />, desc: '任务 & 调度' },

  {
    label: '仓储管理',
    icon: <WarehouseOutlinedIcon />,
    desc: '仓库·在途·库存',
    children: [
      { label: '仪表盘', path: '/dashboard', icon: <DashboardOutlinedIcon />, desc: '总览' },
      { label: '仓库管理', path: '/warehouses', icon: <FolderOutlinedIcon />, desc: '仓库列表' },
      { label: '客商管理', path: '/partners', icon: <GroupsOutlinedIcon />, desc: '供应商 & 客户' },
      { label: '在途管理', path: '/in-transit', icon: <LocalShippingOutlinedIcon />, desc: '在途跟踪' },
      { label: '库存管理', path: '/inventory', icon: <InventoryOutlinedIcon />, desc: '库存查询' },
      { label: '仓库调拨', path: '/transfer', icon: <SwapHorizIcon />, desc: '多仓调拨' },
      { label: '腾讯文档', path: '/tencent-docs', icon: <DescriptionOutlinedIcon />, desc: '在线文档' },
      { label: '统计报表', path: '/reports', icon: <AssessmentOutlinedIcon />, desc: '数据报表' },
      { label: '入库质检', path: '/wms/quality', icon: <FactCheckOutlinedIcon />, desc: '质检管理' },
      { label: '库存盘点', path: '/wms/inventory', icon: <FindInPageOutlinedIcon />, desc: '盘点管理' },
      { label: '出库复核', path: '/wms/outbound', icon: <VerifiedUserOutlinedIcon />, desc: '复核管理' },
      { label: '异常预警', path: '/wms/alerts', icon: <NotificationsActiveOutlinedIcon />, desc: '预警中心' },
      { label: '补货建议', path: '/wms/replenishment', icon: <AutorenewOutlinedIcon />, desc: '智能补货' },
      { label: '报表生成', path: '/wms/reports', icon: <SummarizeOutlinedIcon />, desc: '报表中心' },
    ],
  },
];

// ===================== Props =====================

interface NavListProps {
  collapsed: boolean;
  activePath: string;
  onNavigate: (path: string) => void;
  /** 当前选中的聊天会话 ID */
  activeSessionId: string;
  /** 选中历史会话的回调 */
  onSelectSession: (sessionId: string) => void;
  /** 删除历史会话的回调 */
  onDeleteSession: (sessionId: string) => void;
}

// ===================== Component =====================

const NavList: React.FC<NavListProps> = ({
  collapsed,
  activePath,
  onNavigate,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 分组展开状态 — 初始根据当前路由自动展开活跃分组
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of navItems) {
      if (isGroup(item) && item.children.some((c) => activePath.startsWith(c.path))) {
        initial[item.label] = true;
      }
    }
    return initial;
  });

  // 路由变化时自动展开活跃分组
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      for (const item of navItems) {
        if (isGroup(item) && item.children.some((c) => activePath.startsWith(c.path))) {
          next[item.label] = true;
        }
      }
      return next;
    });
  }, [activePath]);

  // 聊天历史 — 从 ChatSidebarContext 获取（不随流式消息更新）
  const {
    sessions,
    handleDeleteSession: deleteSessionFromContext,
    togglePinSession,
    archiveSession: archiveSessionFromContext,
    restoreSession: restoreSessionFromContext,
    archivedSessions,
  } = useChatSidebar();
  const historyListRef = useRef<HTMLDivElement>(null);

  // 即时选中状态：点击时立即切换视觉反馈，不等待父组件 state 传播
  const [justClickedSessionId, setJustClickedSessionId] = useState<string | null>(null);

  // 父组件 activeSessionId 更新后，清除本地即时状态
  useEffect(() => {
    if (justClickedSessionId && justClickedSessionId === activeSessionId) {
      setJustClickedSessionId(null);
    }
  }, [activeSessionId, justClickedSessionId]);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSessionFromContext(sessionId);
    onDeleteSession(sessionId);
  }, [deleteSessionFromContext, onDeleteSession]);

  const chatSessions = sessions;

  // v6.0: 仅显示活跃会话（归档会话不在此列表中）
  const activeSessions = chatSessions.filter(s => s.status !== 'archived' && s.status !== 'daily_reset');

  // 置顶优先 + 最近更新排序
  const sortedSessions = useMemo(() => {
    return [...activeSessions].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [activeSessions]);

  // v6.0: 归档会话排序
  const sortedArchivedSessions = useMemo(() => {
    return [...archivedSessions].sort((a, b) => {
      const aTime = new Date(a.archivedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.archivedAt || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [archivedSessions]);

  // v6.0: 归档区展开状态
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // 点击导航项时清除历史对话的即时选中状态
  const handleNavClick = useCallback((path: string) => {
    setJustClickedSessionId(null);
    onNavigate(path);
  }, [onNavigate]);

  // 有历史会话选中且历史列表不为空时，"AI 对话"不显示激活态（白条让给历史对话项）
  const activeSessionHasMessages = chatSessions.some((s) => s.id === activeSessionId);
  const isChatWithSession = activeSessionId && activePath === '/chat' && activeSessionHasMessages;

  const isActive = (path: string) => {
    if (path === '/chat' && isChatWithSession) return false;
    return activePath.startsWith(path);
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // 检查分组内是否有活跃项
  const isGroupActive = (group: NavItemGroup) =>
    group.children.some((child) => isActive(child.path));

  // 统一灰阶（从 theme.ts 获取）
  const bgActive = gs.bgActive;
  const bgActiveHover = isDark ? '#333333' : '#F9FAFB';
  const bgHover = gs.bgHover;
  const textActive = gs.textPrimary;
  const textNormal = gs.textSecondary;
  const textSecondary = gs.textMuted;
  const textMuted = gs.textDisabled;
  const iconActive = gs.textPrimary;
  const iconNormal = gs.textMuted;

  // ===== AI 完成标记（v1.9.3） =====
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(new Set());
  const prevSessionsRef = useRef<Session[]>(sessions);

  React.useEffect(() => {
    const prev = prevSessionsRef.current;
    for (const session of sessions) {
      if (completedSessions.has(session.id)) continue;
      const prevSession = prev.find(s => s.id === session.id);
      if (!prevSession) continue;
      const prevLast = prevSession.messages[prevSession.messages.length - 1];
      const currLast = session.messages[session.messages.length - 1];
      if (
        prevLast?.role === 'assistant' && prevLast?.isStreaming &&
        currLast?.role === 'assistant' && !currLast?.isStreaming
      ) {
        setCompletedSessions(prev => new Set(prev).add(session.id));
      }
    }
    prevSessionsRef.current = sessions;
  }, [sessions, completedSessions]);

  const clearCompletedFlag = useCallback((sessionId: string) => {
    setCompletedSessions(prev => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  // ===== 渲染单个会话项 =====
  const renderSessionItem = useCallback((session: Session) => {
    const title = (session.parentSessionId ? '└ ' : '') + (session.title || session.messages[0]?.content?.slice(0, 20) || '新对话');
    const effectiveActiveId = justClickedSessionId ?? activeSessionId;
    const isSessionActive = session.id === effectiveActiveId;
    const isPinned = session.isPinned === true;
    const relativeTime = getRelativeTime(session.updatedAt || session.createdAt);

    const lastMsg = session.messages[session.messages.length - 1];
    const isThinking = lastMsg?.role === 'assistant' && lastMsg?.isStreaming === true;
    const showCompleted = completedSessions.has(session.id) && !isThinking;

    return (
      <ListItem
        key={session.id}
        disablePadding
        sx={{ display: 'block' }}
      >
        <ListItemButton
          onClick={() => {
            setJustClickedSessionId(session.id);
            onSelectSession(session.id);
          }}
          sx={{
            minHeight: 32,
            px: 1.5,
            py: 0.25,
            borderRadius: '6px',
            backgroundColor: isSessionActive ? bgActive : 'transparent',
            '&:hover': {
              backgroundColor: isSessionActive ? bgActiveHover : bgHover,
              '& .session-actions': { opacity: 1 },
              '& .session-time': { opacity: 0 },
            },
          }}
        >
          <Typography
            sx={{
              fontSize: '0.7rem',
              fontWeight: isSessionActive ? 500 : 400,
              color: isSessionActive ? textActive : textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
              lineHeight: '28px',
            }}
          >
            {title}
          </Typography>
          {/* AI 思考 / 完成指示器 */}
          {isThinking && (
            <CircularProgress size={12} thickness={3} sx={{ color: '#F59E0B', mr: 0.5 }} />
          )}
          {!isThinking && showCompleted && (
            <Tooltip title="AI 已完成回复" placement="right">
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  clearCompletedFlag(session.id);
                }}
                sx={{
                  display: 'flex', alignItems: 'center', cursor: 'pointer', mr: 0.5,
                  transition: 'opacity 0.2s',
                  '&:hover': { opacity: 0.6 },
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 12, color: '#22C55E' }} />
              </Box>
            </Tooltip>
          )}
          {/* 右侧区：时间正常显示，hover 时按钮覆盖在时间上方 */}
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', flexShrink: 0, position: 'relative' }}>
            {relativeTime && (
              <Typography
                className="session-time"
                sx={{
                  fontSize: '0.6rem',
                  fontWeight: 400,
                  color: textMuted,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  lineHeight: '28px',
                  transition: 'opacity 0.15s',
                }}
              >
                {relativeTime}
              </Typography>
            )}
            <Box
              className="session-actions"
              sx={{
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0,
                transition: 'opacity 0.15s',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Tooltip title={isPinned ? '取消置顶' : '置顶'} placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinSession(session.id);
                  }}
                  sx={{
                    p: 0.25,
                    color: isPinned ? '#F59E0B' : gs.textMuted,
                    '&:hover': { color: isPinned ? '#D97706' : gs.textPrimary },
                  }}
                >
                  <PushPinOutlinedIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="归档" placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveSessionFromContext(session.id);
                  }}
                  sx={{
                    p: 0.25,
                    color: gs.textMuted,
                    '&:hover': { color: '#8B5CF6' },
                  }}
                >
                  <Inventory2OutlinedIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="删除" placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteSession(e, session.id);
                  }}
                  sx={{
                    p: 0.25,
                    color: gs.textMuted,
                    '&:hover': { color: '#EF4444' },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </ListItemButton>
      </ListItem>
    );
  }, [justClickedSessionId, activeSessionId, completedSessions, bgActive, bgActiveHover, bgHover, textActive, textSecondary, textMuted, gs, onSelectSession, togglePinSession, handleDeleteSession, archiveSessionFromContext, clearCompletedFlag]);

  return (
    <List
      sx={{
        pt: 1,
        px: collapsed ? 0.5 : 1,
        flex: 1,
        overflow: 'auto',
        overscrollBehaviorY: 'none',
        WebkitOverflowScrolling: 'auto',
      }}
      // v1.5.107: 排除导航区域出窗口拖拽（父 Sidebar 已设 WebkitAppRegion:drag）
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {navItems.map((item) => {
        // ====== 分组项 ======
        if (isGroup(item)) {
          const expanded = expandedGroups[item.label] ?? false;
          const groupActive = isGroupActive(item);

          if (collapsed) {
            // 收起模式：显示分组图标，点击展开第一个子项
            return (
              <Tooltip key={item.label} title={item.label} placement="right" arrow>
                <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleNavClick(item.children[0].path)}
                    sx={{
                      minHeight: 40,
                      justifyContent: 'center',
                      px: 0,
                      borderRadius: '6px',
                      '&:hover': { backgroundColor: bgHover },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: groupActive ? iconActive : iconNormal }}>
                      {React.cloneElement(item.icon as React.ReactElement, {
                        sx: { fontSize: '20px' },
                      })}
                    </ListItemIcon>
                  </ListItemButton>
                </ListItem>
              </Tooltip>
            );
          }

          // 展开模式：可折叠分组
          return (
            <Box key={item.label} sx={{ mb: 0.5 }}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => toggleGroup(item.label)}
                  sx={{
                    minHeight: 36,
                    px: 1.5,
                    py: 0.25,
                    borderRadius: '6px',
                    '&:hover': { backgroundColor: bgHover },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center', color: groupActive ? iconActive : iconNormal }}>
                    {React.cloneElement(item.icon as React.ReactElement, {
                      sx: { fontSize: '18px' },
                    })}
                  </ListItemIcon>
                  <Typography
                    sx={{
                      fontSize: '0.8125rem',
                      fontWeight: groupActive ? 500 : 400,
                      color: groupActive ? textActive : textNormal,
                      flex: 1,
                      lineHeight: '36px',
                    }}
                  >
                    {item.label}
                  </Typography>
                  {item.desc && !collapsed && (
                    <Typography
                      sx={{
                        fontSize: '0.625rem',
                        color: textMuted,
                        mr: 0.5,
                        lineHeight: '36px',
                        flexShrink: 0,
                      }}
                    >
                      {item.desc}
                    </Typography>
                  )}
                  {expanded ? (
                    <ExpandLessIcon sx={{ fontSize: 16, color: textMuted }} />
                  ) : (
                    <ExpandMoreIcon sx={{ fontSize: 16, color: textMuted }} />
                  )}
                </ListItemButton>
              </ListItem>
              <Collapse in={expanded} timeout="auto">
                <List sx={{ py: 0, pl: 2.5 }}>
                  {item.children.map((child) => {
                    const childActive = isActive(child.path);
                    return (
                      <ListItem key={child.path} disablePadding sx={{ display: 'block' }}>
                        <ListItemButton
                          onClick={() => handleNavClick(child.path)}
                        sx={{
                          minHeight: 32,
                          px: 1,
                          py: 0.25,
                          borderRadius: '6px',
                          backgroundColor: childActive ? bgActive : 'transparent',
                          '&:hover': {
                            backgroundColor: childActive ? bgActiveHover : bgHover,
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 0, mr: 1, justifyContent: 'center', color: childActive ? iconActive : iconNormal }}>
                          {React.cloneElement(child.icon as React.ReactElement, {
                            sx: { fontSize: '16px' },
                          })}
                        </ListItemIcon>
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: childActive ? 500 : 400,
                            color: childActive ? textActive : textNormal,
                            lineHeight: '28px',
                          }}
                        >
                          {child.label}
                        </Typography>
                        {child.desc && (
                          <Typography
                            sx={{
                              fontSize: '0.625rem',
                              color: textMuted,
                              ml: 'auto',
                              lineHeight: '28px',
                              flexShrink: 0,
                            }}
                          >
                            {child.desc}
                          </Typography>
                        )}
                      </ListItemButton>
                    </ListItem>
                  );
                })}
                </List>
              </Collapse>
            </Box>
          );
        }

        // ====== 普通导航项 ======
        const active = isActive(item.path);

        if (collapsed) {
          return (
            <Tooltip key={item.path} title={item.label} placement="right" arrow>
              <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
                <ListItemButton
                  onClick={() => {
                    if (item.path === '/chat') {
                      handleNavClick(item.path);
                      window.dispatchEvent(new CustomEvent('cdf-know-clow-clear-session'));
                      window.dispatchEvent(new CustomEvent('cdf-know-clow-navigate-chat'));
                    } else {
                      handleNavClick(item.path);
                    }
                  }}
                  sx={{
                    minHeight: 40,
                    justifyContent: 'center',
                    px: 0,
                    borderRadius: '6px',
                    backgroundColor: active ? bgActive : 'transparent',
                    '&:hover': {
                      backgroundColor: active ? bgActiveHover : bgHover,
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: active ? iconActive : iconNormal }}>
                    {React.cloneElement(item.icon as React.ReactElement, {
                      sx: { fontSize: '20px' },
                    })}
                  </ListItemIcon>
                </ListItemButton>
              </ListItem>
            </Tooltip>
          );
        }

        // 展开模式普通项
        return (
          <React.Fragment key={item.path}>
            <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
              <ListItemButton
                onClick={() => {
                  if (item.path === '/chat') {
                    handleNavClick(item.path);
                    window.dispatchEvent(new CustomEvent('cdf-know-clow-clear-session'));
                    window.dispatchEvent(new CustomEvent('cdf-know-clow-navigate-chat'));
                  } else {
                    handleNavClick(item.path);
                  }
                }}
                sx={{
                  minHeight: 36,
                  px: 1.5,
                  py: 0.25,
                  borderRadius: '6px',
                  backgroundColor: active ? bgActive : 'transparent',
                  '&:hover': {
                    backgroundColor: active ? bgActiveHover : bgHover,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center', color: active ? iconActive : iconNormal }}>
                  {React.cloneElement(item.icon as React.ReactElement, {
                    sx: { fontSize: '18px' },
                  })}
                </ListItemIcon>
                <Typography
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: active ? 500 : 400,
                    color: active ? textActive : textNormal,
                    lineHeight: '36px',
                    flex: 1,
                  }}
                >
                  {item.label}
                </Typography>
                {'desc' in item && item.desc && (
                  <Typography
                    sx={{
                      fontSize: '0.625rem',
                      color: textMuted,
                      lineHeight: '36px',
                      flexShrink: 0,
                    }}
                  >
                    {item.desc}
                  </Typography>
                )}
              </ListItemButton>
            </ListItem>
          </React.Fragment>
        );
      })}

      {/* ====== 历史对话 ====== */}
      {!collapsed && sortedSessions.length > 0 && (
        <Box ref={historyListRef} sx={{ mt: 1, pt: 2.25, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, mb: 0.5, flexShrink: 0 }}>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: gs.textMuted,
                letterSpacing: '0.02em',
              }}
            >
              历史对话
              <Box
                component="span"
                sx={{
                  ml: 0.75,
                  fontSize: '0.625rem',
                  fontWeight: 500,
                  color: gs.textDisabled,
                }}
              >
                {sortedSessions.length}
              </Box>
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', maxHeight: 280 }}>
            {sortedSessions.map((s) => renderSessionItem(s))}
          </Box>
        </Box>
      )}

      {/* ====== v6.0: 归档会话 ====== */}
      {!collapsed && sortedArchivedSessions.length > 0 && (
        <Box sx={{ mt: 1, pt: 1, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
          <ListItemButton
            onClick={() => setArchivedExpanded(prev => !prev)}
            sx={{
              minHeight: 28,
              px: 1.5,
              py: 0,
              borderRadius: '4px',
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: gs.textDisabled,
                letterSpacing: '0.02em',
                flex: 1,
              }}
            >
              归档
              <Box
                component="span"
                sx={{ ml: 0.75, fontSize: '0.625rem', fontWeight: 500, color: gs.textDisabled }}
              >
                {sortedArchivedSessions.length}
              </Box>
            </Typography>
            {archivedExpanded
              ? <ExpandLessIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
              : <ExpandMoreIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
            }
          </ListItemButton>
          <Collapse in={archivedExpanded} timeout="auto">
            <Box sx={{ overflow: 'auto', maxHeight: 200 }}>
              {sortedArchivedSessions.map((s) => (
                <ListItem key={s.id} disablePadding sx={{ display: 'block' }}>
                  <ListItemButton
                    onClick={() => {
                      restoreSessionFromContext(s.id);
                      onSelectSession(s.id);
                    }}
                    sx={{
                      minHeight: 32,
                      px: 1.5,
                      py: 0,
                      borderRadius: '4px',
                      '&:hover': { backgroundColor: bgHover },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        color: gs.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {s.title || '未命名对话'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: gs.textDisabled, ml: 1, flexShrink: 0 }}>
                      {getRelativeTime(s.archivedAt || s.updatedAt)}
                    </Typography>
                  </ListItemButton>
                </ListItem>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
    </List>
  );
};

export default NavList;
