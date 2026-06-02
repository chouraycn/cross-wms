import React from 'react';
import { IconButton, useTheme } from '@mui/material';
import ChevronLeftOutlinedIcon from '@mui/icons-material/ChevronLeftOutlined';
import MenuOpenOutlinedIcon from '@mui/icons-material/MenuOpenOutlined';

// ===================== Props =====================

export interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  expandedWidth: number;
  collapsedWidth: number;
}

// ===================== Component =====================

const SidebarToggle: React.FC<SidebarToggleProps> = ({
  collapsed,
  onToggle,
  expandedWidth,
  collapsedWidth,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <IconButton
      onClick={onToggle}
      size="small"
      sx={{
        position: 'fixed',
        top: '7px',
        left: collapsed ? collapsedWidth + 8 : expandedWidth - 40,
        right: 'auto',
        zIndex: 1300,
        color: isDark ? '#9CA3AF' : '#6B7280',
        borderRadius: '8px',
        p: 0.5,
        width: 32,
        height: 32,
        // Glass effect when collapsed (button sits on content area)
        ...(collapsed ? {
          backgroundColor: isDark ? 'rgba(30, 30, 30, 0.6)' : 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.2)',
        } : {}),
        '&:hover': {
          backgroundColor: collapsed
            ? (isDark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)')
            : (isDark ? '#333333' : '#e0e0e0'),
        },
        '&:focus': { outline: 'none' },
      }}
    >
      {collapsed ? (
        <MenuOpenOutlinedIcon sx={{ fontSize: 20 }} />
      ) : (
        <ChevronLeftOutlinedIcon sx={{ fontSize: 18 }} />
      )}
    </IconButton>
  );
};

export default SidebarToggle;
