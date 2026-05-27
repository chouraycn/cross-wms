import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, Typography, Box, IconButton } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { mockVolumeHistory } from '../../data/mockData';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { subscribeWarehouses } from '../../stores/warehouseStore';
import { exportToCsv } from '../../utils/exportCsv';
import type { Warehouse } from '../../types';

interface VolumeChartProps {
  warehouseId: string;
}

const VolumeChart: React.FC<VolumeChartProps> = ({ warehouseId }) => {
  const { settings } = useAppSettings();
  const { warningThreshold, fullThreshold } = settings.dashboard;

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    const unsub = subscribeWarehouses(setWarehouses);
    return unsub;
  }, []);

  const warehouseName = warehouseId !== ALL_WAREHOUSES
    ? warehouses.find((w) => w.id === warehouseId)?.name ?? ''
    : '';

  // ==================== 导出容积率趋势数据 ====================
  const handleExport = () => {
    exportToCsv(
      'volume_trend.csv',
      ['日期', '容积利用率(%)'],
      mockVolumeHistory.map((p) => [p.date, String(p.utilizationRate)])
    );
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
      <CardHeader
        title={
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
            {warehouseName ? `${warehouseName}容积率趋势` : '容积率趋势'}
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            近 {settings.dashboard.trendCompareDays} 天 · 按件数计算
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
          <LineChart data={mockVolumeHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickLine={false}
              interval={4}
            />
            <YAxis
              domain={[50, 100]}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={40}
            />
            <Tooltip
              formatter={(value: number) => [`${value}%`, '容积利用率']}
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
            />
            <ReferenceLine
              y={fullThreshold}
              stroke="#EF4444"
              strokeDasharray="4 4"
              label={{ value: `满仓 ${fullThreshold}%`, position: 'right', fontSize: 10, fill: '#EF4444' }}
            />
            <ReferenceLine
              y={warningThreshold}
              stroke="#F59E0B"
              strokeDasharray="4 4"
              label={{ value: `预警 ${warningThreshold}%`, position: 'right', fontSize: 10, fill: '#F59E0B' }}
            />
            <Line
              type="monotone"
              dataKey="utilizationRate"
              name="容积利用率"
              stroke="#111827"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#111827', stroke: '#FFFFFF', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default VolumeChart;
