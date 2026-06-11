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
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
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
import { getGrayScale } from '../../constants/theme';
import { Session } from '../../types/chat';
import {
  loadSessions,
  saveAndNotify,
  SESSIONS_UPDATED_EVENT,
} from '../../utils/sessionStore';

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

  // 聊天历史
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const historyListRef = useRef<HTMLDivElement>(null);

  // 即时选中状态：点击时立即切换视觉反馈，不等待父组件 state 传播
  const [justClickedSessionId, setJustClickedSessionId] = useState<string | null>(null);

  // 父组件 activeSessionId 更新后，清除本地即时状态
  useEffect(() => {
    if (justClickedSessionId && justClickedSessionId === activeSessionId) {
      setJustClickedSessionId(null);
    }
  }, [activeSessionId, justClickedSessionId]);

  useEffect(() => {
    const onStorage = () => {
      setSessions(loadSessions());
      // 新会话时自动滚动到历史对话区域
      requestAnimationFrame(() => {
        historyListRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    };
    const onChatUpdate = () => {
      setSessions(loadSessions());
      // AI 回复后自动滚动到历史对话区域
      requestAnimationFrame(() => {
        historyListRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSIONS_UPDATED_EVENT, onChatUpdate);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSIONS_UPDATED_EVENT, onChatUpdate);
    };
  }, []);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const next = sessions.filter((s) => s.id !== sessionId);
    setSessions(next);
    saveAndNotify(next);
    onDeleteSession(sessionId);
  }, [sessions, onDeleteSession]);

  // 只显示有消息的会话
  const chatSessions = sessions.filter((s) => s.messages.length > 0);

  // 点击导航项时清除历史对话的即时选中状态
  const handleNavClick = useCallback((path: string) => {
    setJustClickedSessionId(null);
    onNavigate(path);
  }, [onNavigate]);

  // 有历史会话选中时，"新建任务"不显示激活态（白条让给历史对话项）
  const isChatWithSession = activeSessionId && activePath === '/chat';

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
        <Box ref={historyListRef} sx={{ mt: 1, pt: 2.25, pl: 0.25, pr: 1, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto', maxHeight: '40vh' }}>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: gs.textMuted,
              px: 1.5,
              mb: 0.5,
              letterSpacing: '0.02em',
              flexShrink: 0,
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
          <Box className="auto-hide-scrollbar" sx={{ overflowY: 'auto', overscrollBehaviorY: 'none', WebkitOverflowScrolling: 'auto', flex: 1, minHeight: 0 }}>
          {chatSessions.map((session) => {
            const title = session.title || session.messages[0]?.content?.slice(0, 20) || '新对话';
            const effectiveActiveId = justClickedSessionId ?? activeSessionId;
            const isSessionActive = session.id === effectiveActiveId;
            return (
              <ListItem key={session.id} disablePadding sx={{ display: 'block', mb: 0.25 }}>
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
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    sx={{
                      p: 0.25,
                      opacity: 0,
                      color: textMuted,
                      transition: 'opacity 0.15s',
                      '.MuiListItemButton-root:hover &': { opacity: 1 },
                      '&:hover': { color: gs.textPrimary },
                      '&:hover .MuiSvgIcon-root': { fontSize: 14 },
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            );
          })}
          </Box>
        </Box>
      )}
    </List>
  );
};

export default NavList;
