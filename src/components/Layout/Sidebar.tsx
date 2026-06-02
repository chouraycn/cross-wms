import React, { useState, useRef } from 'react';
import {
  Box,
  ListItemButton,
  ListItemIcon,
  Typography,
  Tooltip,
  useTheme,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import MonitorOutlinedIcon from '@mui/icons-material/MonitorOutlined';
import { useNavigate, useLocation } from 'react-router-dom';
import SidebarLogo from './SidebarLogo';
import NavList from './NavList';
import SidebarToggle from './SidebarToggle';
import SettingsPopover from './SettingsPopover';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { ThemeMode } from '../../contexts/AppSettingsContext';

// ===================== Constants =====================

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 83;

// ===================== Sidebar Component =====================

interface SidebarProps {
  collapsed: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const SIDEBAR_BG = isDark ? '#1A1A1A' : '#F0F0F0';

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLDivElement>(null);
  const { settings, updateSettings } = useAppSettings();

  // 主题切换：浅色 → 深色 → 跟随系统 → 浅色
  const themeMode = settings.appearance.themeMode;
  const cycleTheme = () => {
    const next: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };
    updateSettings({ appearance: { ...settings.appearance, themeMode: next[themeMode] } });
  };

  const themeIcon = themeMode === 'dark' ? <DarkModeOutlinedIcon /> : themeMode === 'light' ? <LightModeOutlinedIcon /> : <MonitorOutlinedIcon />;
  const themeTooltip = themeMode === 'dark' ? '深色模式（点击切换）' : themeMode === 'light' ? '浅色模式（点击切换）' : '跟随系统（点击切换）';
  const themeLabel = themeMode === 'dark' ? '深色' : themeMode === 'light' ? '浅色' : '跟随系统';
  const [activeSessionId, setActiveSessionId] = useState(() => {
    try {
      const raw = localStorage.getItem('crosswms-chat-sessions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch { /* ignore */ }
    return '';
  });

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
        activePath={location.pathname}
        onNavigate={(path) => navigate(path)}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId) => {
          setActiveSessionId(sessionId);
          navigate(`/chat?session=${encodeURIComponent(sessionId)}`);
        }}
        onDeleteSession={(sessionId) => {
          setActiveSessionId((prev: string) => prev === sessionId ? '' : prev);
        }}
      />

      {/* Bottom: Theme toggle + Settings button */}
      <Box sx={{ px: collapsed ? 0.5 : 1, pb: 1.5, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {/* 主题切换按钮 */}
        {collapsed ? (
          <Tooltip title={themeTooltip} placement="right" arrow>
            <ListItemButton
              onClick={cycleTheme}
              sx={{
                minHeight: 40,
                justifyContent: 'center',
                px: 0,
                borderRadius: '6px',
                '&:hover': { backgroundColor: isDark ? '#2D2D2D' : '#f5f5f5' },
                color: isDark ? '#9CA3AF' : '#6B7280',
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: '20px' } }}>
                {themeIcon}
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        ) : (
          <ListItemButton
            onClick={cycleTheme}
            sx={{
              minHeight: 36,
              px: 1.5,
              py: 0.25,
              borderRadius: '6px',
              '&:hover': { backgroundColor: isDark ? '#2D2D2D' : '#f5f5f5' },
              color: isDark ? '#D1D5DB' : '#374151',
            }}
          >
            <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center', color: isDark ? '#9CA3AF' : '#6B7280', '& .MuiSvgIcon-root': { fontSize: '18px' } }}>
              {themeIcon}
            </ListItemIcon>
            <Typography sx={{ fontSize: '0.8125rem', lineHeight: '36px', flex: 1 }}>
              {themeLabel}
            </Typography>
            <Typography sx={{ fontSize: '0.625rem', color: isDark ? '#6B7280' : '#9CA3AF', lineHeight: '36px' }}>
              {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '💻'}
            </Typography>
          </ListItemButton>
        )}

        {/* 设置按钮 */}
        <Box ref={settingsBtnRef}>
        <ListItemButton
          onClick={() => setSettingsOpen(true)}
          sx={{
            minHeight: collapsed ? 40 : 36,
            justifyContent: collapsed ? 'center' : 'flex-start',
            px: collapsed ? 0 : 1.5,
            borderRadius: '6px',
            backgroundColor: settingsOpen ? (isDark ? '#2D2D2D' : '#FFFFFF') : 'transparent',
            '&:hover': {
              backgroundColor: settingsOpen ? (isDark ? '#333333' : '#F9FAFB') : (isDark ? '#2D2D2D' : '#f5f5f5'),
            },
            color: isDark ? '#E5E7EB' : undefined,
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              mr: collapsed ? 0 : 1.5,
              justifyContent: 'center',
              color: settingsOpen ? (isDark ? '#FFFFFF' : '#111827') : (isDark ? '#9CA3AF' : '#6B7280'),
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
                color: settingsOpen ? (isDark ? '#FFFFFF' : '#111827') : (isDark ? '#D1D5DB' : '#374151'),
                lineHeight: '36px',
              }}
            >
              设置
            </Typography>
          </Box>
        </ListItemButton>
        </Box>
      </Box>

      {/* Settings Popover */}
      <SettingsPopover
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        anchorEl={settingsBtnRef.current}
      />
    </Box>
  );
};

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };
export default Sidebar;
