import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { Box, Typography, Button, Switch, FormControlLabel, Alert, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import AddTaskIcon from '@mui/icons-material/AddTask';
import KpiCards from '../components/Dashboard/KpiCards';
import VolumeChart from '../components/Dashboard/VolumeChart';
import TransitPieChart from '../components/Dashboard/TransitPieChart';
import WarehouseBarChart from '../components/Dashboard/WarehouseBarChart';
import GitHubHeatmap from '../components/Dashboard/GitHubHeatmap';
import InventoryAlertList from '../components/Dashboard/InventoryAlertList';
import WarehouseKpiTable from '../components/Dashboard/WarehouseKpiTable';
import TransitTimeChart from '../components/Dashboard/TransitTimeChart';
import NewTaskDialog, { type TaskFormData } from '../components/Dashboard/NewTaskDialog';
import WarehouseSelector, { ALL_WAREHOUSES } from '../components/Dashboard/WarehouseSelector';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { subscribeRefresh, subscribeWarehouseChange } from '../App';
import { useDashboardData } from '../contexts/DashboardDataContext';
import { DashboardDataProvider } from '../contexts/DashboardDataContext';
import type { Warehouse, TransitOrder, InventoryItem } from '../types';

interface DashboardAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

function computeAlerts(
  warehouses: Warehouse[],
  settings: ReturnType<typeof useAppSettings>['settings'],
  selectedWarehouse: string,
  transitOrders: TransitOrder[],
  inventory: InventoryItem[],
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const alertThreshold = settings.dashboard.warningThreshold;
  const fullThreshold = settings.dashboard.fullThreshold;
  const ageWarningDays = settings.dashboard.ageWarningDays;
  const transitAlertThreshold = settings.dashboard.transitAlertThreshold;
  const VOLUME_PER_ITEM_ESTIMATE = 0.05;

  // 1. 容积率预警
  const targetWarehouses = selectedWarehouse === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter((w) => w.id === selectedWarehouse);

  for (const wh of targetWarehouses) {
    const totalItems = Number.isFinite(wh.totalItems) && wh.totalItems! > 0 ? wh.totalItems! : (Number.isFinite(wh.totalVolume) ? wh.totalVolume : 1);
    const usedItems = Number.isFinite(wh.usedItems) && wh.usedItems! >= 0 ? wh.usedItems! : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0);
    const rate = totalItems > 0 ? (usedItems / totalItems) * 100 : 0;
    if (rate >= fullThreshold) {
      alerts.push({
        id: `full-${wh.id}`,
        severity: 'error',
        title: '仓库已满',
        message: `${wh.name} 容积率已达 ${rate.toFixed(1)}%，超过满仓线 ${fullThreshold}%`,
      });
    } else if (rate >= alertThreshold) {
      alerts.push({
        id: `warning-${wh.id}`,
        severity: 'warning',
        title: '容积率预警',
        message: `${wh.name} 容积率为 ${rate.toFixed(1)}%，超过预警线 ${alertThreshold}%`,
      });
    }
  }

  // 2. 在途报警（到仓后容积率可能超标）
  const pendingTransit = transitOrders.filter((t) => t.status !== 'arrived');
  if (pendingTransit.length > 0) {
    const transitByDest: Record<string, number> = {};
    for (const t of pendingTransit) {
      const dest = t.toWarehouseId;
      if (!transitByDest[dest]) transitByDest[dest] = 0;
      transitByDest[dest] += t.volume / VOLUME_PER_ITEM_ESTIMATE;
    }
    for (const wh of targetWarehouses) {
      const transitItems = transitByDest[wh.id] || 0;
      if (transitItems > 0) {
        const totalItems = Number.isFinite(wh.totalItems) && wh.totalItems! > 0 ? wh.totalItems! : (Number.isFinite(wh.totalVolume) ? wh.totalVolume : 1);
        const usedItems = Number.isFinite(wh.usedItems) && wh.usedItems! >= 0 ? wh.usedItems! : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0);
        const afterRate = totalItems > 0 ? ((usedItems + transitItems) / totalItems) * 100 : 0;
        if (afterRate >= transitAlertThreshold) {
          alerts.push({
            id: `transit-${wh.id}`,
            severity: 'error',
            title: '在途报警',
            message: `${wh.name} 在途到仓后容积率预计达 ${afterRate.toFixed(1)}%，超过阈值 ${transitAlertThreshold}%`,
          });
        }
      }
    }
  }

  // 3. 库龄预警
  const filteredInventory = selectedWarehouse === ALL_WAREHOUSES
    ? inventory
    : inventory.filter((item) => item.warehouseId === selectedWarehouse);
  const agedItems = filteredInventory.filter(
    (item) => item.isAgeWarning || (item.inboundDate && dayjs().diff(dayjs(item.inboundDate), 'day') >= ageWarningDays),
  );
  if (agedItems.length > 0) {
    alerts.push({
      id: 'age-warning',
      severity: 'warning',
      title: '库龄预警',
      message: `共有 ${agedItems.length} 个 SKU 库龄超过 ${ageWarningDays} 天，请关注滞销/过期风险`,
    });
  }

  return alerts;
}

const DashboardPageContent: React.FC = () => {
  const { settings, updateSettings } = useAppSettings();
  const vis = settings.dashboard.visibility;

  // 从 Context 获取数据
  const { warehouses, transitOrders, inventory, loading, error, refresh } = useDashboardData();

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(ALL_WAREHOUSES);

  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(settings.dashboard.dataRefreshInterval);

  // 新建任务对话框状态
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  // 告警通知状态
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // 计算告警列表
  const alerts = useMemo(() => {
    if (loading) return [];
    return computeAlerts(warehouses, settings, selectedWarehouse, transitOrders, inventory);
  }, [warehouses, settings, selectedWarehouse, transitOrders, inventory, loading]);

  // 过滤掉已关闭的告警
  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

  // 自动刷新定时器
  useEffect(() => {
    if (!autoRefresh) return;
    setCountdown(settings.dashboard.dataRefreshInterval);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refresh();
          return settings.dashboard.dataRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, settings.dashboard.dataRefreshInterval, refresh]);

  useEffect(() => {
    const unsubRefresh = subscribeRefresh('dashboard', refresh);
    const unsubWarehouse = subscribeWarehouseChange(setSelectedWarehouse);
    return () => {
      unsubRefresh();
      unsubWarehouse();
    };
  }, [refresh]);

  // Check if any KPI cards are visible
  const hasKpiCards = vis.kpiTransitVolume || vis.kpiVolumeUtilization || vis.kpiPendingInbound || vis.kpiOutboundCount || vis.kpiInventoryDepth;

  // 处理任务提交
  const handleTaskSubmit = useCallback((task: TaskFormData) => {
    console.log('新建任务:', task);
    setTaskDialogOpen(false);
  }, []);

  return (
    <Box className="page-fade-in">
      {/* ProWeb 风格 Banner — 极简黑白、贴合 CrossWMS 功能 */}
      <Box
        sx={{
          mb: 3,
          pb: 3,
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Typography
          sx={{
            fontSize: { xs: '1.75rem', md: '2.25rem' },
            fontWeight: 800,
            color: '#111827',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1.15,
            mb: 1,
          }}
        >
          Driven by Warehouse Data
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: '0.8125rem', md: '0.875rem' },
            fontWeight: 500,
            color: '#6B7280',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1.5,
          }}
        >
          Inbound · Transit · Inventory · Outbound · Insights
        </Typography>
      </Box>

      {/* 标题行 — 与侧边栏 logo 垂直居中对齐 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0 }}>
          仪表盘总览
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: -0.25 }}>
          <WarehouseSelector selected={selectedWarehouse} onChange={setSelectedWarehouse} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddTaskIcon sx={{ fontSize: 16 }} />}
            onClick={() => setTaskDialogOpen(true)}
            sx={{
              borderColor: '#D1D5DB',
              color: '#374151',
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: 6,
              '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
            }}
          >
            新建任务
          </Button>
          {autoRefresh && (
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', minWidth: '4rem', textAlign: 'right' }}>
              {countdown}s 后刷新
            </Typography>
          )}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autoRefresh}
                onChange={(e) => {
                  setAutoRefresh(e.target.checked);
                  setCountdown(settings.dashboard.dataRefreshInterval);
                }}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
                }}
              />
            }
            label={<Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>自动刷新</Typography>}
            sx={{ m: 0 }}
          />
        </Box>
      </Box>

      {/* 告警通知 */}
      {visibleAlerts.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {visibleAlerts.map((alert) => (
            <Alert
              key={alert.id}
              severity={alert.severity}
              sx={{ mb: 1, borderRadius: 2 }}
              action={
                <IconButton
                  size="small"
                  onClick={() =>
                    setDismissedAlerts((prev) => {
                      const next = new Set(prev);
                      next.add(alert.id);
                      return next;
                    })
                  }
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            >
              <Typography sx={{ fontWeight: 600 }}>{alert.title}</Typography>
              <Typography sx={{ fontSize: '0.8125rem' }}>{alert.message}</Typography>
            </Alert>
          ))}
        </Box>
      )}

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* 加载状态 */}
      {loading && (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <CircularProgress size={40} sx={{ color: '#111827' }} />
          <Typography sx={{ mt: 2, color: '#6B7280', fontSize: '0.875rem' }}>
            数据加载中...
          </Typography>
        </Box>
      )}

      {/* 仓库为空时显示引导页 */}
      {!loading && !error && warehouses.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <WarehouseOutlinedIcon sx={{ fontSize: 56, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ fontSize: '1rem', fontWeight: 500, color: '#6B7280', mb: 0.5 }}>
            暂无仓库数据
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', mb: 3 }}>
            点击左上角仓库切换按钮，添加您的第一个仓库
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddOutlinedIcon />}
            sx={{
              bgcolor: '#111827',
              color: '#fff',
              textTransform: 'none',
              borderRadius: 6,
              '&:hover': { bgcolor: '#374151' },
            }}
          >
            添加仓库
          </Button>
        </Box>
      ) : !loading && !error && (
        <>
          {settings.dashboard.componentOrder.map((comp) => {
                switch (comp) {
                  case 'kpi-cards':
                    return hasKpiCards ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <KpiCards warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  case 'heatmap':
                    return vis.chartShipmentHeatmap ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <GitHubHeatmap warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  case 'volume-trend':
                    return vis.chartVolumeTrend ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <VolumeChart warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  case 'transit-pie':
                    return vis.chartTransitPie ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <TransitPieChart />
                      </Box>
                    ) : null;
                  case 'warehouse-bar':
                    return vis.chartWarehouseBar ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <WarehouseBarChart warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  case 'inventory-alert':
                    return vis.chartInventoryAlert ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <InventoryAlertList warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  case 'kpi-comparison':
                    return vis.chartKpiComparison ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <WarehouseKpiTable warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  case 'transit-time':
                    return vis.chartTransitTime ? (
                      <Box key={comp} sx={{ mb: 3 }}>
                        <TransitTimeChart warehouseId={selectedWarehouse} />
                      </Box>
                    ) : null;
                  default:
                    return null;
                }
              })}

              {/* 所有指标隐藏时的提示 */}
              {!hasKpiCards && !vis.chartShipmentHeatmap && !vis.chartVolumeTrend && !vis.chartTransitPie && !vis.chartWarehouseBar && !vis.chartInventoryAlert && !vis.chartKpiComparison && !vis.chartTransitTime && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography sx={{ color: '#9CA3AF', fontSize: '0.95rem' }}>
                    所有指标已隐藏，请在设置中开启需要显示的指标
                  </Typography>
                </Box>
              )}
        </>
      )}

      {/* 新建任务对话框 */}
      <NewTaskDialog
        open={taskDialogOpen}
        onClose={() => setTaskDialogOpen(false)}
        onSubmit={handleTaskSubmit}
        selectedWarehouse={selectedWarehouse}
        warehouses={warehouses}
      />
    </Box>
  );
};

const DashboardPage: React.FC = () => {
  return (
    <DashboardDataProvider>
      <DashboardPageContent />
    </DashboardDataProvider>
  );
};

export default DashboardPage;
