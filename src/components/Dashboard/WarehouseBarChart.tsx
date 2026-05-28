import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, Typography, Box, IconButton } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { getWarehouseUtilization } from '../../data/mockData';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { subscribeWarehouses } from '../../stores/warehouseStore';
import { exportToCsv } from '../../utils/exportCsv';
import type { Warehouse } from '../../types';

interface WarehouseBarChartProps {
  warehouseId: string;
}

const WarehouseBarChart: React.FC<WarehouseBarChartProps> = ({ warehouseId }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    const unsub = subscribeWarehouses(setWarehouses);
    return unsub;
  }, []);

  const filtered = warehouseId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter((w) => w.id === warehouseId);

  const data = filtered.map((wh) => ({
    name: wh.name.replace('仓', ''),
    used: Number.isFinite(wh.usedItems) && wh.usedItems! >= 0 ? wh.usedItems! : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0),
    free: Math.max(0,
      (Number.isFinite(wh.totalItems) && wh.totalItems! > 0 ? wh.totalItems! : (Number.isFinite(wh.totalVolume) ? wh.totalVolume : 1))
      - (Number.isFinite(wh.usedItems) && wh.usedItems! >= 0 ? wh.usedItems! : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0))
    ),
    rate: getWarehouseUtilization(wh),
  }));

  // ==================== 导出仓库容积数据 ====================
  const handleExport = () => {
    exportToCsv(
      'warehouse_volume.csv',
      ['仓库名称', '已用件数', '空闲件数', '容积利用率(%)'],
      data.map((d) => [d.name, String(d.used), String(d.free), String(d.rate)])
    );
  };

  // 没有仓库时显示空状态
  if (filtered.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              仓库容积使用情况
            </Typography>
          }
          action={
            <IconButton size="small" onClick={handleExport} title="导出CSV" disabled>
              <DownloadOutlinedIcon fontSize="small" />
            </IconButton>
          }
        />
        <CardContent>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
              暂无仓库数据，请先添加仓库
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
            {warehouseId === ALL_WAREHOUSES
              ? '各仓库容积使用情况'
              : `${filtered[0]?.name ?? ''}容积使用情况`}
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            已用 / 空闲（件数）
          </Typography>
        }
        action={
          <IconButton size="small" onClick={handleExport} title="导出CSV">
            <DownloadOutlinedIcon fontSize="small" />
          </IconButton>
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
              tickFormatter={(v) => `${v}`}
              width={40}
            />
            <Tooltip
              formatter={(value: number, name: string) => [`${value} 件`, name === 'used' ? '已用' : '空闲']}
              contentStyle={{
                fontSize: '0.8rem',
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                padding: '8px 12px',
              }}
              labelStyle={{ color: '#6B7280', marginBottom: 4 }}
            />
            <Legend
              wrapperStyle={{ fontSize: '0.8rem' }}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (value === 'used' ? '已用' : '空闲')}
            />
            <Bar dataKey="used" stackId="a" fill="#111827" radius={[0, 0, 0, 0]} maxBarSize={40} />
            <Bar dataKey="free" stackId="a" fill="#E5E7EB" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default WarehouseBarChart;
