import React from 'react';
import { Box, Typography, TextField, Divider, Slider } from '@mui/material';
import type { AppSettings, DashboardConfig } from '../../../contexts/AppSettingsContext';

const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
};

export interface DashboardCalcTabProps {
  draft: AppSettings;
  updateDashboard: <K extends keyof DashboardConfig>(key: K, value: DashboardConfig[K]) => void;
  errors: Record<string, string>;
}

const DashboardCalcTab: React.FC<DashboardCalcTabProps> = ({ draft, updateDashboard, errors }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>容积率预警线：{draft.dashboard.warningThreshold}%</Typography>
        <Slider value={draft.dashboard.warningThreshold} onChange={(_, v) => updateDashboard('warningThreshold', v as number)} min={0} max={100} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} sx={{ color: '#F59E0B' }} size="small" />
        {errors['dashboard.warningThreshold'] && <Typography variant="caption" sx={{ color: '#EF4444' }}>{errors['dashboard.warningThreshold']}</Typography>}
      </Box>
      <Box>
        <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>容积率满仓线：{draft.dashboard.fullThreshold}%</Typography>
        <Slider value={draft.dashboard.fullThreshold} onChange={(_, v) => updateDashboard('fullThreshold', v as number)} min={0} max={100} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} sx={{ color: '#EF4444' }} size="small" />
        {errors['dashboard.fullThreshold'] && <Typography variant="caption" sx={{ color: '#EF4444' }}>{errors['dashboard.fullThreshold']}</Typography>}
      </Box>
      <Divider />
      <TextField label="库龄预警天数" type="number" size="small" fullWidth value={draft.dashboard.ageWarningDays} onChange={(e) => updateDashboard('ageWarningDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="KPI趋势对比天数" type="number" size="small" fullWidth value={draft.dashboard.trendCompareDays} onChange={(e) => updateDashboard('trendCompareDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="数据刷新间隔（秒）" type="number" size="small" fullWidth value={draft.dashboard.dataRefreshInterval} onChange={(e) => updateDashboard('dataRefreshInterval', Math.max(5, parseInt(e.target.value, 10) || 5))} inputProps={{ min: 5 }} sx={textFieldSx} />
      <TextField label="在途货物统计天数" type="number" size="small" fullWidth value={draft.dashboard.defaultTransitVolumeDays} onChange={(e) => updateDashboard('defaultTransitVolumeDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="在途报警阈值（%）" type="number" size="small" fullWidth value={draft.dashboard.transitAlertThreshold} onChange={(e) => updateDashboard('transitAlertThreshold', Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))} inputProps={{ min: 1, max: 100 }} helperText="预计到仓后容积率超过此值即报警" sx={textFieldSx} />
      <Divider />
      <Typography sx={{ fontSize: '0.8rem', color: '#111827', fontWeight: 500 }}>总件数指标</Typography>
      <TextField label="仓库总件数" type="number" size="small" fullWidth value={draft.dashboard.totalItems} onChange={(e) => updateDashboard('totalItems', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} helperText="总容积利用率 = 已用容积件数 / 总件数" sx={textFieldSx} />
    </Box>
  );
};

export default DashboardCalcTab;
