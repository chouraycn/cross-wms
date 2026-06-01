import React from 'react';
import { IconButton } from '@mui/material';
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
  return (
    <IconButton
      onClick={onToggle}
      size="small"
      sx={{
        position: 'fixed',
        top: '7px',
        left: collapsed ? collapsedWidth + 8 : 'auto',
        right: collapsed ? 'auto' : `calc(100vw - ${expandedWidth}px + 8px)`,
        zIndex: 1300,
        color: '#6B7280',
        borderRadius: '8px',
        p: 0.5,
        width: 32,
        height: 32,
        // Glass effect when collapsed (button sits on white content area)
        ...(collapsed ? {
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        } : {}),
        '&:hover': {
          backgroundColor: collapsed ? 'rgba(255, 255, 255, 0.8)' : '#e0e0e0',
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
