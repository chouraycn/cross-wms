import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { Box, Typography, Divider, Button, Switch, FormControlLabel, Alert, Collapse, IconButton, Snackbar } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import AddTaskIcon from '@mui/icons-material/AddTask';
import KpiCards from '../components/Dashboard/KpiCards';
import VolumeChart from '../components/Dashboard/VolumeChart';
import TransitPieChart from '../components/Dashboard/TransitPieChart';
import WarehouseBarChart from '../components/Dashboard/WarehouseBarChart';
import ShipmentHeatmap from '../components/Dashboard/ShipmentHeatmap';
import InventoryAlertList from '../components/Dashboard/InventoryAlertList';
import WarehouseKpiTable from '../components/Dashboard/WarehouseKpiTable';
import TransitTimeChart from '../components/Dashboard/TransitTimeChart';
import NewTaskDialog, { type TaskFormData } from '../components/Dashboard/NewTaskDialog';
import { ALL_WAREHOUSES } from '../components/Dashboard/WarehouseSelector';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { subscribeRefresh, subscribeWarehouseChange, emitNewWarehouse } from '../App';
import { subscribeWarehouses } from '../stores/warehouseStore';
import { useNavigate } from 'react-router-dom';
import type { Warehouse, TransitOrder, InventoryItem } from '../types';
import {
  mockTransitOrders,
  mockInventory,
  mockWarehouses,
} from '../data/mockData';

// ===================== 告警计算 =====================

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
  prevAlerts: DashboardAlert[],
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
    const totalItems = wh.totalItems || wh.totalVolume;
    const usedItems = wh.usedItems || wh.usedVolume;
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
  const pendingTransit = mockTransitOrders.filter((t) => t.status !== 'arrived');
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
        const totalItems = wh.totalItems || wh.totalVolume;
        const usedItems = wh.usedItems || wh.usedVolume;
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
    ? mockInventory
    : mockInventory.filter((item) => item.warehouseId === selectedWarehouse);
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

const DashboardPage: React.FC = () => {
  const { settings } = useAppSettings();
  const vis = settings.dashboard.visibility;
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(ALL_WAREHOUSES);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(settings.dashboard.dataRefreshInterval);

  // 新建任务对话框状态
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  // 告警通知状态
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // 计算告警列表
  const alerts = useMemo(() => {
    return computeAlerts(warehouses, settings, selectedWarehouse, []);
  }, [warehouses, settings, selectedWarehouse, refreshKey]);

  // 过滤掉已关闭的告警
  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 自动刷新定时器
  useEffect(() => {
    if (!autoRefresh) return;
    setCountdown(settings.dashboard.dataRefreshInterval);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRefresh();
          return settings.dashboard.dataRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, settings.dashboard.dataRefreshInterval, handleRefresh]);

  // 组件卸载时清除定时器（额外保障）
  useEffect(() => {
    return () => {
      // 定时器已在上面的 effect cleanup 中清除
    };
  }, []);

  // 仪表盘空状态：点击「添加仓库」→ 先导航到仓库管理页，再延迟触发新建对话框
  const handleAddWarehouse = useCallback(() => {
    navigate('/warehouses');
    // 等待 WarehouseList 组件挂载并注册 subscribeNewWarehouse 后再触发
    requestAnimationFrame(() => {
      emitNewWarehouse();
    });
  }, [navigate]);

  useEffect(() => {
    const unsubRefresh = subscribeRefresh('dashboard', handleRefresh);
    const unsubWarehouse = subscribeWarehouseChange(setSelectedWarehouse);
    const unsubWarehouseStore = subscribeWarehouses(setWarehouses);
    return () => {
      unsubRefresh();
      unsubWarehouse();
      unsubWarehouseStore();
    };
  }, [handleRefresh]);

  // Check if any KPI cards are visible
  const hasKpiCards = vis.kpiTransitVolume || vis.kpiVolumeUtilization || vis.kpiPendingInbound || vis.kpiOutboundCount || vis.kpiInventoryDepth;

  // 没有仓库时显示引导
  if (warehouses.length === 0) {
    return (
      <Box key={refreshKey} className="page-fade-in">
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
            仪表盘总览
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <WarehouseOutlinedIcon sx={{ fontSize: 56, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ fontSize: '1rem', fontWeight: 500, color: '#6B7280', mb: 0.5 }}>
            暂无仓库数据
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', mb: 3 }}>
            添加您的第一个仓库，开始使用仪表盘
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddOutlinedIcon />}
            onClick={handleAddWarehouse}
            sx={{
              backgroundColor: '#111827',
              color: '#FFFFFF',
              px: 3,
              py: 0.75,
              boxShadow: 'none',
              '&:hover': { backgroundColor: '#374151', boxShadow: 'none' },
            }}
          >
            添加仓库
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box key={refreshKey} className="page-fade-in">
      {/* 标题行 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
          仪表盘总览
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

      {/* 根据 componentOrder 动态渲染组件 */}
      {settings.dashboard.componentOrder.map((comp) => {
        switch (comp) {
          case 'kpi-cards':
            return hasKpiCards ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <KpiCards warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'heatmap':
            return vis.chartShipmentHeatmap ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <ShipmentHeatmap warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'volume-trend':
            return vis.chartVolumeTrend ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <VolumeChart warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'transit-pie':
            return vis.chartTransitPie ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <TransitPieChart />
              </Box>
            ) : null;
          case 'warehouse-bar':
            return vis.chartWarehouseBar ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <WarehouseBarChart warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'inventory-alert':
            return vis.chartInventoryAlert ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <InventoryAlertList warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'kpi-comparison':
            return vis.chartKpiComparison ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <WarehouseKpiTable warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'transit-time':
            return vis.chartTransitTime ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <TransitTimeChart warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          default:
            return null;
        }
      })}

      {/* All hidden message */}
      {!hasKpiCards && !vis.chartShipmentHeatmap && !vis.chartVolumeTrend && !vis.chartTransitPie && !vis.chartWarehouseBar && !vis.chartInventoryAlert && !vis.chartKpiComparison && !vis.chartTransitTime && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.95rem' }}>
            所有指标已隐藏，请在设置中开启需要显示的指标
          </Typography>
        </Box>
      )}
    </Box>
  );

  // 处理任务提交
  const handleTaskSubmit = useCallback((task: TaskFormData) => {
    console.log('新建任务:', task);
    // TODO: 这里可以接入实际的任务管理系统（如 TAPD、本地存储等）
    setTaskDialogOpen(false);
  }, []);

  return (
    <Box key={refreshKey} className="page-fade-in">
      {/* 标题行 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
          仪表盘总览
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

      {/* 根据 componentOrder 动态渲染组件 */}
      {settings.dashboard.componentOrder.map((comp) => {
        switch (comp) {
          case 'kpi-cards':
            return hasKpiCards ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <KpiCards warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'heatmap':
            return vis.chartShipmentHeatmap ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <ShipmentHeatmap warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'volume-trend':
            return vis.chartVolumeTrend ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <VolumeChart warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'transit-pie':
            return vis.chartTransitPie ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <TransitPieChart />
              </Box>
            ) : null;
          case 'warehouse-bar':
            return vis.chartWarehouseBar ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <WarehouseBarChart warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'inventory-alert':
            return vis.chartInventoryAlert ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <InventoryAlertList warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'kpi-comparison':
            return vis.chartKpiComparison ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <WarehouseKpiTable warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          case 'transit-time':
            return vis.chartTransitTime ? (
              <Box key={comp} sx={{ mb: 4 }}>
                <TransitTimeChart warehouseId={selectedWarehouse} />
              </Box>
            ) : null;
          default:
            return null;
        }
      })}

      {/* All hidden message */}
      {!hasKpiCards && !vis.chartShipmentHeatmap && !vis.chartVolumeTrend && !vis.chartTransitPie && !vis.chartWarehouseBar && !vis.chartInventoryAlert && !vis.chartKpiComparison && !vis.chartTransitTime && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.95rem' }}>
            所有指标已隐藏，请在设置中开启需要显示的指标
          </Typography>
        </Box>
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

export default DashboardPage;
