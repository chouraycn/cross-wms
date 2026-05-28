import React, { useState, useEffect, useMemo } from 'react';
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
} from '@mui/material';
import { mockInventory, mockTransitOrders, mockInboundRecords, mockOutboundRecords } from '../../data/mockData';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { subscribeWarehouses } from '../../stores/warehouseStore';
import type { Warehouse } from '../../types';
import dayjs from 'dayjs';

interface WarehouseKpiTableProps {
  warehouseId?: string;
}

const WarehouseKpiTable: React.FC<WarehouseKpiTableProps> = ({ warehouseId = ALL_WAREHOUSES }) => {
  const { settings } = useAppSettings();
  const { warningThreshold, fullThreshold } = settings.dashboard;

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    const unsub = subscribeWarehouses(setWarehouses);
    return unsub;
  }, []);

  const filteredWarehouses = warehouseId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter((w) => w.id === warehouseId);

  const tableData = useMemo(() => {
    // 计算最近一天的出库量
    const today = dayjs();
    const latestOutboundDate = mockOutboundRecords.length > 0
      ? mockOutboundRecords.reduce((latest, r) => {
          return r.createdAt > latest ? r.createdAt : latest;
        }, mockOutboundRecords[0].createdAt)
      : today.format('YYYY-MM-DD');

    return filteredWarehouses.map((wh) => {
      // 容积使用率
      const totalItems = Number.isFinite(wh.totalItems) && wh.totalItems! > 0 ? wh.totalItems! : (Number.isFinite(wh.totalVolume) ? wh.totalVolume : 1);
      const usedItems = Number.isFinite(wh.usedItems) && wh.usedItems! >= 0 ? wh.usedItems! : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0);
      const utilizationRate = totalItems > 0 ? (usedItems / totalItems) * 100 : 0;

      // 在途货物量（从 transitOrders 汇总目的地为该仓库的）
      const transitVolume = mockTransitOrders
        .filter((t) => t.toWarehouseId === wh.id && t.status !== 'arrived')
        .reduce((s, t) => s + t.volume, 0);

      // 库存深度
      const inventoryCount = mockInventory
        .filter((item) => item.warehouseId === wh.id)
        .reduce((s, item) => s + item.quantity, 0);

      // 待处理入库单
      const pendingInbound = mockInboundRecords
        .filter((r) => r.warehouseId === wh.id && r.status === 'pending').length;

      // 当日出库量（最近一天）
      const todayOutbound = mockOutboundRecords
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
        totalItems,
        usedItems,
        transitVolume,
        inventoryCount,
        pendingInbound,
        todayOutbound,
        statusChip,
      };
    });
  }, [filteredWarehouses, warningThreshold, fullThreshold]);

  if (filteredWarehouses.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              各仓库KPI对比
            </Typography>
          }
        />
        <CardContent>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
              暂无仓库数据
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
      <CardHeader
        title={
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
            各仓库KPI对比
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            横向对比所有仓库核心指标
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid #E5E7EB', borderRadius: 1, overflow: 'auto' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                  仓库名称
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                  容积使用率
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                  在途货物量
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                  库存深度
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                  待处理入库单
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                  当日出库量
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
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
                    <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', fontWeight: 600, py: 1, whiteSpace: 'nowrap' }}>
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
                              backgroundColor: '#F3F4F6',
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
                    <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', py: 1, whiteSpace: 'nowrap' }}>
                      {row.transitVolume.toFixed(1)} m³
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', py: 1, whiteSpace: 'nowrap' }}>
                      {row.inventoryCount.toLocaleString()} 件
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: row.pendingInbound > 0 ? '#F59E0B' : '#6B7280', py: 1, whiteSpace: 'nowrap' }}>
                      {row.pendingInbound}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', py: 1, whiteSpace: 'nowrap' }}>
                      {row.todayOutbound} 单
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Chip
                        label={row.statusChip.label}
                        size="small"
                        sx={{
                          backgroundColor: row.statusChip.bgColor,
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
