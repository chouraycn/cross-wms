/**
 * SettingsDialogShell — 统一设置弹窗外壳
 *
 * 为 AISettingsDialog 和 ToolManagementDialog 提供一致的：
 * - Dialog 配置（宽度、高度、阴影、圆角、暗色模式）
 * - 关闭按钮
 * - 左侧 Tab 导航栏
 * - 右侧内容区
 *
 * 使用 getGrayScale 主题系统，自动适配暗色模式。
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Dialog,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getGrayScale } from '../../constants/theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
}

export interface SettingsDialogShellProps {
  open: boolean;
  onClose: () => void;

  /** Tab 定义数组 */
  tabs: TabDef[];

  /** 当前激活的 tab key */
  activeTab: string;

  /** 切换 tab 回调 */
  onTabChange: (key: string) => void;

  /** 右侧内容区渲染 */
  children: React.ReactNode;

  /** 弹窗宽度，默认 960 */
  width?: number;

  /** 弹窗高度，默认 620 */
  height?: number;

  /** 侧边栏宽度，默认 156 */
  sidebarWidth?: number;

  /** 侧边栏图标尺寸，默认 17 */
  iconSize?: number;

  /** 侧边栏文字尺寸，默认 '0.8125rem' */
  fontSize?: string;

  /** 右侧内容区 padding，默认 { px: 3, pt: 3, pb: 4 } */
  contentPadding?: { px?: number; pt?: number; pb?: number };

  /** 内容区是否自行管理 overflow（默认 false，由 shell 管理） */
  contentSelfOverflow?: boolean;

  /** 是否显示顶部 padding（默认 false） */
  topPadding?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const SettingsDialogShell: React.FC<SettingsDialogShellProps> = ({
  open,
  onClose,
  tabs,
  activeTab,
  onTabChange,
  children,
  width = 960,
  height = 620,
  sidebarWidth = 156,
  iconSize = 17,
  fontSize = '0.8125rem',
  contentPadding = { px: 3, pt: 3, pb: 4 },
  contentSelfOverflow = false,
  topPadding,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.5)' : '0 24px 64px rgba(0,0,0,0.18)',
          width,
          height,
          maxHeight: 'none',
          margin: 'auto',
          backgroundColor: gs.bgPanel,
          overflow: 'hidden',
        },
      }}
    >
      {/* Close button — absolute top-right */}
      <IconButton
        size="small"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 10,
          color: gs.textMuted,
          '&:hover': { color: gs.textPrimary, backgroundColor: gs.bgHover },
        }}
      >
        <CloseIcon sx={{ fontSize: 20 }} />
      </IconButton>

      <Box sx={{ display: 'flex', height: '100%', pt: topPadding ?? 0 }}>
        {/* Left sidebar */}
        <Box
          sx={{
            width: sidebarWidth,
            borderRight: `1px solid ${gs.border}`,
            backgroundColor: gs.bgSidebar,
            py: 2,
            px: 1.25,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.125,
            flexShrink: 0,
          }}
        >
          {tabs.map(tab => {
            const isSelected = activeTab === tab.key;
            return (
              <Box
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.25,
                  py: 1,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  backgroundColor: isSelected ? gs.bgActive : 'transparent',
                  color: isSelected ? gs.textPrimary : gs.textMuted,
                  '&:hover': {
                    backgroundColor: isSelected ? gs.bgActive : gs.bgHover,
                    color: gs.textPrimary,
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', opacity: isSelected ? 1 : 0.55 }}>
                  {React.cloneElement(tab.icon as React.ReactElement, { sx: { fontSize: iconSize } })}
                </Box>
                <Typography sx={{ fontSize, fontWeight: isSelected ? 500 : 400, letterSpacing: '-0.01em' }}>
                  {tab.label}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Right content area */}
        <Box
          sx={{
            flex: 1,
            px: contentPadding.px,
            pt: contentPadding.pt,
            pb: contentPadding.pb,
            overflow: contentSelfOverflow ? 'visible' : 'hidden',
            minWidth: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Box>
      </Box>
    </Dialog>
  );
};

export default SettingsDialogShell;
