import React from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { AppSettings, DashboardConfig, DashboardVisibility, HeatmapConfig } from '../../../contexts/AppSettingsContext';
import { switchSx } from '../sharedStyles';

// ===================== Props =====================

export interface MetricsControlTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

// ===================== Helpers =====================

/** Update a dashboard field (no cross-validation needed for indicator fields) */
const updateDashboard = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  key: keyof DashboardConfig,
  value: DashboardConfig[keyof DashboardConfig],
) => {
  setDraft((prev) => ({
    ...prev,
    dashboard: { ...prev.dashboard, [key]: value },
  }));
};

/** Update a visibility toggle in the draft */
const updateVisibility = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  key: keyof DashboardVisibility,
  value: DashboardVisibility[keyof DashboardVisibility],
) => {
  setDraft((prev) => ({
    ...prev,
    dashboard: {
      ...prev.dashboard,
      visibility: { ...prev.dashboard.visibility, [key]: value },
    },
  }));
};

/** Update a heatmap config field */
const updateHeatmap = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  key: keyof HeatmapConfig,
  value: HeatmapConfig[keyof HeatmapConfig],
) => {
  setDraft((prev) => ({
    ...prev,
    dashboard: {
      ...prev.dashboard,
      heatmap: { ...prev.dashboard.heatmap, [key]: value },
    },
  }));
};

// ===================== Component =====================

const MetricsControlTab: React.FC<MetricsControlTabProps> = ({
  draft,
  setDraft,
  errors,
  setErrors,
}) => {
  const dash = draft.dashboard;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 480 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        仪表盘指标控制
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        开关控制仪表盘上各模块的显示与隐藏
      </Typography>

      {/* KPI Section */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, mb: 0.5 }}>
        KPI 指标卡片
      </Typography>
      <FormControlLabel
        control={<Switch checked={dash.visibility.kpiTransitVolume} onChange={(e) => updateVisibility(setDraft, 'kpiTransitVolume', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>在途货物总量</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.kpiVolumeUtilization} onChange={(e) => updateVisibility(setDraft, 'kpiVolumeUtilization', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>仓库总容积利用率</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.kpiPendingInbound} onChange={(e) => updateVisibility(setDraft, 'kpiPendingInbound', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>待处理入库单</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.kpiOutboundCount} onChange={(e) => updateVisibility(setDraft, 'kpiOutboundCount', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>当日出库量</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.kpiInventoryDepth} onChange={(e) => updateVisibility(setDraft, 'kpiInventoryDepth', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>库存深度</Typography>}
      />

      <Divider sx={{ my: 1.5 }} />

      {/* Charts Section */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>
        图表组件
      </Typography>
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartVolumeTrend} onChange={(e) => updateVisibility(setDraft, 'chartVolumeTrend', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>容积率趋势图</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartTransitPie} onChange={(e) => updateVisibility(setDraft, 'chartTransitPie', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>在途货物状态分布</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartWarehouseBar} onChange={(e) => updateVisibility(setDraft, 'chartWarehouseBar', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>各仓库容积使用情况</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartInventoryAlert} onChange={(e) => updateVisibility(setDraft, 'chartInventoryAlert', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>库存预警列表</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartKpiComparison} onChange={(e) => updateVisibility(setDraft, 'chartKpiComparison', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>各仓库KPI对比表</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartTransitTime} onChange={(e) => updateVisibility(setDraft, 'chartTransitTime', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>运单时效分析</Typography>}
      />

      <Divider sx={{ my: 1.5 }} />

      {/* Heatmap Section */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>
        热力图
      </Typography>
      <FormControlLabel
        control={<Switch checked={dash.visibility.chartShipmentHeatmap} onChange={(e) => updateVisibility(setDraft, 'chartShipmentHeatmap', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>仓库出货热力图</Typography>}
      />

      {/* Heatmap detailed settings (only shown when heatmap is enabled) */}
      {dash.visibility.chartShipmentHeatmap && (
        <Box sx={{ ml: 3, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>
              时间范围
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[7, 14, 30, 365].map((d) => (
                <Chip
                  key={d}
                  label={`${d} 天`}
                  size="small"
                  onClick={() => updateHeatmap(setDraft, 'days', d)}
                  sx={{
                    fontSize: '0.75rem',
                    backgroundColor: dash.heatmap.days === d ? '#111827' : '#F3F4F6',
                    color: dash.heatmap.days === d ? '#FFFFFF' : '#6B7280',
                    '&:hover': {
                      backgroundColor: dash.heatmap.days === d ? '#374151' : '#E5E7EB',
                    },
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>
              颜色方案
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[
                { key: 'ocean' as const, label: '海洋蓝', colors: ['#E0F2FE', '#0EA5E9', '#0369A1'] },
                { key: 'forest' as const, label: '森林绿', colors: ['#DCFCE7', '#22C55E', '#15803D'] },
                { key: 'sunset' as const, label: '日落橙', colors: ['#FED7AA', '#F97316', '#C2410C'] },
              ].map((scheme) => (
                <Chip
                  key={scheme.key}
                  label={scheme.label}
                  size="small"
                  onClick={() => updateHeatmap(setDraft, 'colorScheme', scheme.key)}
                  sx={{
                    fontSize: '0.75rem',
                    backgroundColor: dash.heatmap.colorScheme === scheme.key ? '#111827' : '#F3F4F6',
                    color: dash.heatmap.colorScheme === scheme.key ? '#FFFFFF' : '#6B7280',
                    '&:hover': {
                      backgroundColor: dash.heatmap.colorScheme === scheme.key ? '#374151' : '#E5E7EB',
                    },
                    transition: 'all 0.15s ease',
                  }}
                  icon={
                    <Box sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>
                      {scheme.colors.map((c, i) => (
                        <Box key={i} sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                      ))}
                    </Box>
                  }
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* Component ordering */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
        组件顺序
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        拖动调整仪表盘组件的显示顺序
      </Typography>
      <List sx={{ bgcolor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB', py: 0.5 }}>
        {dash.componentOrder.map((comp, idx) => {
          const labels: Record<string, string> = {
            'kpi-cards': 'KPI 指标卡片',
            'heatmap': '仓库出货热力图',
            'volume-trend': '容积率趋势图',
            'transit-pie': '在途货物状态分布',
            'warehouse-bar': '各仓库容积使用情况',
            'inventory-alert': '库存预警列表',
            'kpi-comparison': '各仓库KPI对比表',
            'transit-time': '运单时效分析',
          };
          return (
            <ListItem
              key={comp}
              sx={{
                py: 0.5,
                px: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderBottom: idx < dash.componentOrder.length - 1 ? '1px solid #E5E7EB' : 'none',
              }}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    disabled={idx === 0}
                    onClick={() => {
                      if (idx === 0) return;
                      const next = [...dash.componentOrder];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      updateDashboard(setDraft, 'componentOrder', next);
                    }}
                    sx={{ color: '#6B7280', '&.Mui-disabled': { color: '#D1D5DB' } }}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={idx === dash.componentOrder.length - 1}
                    onClick={() => {
                      if (idx === dash.componentOrder.length - 1) return;
                      const next = [...dash.componentOrder];
                      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                      updateDashboard(setDraft, 'componentOrder', next);
                    }}
                    sx={{ color: '#6B7280', '&.Mui-disabled': { color: '#D1D5DB' } }}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{labels[comp] || comp}</Typography>}
              />
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};

export default MetricsControlTab;
