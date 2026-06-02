/**
 * 库存变动历史组件
 *
 * 展示库存的入库/出库/调整记录，支持筛选、分页。
 * 数据来源：GET /api/inventory-transactions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Typography,
  CircularProgress,
} from '@mui/material';
import { getInventoryTransactions } from '../../services/api';
import { getWarehouses } from '../../capabilities/warehouse';
import type { Warehouse, InventoryTransaction } from '../../types';

export interface TransactionHistoryProps {
  warehouseId?: string;
  sku?: string;
}

/** 变动类型标签配置 */
const TYPE_CHIP_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'info' }> = {
  inbound: { label: '入库', color: 'success' },
  outbound: { label: '出库', color: 'warning' },
  adjustment: { label: '调整', color: 'info' },
};

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ warehouseId, sku }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // 筛选状态
  const [filterType, setFilterType] = useState<string>('all');
  const [filterWarehouse, setFilterWarehouse] = useState<string>(warehouseId ?? 'all');
  const [filterSku, setFilterSku] = useState(sku ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 分页状态
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // 数据状态
  const [items, setItems] = useState<InventoryTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载仓库列表
  useEffect(() => {
    setWarehouses(getWarehouses());
  }, []);

  // 当 prop 变化时同步筛选
  useEffect(() => {
    if (warehouseId) setFilterWarehouse(warehouseId);
  }, [warehouseId]);

  useEffect(() => {
    if (sku) setFilterSku(sku);
  }, [sku]);

  /** 拉取变动历史数据 */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {
        page: page + 1, // API 从 1 开始
        pageSize: rowsPerPage,
      };
      if (filterType !== 'all') params.type = filterType;
      if (filterWarehouse !== 'all') params.warehouseId = filterWarehouse;
      if (filterSku.trim()) params.sku = filterSku.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const result = await getInventoryTransactions(params as Parameters<typeof getInventoryTransactions>[0]);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载变动历史失败';
      setError(message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterType, filterWarehouse, filterSku, startDate, endDate]);

  // 数据拉取
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 筛选条件变更时重置到第1页 */
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    setPage(0);
  };

  /** 获取仓库名称 */
  const getWarehouseName = (whId: string): string => {
    const wh = warehouses.find((w) => w.id === whId);
    return wh?.name ?? whId;
  };

  /** 格式化时间 */
  const formatTime = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return dateStr;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <Box>
      {/* 筛选栏 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, mb: 2, p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>变动类型</InputLabel>
            <Select
              value={filterType}
              label="变动类型"
              onChange={(e) => handleFilterChange(setFilterType, e.target.value)}
            >
              <MenuItem value="all">全部</MenuItem>
              <MenuItem value="inbound">入库</MenuItem>
              <MenuItem value="outbound">出库</MenuItem>
              <MenuItem value="adjustment">调整</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>仓库</InputLabel>
            <Select
              value={filterWarehouse}
              label="仓库"
              onChange={(e) => handleFilterChange(setFilterWarehouse, e.target.value)}
            >
              <MenuItem value="all">全部仓库</MenuItem>
              {warehouses.map((wh) => (
                <MenuItem key={wh.id} value={wh.id}>
                  {wh.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="SKU搜索"
            value={filterSku}
            onChange={(e) => handleFilterChange(setFilterSku, e.target.value)}
            sx={{ minWidth: 140 }}
            placeholder="输入SKU"
          />
          <TextField
            size="small"
            label="开始日期"
            type="date"
            value={startDate}
            onChange={(e) => handleFilterChange(setStartDate, e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            size="small"
            label="结束日期"
            type="date"
            value={endDate}
            onChange={(e) => handleFilterChange(setEndDate, e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
        </Stack>
      </Card>

      {/* 数据表格 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && error && (
          <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Box>
        )}

        {!loading && !error && items.length === 0 && (
          <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              暂无变动记录
            </Typography>
          </Box>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>商品名称</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>类型</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="right">
                      数量
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>仓库</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>操作人</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>备注</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => {
                    const chipConfig = TYPE_CHIP_CONFIG[item.type] ?? {
                      label: item.type,
                      color: 'default' as const,
                    };
                    return (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                            {formatTime(item.createdAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                            {item.sku}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={chipConfig.label}
                            size="small"
                            color={chipConfig.color}
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: item.type === 'outbound' ? '#EA580C' : item.type === 'inbound' ? '#059669' : '#2563EB',
                            }}
                          >
                            {item.type === 'outbound' ? '-' : '+'}
                            {item.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {getWarehouseName(item.warehouseId)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.operator || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                            {item.remark || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 20, 50]}
              labelRowsPerPage="每页行数："
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
            />
          </>
        )}
      </Card>
    </Box>
  );
};

export default TransactionHistory;
