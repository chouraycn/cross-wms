import React, { useState, useEffect, useCallback } from 'react';
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
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { Session } from '../../types/chat';

// ===================== Nav Item Types =====================

interface NavItemLeaf {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavItemGroup {
  label: string;
  icon: React.ReactNode;
  children: NavItemLeaf[];
}

type NavItem = NavItemLeaf | NavItemGroup;

function isGroup(item: NavItem): item is NavItemGroup {
  return 'children' in item;
}

// ===================== Nav Items Config =====================

const navItems: NavItem[] = [
  { label: '新建任务', path: '/chat', icon: <TaskAltOutlinedIcon /> },
  { label: '技能', path: '/skills', icon: <AutoFixHighIcon /> },
  { label: '自动化', path: '/automation', icon: <ScheduleIcon /> },
  { label: 'Agent 应用', path: '/agent', icon: <SmartToyOutlinedIcon /> },
  {
    label: '仓储管理',
    icon: <WarehouseOutlinedIcon />,
    children: [
      { label: '仪表盘', path: '/dashboard', icon: <DashboardOutlinedIcon /> },
      { label: '仓库管理', path: '/warehouses', icon: <FolderOutlinedIcon /> },
      { label: '在途管理', path: '/in-transit', icon: <LocalShippingOutlinedIcon /> },
      { label: '库存管理', path: '/inventory', icon: <InventoryOutlinedIcon /> },
      { label: '腾讯文档', path: '/tencent-docs', icon: <DescriptionOutlinedIcon /> },
      { label: '统计报表', path: '/reports', icon: <AssessmentOutlinedIcon /> },
    ],
  },
];

// ===================== Session Helpers =====================

const SESSIONS_STORAGE_KEY = 'crosswms-chat-sessions';

function loadSessions(): Session[] {
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
        })) as Session[];
      }
    }
  } catch { /* ignore */ }
  return [];
}

function saveSessions(sessions: Session[]): void {
  try {
    const serializable = sessions.map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    }));
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable));
  } catch { /* ignore */ }
}

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

  // 聊天历史
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());

  useEffect(() => {
    const onStorage = () => setSessions(loadSessions());
    window.addEventListener('storage', onStorage);
    const onChatUpdate = () => setSessions(loadSessions());
    window.addEventListener('crosswms-chat-updated', onChatUpdate);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('crosswms-chat-updated', onChatUpdate);
    };
  }, []);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const next = sessions.filter((s) => s.id !== sessionId);
    setSessions(next);
    saveSessions(next);
    onDeleteSession(sessionId);
  }, [sessions, onDeleteSession]);

  // 只显示有消息的会话
  const chatSessions = sessions.filter((s) => s.messages.length > 0);

  const isActive = (path: string) => activePath.startsWith(path);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // 检查分组内是否有活跃项
  const isGroupActive = (group: NavItemGroup) =>
    group.children.some((child) => isActive(child.path));

  // Dark mode colors
  const bgActive = isDark ? '#2D2D2D' : '#FFFFFF';
  const bgActiveHover = isDark ? '#333333' : '#F9FAFB';
  const bgHover = isDark ? '#2D2D2D' : '#f5f5f5';
  const textActive = isDark ? '#FFFFFF' : '#111827';
  const textNormal = isDark ? '#D1D5DB' : '#374151';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  const textMuted = isDark ? '#6B7280' : '#9CA3AF';
  const iconActive = isDark ? '#FFFFFF' : '#111827';
  const iconNormal = isDark ? '#9CA3AF' : '#6B7280';

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
                    onClick={() => onNavigate(item.children[0].path)}
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
                      <ListItem key={child.path} disablePadding sx={{ display: 'block', mb: 0.25 }}>
                        <ListItemButton
                          onClick={() => onNavigate(child.path)}
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
                      onNavigate(item.path);
                      window.dispatchEvent(new CustomEvent('crosswms-navigate-chat'));
                    } else {
                      onNavigate(item.path);
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
                    onNavigate(item.path);
                    window.dispatchEvent(new CustomEvent('crosswms-navigate-chat'));
                  } else {
                    onNavigate(item.path);
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
                  }}
                >
                  {item.label}
                </Typography>
              </ListItemButton>
            </ListItem>

          </React.Fragment>
        );
      })}

      {/* ====== 栏目底部：历史对话 ====== */}
      {!collapsed && chatSessions.length > 0 && (
        <Box sx={{ mt: 1, borderTop: `1px solid ${isDark ? '#2D2D2D' : '#E5E7EB'}`, pt: 1, px: 1 }}>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: textMuted,
              px: 1.5,
              mb: 0.5,
              letterSpacing: '0.02em',
            }}
          >
            历史对话
          </Typography>
          {chatSessions.slice(0, 10).map((session) => {
            const title = session.title || session.messages[0]?.content?.slice(0, 20) || '新对话';
            const isSessionActive = session.id === activeSessionId;
            return (
              <ListItem key={session.id} disablePadding sx={{ display: 'block', mb: 0.25 }}>
                <ListItemButton
                  onClick={() => onSelectSession(session.id)}
                  sx={{
                    minHeight: 28,
                    px: 1.5,
                    py: 0,
                    borderRadius: '6px',
                    backgroundColor: isSessionActive ? bgActive : 'transparent',
                    '&:hover': {
                      backgroundColor: isSessionActive ? bgActiveHover : bgHover,
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: 1, justifyContent: 'center', color: textMuted }}>
                    <ChatBubbleOutlineIcon sx={{ fontSize: '13px' }} />
                  </ListItemIcon>
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: isSessionActive ? 500 : 400,
                      color: isSessionActive ? textActive : textSecondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      lineHeight: '28px',
                    }}
                  >
                    {title}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    sx={{
                      p: 0.25,
                      opacity: 0,
                      color: textMuted,
                      transition: 'opacity 0.15s',
                      '.MuiListItemButton-root:hover &': { opacity: 1 },
                      '&:hover': { color: '#EF4444' },
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            );
          })}
        </Box>
      )}
    </List>
  );
};

export default NavList;
