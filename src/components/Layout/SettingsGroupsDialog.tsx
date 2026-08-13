/**
 * SettingsGroupsDialog — 设置分组弹窗
 *
 * 点击设置 Popover 内的分组（通讯&语音、创作、系统、触发&通知、开发工具、
 * 知识&记忆、仓储管理）时弹出。复用 SettingsDialogShell（与模型管理同形态）：
 * - 左栏：该栏目（对应分组）的下一级子项
 * - 右栏：选中子项的详情 + 打开按钮（执行导航 / 打开 AI 设置 / 打开工具管理）
 *
 * 点击「打开」后执行对应动作并关闭本弹窗。
 */

import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import SettingsDialogShell from '../shared/SettingsDialogShell';
import { getGrayScale } from '../../constants/theme';
import { MenuEntry, SETTINGS_MENU } from './settingsMenuData.tsx';

interface SettingsGroupsDialogProps {
  open: boolean;
  initialGroupKey?: string;
  onClose: () => void;
}

const SettingsGroupsDialog: React.FC<SettingsGroupsDialogProps> = ({ open, initialGroupKey, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();

  // 仅取带 children 的分组（通讯 → 仓储，共 7 个）
  const groups = SETTINGS_MENU.filter((e) => e.children && e.children.length > 0);
  const activeGroup = groups.find((g) => g.key === initialGroupKey) ?? groups[0];
  const children = activeGroup?.children ?? [];

  const [activeChildKey, setActiveChildKey] = useState<string>(children[0]?.key ?? '');

  // 每次打开时，定位到该分组的第一个子项
  useEffect(() => {
    if (open && activeGroup) setActiveChildKey(activeGroup.children?.[0]?.key ?? '');
    // 注意：依赖列表故意不含 activeGroup（由 initialGroupKey 派生），避免重渲染抖动
  }, [open, initialGroupKey]);

  const activeChild = children.find((c) => c.key === activeChildKey) ?? children[0];

  const handleLeafClick = (entry?: MenuEntry) => {
    if (!entry) return;
    if (entry.aiTab) {
      onClose();
      window.dispatchEvent(new CustomEvent('cdf-open-ai-settings-dialog', { detail: { mainTab: entry.aiTab.main, subTab: entry.aiTab.sub } }));
    } else if (entry.dialog === 'tool') {
      onClose();
      window.dispatchEvent(new CustomEvent('cdf-open-tool-management-dialog'));
    } else if (entry.dialog === 'model') {
      onClose();
      window.dispatchEvent(new CustomEvent('cdf-open-ai-settings-dialog', { detail: { mainTab: 'basic', subTab: 'model' } }));
    } else if (entry.path) {
      onClose();
      navigate(entry.path);
    }
  };

  const tabs = children.map((c) => ({ key: c.key, label: c.label, icon: c.icon as React.ReactNode }));

  return (
    <SettingsDialogShell
      open={open}
      onClose={onClose}
      tabs={tabs}
      activeTab={activeChild?.key ?? ''}
      onTabChange={(k) => setActiveChildKey(k)}
      width={720}
      height={520}
      sidebarWidth={200}
      contentPadding={{ px: 3, pt: 3, pb: 3 }}
    >
      {activeChild ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.25 }}>
            <Box sx={{ color: gs.textPrimary, display: 'flex', alignItems: 'center' }}>
              {React.cloneElement(activeChild.icon as React.ReactElement, { sx: { fontSize: 34 } })}
            </Box>
            <Typography sx={{ fontSize: '1.15rem', fontWeight: 600, color: gs.textPrimary }}>{activeChild.label}</Typography>
          </Box>
          {activeChild.description && (
            <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, mb: 3, lineHeight: 1.6 }}>{activeChild.description}</Typography>
          )}
          <Button
            variant="contained"
            startIcon={<ArrowForwardIcon />}
            onClick={() => handleLeafClick(activeChild)}
            sx={{ alignSelf: 'flex-start', textTransform: 'none', borderRadius: '8px', px: 2.5, py: 1 }}
          >
            打开
          </Button>
          <Box sx={{ flex: 1 }} />
        </Box>
      ) : (
        <Box sx={{ color: gs.textMuted }}>暂无内容</Box>
      )}
    </SettingsDialogShell>
  );
};

export default SettingsGroupsDialog;
