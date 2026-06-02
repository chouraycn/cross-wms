import React from 'react';
import { Box, Typography, Switch, FormControlLabel, Divider } from '@mui/material';
import { APP_VERSION } from '../Settings/sharedStyles';
import type { AppSettings } from '../../contexts/AppSettingsContext';

/** 共享样式常量 */
const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

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
  const handleSidebarVersionToggle = (checked: boolean) => {
    setDraft((prev) => ({ ...prev, sidebar: { ...prev.sidebar, showVersion: checked } }));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>系统名称</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>CDF Know CrossWMS</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>版本</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>V{APP_VERSION}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>构建日期</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}</Typography>
      </Box>
      <Divider sx={{ my: 0.5 }} />
      <Box sx={{ mb: 1 }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem', mb: 0.5 }}>软件介绍</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.75rem', lineHeight: 1.6 }}>
          CrossWMS 仓储系统配套线上知识库 / 随查平台，简称「随知」，专仓管、柜组库管、运维查询 WMS 全流程操作规范、单据规则、主数据查询等软件系统。
        </Typography>
      </Box>
      <FormControlLabel
        control={<Switch checked={draft.sidebar.showVersion} onChange={(e) => handleSidebarVersionToggle(e.target.checked)} size="small" sx={switchSx} />}
        label={
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>显示版本号</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>在侧边栏 Logo 旁显示 v{APP_VERSION}</Typography>
          </Box>
        }
      />
    </Box>
  );
};

export default SettingsAbout;
