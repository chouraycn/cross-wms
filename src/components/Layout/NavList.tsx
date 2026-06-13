import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useChatContext } from '../../contexts/ChatContext';
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import { getGrayScale } from '../../constants/theme';
import { Session, Folder } from '../../types/chat';

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

  // 聊天历史 — 从 ChatContext 获取
  const {
    sessions,
    folders,
    handleDeleteSession: deleteSessionFromContext,
    moveSessionToFolder,
    createFolder,
  } = useChatContext();
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

  // 只显示有消息的会话
  const chatSessions = sessions.filter((s) => s.messages.length > 0);

  // 点击导航项时清除历史对话的即时选中状态
  const handleNavClick = useCallback((path: string) => {
    setJustClickedSessionId(null);
    onNavigate(path);
  }, [onNavigate]);

  // 有历史会话选中且历史列表不为空时，"AI 对话"不显示激活态（白条让给历史对话项）
  // 防御：只有 activeSessionId 对应的会话真的有消息时才让出白条
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

  // ===================== 文件夹展开状态 =====================
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // ===================== 右键菜单状态 =====================
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    sessionId: string;
  } | null>(null);

  const [moveSubMenuAnchor, setMoveSubMenuAnchor] = useState<HTMLElement | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      sessionId,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
    setMoveSubMenuAnchor(null);
  }, []);

  const handleMoveSession = useCallback(async (folderId: string | null) => {
    if (contextMenu) {
      await moveSessionToFolder(contextMenu.sessionId, folderId);
    }
    handleCloseContextMenu();
  }, [contextMenu, moveSessionToFolder, handleCloseContextMenu]);

  // ===================== 新建文件夹对话框 =====================
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleOpenNewFolderDialog = useCallback(() => {
    setNewFolderName('');
    setNewFolderDialogOpen(true);
  }, []);

  const handleCloseNewFolderDialog = useCallback(() => {
    setNewFolderDialogOpen(false);
    setNewFolderName('');
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (name) {
      await createFolder(name);
    }
    handleCloseNewFolderDialog();
  }, [newFolderName, createFolder, handleCloseNewFolderDialog]);

  // ===================== 按文件夹分组会话 =====================
  const uncategorizedSessions = chatSessions.filter((s) => !s.folderId);
  const folderSessionsMap = useCallback((folderId: string) => {
    return chatSessions.filter((s) => s.folderId === folderId);
  }, [chatSessions]);

  // 渲染单个会话项
  // v1.9.3: 跟踪每个会话的完成通知状态（AI 完成回复时显示绿点）
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(new Set());
  const prevSessionsRef = useRef<Session[]>(sessions);

  React.useEffect(() => {
    const prev = prevSessionsRef.current;
    // 检查哪些会话从 streaming 变为完成
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

  const renderSessionItem = (session: Session) => {
    const title = session.title || session.messages[0]?.content?.slice(0, 20) || '新对话';
    const effectiveActiveId = justClickedSessionId ?? activeSessionId;
    const isSessionActive = session.id === effectiveActiveId;

    // 检查该会话是否有 AI 正在思考/流式响应
    const lastMsg = session.messages[session.messages.length - 1];
    const isThinking = lastMsg?.role === 'assistant' && lastMsg?.isStreaming === true;
    const showCompleted = completedSessions.has(session.id) && !isThinking;

    return (
      <ListItem
        key={session.id}
        disablePadding
        sx={{ display: 'block', mb: 0.25 }}
        onContextMenu={(e) => handleContextMenu(e, session.id)}
      >
        <ListItemButton
          onClick={() => {
            setJustClickedSessionId(session.id);
            onSelectSession(session.id);
          }}
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
          {/* v1.9.3: AI 思考/完成指示器 */}
          {isThinking && (
            <CircularProgress size={14} thickness={3} sx={{ color: '#F59E0B', mr: 0.5 }} />
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
                <CheckCircleIcon sx={{ fontSize: 14, color: '#22C55E' }} />
              </Box>
            </Tooltip>
          )}
          <IconButton
            size="small"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDeleteSession(e, session.id);
            }}
            sx={{
              p: 0.25,
              opacity: 0.7,
              color: textMuted,
              transition: 'opacity 0.15s',
              '&:hover': { opacity: 1, color: gs.textPrimary },
            }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </ListItemButton>
      </ListItem>
    );
  };

  // 渲染文件夹及其会话
  const renderFolder = (folder: Folder) => {
    const sessionsInFolder = folderSessionsMap(folder.id);
    const expanded = expandedFolders[folder.id] ?? false;

    return (
      <Box key={folder.id} sx={{ mb: 0.5 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => toggleFolder(folder.id)}
            sx={{
              minHeight: 28,
              px: 1.5,
              py: 0,
              borderRadius: '6px',
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <ListItemIcon sx={{ minWidth: 0, mr: 1, justifyContent: 'center', color: textMuted }}>
              <FolderOutlinedIcon sx={{ fontSize: '14px' }} />
            </ListItemIcon>
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: textNormal,
                flex: 1,
                lineHeight: '28px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {folder.name}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.625rem',
                color: textMuted,
                lineHeight: '28px',
                flexShrink: 0,
                mr: 0.5,
              }}
            >
              {sessionsInFolder.length}
            </Typography>
            {expanded ? (
              <ExpandLessIcon sx={{ fontSize: 14, color: textMuted }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 14, color: textMuted }} />
            )}
          </ListItemButton>
        </ListItem>
        <Collapse in={expanded} timeout="auto">
          <List sx={{ py: 0, pl: 2.5 }}>
            {sessionsInFolder.map((session) => renderSessionItem(session))}
          </List>
        </Collapse>
      </Box>
    );
  };

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
                      <ListItem key={child.path} disablePadding sx={{ display: 'block', mb: 0.25 }}>
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
                      // 新建对话时清除历史对话选中态
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
                    // 新建对话时清除历史对话选中态
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

      {/* ====== 栏目底部：历史对话 ====== */}
      {!collapsed && chatSessions.length > 0 && (
        <Box ref={historyListRef} sx={{ mt: 1, pt: 2.25, pl: 0.25, pr: 1, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, mb: 0.5, flexShrink: 0 }}>
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
                {chatSessions.length}
              </Box>
            </Typography>
            <Tooltip title="新建文件夹" placement="top" arrow>
              <IconButton
                size="small"
                onClick={handleOpenNewFolderDialog}
                sx={{
                  p: 0.25,
                  color: gs.textMuted,
                  '&:hover': { color: gs.textPrimary },
                }}
              >
                <CreateNewFolderIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            sx={{
              overflowY: 'auto',
              overscrollBehaviorY: 'none',
              WebkitOverflowScrolling: 'auto',
              flex: 1,
              minHeight: 0,
              maxHeight: 280, // 固定高度：约10条会话
              // 滚动条仅在悬停时显示
              '&::-webkit-scrollbar': {
                width: '4px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: 'transparent',
                borderRadius: '2px',
              },
              '&:hover::-webkit-scrollbar-thumb': {
                background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
              },
              // Firefox
              scrollbarWidth: 'thin',
              scrollbarColor: 'transparent transparent',
              '&:hover': {
                scrollbarColor: isDark ? 'rgba(255,255,255,0.2) transparent' : 'rgba(0,0,0,0.15) transparent',
              },
            }}
          >
            {/* 渲染文件夹 */}
            {folders.map((folder) => renderFolder(folder))}

            {/* 渲染未分类会话 */}
            {uncategorizedSessions.map((session) => renderSessionItem(session))}
          </Box>
        </Box>
      )}

      {/* ====== 右键菜单 ====== */}
      <Menu
        open={!!contextMenu}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        PaperProps={{
          sx: {
            minWidth: 160,
            '& .MuiMenuItem-root': {
              fontSize: '0.8125rem',
              py: 0.75,
            },
          },
        }}
      >
        <MenuItem
          onMouseEnter={(e) => setMoveSubMenuAnchor(e.currentTarget)}
          onMouseLeave={() => setMoveSubMenuAnchor(null)}
          sx={{ position: 'relative' }}
        >
          移动到文件夹
          <Menu
            open={!!moveSubMenuAnchor}
            anchorEl={moveSubMenuAnchor}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            onClose={() => setMoveSubMenuAnchor(null)}
            PaperProps={{
              sx: {
                minWidth: 140,
                '& .MuiMenuItem-root': {
                  fontSize: '0.8125rem',
                  py: 0.75,
                },
              },
            }}
          >
            <MenuItem onClick={() => handleMoveSession(null)}>
              未分类
            </MenuItem>
            {folders.map((folder) => (
              <MenuItem key={folder.id} onClick={() => handleMoveSession(folder.id)}>
                {folder.name}
              </MenuItem>
            ))}
          </Menu>
        </MenuItem>
      </Menu>

      {/* ====== 新建文件夹对话框 ====== */}
      <Dialog open={newFolderDialogOpen} onClose={handleCloseNewFolderDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', pb: 1 }}>新建文件夹</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label="文件夹名称"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateFolder();
              }
            }}
            size="small"
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseNewFolderDialog} size="small">
            取消
          </Button>
          <Button onClick={handleCreateFolder} variant="contained" size="small" disabled={!newFolderName.trim()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>
    </List>
  );
};

export default NavList;
