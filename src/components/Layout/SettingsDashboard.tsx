import React, { useCallback } from 'react';
import { Box, Typography, Slider, TextField, Divider, Switch, FormControlLabel, Chip } from '@mui/material';
import type { AppSettings, DashboardConfig, DashboardVisibility, HeatmapConfig } from '../../contexts/AppSettingsContext';

/** 共享样式常量 */
const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
};

/**
 * 仪表盘设置子组件
 *
 * 负责仪表盘计算参数（预警线、满仓线等）、指标显隐控制、热力图参数。
 */
interface SettingsDashboardProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

const SettingsDashboard: React.FC<SettingsDashboardProps> = ({ draft, setDraft, errors, setErrors }) => {
  const updateDashboard = useCallback(<K extends keyof DashboardConfig>(key: K, value: DashboardConfig[K]) => {
    setDraft((prev) => {
      const next = { ...prev, dashboard: { ...prev.dashboard, [key]: value } };
      if (key === 'fullThreshold' && typeof value === 'number' && value <= prev.dashboard.warningThreshold) {
        setErrors((e) => ({ ...e, 'dashboard.fullThreshold': '满仓线必须大于预警线' }));
      } else if (key === 'warningThreshold' && typeof value === 'number' && value >= prev.dashboard.fullThreshold) {
        setErrors((e) => ({ ...e, 'dashboard.warningThreshold': '预警线必须小于满仓线' }));
      } else {
        setErrors((e) => { const n = { ...e }; delete n['dashboard.fullThreshold']; delete n['dashboard.warningThreshold']; return n; });
      }
      return next;
    });
  }, [setDraft, setErrors]);

  const updateVisibility = useCallback(<K extends keyof DashboardVisibility>(key: K, value: DashboardVisibility[K]) => {
    setDraft((prev) => ({ ...prev, dashboard: { ...prev.dashboard, visibility: { ...prev.dashboard.visibility, [key]: value } } }));
  }, [setDraft]);

  const updateHeatmap = useCallback(<K extends keyof HeatmapConfig>(key: K, value: HeatmapConfig[K]) => {
    setDraft((prev) => ({ ...prev, dashboard: { ...prev.dashboard, heatmap: { ...prev.dashboard.heatmap, [key]: value } } }));
  }, [setDraft]);

  return (
    <Box>
      {/* === 计算参数 === */}
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

      <Divider sx={{ my: 2 }} />

      {/* === 指标显隐 === */}
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
    </Box>
  );
};

export default SettingsDashboard;
