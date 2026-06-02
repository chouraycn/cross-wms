import React, { useCallback } from 'react';
import { Box, Typography, Switch, FormControlLabel } from '@mui/material';
import type { AppSettings, SidebarConfig } from '../../contexts/AppSettingsContext';

/** 共享样式常量 */
const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

/**
 * 侧边栏设置子组件
 *
 * 负责侧边栏项目显隐配置、版本号显示等。
 */
interface SettingsSidebarProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ draft, setDraft }) => {
  const updateSidebar = useCallback(<K extends keyof SidebarConfig>(key: K, value: SidebarConfig[K]) => {
    setDraft((prev) => ({ ...prev, sidebar: { ...prev.sidebar, [key]: value } }));
  }, [setDraft]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>侧边栏显示配置</Typography>

      <FormControlLabel
        control={<Switch checked={draft.sidebar.showVersion} onChange={(e) => updateSidebar('showVersion', e.target.checked)} size="small" sx={switchSx} />}
        label={
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>显示版本号</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>在侧边栏 Logo 旁显示版本信息</Typography>
          </Box>
        }
      />

      <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mb: 1 }}>侧边栏项目顺序可通过拖拽调整（在主页面侧边栏中操作）</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {draft.dashboard.componentOrder.map((comp, idx) => {
            const nameMap: Record<string, string> = {
              'kpi-cards': 'KPI 卡片',
              'heatmap': '热力图',
              'volume-trend': '容积率趋势',
              'transit-pie': '在途状态分布',
              'warehouse-bar': '仓库容积柱状图',
              'inventory-alert': '库存预警',
              'kpi-comparison': 'KPI 对比表',
              'transit-time': '运单时效',
            };
            return (
              <Box key={comp} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', width: 20 }}>{idx + 1}.</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: '#374151' }}>{nameMap[comp] || comp}</Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default SettingsSidebar;
