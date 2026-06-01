import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  Alert,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import DescriptionIcon from '@mui/icons-material/Description';
import type { AppSettings, DashboardConfig } from '../../../contexts/AppSettingsContext';
import { dashboardApi } from '../../../services/dashboardApi';
import { textFieldSx } from '../sharedStyles';

// ===================== Props =====================

export interface DashboardParamsTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onShowSnackbar: (msg: string) => void;
}

// ===================== Helpers =====================

/** Update a dashboard field, with cross-validation for threshold pair */
const updateDashboard = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  key: keyof DashboardConfig,
  value: DashboardConfig[keyof DashboardConfig],
) => {
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
};

// ===================== Component =====================

const DashboardParamsTab: React.FC<DashboardParamsTabProps> = ({
  draft,
  setDraft,
  errors,
  setErrors,
  onShowSnackbar,
}) => {
  const dash = draft.dashboard;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 480 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>仪表盘计算参数</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>调整仪表盘中的计算阈值和参数</Typography>

      {/* Warning Threshold */}
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827', mb: 1, fontWeight: 500 }}>容积率预警线：{dash.warningThreshold}%</Typography>
        <Slider value={dash.warningThreshold} onChange={(_, v) => updateDashboard(setDraft, setErrors, 'warningThreshold', v as number)} min={0} max={100} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} sx={{ color: '#F59E0B' }} />
        {errors['dashboard.warningThreshold'] && <Typography variant="caption" sx={{ color: '#EF4444', mt: 0.5 }}>{errors['dashboard.warningThreshold']}</Typography>}
      </Box>

      {/* Full Threshold */}
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827', mb: 1, fontWeight: 500 }}>容积率满仓线：{dash.fullThreshold}%</Typography>
        <Slider value={dash.fullThreshold} onChange={(_, v) => updateDashboard(setDraft, setErrors, 'fullThreshold', v as number)} min={0} max={100} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} sx={{ color: '#EF4444' }} />
        {errors['dashboard.fullThreshold'] && <Typography variant="caption" sx={{ color: '#EF4444', mt: 0.5 }}>{errors['dashboard.fullThreshold']}</Typography>}
      </Box>

      <Divider />

      <TextField label="库龄预警天数" type="number" size="small" fullWidth value={dash.ageWarningDays} onChange={(e) => updateDashboard(setDraft, setErrors, 'ageWarningDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="KPI趋势对比天数" type="number" size="small" fullWidth value={dash.trendCompareDays} onChange={(e) => updateDashboard(setDraft, setErrors, 'trendCompareDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="数据刷新间隔（秒）" type="number" size="small" fullWidth value={dash.dataRefreshInterval} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataRefreshInterval', Math.max(5, parseInt(e.target.value, 10) || 5))} inputProps={{ min: 5 }} sx={textFieldSx} />
      <TextField label="在途货物统计天数" type="number" size="small" fullWidth value={dash.defaultTransitVolumeDays} onChange={(e) => updateDashboard(setDraft, setErrors, 'defaultTransitVolumeDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />

      <Divider />

      <Typography sx={{ fontSize: '0.875rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>总件数指标</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>设置仓库总件数基数，影响仓库总容积利用率的计算</Typography>
      <TextField label="仓库总件数" type="number" size="small" fullWidth value={dash.totalItems} onChange={(e) => updateDashboard(setDraft, setErrors, 'totalItems', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} helperText="总容积利用率 = 已用容积件数 / 总件数 × 100%" sx={textFieldSx} />

      <Divider sx={{ my: 2 }} />

      {/* ========== Data Source Configuration ========== */}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>数据源配置</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 2 }}>选择仪表盘数据来源：本地 Mock、后端 API 或腾讯文档</Typography>

      {/* Data source mode selector */}
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>数据源模式</InputLabel>
        <Select value={dash.dataSourceMode || 'mock'} label="数据源模式" onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceMode', e.target.value as 'mock' | 'api' | 'tencent-docs')}>
          <MenuItem value="mock"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10B981' }} />Mock 数据（本地演示）</Box></MenuItem>
          <MenuItem value="api"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#3B82F6' }} />API 接口（后端服务）</Box></MenuItem>
          <MenuItem value="tencent-docs"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#F59E0B' }} />腾讯文档（在线表格）</Box></MenuItem>
        </Select>
      </FormControl>

      {/* API Base URL - only shown in API mode */}
      {dash.dataSourceMode === 'api' && (
        <TextField label="API 基础地址" type="url" size="small" fullWidth value={dash.dataSourceApiBaseUrl || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceApiBaseUrl', e.target.value)} placeholder="例如：https://api.example.com" helperText="后端 API 服务的基础 URL 地址" sx={{ ...textFieldSx, mb: 2 }} InputProps={{ startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} /></InputAdornment> }} />
      )}

      {/* Tencent Docs mappings - only shown in tencent-docs mode */}
      {dash.dataSourceMode === 'tencent-docs' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
          <Alert severity="info" sx={{ fontSize: '0.8rem' }}>请确保已在"腾讯文档"标签页完成授权，并填写以下文档 ID</Alert>
          <TextField label="仓库数据文档 ID" size="small" fullWidth value={dash.dataSourceDocMappings?.warehouses || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceDocMappings', { ...dash.dataSourceDocMappings, warehouses: e.target.value })} placeholder="文档 ID 或 URL" sx={textFieldSx} />
          <TextField label="在途订单文档 ID" size="small" fullWidth value={dash.dataSourceDocMappings?.transitOrders || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceDocMappings', { ...dash.dataSourceDocMappings, transitOrders: e.target.value })} placeholder="文档 ID 或 URL" sx={textFieldSx} />
          <TextField label="库存数据文档 ID" size="small" fullWidth value={dash.dataSourceDocMappings?.inventory || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceDocMappings', { ...dash.dataSourceDocMappings, inventory: e.target.value })} placeholder="文档 ID 或 URL" sx={textFieldSx} />
          <TextField label="容积历史文档 ID" size="small" fullWidth value={dash.dataSourceDocMappings?.volumeHistory || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceDocMappings', { ...dash.dataSourceDocMappings, volumeHistory: e.target.value })} placeholder="文档 ID 或 URL" sx={textFieldSx} />
          <TextField label="入库记录文档 ID" size="small" fullWidth value={dash.dataSourceDocMappings?.inboundRecords || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceDocMappings', { ...dash.dataSourceDocMappings, inboundRecords: e.target.value })} placeholder="文档 ID 或 URL" sx={textFieldSx} />
          <TextField label="出库记录文档 ID" size="small" fullWidth value={dash.dataSourceDocMappings?.outboundRecords || ''} onChange={(e) => updateDashboard(setDraft, setErrors, 'dataSourceDocMappings', { ...dash.dataSourceDocMappings, outboundRecords: e.target.value })} placeholder="文档 ID 或 URL" sx={textFieldSx} />
        </Box>
      )}

      {/* Sync interval - only shown in non-mock mode */}
      {dash.dataSourceMode !== 'mock' && (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', mb: 1 }}>数据同步间隔</Typography>
          <FormControl fullWidth size="small">
            <InputLabel>同步间隔</InputLabel>
            <Select
              value={String(dash.dataRefreshInterval || 300)}
              label="同步间隔"
              onChange={(e) => updateDashboard(setDraft, setErrors, 'dataRefreshInterval', parseInt(e.target.value, 10))}
            >
              <MenuItem value="60">1 分钟</MenuItem>
              <MenuItem value="300">5 分钟（推荐）</MenuItem>
              <MenuItem value="600">10 分钟</MenuItem>
              <MenuItem value="1800">30 分钟</MenuItem>
              <MenuItem value="3600">1 小时</MenuItem>
            </Select>
          </FormControl>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.5 }}>自动从远程数据源刷新数据的频率</Typography>
        </Box>
      )}

      {/* Status indicator */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1, bgcolor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
        {dash.dataSourceMode === 'mock' ? (
          <><CloudOffIcon sx={{ fontSize: 20, color: '#9CA3AF' }} /><Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>使用本地 Mock 数据，刷新页面后生效</Typography></>
        ) : dash.dataSourceMode === 'api' ? (
          <><CloudDoneIcon sx={{ fontSize: 20, color: '#3B82F6' }} /><Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>从 API 获取数据：{dash.dataSourceApiBaseUrl || '未配置'}</Typography></>
        ) : (
          <><DescriptionIcon sx={{ fontSize: 20, color: '#F59E0B' }} /><Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>从腾讯文档获取数据</Typography></>
        )}
      </Box>

      {/* Apply config + Sync now buttons */}
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            const dataSourceConfig = { mode: (dash.dataSourceMode || 'mock') as 'mock' | 'api' | 'tencent-docs', apiBaseUrl: dash.dataSourceApiBaseUrl || '/api', docMappings: dash.dataSourceDocMappings || {} };
            dashboardApi.setConfig(dataSourceConfig);
            onShowSnackbar('数据源配置已保存，正在刷新数据...');
          }}
          sx={{
            bgcolor: '#111827',
            '&:hover': { bgcolor: '#1F2937' },
            height: 42,
            borderRadius: 1,
          }}
        >
          应用数据源配置
        </Button>
        {dash.dataSourceMode !== 'mock' && (
          <Button
            variant="outlined"
            onClick={async () => {
              try {
                await Promise.all([
                  dashboardApi.getWarehouses(),
                  dashboardApi.getTransitOrders(),
                  dashboardApi.getInventory(),
                  dashboardApi.getInboundRecords(),
                  dashboardApi.getOutboundRecords(),
                  dashboardApi.getVolumeHistory(),
                  dashboardApi.getKpiData(),
                ]);
                onShowSnackbar('数据同步成功');
              } catch (err) {
                onShowSnackbar(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
              }
            }}
            sx={{
              borderColor: '#111827',
              color: '#111827',
              height: 42,
              borderRadius: 1,
              minWidth: 100,
              '&:hover': { borderColor: '#374151' },
            }}
          >
            立即同步
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default DashboardParamsTab;
