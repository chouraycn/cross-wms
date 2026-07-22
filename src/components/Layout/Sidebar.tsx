import React, { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react';
import {
  Box,
  ListItemButton,
  ListItemIcon,
  Typography,
  useTheme,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGrayScale } from '../../constants/theme';
import SidebarLogo from './SidebarLogo';
import NavList from './NavList';
import { SETTINGS_MENU } from './SettingsPopover';
import type { MenuEntry } from './SettingsPopover';
import { APP_VERSION } from './appVersion';
const AISettingsDialog = React.lazy(() => import('./AISettingsDialog'));
const ToolManagementDialog = React.lazy(() => import('./ToolManagementDialog'));
import CommandPalette from './CommandPalette';
import { isPyWebView } from '../../services/tencentDocsApi';
import { useChatSidebar } from '../../contexts/ChatContext';
import { isWKWebView, isMacOSApp } from '../../utils/env';

// 检测是否为原生 App 模式（构建时 + 运行时双重检测）
// v3.3: 打包时通过 VITE_IS_MACOS_APP 注入构建标记，避免运行时注入时机问题
const isNativeApp = (): boolean => {
  // 构建时检测（优先）
  if (isMacOSApp()) return true;
  // 运行时检测（fallback）
  // @ts-ignore
  if (window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};

// v3.3: 不再使用模块顶层常量，改为组件内动态检测。
// 原因：Swift 的 injectNativeBridge 在 didFinish 后才注入 window.cdfAppNative，
// 模块顶层求值时注入尚未完成，导致 IS_NATIVE_APP 恒为 false。
// const IS_NATIVE_APP = isNativeApp(); // REMOVED

// v3.2: WKWebView 环境检测，用于禁用高成本 CSS 动画
const IS_WKWEBVIEW = isWKWebView();

// ===================== Constants =====================

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 0;

// ===================== Sidebar Component =====================

interface SidebarProps {
  collapsed: boolean;
  onToggle?: () => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: React.Dispatch<React.SetStateAction<boolean>>;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, settingsOpen: settingsOpenProp, onSettingsOpenChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const SIDEBAR_BG = gs.bgSidebar;

  // v1.7.15: 监听窗口最大化/恢复事件，自动展开侧边栏
  useEffect(() => {
    const onMaximized = () => {
      // 点击绿按钮最大化窗口时，如果侧边栏是收起状态，自动展开
      if (collapsed && onToggle) {
        onToggle();
      }
    };
    window.addEventListener('cdf-window-maximized', onMaximized);
    return () => window.removeEventListener('cdf-window-maximized', onMaximized);
  }, [collapsed, onToggle]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFullscreenChanged = ((e: CustomEvent) => {
      setIsFullscreen(e.detail?.fullscreen ?? false);
    }) as EventListener;
    window.addEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
    return () => window.removeEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
  }, []);

  const settingsOpen = settingsOpenProp ?? false;
  const setSettingsOpen = onSettingsOpenChange ?? (() => {});

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDialogInitialTab, setAiDialogInitialTab] = useState<{ main: string; sub: string } | undefined>(undefined);
  const [toolManagementDialogOpen, setToolManagementDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [activeSessionId, setActiveSessionId] = useState('');
  // 点击「AI 对话」新建会话后，短暂忽略 chat-updated 事件，避免新会话 ID 覆盖清空状态
  const ignoreChatUpdateRef = useRef(false);
  // 任务 4: 从 ChatContext 获取 loadSessionContext（加载历史/归档会话上下文但不跳转）
  const { loadSessionContext } = useChatSidebar();

  // 输入内容预览（收起侧边栏时显示）
  const [chatInputValue, setChatInputValue] = useState('');

  // 兼容 hash 路由：从 hash 中提取实际路径
  const activePath = location.hash ? location.hash.replace('#', '') : location.pathname;

  // 监听 CDFKnowChat 的会话更新事件，同步 activeSessionId
  useEffect(() => {
    const onChatUpdate = ((e: CustomEvent) => {
      // 如果正处于「新建对话」后的保护期内，忽略事件
      if (ignoreChatUpdateRef.current) return;
      // 防御：只有收到明确的 activeSessionId 才更新，避免空事件覆盖状态
      if (e.detail && e.detail.activeSessionId) {
        setActiveSessionId(e.detail.activeSessionId);
      }
    }) as EventListener;
    const onClearSession = () => {
      setActiveSessionId('');
      // 开启保护期：200ms 内忽略 chat-updated 事件（ChatPage 新建会话后会发送该事件）
      ignoreChatUpdateRef.current = true;
      setTimeout(() => { ignoreChatUpdateRef.current = false; }, 200);
    };
    // 监听聊天输入框失焦（输入完成）时的内容
    const onChatInputBlur = ((e: CustomEvent) => {
      if (e.detail && typeof e.detail.value === 'string') {
        setChatInputValue(e.detail.value);
      }
    }) as EventListener;
    window.addEventListener('cdf-know-clow-chat-updated', onChatUpdate);
    window.addEventListener('cdf-know-clow-clear-session', onClearSession);
    window.addEventListener('cdf-chat-input-blur', onChatInputBlur);
    const onOpenSearch = () => setSearchOpen(true);
    window.addEventListener('cdf-open-search', onOpenSearch);
    return () => {
      window.removeEventListener('cdf-know-clow-chat-updated', onChatUpdate);
      window.removeEventListener('cdf-know-clow-clear-session', onClearSession);
      window.removeEventListener('cdf-chat-input-blur', onChatInputBlur);
      window.removeEventListener('cdf-open-search', onOpenSearch);
    };
  }, []);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  // v3.3: 每次渲染时动态检测，确保构建时标记或运行时注入都能被识别
  const nativeApp = isNativeApp();

  // 点击侧边栏外部关闭设置面板
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [settingsOpen, setSettingsOpen]);

  // 新建对话
  const handleNewChat = useCallback(() => {
    window.dispatchEvent(new CustomEvent('cdf-know-clow-new-chat'));
    // 如果在聊天页，也可以直接导航
    if (!activePath.startsWith('/chat')) {
      navigate('/chat');
    }
  }, [activePath, navigate]);

  // NavList 回调 — useCallback 稳定引用，避免 NavList 不必要的重渲染
  const handleNavigate = useCallback((path: string) => {
    setActiveSessionId('');
    navigate(path);
  }, [navigate]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    // 仅当不在聊天页面时才导航（避免不必要的路由重渲染）
    if (!activePath.startsWith('/chat')) {
      navigate('/chat');
    }
  }, [activePath, navigate]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setActiveSessionId((prev: string) => prev === sessionId ? '' : prev);
  }, []);

  // 任务 4: 加载历史/归档会话上下文但不跳转路由
  const handleLoadSessionContext = useCallback((sessionId: string) => {
    loadSessionContext(sessionId);
  }, [loadSessionContext]);

  // 设置菜单项点击处理
  const handleSettingsLeafClick = useCallback((entry: MenuEntry) => {
    if (entry.aiTab) {
      setSettingsOpen(false);
      setAiDialogInitialTab({ main: entry.aiTab.main, sub: entry.aiTab.sub });
      setAiDialogOpen(true);
    } else if (entry.dialog === 'tool') {
      setSettingsOpen(false);
      setToolManagementDialogOpen(true);
    } else if (entry.dialog === 'model') {
      setSettingsOpen(false);
      setAiDialogInitialTab(undefined);
      setAiDialogOpen(true);
    } else if (entry.path) {
      setSettingsOpen(false);
      navigate(entry.path);
    }
  }, [navigate, setSettingsOpen]);

  return (
    <Box
      ref={sidebarRef}
      sx={{
        width,
        height: 'calc(100vh - var(--pw-top, 0px))',
        boxSizing: 'content-box',
        paddingTop: 'var(--pw-top, 0px)',
        position: 'sticky',
        top: 0,
        zIndex: 1200,
        flexShrink: 0,
        backgroundColor: SIDEBAR_BG,
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
        borderRight: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // v3.2: WKWebView 中禁用宽度过渡动画，避免全页面重排导致卡顿
        // 宽度变化会触发主内容区 margin 变化，进而导致整个页面重排
        transition: IS_WKWEBVIEW ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      // v1.5.107: 侧边栏整体作为窗口拖拽区域（pywebview frameless 窗口）
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Logo — 原生 App 模式下单独显示（避让顶部按钮区域），网页端模式下已包含在 top bar 中 */}
      {!collapsed && <SidebarLogo collapsed={collapsed} />}

      {/* Navigation list (含历史对话) */}
      <Box sx={{ flex: 1, minHeight: 0, display: collapsed ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <NavList
          collapsed={collapsed}
          activePath={activePath}
          onNavigate={handleNavigate}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onLoadSessionContext={handleLoadSessionContext}
        />
      </Box>

      {/* Bottom: Settings button */}
      <Box
        sx={{ px: collapsed ? 0.5 : 1, pb: 1.5, flexShrink: 0, display: collapsed ? 'none' : 'flex', flexDirection: 'column', gap: 0.25 }}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ListItemButton
          ref={settingsBtnRef}
          onClick={() => setSettingsOpen((prev) => !prev)}
          sx={{
            minHeight: collapsed ? 40 : 36,
            justifyContent: collapsed ? 'center' : 'flex-start',
            px: collapsed ? 0 : 1.5,
            borderRadius: '6px',
            backgroundColor: settingsOpen ? gs.bgActive : 'transparent',
            '&:hover': {
              backgroundColor: settingsOpen ? (isDark ? '#333333' : '#F9FAFB') : gs.bgHover,
            },
            color: gs.textSecondary,
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              mr: collapsed ? 0 : 1.5,
              justifyContent: 'center',
              color: settingsOpen ? gs.textPrimary : gs.textMuted,
              '& .MuiSvgIcon-root': { fontSize: collapsed ? '20px' : '18px' },
            }}
          >
            <SettingsOutlinedIcon />
          </ListItemIcon>
          <Box
            sx={{
              maxWidth: collapsed ? 0 : 120,
              opacity: collapsed ? 0 : 1,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: settingsOpen ? 500 : 400,
                color: settingsOpen ? gs.textPrimary : gs.textSecondary,
                lineHeight: '36px',
              }}
            >
              设置
            </Typography>
          </Box>
        </ListItemButton>
        <Suspense fallback={null}>
          <AISettingsDialog open={aiDialogOpen} onClose={() => setAiDialogOpen(false)} initialMainTab={aiDialogInitialTab?.main as any} initialSubTab={aiDialogInitialTab?.sub as any} />
          <ToolManagementDialog open={toolManagementDialogOpen} onClose={() => setToolManagementDialogOpen(false)} />
        </Suspense>
      </Box>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };
export default React.memo(Sidebar);
