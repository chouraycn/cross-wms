import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { TimeRange } from './TimeRangeSelector';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import { calcUtilizationByItems } from '../../utils/volumeCalculator';
import dayjs from 'dayjs';

interface WarehouseKpiTableProps {
  warehouseId?: string;
  timeRange?: TimeRange;
}

interface TableRowData {
  warehouseId: string;
  warehouseName: string;
  utilizationRate: number;
  transitVolume: number;
  inventoryCount: number;
  pendingInbound: number;
  todayOutbound: number;
  statusChip: {
    label: string;
    color: 'error' | 'warning' | 'success';
    textColor: string;
    bgColor: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WarehouseKpiTable: React.FC<WarehouseKpiTableProps> = ({ warehouseId = ALL_WAREHOUSES, timeRange }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const { settings } = useAppSettings();
  const { warningThreshold, fullThreshold } = settings.dashboard;

  // 从 Context 获取数据
  const { warehouses, transitOrders, inventory, inboundRecords, outboundRecords, loading, error } = useWarehouseCapability({ includeDashboard: true });

  const filteredWarehouses = warehouseId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter((w) => w.id === warehouseId);

  const tableData = useMemo<TableRowData[]>(() => {
    // 计算最近一天的出库量
    const today = dayjs();
    const latestOutboundDate = outboundRecords.length > 0
      ? outboundRecords.reduce((latest, r) => {
          return r.createdAt > latest ? r.createdAt : latest;
        }, outboundRecords[0].createdAt)
      : today.format('YYYY-MM-DD');

    return filteredWarehouses.map((wh) => {
      // 容积使用率（基于件数）— 使用统一工具函数
      const utilizationRate = calcUtilizationByItems(wh);

      // 在途货物量（从 transitOrders 汇总目的地为该仓库的）
      const transitVolume = transitOrders
        .filter((t) => t.toWarehouseId === wh.id && t.status !== 'arrived')
        .reduce((s, t) => s + t.volume, 0);

      // 库存深度
      const inventoryCount = inventory
        .filter((item) => item.warehouseId === wh.id)
        .reduce((s, item) => s + item.quantity, 0);

      // 待处理入库单
      const pendingInbound = inboundRecords
        .filter((r) => r.warehouseId === wh.id && r.status === 'pending').length;

      // 当日出库量（最近一天）
      const todayOutbound = outboundRecords
        .filter((r) => r.warehouseId === wh.id && r.createdAt === latestOutboundDate).length;

      // 状态标签
      const getStatusChip = () => {
        if (utilizationRate >= fullThreshold) {
          return { label: '满仓', color: 'error' as const, textColor: '#EF4444', bgColor: '#FEF2F2' };
        }
        if (utilizationRate >= warningThreshold) {
          return { label: '预警', color: 'warning' as const, textColor: '#F59E0B', bgColor: '#FFFBEB' };
        }
        return { label: '正常', color: 'success' as const, textColor: '#10B981', bgColor: '#ECFDF5' };
      };

      const statusChip = getStatusChip();

      return {
        warehouseId: wh.id,
        warehouseName: wh.name,
        utilizationRate,
        transitVolume,
        inventoryCount,
        pendingInbound,
        todayOutbound,
        statusChip,
      };
    });
  }, [filteredWarehouses, transitOrders, inventory, inboundRecords, outboundRecords, warningThreshold, fullThreshold]);

  // 加载状态
  if (loading) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, height: '100%' }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
              各仓库KPI对比
            </Typography>
          }
        />
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 260 }}>
          <CircularProgress size={30} sx={{ color: gs.textPrimary }} />
        </CardContent>
      </Card>
    );
  }

  // 错误状态
  if (error) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, height: '100%' }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
              各仓库KPI对比
            </Typography>
          }
        />
        <CardContent sx={{ pt: 0, pb: '16px !important' }}>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  if (filteredWarehouses.length === 0) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
              各仓库KPI对比
            </Typography>
          }
        />
        <CardContent>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
              暂无仓库数据
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, height: '100%' }}>
      <CardHeader
        title={
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
            各仓库KPI对比
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, mt: 0.25 }}>
            横向对比所有仓库核心指标
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: `1px solid ${gs.border}`, borderRadius: 1, overflow: 'auto' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  仓库名称
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  容积使用率
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  在途货物量
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  库存深度
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  待处理入库单
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  当日出库量
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                  状态
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tableData.map((row) => {
                const rateColor = row.utilizationRate >= fullThreshold
                  ? '#EF4444'
                  : row.utilizationRate >= warningThreshold
                    ? '#F59E0B'
                    : '#10B981';
                return (
                  <TableRow key={row.warehouseId} hover>
                    <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, fontWeight: 600, py: 1, whiteSpace: 'nowrap' }}>
                      {row.warehouseName}
                    </TableCell>
                    <TableCell sx={{ py: 1, minWidth: 160 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(row.utilizationRate, 100)}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: gs.borderLighter,
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: rateColor,
                                borderRadius: 4,
                              },
                            }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.8125rem', color: rateColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {row.utilizationRate.toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, py: 1, whiteSpace: 'nowrap' }}>
                      {row.transitVolume.toFixed(1)} m³
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, py: 1, whiteSpace: 'nowrap' }}>
                      {row.inventoryCount.toLocaleString()} 件
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: row.pendingInbound > 0 ? '#F59E0B' : gs.textMuted, py: 1, whiteSpace: 'nowrap' }}>
                      {row.pendingInbound}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: gs.textPrimary, py: 1, whiteSpace: 'nowrap' }}>
                      {row.todayOutbound} 单
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Chip
                        label={row.statusChip.label}
                        size="small"
                        sx={{
                          backgroundColor: isDark
                            ? (row.statusChip.color === 'error' ? '#7F1D1D' : row.statusChip.color === 'warning' ? '#78350F' : '#064E3B')
                            : row.statusChip.bgColor,
                          color: row.statusChip.textColor,
                          fontSize: '0.7rem',
                          height: 20,
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};

export default WarehouseKpiTable;
