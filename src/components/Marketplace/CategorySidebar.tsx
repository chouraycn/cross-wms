/**
 * CategorySidebar — 技能市场分类侧边栏
 *
 * 左侧分类导航：仓储、物流、报关、财务、通用，以及已安装/有更新筛选
 */

import React from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Badge,
  useTheme,
} from '@mui/material';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import DownloadDoneIcon from '@mui/icons-material/DownloadDone';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';

// ===================== 类型 =====================

export interface CategoryItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

export interface CategorySidebarProps {
  /** 当前选中的分类 key（空字符串表示"全部"） */
  activeCategory: string;
  /** 分类切换回调 */
  onCategoryChange: (category: string) => void;
  /** 是否显示"已安装"筛选 */
  showInstalled?: boolean;
  /** 是否显示"有更新"筛选 */
  showUpdates?: boolean;
  /** 有更新的技能数量 */
  updateCount?: number;
}

// ===================== 常量 =====================

const CATEGORIES: CategoryItem[] = [
  { key: '仓储', label: '仓储', icon: <WarehouseOutlinedIcon /> },
  { key: '物流', label: '物流', icon: <LocalShippingOutlinedIcon /> },
  { key: '报关', label: '报关', icon: <DescriptionOutlinedIcon /> },
  { key: '财务', label: '财务', icon: <AccountBalanceOutlinedIcon /> },
  { key: '通用', label: '通用', icon: <AppsOutlinedIcon /> },
];

// ===================== 组件 =====================

const CategorySidebar: React.FC<CategorySidebarProps> = ({
  activeCategory,
  onCategoryChange,
  showInstalled = true,
  showUpdates = true,
  updateCount = 0,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const textPrimary = isDark ? '#F3F4F6' : '#111827';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  const bgActive = isDark ? '#2D2D2D' : '#EFF6FF';
  const bgHover = isDark ? '#1F1F1F' : '#F9FAFB';
  const borderActive = '#2563EB';

  return (
    <Box
      sx={{
        width: 180,
        flexShrink: 0,
        borderRight: `1px solid ${isDark ? '#2D2D2D' : '#E5E7EB'}`,
        pr: 1,
        overflowY: 'auto',
      }}
    >
      {/* 分类标题 */}
      <Typography
        sx={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: textSecondary,
          px: 1.5,
          pt: 1,
          pb: 0.5,
          letterSpacing: '0.02em',
        }}
      >
        分类
      </Typography>

      <List sx={{ py: 0 }}>
        {/* 全部 */}
        <ListItemButton
          selected={activeCategory === ''}
          onClick={() => onCategoryChange('')}
          sx={{
            borderRadius: '6px',
            mb: 0.25,
            py: 0.5,
            '&.Mui-selected': {
              backgroundColor: bgActive,
              borderLeft: `3px solid ${borderActive}`,
              '&:hover': { backgroundColor: bgActive },
            },
            '&:hover': { backgroundColor: bgHover },
          }}
        >
          <ListItemIcon sx={{ minWidth: 32, justifyContent: 'center', color: activeCategory === '' ? borderActive : textSecondary }}>
            <AppsOutlinedIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText
            primary="全部"
            primaryTypographyProps={{
              fontSize: '0.8125rem',
              fontWeight: activeCategory === '' ? 500 : 400,
              color: activeCategory === '' ? textPrimary : textSecondary,
            }}
          />
        </ListItemButton>

        {/* 业务分类 */}
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <ListItemButton
              key={cat.key}
              selected={isActive}
              onClick={() => onCategoryChange(cat.key)}
              sx={{
                borderRadius: '6px',
                mb: 0.25,
                py: 0.5,
                '&.Mui-selected': {
                  backgroundColor: bgActive,
                  borderLeft: `3px solid ${borderActive}`,
                  '&:hover': { backgroundColor: bgActive },
                },
                '&:hover': { backgroundColor: bgHover },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, justifyContent: 'center', color: isActive ? borderActive : textSecondary }}>
                {React.cloneElement(cat.icon as React.ReactElement, {
                  sx: { fontSize: 18 },
                })}
              </ListItemIcon>
              <ListItemText
                primary={cat.label}
                primaryTypographyProps={{
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? textPrimary : textSecondary,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      {/* 筛选区域 */}
      <Typography
        sx={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: textSecondary,
          px: 1.5,
          pt: 2,
          pb: 0.5,
          letterSpacing: '0.02em',
        }}
      >
        筛选
      </Typography>

      <List sx={{ py: 0 }}>
        {showInstalled && (
          <ListItemButton
            selected={activeCategory === '__installed__'}
            onClick={() => onCategoryChange('__installed__')}
            sx={{
              borderRadius: '6px',
              mb: 0.25,
              py: 0.5,
              '&.Mui-selected': {
                backgroundColor: bgActive,
                borderLeft: `3px solid ${borderActive}`,
                '&:hover': { backgroundColor: bgActive },
              },
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32, justifyContent: 'center', color: activeCategory === '__installed__' ? borderActive : textSecondary }}>
              <DownloadDoneIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="已安装"
              primaryTypographyProps={{
                fontSize: '0.8125rem',
                fontWeight: activeCategory === '__installed__' ? 500 : 400,
                color: activeCategory === '__installed__' ? textPrimary : textSecondary,
              }}
            />
          </ListItemButton>
        )}

        {showUpdates && (
          <ListItemButton
            selected={activeCategory === '__updates__'}
            onClick={() => onCategoryChange('__updates__')}
            sx={{
              borderRadius: '6px',
              mb: 0.25,
              py: 0.5,
              '&.Mui-selected': {
                backgroundColor: bgActive,
                borderLeft: `3px solid ${borderActive}`,
                '&:hover': { backgroundColor: bgActive },
              },
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32, justifyContent: 'center', color: activeCategory === '__updates__' ? borderActive : textSecondary }}>
              <SystemUpdateAltIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>有更新</span>
                  {updateCount > 0 && (
                    <Badge
                      badgeContent={updateCount}
                      color="error"
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.6rem',
                          minWidth: 16,
                          height: 16,
                          right: -4,
                          top: 2,
                        },
                      }}
                    />
                  )}
                </Box>
              }
              primaryTypographyProps={{
                fontSize: '0.8125rem',
                fontWeight: activeCategory === '__updates__' ? 500 : 400,
                color: activeCategory === '__updates__' ? textPrimary : textSecondary,
              }}
            />
          </ListItemButton>
        )}
      </List>
    </Box>
  );
};

export default CategorySidebar;
