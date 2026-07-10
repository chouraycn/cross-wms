import React from 'react';
import { Box, Typography, Switch, FormControlLabel, Divider, useTheme } from '@mui/material';
import { APP_VERSION } from './appVersion';
import type { AppSettings } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';

/**
 * 关于信息子组件
 *
 * 负责系统信息展示、版本号、软件介绍等。
 */
interface SettingsAboutProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const SettingsAbout: React.FC<SettingsAboutProps> = ({ draft, setDraft }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const handleSidebarVersionToggle = (checked: boolean) => {
    setDraft((prev) => ({ ...prev, sidebar: { ...prev.sidebar, showVersion: checked } }));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: gs.textMuted, fontSize: '0.8rem' }}>系统名称</Typography>
        <Typography sx={{ color: gs.textPrimary, fontSize: '0.8rem', fontWeight: 500 }}>CDF Know Clow</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: gs.textMuted, fontSize: '0.8rem' }}>版本</Typography>
        <Typography sx={{ color: gs.textPrimary, fontSize: '0.8rem', fontWeight: 500 }}>V{APP_VERSION}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: gs.textMuted, fontSize: '0.8rem' }}>构建日期</Typography>
        <Typography sx={{ color: gs.textPrimary, fontSize: '0.8rem', fontWeight: 500 }}>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: gs.textMuted, fontSize: '0.8rem' }}>运行环境</Typography>
        <Typography sx={{ color: gs.textPrimary, fontSize: '0.8rem', fontWeight: 500 }}>
          {typeof window !== 'undefined' && (window as unknown as { electronAPI?: unknown }).electronAPI ? 'Electron 桌面应用' : '浏览器'}
        </Typography>
      </Box>
      <Divider sx={{ my: 0.5, borderColor: gs.border }} />
      <Box sx={{ mb: 1 }}>
        <Typography sx={{ color: gs.textMuted, fontSize: '0.8rem', mb: 0.5 }}>软件介绍</Typography>
        <Typography sx={{ color: gs.textPrimary, fontSize: '0.75rem', lineHeight: 1.6 }}>
          CDF Know Clow 中免CLow端系统配套线上知识库 / 随查平台，简称「随知」，专仓管、柜组库管、运维查询 WMS 全流程操作规范、单据规则、主数据查询等软件系统。
        </Typography>
      </Box>
      <FormControlLabel
        control={
          <Switch
            checked={draft.sidebar.showVersion}
            onChange={(e) => handleSidebarVersionToggle(e.target.checked)}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: gs.textPrimary },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: gs.textPrimary },
            }}
          />
        }
        label={
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: gs.textPrimary }}>显示版本号</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled }}>在侧边栏 Logo 旁显示 v{APP_VERSION}</Typography>
          </Box>
        }
      />
    </Box>
  );
};

export default SettingsAbout;
