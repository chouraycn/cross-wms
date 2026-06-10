import React, { useMemo } from 'react';
import { Grid, Card, CardContent, Typography, Box, IconButton, CircularProgress, Alert, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getGrayScale } from '../../constants/theme';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LayersIcon from '@mui/icons-material/Layers';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { exportToCsv } from '../../utils/exportCsv';
import { calcOverallByItems } from '../../utils/volumeCalculator';
import { useWarehouseCapability } from '../../capabilities/warehouse';

/** KPI 卡片主题配置 */
interface KpiTheme {
  border: string;
  icon: string;
  bg: string;
}

const getKpiTheme = (isDark: boolean): Record<string, KpiTheme> => ({
  transit:     { border: '#3B82F6', icon: '#3B82F6', bg: isDark ? '#1E3A8A' : '#EFF6FF' },
  utilization:  { border: '#8B5CF6', icon: '#8B5CF6', bg: isDark ? '#3B0764' : '#F5F3FF' },
  inbound:     { border: '#F59E0B', icon: '#F59E0B', bg: isDark ? '#78350F' : '#FFFBEB' },
  outbound:    { border: '#10B981', icon: '#10B981', bg: isDark ? '#064E3B' : '#ECFDF5' },
  depth:       { border: '#6B7280', icon: '#6B7280', bg: isDark ? '#1A1A1A' : '#F9FAFB' },
  alert:       { border: '#EF4444', icon: '#EF4444', bg: isDark ? '#7F1D1D' : '#FEF2F2' },
});

interface KpiCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  theme: KpiTheme;
  trend?: string;
  trendColor?: string;
  /** 点击跳转路径，不传则不可点击 */
  navigateTo?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, unit, icon, theme, trend, trendColor, navigateTo }) => {
  const cardTheme = useTheme();
  const cardIsDark = cardTheme.palette.mode === 'dark';
  const cgs = getGrayScale(cardIsDark);
  return (
    <Card
      elevation={0}
      onClick={navigateTo ? undefined : undefined}
      sx={{
        border: `1px solid ${cgs.border}`,
        borderLeft: `3px solid ${theme.border}`,
        borderRadius: '6px',
        cursor: navigateTo ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease',
        '&:hover': navigateTo
          ? {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${cardIsDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'}`,
              backgroundColor: cardIsDark ? 'rgba(255,255,255,0.04)' : 'rgba(17, 24, 39, 0.02)',
            }
          : {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${cardIsDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'}`,
            },
      }}
    >
      <CardContent sx={{ p: '16px 20px' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, pr: 1 }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: cgs.textMuted, mb: 0.5, lineHeight: 1.3 }}>
              {title}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.5 }}>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: cgs.textPrimary, lineHeight: 1.2 }}>
                {value}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: cgs.textDisabled, fontWeight: 400 }}>
                {unit}
              </Typography>
            </Box>
            {trend && (
              <Typography sx={{ fontSize: '0.75rem', color: trendColor || cgs.textDisabled, lineHeight: 1.3 }}>
                {trend}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              backgroundColor: theme.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              '& svg': { fontSize: '1.25rem', color: theme.icon },
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

interface KpiCardsProps {
  warehouseId: string;
}

const KpiCards: React.FC<KpiCardsProps> = ({ warehouseId }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const KPI_THEME = getKpiTheme(isDark);

  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const compareDays = settings.dashboard.trendCompareDays;
  const vis = settings.dashboard.visibility;

  // 从 Context 获取数据
  const { warehouses, transitOrders, kpiData, loading, error } = useWarehouseCapability({ includeDashboard: true });

  // 所有 hooks 和派生变量必须在条件返回之前计算（React Hooks 规则）
  const safeKpiData = kpiData || {
    pendingInboundOrders: 0,
    todayOutboundCount: 0,
    inventoryDepth: 0,
  };

  const filteredWarehouses = warehouseId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter((w) => w.id === warehouseId);

  const filteredTransit = warehouseId === ALL_WAREHOUSES
    ? transitOrders
    : transitOrders.filter((t) => t.toWarehouseId === warehouseId);

  const VOLUME_PER_ITEM_ESTIMATE = 0.05;
  const transitItems = filteredTransit.reduce((s, t) => s + Math.round(t.volume / VOLUME_PER_ITEM_ESTIMATE), 0);
  const volumeUtilization = calcOverallByItems(filteredWarehouses);
  const transitAlertThreshold = settings.dashboard.transitAlertThreshold;

  const transitAlerts = useMemo(() => {
    const pendingTransit = filteredTransit.filter(t => t.status !== 'arrived');
    const alerts: { warehouseId: string; warehouseName: string; afterRate: number; isAlert: boolean }[] = [];

    filteredWarehouses.forEach(wh => {
      const toTransit = pendingTransit.filter(t => t.toWarehouseId === wh.id);
      if (toTransit.length === 0) return;

      const ti = toTransit.reduce((sum, t) => sum + (t.volume / VOLUME_PER_ITEM_ESTIMATE), 0);
      const totalItems = wh.totalItems || wh.totalVolume;
      const usedItems = wh.usedItems || wh.usedVolume;
      const afterRate = totalItems > 0 ? ((usedItems + ti) / totalItems) * 100 : 0;

      if (afterRate >= transitAlertThreshold) {
        alerts.push({
          warehouseId: wh.id,
          warehouseName: wh.name,
          afterRate: Math.round(afterRate * 10) / 10,
          isAlert: true,
        });
      }
    });

    return alerts;
  }, [filteredTransit, filteredWarehouses, transitAlertThreshold, VOLUME_PER_ITEM_ESTIMATE]);

  const alertCount = transitAlerts.length;
  const maxAlertRate = alertCount > 0 ? Math.max(...transitAlerts.map(a => a.afterRate)) : 0;

  const pendingInbound = warehouseId === ALL_WAREHOUSES
    ? safeKpiData.pendingInboundOrders
    : warehouses.length > 0
      ? Math.max(1, Math.round(safeKpiData.pendingInboundOrders / warehouses.length))
      : 0;

  const todayOutbound = warehouseId === ALL_WAREHOUSES
    ? safeKpiData.todayOutboundCount
    : warehouses.length > 0
      ? Math.max(1, Math.round(safeKpiData.todayOutboundCount / warehouses.length))
      : 0;

  const inventoryDepth = warehouseId === ALL_WAREHOUSES
    ? safeKpiData.inventoryDepth
    : safeKpiData.inventoryDepth;

  const warehouseName = filteredWarehouses.length === 1 ? filteredWarehouses[0].name : '';

  // 加载状态
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={30} sx={{ color: gs.textPrimary }} />
      </Box>
    );
  }

  // 错误状态
  if (error) {
    return (
      <Box sx={{ py: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  // ==================== 导出 KPI 汇总 ====================
  const handleExportKpi = () => {
    exportToCsv(
      'kpi_summary.csv',
      ['指标', '数值', '单位', '趋势'],
      [
        ...(vis.kpiTransitVolume ? [['在途件数', String(transitItems), '件', `↑ 12.5% 较${compareDays}天前`]] : []),
        ...(vis.kpiVolumeUtilization ? [['仓库总容积利用率', String(volumeUtilization), '%', `${filteredWarehouses.reduce((s, w) => s + (Number.isFinite(w.totalItems) ? w.totalItems : (Number.isFinite(w.totalVolume) ? w.totalVolume : 0)), 0).toLocaleString()} 件`]] : []),
        ...(vis.kpiPendingInbound ? [['待处理入库单', String(pendingInbound), '单', '需今日处理']] : []),
        ...(vis.kpiOutboundCount ? [['当日出库量', String(todayOutbound), '单', '↑ 较昨日 +2单']] : []),
        ...(vis.kpiInventoryDepth ? [['库存深度', String(inventoryDepth), '天', '按当前出库速率可支撑天数']] : []),
        ...(vis.kpiTransitAlert ? [['在途报警', String(alertCount), '个仓库预警', `阈值 ${transitAlertThreshold}%`]] : []),
      ]
    );
  };

  const allCards: { key: keyof typeof vis; card: KpiCardProps }[] = [
    {
      key: 'kpiVolumeUtilization',
      card: {
        title: warehouseName ? `${warehouseName}容积利用率` : '仓库总容积利用率',
        value: volumeUtilization,
        unit: '%',
        icon: <InventoryIcon />,
        theme: KPI_THEME.utilization,
        trend: warehouseId === ALL_WAREHOUSES
          ? `基于件数 ${filteredWarehouses.reduce((s, w) => s + (Number.isFinite(w.totalItems) ? w.totalItems : (Number.isFinite(w.totalVolume) ? w.totalVolume : 0)), 0).toLocaleString()} 件`
          : `基于件数 ${filteredWarehouses.reduce((s, w) => s + (Number.isFinite(w.totalItems) ? w.totalItems : (Number.isFinite(w.totalVolume) ? w.totalVolume : 0)), 0).toLocaleString()} 件`,
        trendColor: gs.textPrimary,
        navigateTo: '/inventory',
      },
    },
    {
      key: 'kpiTransitVolume',
      card: {
        title: warehouseName ? `在途至${warehouseName}` : '在途件数',
        value: transitItems,
        unit: '件',
        icon: <LocalShippingIcon />,
        theme: KPI_THEME.transit,
        trend: `↑ 12.5% 较${compareDays}天前`,
        trendColor: '#059669',
        navigateTo: '/in-transit',
      },
    },
    {
      key: 'kpiPendingInbound',
      card: {
        title: '待处理入库单',
        value: pendingInbound,
        unit: '单',
        icon: <TrendingUpIcon />,
        theme: KPI_THEME.inbound,
        trend: '需今日处理',
        trendColor: '#F59E0B',
        navigateTo: '/inventory?filter=pending-inbound',
      },
    },
    {
      key: 'kpiOutboundCount',
      card: {
        title: '当日出库量',
        value: todayOutbound,
        unit: '单',
        icon: <StorefrontIcon />,
        theme: KPI_THEME.outbound,
        trend: '↑ 较昨日 +2单',
        trendColor: '#059669',
        navigateTo: '/inventory?filter=outbound',
      },
    },
    {
      key: 'kpiInventoryDepth',
      card: {
        title: '库存深度',
        value: inventoryDepth,
        unit: '天',
        icon: <LayersIcon />,
        theme: KPI_THEME.depth,
        trend: `按当前出库速率可支撑天数`,
        trendColor: gs.textMuted,
        navigateTo: '/inventory?filter=depth',
      },
    },
    {
      key: 'kpiTransitAlert',
      card: {
        title: '在途报警',
        value: alertCount > 0 ? alertCount : 0,
        unit: alertCount > 0 ? '个仓库预警' : '无预警',
        icon: <WarningAmberIcon />,
        theme: alertCount > 0 ? KPI_THEME.alert : KPI_THEME.depth,
        trend: alertCount > 0
          ? `最高容积率 ${maxAlertRate}% (到仓后)`
          : `阈值 ${transitAlertThreshold}%，状态正常`,
        trendColor: alertCount > 0 ? '#EF4444' : '#059669',
        navigateTo: '/inventory?filter=warning',
      },
    },
  ];

  // Filter by visibility settings
  const visibleCards = allCards.filter((item) => vis[item.key as keyof typeof vis]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
          KPI 概览
        </Typography>
        <IconButton size="small" onClick={handleExportKpi} title="导出CSV">
          <DownloadOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>
      <Grid container spacing={1.5}>
        {visibleCards.map((item, idx) => {
          // 响应式：6卡片每行3个，4卡片每行4个，3卡片每行3个
          const cols = visibleCards.length >= 6 ? 4 : visibleCards.length >= 4 ? 3 : 4;
          const handleClick = item.card.navigateTo
            ? () => navigate(item.card.navigateTo!)
            : undefined;
          return (
            <Grid item xs={12} sm={6} md={cols} key={idx}>
              <Box onClick={handleClick} sx={item.card.navigateTo ? { cursor: 'pointer' } : undefined}>
                <KpiCard {...item.card} />
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default KpiCards;
