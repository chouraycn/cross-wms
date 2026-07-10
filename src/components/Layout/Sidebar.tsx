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
import { useAppSettings } from '../../contexts/AppSettingsContext';
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

// ===================== Toggle Icons =====================

const CollapseIcon: React.FC = () => (
  <svg width="19.44" height="19.44" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="9" y1="8" x2="9" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ExpandIcon: React.FC = () => (
  <svg width="19.44" height="19.44" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="15" y1="8" x2="15" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);


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

  const [localSettingsOpen, localSetSettingsOpen] = useState(false);
  const settingsOpen = settingsOpenProp ?? localSettingsOpen;
  const setSettingsOpen = onSettingsOpenChange ?? localSetSettingsOpen;

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDialogInitialTab, setAiDialogInitialTab] = useState<{ main: string; sub: string } | undefined>(undefined);
  const [toolManagementDialogOpen, setToolManagementDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedSettingsGroup, setExpandedSettingsGroup] = useState<string | null>(null);
  const settingsBtnRef = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { settings, updateSettings } = useAppSettings();

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
    return () => {
      window.removeEventListener('cdf-know-clow-chat-updated', onChatUpdate);
      window.removeEventListener('cdf-know-clow-clear-session', onClearSession);
      window.removeEventListener('cdf-chat-input-blur', onChatInputBlur);
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
      {/* 原生 App 模式：搜索 + Toggle 按钮绝对定位在侧边栏右侧（与网页端布局区分） */}
      {/* v3.1: 恢复 macOS 专属位置 — 按钮在右侧右上角，不与红黄绿按钮区域对齐 */}
      {nativeApp && !collapsed && (
        <Box
          sx={{
            position: 'absolute',
            top: '12px',
            right: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            zIndex: 1400,
          }}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {onToggle && (
            <IconButton
              onClick={onToggle}
              size="small"
              sx={{
                color: gs.textPrimary,
                borderRadius: '6.48px',
                p: 0.45,
                width: 25.92,
                height: 25.92,
                flexShrink: 0,
                '&:hover': {
                  backgroundColor: gs.bgHover,
                },
                '&:focus': { outline: 'none' },
              }}
            >
              <CollapseIcon />
            </IconButton>
          )}
          <IconButton
            onClick={() => setSearchOpen(true)}
            size="small"
            sx={{
              color: gs.textPrimary,
              borderRadius: '6.48px',
              p: 0.45,
              width: 25.92,
              height: 25.92,
              flexShrink: 0,
              '&:hover': {
                backgroundColor: gs.bgHover,
              },
              '&:focus': { outline: 'none' },
            }}
          >
            <SearchOutlinedIcon sx={{ fontSize: '18px' }} />
          </IconButton>
        </Box>
      )}

      {/* 网页端模式：Logo + 按钮在同一行，按钮右对齐（旧布局） */}
      {!nativeApp && !collapsed && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1,
            pt: 1,
            pb: 0.5,
            flexShrink: 0,
          }}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <SidebarLogo collapsed={collapsed} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              onClick={() => setSearchOpen(true)}
              size="small"
              sx={{
                color: gs.textPrimary,
                borderRadius: '6.48px',
                p: 0.45,
                width: 25.92,
                height: 25.92,
                flexShrink: 0,
                '&:hover': {
                  backgroundColor: gs.bgHover,
                },
                '&:focus': { outline: 'none' },
              }}
            >
              <SearchOutlinedIcon sx={{ fontSize: '18px' }} />
            </IconButton>

            {onToggle && (
              <IconButton
                onClick={onToggle}
                size="small"
                sx={{
                  color: gs.textPrimary,
                  borderRadius: '6.48px',
                  p: 0.45,
                  width: 25.92,
                  height: 25.92,
                  flexShrink: 0,
                  '&:hover': {
                    backgroundColor: gs.bgHover,
                  },
                  '&:focus': { outline: 'none' },
                }}
              >
                <CollapseIcon />
              </IconButton>
            )}
          </Box>
        </Box>
      )}

      {/* 收起状态：无顶部按钮（侧边栏切换和新对话按钮由 ChatThread 顶部栏提供） */}
      {collapsed && (
        <>
          {/* 输入内容预览 — 仅收起时且有输入内容时显示 */}
          {chatInputValue.trim() && (
            <Box
              sx={{
                position: 'fixed',
                top: nativeApp ? '15px' : '10px',
                left: nativeApp ? (isFullscreen ? 76 : 136) : 74,
                zIndex: 1400,
                display: 'flex',
                alignItems: 'center',
                height: 25.92,
                px: 1.5,
                borderRadius: '6.48px',
                backgroundColor: nativeApp ? 'transparent' : (isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.6)'),
                // v3.2: WKWebView 中禁用 backdrop-filter，毛玻璃效果性能差导致卡顿
                ...(nativeApp || IS_WKWEBVIEW ? {} : {
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }),
                border: nativeApp ? 'none' : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                maxWidth: 200,
              }}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  color: gs.textSecondary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {chatInputValue.trim()}
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* Logo — 原生 App 模式下单独显示（避让顶部按钮区域），网页端模式下已包含在 top bar 中 */}
      {nativeApp && !collapsed && <SidebarLogo collapsed={collapsed} />}

      {/* Navigation list (含历史对话) 或 设置面板 */}
      <Box sx={{ flex: 1, minHeight: 0, display: collapsed ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {settingsOpen ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              px: 1,
              pt: 1,
              pb: 1,
            }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* 设置面板卡片 */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                bgcolor: isDark ? '#1E1E1E' : '#FFFFFF',
                borderRadius: '12px',
                border: `1px solid ${gs.border}`,
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
              }}
            >
              {/* 设置面板标题栏 - logo + 标题 */}
              <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <g fill={gs.textPrimary}>
                      <path d="M93.45,36.53l-11.5,16.57,10.03,14.41c2.25-5.4,3.5-11.32,3.5-17.53,0-4.68-.71-9.2-2.02-13.45Z" />
                      <path d="M57.48,88.15c-2.65.57-5.4.88-8.23.88-6.04,0-11.77-1.37-16.88-3.83V18.56c0-2.38,1.47-4.54,3.71-5.34,4.11-1.47,8.55-2.28,13.17-2.28.91,0,1.81.03,2.71.1v44.36c0,2.49,3.21,3.5,4.64,1.45l26.5-38.08c-7.87-8.37-18.87-13.77-31.13-14.32v.03c-.9-.05-1.8-.08-2.71-.08C24.07,4.39,3.66,24.8,3.66,49.99s20.41,45.59,45.59,45.59c1.04,0,2.07-.04,3.09-.11l-.03.04c10.67-.56,20.36-4.8,27.85-11.46l-6.65-9.55c-1.56-2.25-4.89-2.25-6.46-.01l-9.57,13.65Z" />
                    </g>
                  </svg>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>CDF Know Claw</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>v{APP_VERSION}</Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 1, flexShrink: 0 }} />
              {/* 设置菜单内容 - 可滚动 */}
              <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, pl: '5px', pr: '5px', pb: 1 }}>
                {SETTINGS_MENU.map((entry) => {
                  const isAppearance = entry.appearanceInline === true;
                  if (entry.children) {
                    const expanded = expandedSettingsGroup === entry.key;
                    const hasAiTab = !!entry.aiTab;
                    return (
                      <Box key={entry.key}>
                        <Box
                          sx={{
                            display: 'flex', alignItems: 'center', gap: '7px', px: '13px', py: 1, borderRadius: '8px',
                            '&:hover': { backgroundColor: gs.bgHover },
                          }}
                        >
                          <Box
                            sx={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0, cursor: 'pointer' }}
                            onClick={() => { if (hasAiTab) handleSettingsLeafClick(entry); }}
                          >
                            <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center', minWidth: 20 }}>{entry.icon}</Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>{entry.label}</Typography>
                            </Box>
                          </Box>
                          <ExpandMoreIcon
                            onClick={() => setExpandedSettingsGroup(expanded ? null : entry.key)}
                            sx={{ fontSize: 18, color: gs.textMuted, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', cursor: 'pointer' }}
                          />
                        </Box>
                        {expanded && entry.children.map((child) => {
                          const childIsAppearance = child.appearanceInline === true;
                          return (
                            <Box
                              key={child.key}
                              onClick={() => { if (!childIsAppearance) handleSettingsLeafClick(child); }}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: '7px',
                                pl: '29px', pr: '13px', py: 0.75,
                                cursor: childIsAppearance ? 'default' : 'pointer',
                                borderRadius: '8px',
                                '&:hover': { backgroundColor: childIsAppearance ? 'transparent' : gs.bgHover },
                              }}
                            >
                              <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 20 }}>
                                {child.icon}
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: gs.textPrimary }}>{child.label}</Typography>
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    );
                  }
                  return (
                    <Box
                      key={entry.key}
                      onClick={() => { if (!isAppearance) handleSettingsLeafClick(entry); }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        px: '13px', py: 1,
                        cursor: isAppearance ? 'default' : 'pointer',
                        borderRadius: '8px',
                        '&:hover': { backgroundColor: isAppearance ? 'transparent' : gs.bgHover },
                      }}
                    >
                      <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 20 }}>
                        {entry.icon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>{entry.label}</Typography>
                      </Box>
                      {isAppearance && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }} onClick={e => e.stopPropagation()}>
                          <Box
                            onClick={() => {
                              const newMode = 'light' as const;
                              updateSettings({ appearance: { ...settings.appearance, themeMode: newMode } });
                            }}
                            sx={{
                              px: 1.5, py: 0.4, borderRadius: '12px 0 0 12px', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                              backgroundColor: settings.appearance.themeMode === 'light' ? gs.bgPanel : gs.bgHover,
                              color: settings.appearance.themeMode === 'light' ? gs.textPrimary : gs.textDisabled,
                              border: `1px solid ${gs.border}`, borderRight: 'none',
                              boxShadow: settings.appearance.themeMode === 'light' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                              transition: 'all 0.15s',
                            }}
                          >
                            浅色
                          </Box>
                          <Box
                            onClick={() => {
                              const newMode = 'dark' as const;
                              updateSettings({ appearance: { ...settings.appearance, themeMode: newMode } });
                            }}
                            sx={{
                              px: 1.5, py: 0.4, borderRadius: '0 12px 12px 0', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                              backgroundColor: settings.appearance.themeMode === 'dark' ? gs.bgPanel : gs.bgHover,
                              color: settings.appearance.themeMode === 'dark' ? gs.textPrimary : gs.textDisabled,
                              border: `1px solid ${gs.border}`, borderLeft: 'none',
                              boxShadow: settings.appearance.themeMode === 'dark' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                              transition: 'all 0.15s',
                            }}
                          >
                            深色
                          </Box>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        ) : (
          <NavList
            collapsed={collapsed}
            activePath={activePath}
            onNavigate={handleNavigate}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onLoadSessionContext={handleLoadSessionContext}
          />
        )}
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
