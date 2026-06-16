import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  ListItemButton,
  ListItemIcon,
  Typography,
  useTheme,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGrayScale } from '../../constants/theme';
import SidebarLogo from './SidebarLogo';
import NavList from './NavList';
import SidebarToggle from './SidebarToggle';
import SettingsPopover from './SettingsPopover';
import AISettingsDialog from './AISettingsDialog';
import ToolManagementDialog from './ToolManagementDialog';
import SystemAuthorizationDialog from './SystemAuthorizationDialog';


// ===================== Constants =====================

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 83;

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

  // v1.5.73: settingsOpen 提升到 MainLayout，通过 props 传入；无 props 时回退本地 state（兼容旧调用）
  const [localSettingsOpen, localSetSettingsOpen] = useState(false);
  const settingsOpen = settingsOpenProp ?? localSettingsOpen;
  const setSettingsOpen = onSettingsOpenChange ?? localSetSettingsOpen;

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [toolManagementDialogOpen, setToolManagementDialogOpen] = useState(false);
  const [systemAuthDialogOpen, setSystemAuthDialogOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLDivElement>(null);

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
      }}
    >
      {/* Sidebar toggle button — fixed position */}
      {onToggle && (
        <SidebarToggle
          collapsed={collapsed}
          onToggle={onToggle}
          expandedWidth={SIDEBAR_WIDTH_EXPANDED}
          collapsedWidth={SIDEBAR_WIDTH_COLLAPSED}
        />
      )}

      {/* Logo area */}
      <SidebarLogo
        collapsed={collapsed}
        onLogoClick={() => navigate('/chat')}
      />

      {/* Navigation list (含历史对话) */}
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

      {/* Bottom: Settings button */}
      <Box sx={{ px: collapsed ? 0.5 : 1, pb: 1.5, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
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
          onOpenSystemAuthorization={() => setSystemAuthDialogOpen(true)}
        />
        <AISettingsDialog open={aiDialogOpen} onClose={() => setAiDialogOpen(false)} onOpenSystemAuthorization={() => { setAiDialogOpen(false); setSystemAuthDialogOpen(true); }} />
        <ToolManagementDialog open={toolManagementDialogOpen} onClose={() => setToolManagementDialogOpen(false)} />
        <SystemAuthorizationDialog open={systemAuthDialogOpen} onClose={() => setSystemAuthDialogOpen(false)} />
      </Box>
    </Box>
  );
};

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };
export default Sidebar;
