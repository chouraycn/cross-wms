import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, Typography, Box, CircularProgress, Alert } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import CustomTooltip from './CustomTooltip';
import type { TimeRange } from './TimeRangeSelector';

interface TransitTimeChartProps {
  warehouseId?: string;
  timeRange?: TimeRange;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TransitTimeChart: React.FC<TransitTimeChartProps> = ({ warehouseId = ALL_WAREHOUSES, timeRange }) => {
  // 从 Context 获取数据
  const { warehouses, transitOrders, loading, error } = useWarehouseCapability({ includeDashboard: true });

  // 过滤运单（按仓库）
  const filteredOrders = useMemo(() => {
    return warehouseId === ALL_WAREHOUSES
      ? transitOrders
      : transitOrders.filter(
          (t) => t.fromWarehouseId === warehouseId || t.toWarehouseId === warehouseId
        );
  }, [transitOrders, warehouseId]);

  // 计算运输时长并分组
  const chartData = useMemo(() => {
    const today = new Date();

    // 计算每条运单的运输天数
    const ordersWithDays = filteredOrders.map((order) => {
      const shipDate = new Date(order.createdAt);
      const days = Math.floor((today.getTime() - shipDate.getTime()) / (1000 * 60 * 60 * 24));
      return { ...order, days };
    });

    // 定义时长区间
    const ranges = [
      { name: '≤3天', min: 0, max: 3, count: 0 },
      { name: '4-7天', min: 4, max: 7, count: 0 },
      { name: '8-14天', min: 8, max: 14, count: 0 },
      { name: '15-30天', min: 15, max: 30, count: 0 },
      { name: '>30天', min: 31, max: Infinity, count: 0 },
    ];

    ordersWithDays.forEach((order) => {
      for (const range of ranges) {
        if (order.days >= range.min && order.days <= range.max) {
          range.count++;
          break;
        }
      }
    });

    return ranges.map((r) => ({
      name: r.name,
      count: r.count,
    }));
  }, [filteredOrders]);

  // 渐变蓝色系
  const barColors = ['#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#1D4ED8'];

  const warehouseName = warehouseId !== ALL_WAREHOUSES
    ? warehouses.find((w) => w.id === warehouseId)?.name ?? ''
    : '';

  // 加载状态
  if (loading) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              运单时效分析
            </Typography>
          }
        />
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 260 }}>
          <CircularProgress size={30} sx={{ color: '#111827' }} />
        </CardContent>
      </Card>
    );
  }

  // 错误状态
  if (error) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              {warehouseName ? `${warehouseName}运单时效分析` : '运单时效分析'}
            </Typography>
          }
        />
        <CardContent sx={{ pt: 0, pb: '16px !important' }}>
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
            {warehouseName ? `${warehouseName}运单时效分析` : '运单时效分析'}
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            基于发货日期统计运输时长分布
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        {chartData.every((d) => d.count === 0) ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
              暂无运单数据
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip unit=" 单" />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default TransitTimeChart;
