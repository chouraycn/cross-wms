import React from 'react';
import { Box, Typography, Divider, FormControlLabel, Switch } from '@mui/material';
import type { AppSettings, SidebarConfig } from '../../../contexts/AppSettingsContext';
import { APP_VERSION } from '../../Settings/sharedStyles';

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

export interface AboutSettingsTabProps {
  draft: AppSettings;
  updateSidebar: <K extends keyof SidebarConfig>(key: K, value: SidebarConfig[K]) => void;
}

const AboutSettingsTab: React.FC<AboutSettingsTabProps> = ({ draft, updateSidebar }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>系统名称</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>CDF Know Clow</Typography>
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
          CDF Know Clow 中免CLow端系统配套线上知识库 / 随查平台，简称「随知」，专仓管、柜组库管、运维查询 WMS 全流程操作规范、单据规则、主数据查询等软件系统。
        </Typography>
      </Box>
      <FormControlLabel control={<Switch checked={draft.sidebar.showVersion} onChange={(e) => updateSidebar('showVersion', e.target.checked)} size="small" sx={switchSx} />} label={<Box><Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>显示版本号</Typography><Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>在侧边栏 Logo 旁显示 v{APP_VERSION}</Typography></Box>} />
    </Box>
  );
};

export default AboutSettingsTab;
