import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Breadcrumbs,
  Link,
  Box,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
  Chip,
  Divider,
  useTheme,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { useLocation, useNavigate } from 'react-router-dom';
import { getGrayScale } from '../../constants/theme';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

const routeMap: Record<string, BreadcrumbItem[]> = {
  '/': [{ label: '仪表盘' }],
  '/warehouses': [{ label: '仓库管理' }],
  '/in-transit': [{ label: '在途管理' }],
  '/inventory': [{ label: '库存管理' }],
  '/tencent-docs': [{ label: '腾讯文档集成' }],
  '/reports': [{ label: '统计报表' }],
};

const TopBar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const breadcrumbs = routeMap[location.pathname] ?? [{ label: '未知页面' }];

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: gs.bgPanel,
        borderBottom: `1px solid ${gs.border}`,
        color: gs.textPrimary,
      }}
    >
      <Toolbar sx={{ minHeight: '64px !important', px: 3 }}>
        {/* Breadcrumbs */}
        <Box sx={{ flex: 1 }}>
          <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" />}
            aria-label="breadcrumb"
          >
            <Link
              underline="hover"
              color="inherit"
              sx={{ cursor: 'pointer', fontSize: '0.85rem', color: gs.textDisabled }}
              onClick={() => navigate('/')}
            >
              首页
            </Link>
            {breadcrumbs.map((bc, idx) =>
              bc.path ? (
                <Link
                  key={idx}
                  underline="hover"
                  sx={{ cursor: 'pointer', fontSize: '0.85rem' }}
                  onClick={() => navigate(bc.path!)}
                >
                  {bc.label}
                </Link>
              ) : (
                <Typography key={idx} sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                  {bc.label}
                </Typography>
              )
            )}
          </Breadcrumbs>
        </Box>

        {/* Right side */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label="深圳总仓"
            size="small"
            variant="outlined"
            sx={{ borderColor: gs.border, color: gs.textSecondary, fontSize: '0.75rem' }}
          />

          <IconButton size="small" sx={{ color: gs.textMuted }}>
            <NotificationsNoneIcon />
          </IconButton>

          <IconButton
            size="small"
            onClick={handleMenuOpen}
            sx={{ p: 0.5 }}
          >
            <Avatar
              sx={{
                width: 34,
                height: 34,
                backgroundColor: gs.textPrimary,
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              张
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              elevation: 2,
              sx: { minWidth: 160, mt: 1 },
            }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                张伟
              </Typography>
              <Typography variant="caption" color="text.secondary">
                仓库管理员
              </Typography>
            </Box>
            <Divider />
            <MenuItem onClick={handleMenuClose} sx={{ fontSize: '0.875rem' }}>
              <PersonOutlineIcon fontSize="small" sx={{ mr: 1.5, color: gs.textMuted }} />
              个人资料
            </MenuItem>
            <MenuItem onClick={handleMenuClose} sx={{ fontSize: '0.875rem' }}>
              <SettingsOutlinedIcon fontSize="small" sx={{ mr: 1.5, color: gs.textMuted }} />
              系统设置
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleMenuClose} sx={{ fontSize: '0.875rem', color: '#f44336' }}>
              <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />
              退出登录
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
