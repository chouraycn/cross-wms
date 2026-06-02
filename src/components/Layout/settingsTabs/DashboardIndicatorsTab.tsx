import React from 'react';
import { Box, Typography, Divider, FormControlLabel, Switch, Chip } from '@mui/material';
import type { AppSettings, DashboardVisibility, HeatmapConfig } from '../../../contexts/AppSettingsContext';

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

export interface DashboardIndicatorsTabProps {
  draft: AppSettings;
  updateVisibility: <K extends keyof DashboardVisibility>(key: K, value: DashboardVisibility[K]) => void;
  updateHeatmap: <K extends keyof HeatmapConfig>(key: K, value: HeatmapConfig[K]) => void;
}

const DashboardIndicatorsTab: React.FC<DashboardIndicatorsTabProps> = ({ draft, updateVisibility, updateHeatmap }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>KPI 指标卡片</Typography>
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiTransitVolume} onChange={(e) => updateVisibility('kpiTransitVolume', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>在途货物总量</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiVolumeUtilization} onChange={(e) => updateVisibility('kpiVolumeUtilization', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>仓库总容积利用率</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiPendingInbound} onChange={(e) => updateVisibility('kpiPendingInbound', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>待处理入库单</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiOutboundCount} onChange={(e) => updateVisibility('kpiOutboundCount', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>当日出库量</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiInventoryDepth} onChange={(e) => updateVisibility('kpiInventoryDepth', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>库存深度</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiTransitAlert} onChange={(e) => updateVisibility('kpiTransitAlert', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>在途报警</Typography>} />
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>图表组件</Typography>
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartVolumeTrend} onChange={(e) => updateVisibility('chartVolumeTrend', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>容积率趋势图</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartTransitPie} onChange={(e) => updateVisibility('chartTransitPie', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>在途货物状态分布</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartWarehouseBar} onChange={(e) => updateVisibility('chartWarehouseBar', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>各仓库容积使用情况</Typography>} />
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>热力图</Typography>
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartShipmentHeatmap} onChange={(e) => updateVisibility('chartShipmentHeatmap', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>仓库出货热力图</Typography>} />
      {draft.dashboard.visibility.chartShipmentHeatmap && (
        <Box sx={{ ml: 3, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>颜色方案</Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {([
                { key: 'ocean' as const, label: '海洋蓝', colors: ['#E0F2FE', '#0EA5E9', '#0369A1'] },
                { key: 'forest' as const, label: '森林绿', colors: ['#DCFCE7', '#22C55E', '#15803D'] },
                { key: 'sunset' as const, label: '日落橙', colors: ['#FED7AA', '#F97316', '#C2410C'] },
              ]).map((scheme) => (
                <Chip key={scheme.key} label={scheme.label} size="small" onClick={() => updateHeatmap('colorScheme', scheme.key)} sx={{ fontSize: '0.7rem', backgroundColor: draft.dashboard.heatmap.colorScheme === scheme.key ? '#111827' : '#F3F4F6', color: draft.dashboard.heatmap.colorScheme === scheme.key ? '#FFFFFF' : '#6B7280', '&:hover': { backgroundColor: draft.dashboard.heatmap.colorScheme === scheme.key ? '#374151' : '#f5f5f5' } }} icon={<Box sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>{scheme.colors.map((c, i) => (<Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c, border: '1px solid rgba(0,0,0,0.1)' }} />))}</Box>} />
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DashboardIndicatorsTab;
