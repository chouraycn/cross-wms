import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  ListItemButton,
  ListItemIcon,
  Typography,
  useTheme,
  IconButton,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGrayScale } from '../../constants/theme';
import SidebarLogo from './SidebarLogo';
import NavList from './NavList';
import SidebarToggle from './SidebarToggle';
import SettingsPopover from './SettingsPopover';
import AISettingsDialog from './AISettingsDialog';
import ToolManagementDialog from './ToolManagementDialog';
import CommandPalette from './CommandPalette';
import { isPyWebView } from '../../services/tencentDocsApi';

// 检测是否为原生 App 模式（pywebview 或 Swift 原生）
const isNativeApp = (): boolean => {
  // @ts-ignore
  if (window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};

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
  /** v1.5.73: 从 MainLayout 提升，供 /settings 路由触发 */
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

  // v1.7.18: 监听全屏状态变化，全屏时按钮前移（红黄绿隐藏后无需避让）
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFullscreenChanged = ((e: CustomEvent) => {
      setIsFullscreen(e.detail?.fullscreen ?? false);
    }) as EventListener;
    window.addEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
    return () => window.removeEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
  }, []);

  // v1.5.73: settingsOpen 提升到 MainLayout，通过 props 传入；无 props 时回退本地 state（兼容旧调用）
  const [localSettingsOpen, localSetSettingsOpen] = useState(false);
  const settingsOpen = settingsOpenProp ?? localSettingsOpen;
  const setSettingsOpen = onSettingsOpenChange ?? localSetSettingsOpen;

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [toolManagementDialogOpen, setToolManagementDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLDivElement>(null);

  const [activeSessionId, setActiveSessionId] = useState('');
  // 点击「AI 对话」新建会话后，短暂忽略 chat-updated 事件，避免新会话 ID 覆盖清空状态
  const ignoreChatUpdateRef = useRef(false);

  // 兼容 hash 路由：从 hash 中提取实际路径
  const activePath = location.hash ? location.hash.replace('#', '') : location.pathname;

  // 监听 CrossWmsChat 的会话更新事件，同步 activeSessionId
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
    window.addEventListener('cdf-know-clow-chat-updated', onChatUpdate);
    window.addEventListener('cdf-know-clow-clear-session', onClearSession);
    return () => {
      window.removeEventListener('cdf-know-clow-chat-updated', onChatUpdate);
      window.removeEventListener('cdf-know-clow-clear-session', onClearSession);
    };
  }, []);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const nativeApp = isNativeApp();

  return (
    <Box
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
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      // v1.5.107: 侧边栏整体作为窗口拖拽区域（pywebview frameless 窗口）
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 原生 App 模式：搜索 + Toggle 按钮绝对定位在顶部 padding 区域内，与红黄绿对齐 */}
      {/* v1.7.15: 红黄绿往下移5px，top=19，中心线=25；按钮 size=25.92px, top = 25 - 25.92/2 ≈ 12px */}
      {/* v1.7.18: 全屏时红黄绿隐藏，按钮组从右侧移到左侧 */}
      {nativeApp && !collapsed && (
        <Box
          sx={{
            position: 'absolute',
            top: '12px',
            ...(isFullscreen ? { left: 10 } : { right: 3 }),
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            zIndex: 1400,
          }}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
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

      {/* 收起状态：搜索 + toggle 悬浮按钮（原生 App 与红黄绿对齐，网页端保持原有位置） */}
      {/* v1.7.15: 
           1. 往下移5px（top从7px改为12px）
           2. DMG模式下按钮移到红黄绿后面（left从10改为60，避免遮挡红黄绿）
           3. 点击绿按钮后自动展开侧边栏（通过最大化状态检测）
      */}
      {collapsed && (
        <>
          <IconButton
            onClick={() => {
              // v1.7.15: 点击搜索按钮时，临时展开侧边栏以显示搜索界面
              if (onToggle) onToggle();
              setTimeout(() => setSearchOpen(true), 50);
            }}
            size="small"
            sx={{
              position: 'fixed',
              top: nativeApp ? '15px' : '10px', // v1.7.18: 往上1px
              left: nativeApp ? (isFullscreen ? 80 : 96) : 10, // v1.7.18: 搜索按钮再右移5px
              zIndex: 1400,
              color: 'text.primary',
              borderRadius: '6.48px',
              p: 0.45,
              width: 25.92,
              height: 25.92,
              // v1.7.18: macOS 收起时去掉玻璃背景和描边，网页端保持玻璃效果
              backgroundColor: nativeApp ? 'transparent' : (isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.6)'),
              ...(nativeApp ? {} : {
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }),
              border: nativeApp ? 'none' : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
              '&:hover': {
                backgroundColor: nativeApp ? gs.bgHover : (isDark ? 'rgba(20, 20, 20, 0.8)' : 'rgba(240, 240, 240, 0.8)'),
              },
              '&:focus': { outline: 'none' },
            }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <SearchOutlinedIcon sx={{ fontSize: '18px' }} />
          </IconButton>

          {onToggle && (
            <SidebarToggle
              collapsed={collapsed}
              onToggle={onToggle}
              expandedWidth={SIDEBAR_WIDTH_EXPANDED}
              collapsedWidth={SIDEBAR_WIDTH_COLLAPSED}
            />
          )}
        </>
      )}

      {/* Logo — 原生 App 模式下单独显示（避让顶部按钮区域），网页端模式下已包含在 top bar 中 */}
      {nativeApp && !collapsed && <SidebarLogo collapsed={collapsed} />}

      {/* Navigation list (含历史对话) */}
      <Box sx={{ flex: 1, minHeight: 0, display: collapsed ? 'none' : 'block', overflow: 'hidden' }}>
        <NavList
          collapsed={collapsed}
          activePath={activePath}
          onNavigate={(path) => {
            // 点击导航项时清除历史对话选中态，白条回到导航项
            setActiveSessionId('');
            navigate(path);
          }}
          activeSessionId={activeSessionId}
          onSelectSession={(sessionId) => {
            setActiveSessionId(sessionId);
            navigate(`/chat?session=${encodeURIComponent(sessionId)}`);
          }}
          onDeleteSession={(sessionId) => {
            setActiveSessionId((prev: string) => prev === sessionId ? '' : prev);
          }}
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
        <SettingsPopover
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          anchorEl={settingsBtnRef.current}
          onOpenModelManagement={() => setAiDialogOpen(true)}
          onOpenToolManagement={() => setToolManagementDialogOpen(true)}
        />
        <AISettingsDialog open={aiDialogOpen} onClose={() => setAiDialogOpen(false)} />
        <ToolManagementDialog open={toolManagementDialogOpen} onClose={() => setToolManagementDialogOpen(false)} />
      </Box>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };
export default Sidebar;
