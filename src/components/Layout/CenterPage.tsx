/**
 * CenterPage — 通用「能力聚合页」外壳
 *
 * 用于在单个页面内以 Tab 组合多个原本分散的子能力页面
 * （如凭证库、监控中心、扩展与工具），收敛设置面板里的重复入口。
 *
 * 设计要点：
 * - 仅挂载当前选中的 Tab（条件渲染），避免所有子页面同时发请求
 * - 子页面为自包含组件，直接渲染，无需改动其内部结构
 */

import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

export interface CenterTabDef {
  label: string;
  icon?: React.ReactElement;
  render: () => React.ReactNode;
}

export interface CenterPageProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tabs: CenterTabDef[];
}

const CenterPage: React.FC<CenterPageProps> = ({ title, description, icon, tabs }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [value, setValue] = useState(0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: gs.textPrimary }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 1.5, borderBottom: `1px solid ${gs.border}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon && <Box sx={{ color: gs.textMuted, display: 'flex' }}>{icon}</Box>}
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{title}</Typography>
            {description && <Typography variant="body2" sx={{ color: gs.textMuted, mt: 0.25 }}>{description}</Typography>}
          </Box>
        </Box>
      </Box>
      <Box sx={{ borderBottom: `1px solid ${gs.border}`, px: 1.5 }}>
        <Tabs
          value={value}
          onChange={(_e, v) => setValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          textColor="primary"
          indicatorColor="primary"
        >
          {tabs.map((t, i) => (
            <Tab key={i} label={t.label} icon={t.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 3 }}>
        {tabs.map((t, i) => (value === i ? <React.Fragment key={i}>{t.render()}</React.Fragment> : null))}
      </Box>
    </Box>
  );
};

export default CenterPage;
