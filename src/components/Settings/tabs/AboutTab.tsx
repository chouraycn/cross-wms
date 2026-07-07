/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  useTheme,
} from '@mui/material';
import type { AppSettings, SidebarConfig } from '../../../contexts/AppSettingsContext';
import { switchSx, APP_VERSION } from '../sharedStyles';
import TrafficLightOffsetSection from './TrafficLightOffsetSection';
import { getGrayScale } from '../../../constants/theme';

// ===================== Props =====================

export interface AboutTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

// ===================== Helpers =====================

/** Update a sidebar config field */
const updateSidebar = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  key: keyof SidebarConfig,
  value: SidebarConfig[keyof SidebarConfig],
) => {
  setDraft((prev) => ({
    ...prev,
    sidebar: { ...prev.sidebar, [key]: value },
  }));
};

// ===================== Component =====================

const AboutTab: React.FC<AboutTabProps> = ({
  draft,
  setDraft,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errors,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setErrors,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ===== About Section ===== */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 400 }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
          关于系统
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>系统名称</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>CDF Know Claw</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>版本</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>V{APP_VERSION}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>构建日期</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>运行环境</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>
            {window.electronAPI ? 'Electron 桌面应用' : '浏览器'}
          </Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Sidebar settings */}
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, mt: 0.5 }}>
          侧边栏设置
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={draft.sidebar.showVersion}
              onChange={(e) => updateSidebar(setDraft, 'showVersion', e.target.checked)}
              size="small"
              sx={switchSx}
            />
          }
          label={
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>显示版本号</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
                在侧边栏 Logo 旁显示当前版本号（v{APP_VERSION}）
              </Typography>
            </Box>
          }
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Traffic light offset (macOS pywebview only) */}
        <TrafficLightOffsetSection />
      </Box>
    </Box>
  );
};

export default AboutTab;
