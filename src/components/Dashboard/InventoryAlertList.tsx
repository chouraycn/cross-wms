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
  Chip,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import type { TimeRange } from './TimeRangeSelector';
import type { InventoryItem } from '../../types';

interface InventoryAlertListProps {
  warehouseId?: string;
  timeRange?: TimeRange;
}

const InventoryAlertList: React.FC<InventoryAlertListProps> = ({ warehouseId = ALL_WAREHOUSES, timeRange }) => {
  const { settings } = useAppSettings();
  const ageWarningDays = settings.dashboard.ageWarningDays;

  // 从 Context 获取数据
  const { warehouses, inventory, loading, error } = useWarehouseCapability({ includeDashboard: true });

  const warehouseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    warehouses.forEach((w) => {
      map[w.id] = w.name;
    });
    return map;
  }, [warehouses]);

  // 过滤出库龄 >= ageWarningDays 的 SKU
  const filteredItems = useMemo(() => {
    const filtered = inventory.filter((item) => {
      // 计算库龄天数
      const inboundDate = new Date(item.inboundDate);
      const today = new Date();
      const ageDays = Math.floor((today.getTime() - inboundDate.getTime()) / (1000 * 60 * 60 * 24));

      if (ageDays < ageWarningDays) return false;

      // 按仓库过滤
      if (warehouseId !== ALL_WAREHOUSES && item.warehouseId !== warehouseId) return false;

      return true;
    });

    // 按库龄降序排列
    return filtered.sort((a, b) => {
      const dateA = new Date(a.inboundDate);
      const dateB = new Date(b.inboundDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [warehouseId, ageWarningDays, inventory]);

  // 获取预警等级
  const getAlertLevel = (inboundDate: string): { label: string; color: 'warning' | 'error'; bgColor: string } => {
    const date = new Date(inboundDate);
    const today = new Date();
    const ageDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (ageDays >= 90) {
      return { label: '严重', color: 'error', bgColor: '#FEF2F2' };
    } else if (ageDays >= 60) {
      return { label: '警告', color: 'warning', bgColor: '#FFFBEB' };
    }
    return { label: '正常', color: 'warning', bgColor: '#FFFBEB' };
  };

  const displayItems = filteredItems.slice(0, 20);
  const totalCount = filteredItems.length;

  if (loading) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress size={30} sx={{ color: '#111827' }} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
      <CardHeader
        title={
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
            库存预警列表
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            库龄 ≥ {ageWarningDays} 天的 SKU
          </Typography>
        }
        action={
          totalCount > 0 ? (
            <Chip
              label={`${totalCount} 条预警`}
              size="small"
              sx={{ backgroundColor: '#FEF2F2', color: '#EF4444', fontSize: '0.75rem', height: 24 }}
            />
          ) : undefined
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        {totalCount === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 48, color: '#10B981', mb: 1 }} />
            <Typography sx={{ fontSize: '0.875rem', color: '#10B981', fontWeight: 500 }}>
              ✅ 无库存预警
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.5 }}>
              所有 SKU 库龄均在 {ageWarningDays} 天以内
            </Typography>
          </Box>
        ) : (
          <Box>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid #E5E7EB', borderRadius: 1, maxHeight: 320, overflow: 'auto' }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1 }}>
                      SKU编号
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1 }}>
                      商品名称
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1 }}>
                      所在仓库
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1 }}>
                      库龄（天）
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1 }}>
                      库存数量
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#6B7280', py: 1 }}>
                      预警等级
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayItems.map((item) => {
                    const alertLevel = getAlertLevel(item.inboundDate);
                    const inboundDate = new Date(item.inboundDate);
                    const today = new Date();
                    const ageDays = Math.floor((today.getTime() - inboundDate.getTime()) / (1000 * 60 * 60 * 24));

                    return (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', py: 1 }}>
                          {item.sku}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', py: 1 }}>
                          {item.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: '#6B7280', py: 1 }}>
                          {warehouseNameMap[item.warehouseId] || item.warehouseId}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: ageDays >= 90 ? '#EF4444' : '#F59E0B', fontWeight: 600, py: 1 }}>
                          {ageDays}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: '#111827', py: 1 }}>
                          {item.quantity}
                        </TableCell>
                        <TableCell sx={{ py: 1 }}>
                          <Chip
                            label={alertLevel.label}
                            size="small"
                            sx={{
                              backgroundColor: alertLevel.bgColor,
                              color: alertLevel.color === 'error' ? '#EF4444' : '#F59E0B',
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
            {totalCount > 20 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 1, textAlign: 'center' }}>
                共 {totalCount} 条预警，仅显示前 20 条
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default InventoryAlertList;
