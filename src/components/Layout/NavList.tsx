import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Typography,
  Box,
  Tooltip,
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

// ===================== Nav Items =====================

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: '仪表盘', path: '/', icon: <DashboardOutlinedIcon /> },
  { label: '技能', path: '/skills', icon: <AutoFixHighIcon /> },
  { label: '自动化', path: '/automation', icon: <ScheduleIcon /> },
  { label: 'Agent 应用', path: '/agent', icon: <SmartToyOutlinedIcon /> },
  { label: '仓库管理', path: '/warehouses', icon: <WarehouseOutlinedIcon /> },
  { label: '在途管理', path: '/in-transit', icon: <LocalShippingOutlinedIcon /> },
  { label: '库存管理', path: '/inventory', icon: <InventoryOutlinedIcon /> },
  { label: '腾讯文档', path: '/tencent-docs', icon: <DescriptionOutlinedIcon /> },
  { label: '统计报表', path: '/reports', icon: <AssessmentOutlinedIcon /> },
];

// ===================== Props =====================

interface NavListProps {
  collapsed: boolean;
  activePath: string;
  onNavigate: (path: string) => void;
}

// ===================== Component =====================

const NavList: React.FC<NavListProps> = ({ collapsed, activePath, onNavigate }) => {
  const isActive = (path: string) =>
    path === '/' ? activePath === '/' : activePath.startsWith(path);

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
        const active = isActive(item.path);
        return (
          <ListItem key={item.path} disablePadding sx={{ display: 'block', mb: 0.5 }}>
            <Tooltip title={collapsed ? item.label : ''} placement="right" arrow>
              <ListItemButton
                onClick={() => onNavigate(item.path)}
                sx={{
                  minHeight: collapsed ? 40 : 36,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 0 : 1.5,
                  py: 0.25,
                  borderRadius: '6px',
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                  '&:hover': {
                    backgroundColor: active ? '#F9FAFB' : '#f5f5f5',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: collapsed ? 0 : 1.5,
                    justifyContent: 'center',
                    color: active ? '#111827' : '#6B7280',
                    '& .MuiSvgIcon-root': { fontSize: collapsed ? '20px' : '18px' },
                  }}
                >
                  {item.icon}
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
                      fontWeight: active ? 500 : 400,
                      color: active ? '#111827' : '#374151',
                      lineHeight: '36px',
                    }}
                  >
                    {item.label}
                  </Typography>
                </Box>
              </ListItemButton>
            </Tooltip>
          </ListItem>
        );
      })}
    </List>
  );
};

export default NavList;
