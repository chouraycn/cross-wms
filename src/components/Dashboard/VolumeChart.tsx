import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, Typography, Box, IconButton, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import dayjs from 'dayjs';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { subscribeWarehouses } from '../../stores/warehouseStore';
import { exportToCsv } from '../../utils/exportCsv';
import { calcOverallByVolume, calcOverallByItems } from '../../utils/volumeCalculator';
import type { Warehouse } from '../../types';

interface VolumeChartProps {
  warehouseId: string;
}

type CalcMode = 'items' | 'volume';

const CALC_MODE_LABEL: Record<CalcMode, string> = {
  items: '按件数计算',
  volume: '按体积计算',
};

const VolumeChart: React.FC<VolumeChartProps> = ({ warehouseId }) => {
  const { settings } = useAppSettings();
  const { warningThreshold, fullThreshold } = settings.dashboard;

  const [calcMode, setCalcMode] = useState<CalcMode>('items');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    const unsub = subscribeWarehouses(setWarehouses);
    return unsub;
  }, []);

  // ==================== 动态生成 30 天容积率趋势数据 ====================
  const volumeHistory = useMemo(() => {
    // 确定当前使用的仓库集合
    const activeWarehouses = warehouseId === ALL_WAREHOUSES
      ? warehouses
      : warehouses.filter((w) => w.id === warehouseId);

    if (activeWarehouses.length === 0) return [];

    // 计算当前基准容积率
    const baseRate = calcMode === 'items'
      ? calcOverallByItems(activeWarehouses)
      : calcOverallByVolume(activeWarehouses);

    // 以当前值为基准，向前模拟 30 天数据（容积率逐步攀升，加入±3%随机波动）
    const days = 30;
    const result: { date: string; utilizationRate: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day').format('MM-DD');
      // 越早的数据越低于当前值（模拟容积率增长趋势），并加入随机波动
      const progressFactor = (days - 1 - i) / (days - 1); // 0 → 1，越接近当前值越大
      const baseAtDay = baseRate * progressFactor;
      const noise = (Math.random() - 0.5) * 6; // ±3%
      const rate = Math.min(100, Math.max(0, baseAtDay + noise));
      result.push({
        date,
        utilizationRate: parseFloat(rate.toFixed(1)),
      });
    }
    return result;
  }, [warehouses, warehouseId, calcMode]);

  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: CalcMode | null) => {
    if (newMode !== null) {
      setCalcMode(newMode);
    }
  };

  const warehouseName = warehouseId !== ALL_WAREHOUSES
    ? warehouses.find((w) => w.id === warehouseId)?.name ?? ''
    : '';

  // ==================== 导出容积率趋势数据 ====================
  const handleExport = () => {
    const modeLabel = calcMode === 'items' ? '件数' : '体积';
    exportToCsv(
      'volume_trend.csv',
      ['日期', `容积利用率(%)(基于${modeLabel})`],
      volumeHistory.map((p) => [p.date, String(p.utilizationRate)])
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              近 {settings.dashboard.trendCompareDays} 天 · {CALC_MODE_LABEL[calcMode]}
            </Typography>
            <ToggleButtonGroup
              value={calcMode}
              exclusive
              onChange={handleModeChange}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  fontSize: '0.7rem',
                  py: 0.25,
                  px: 1,
                  border: '1px solid #E5E7EB',
                  color: '#9CA3AF',
                  textTransform: 'none',
                  '&.Mui-selected': {
                    color: '#111827',
                    backgroundColor: '#F3F4F6',
                  },
                },
              }}
            >
              <ToggleButton value="items">件数</ToggleButton>
              <ToggleButton value="volume">体积</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        }
        action={
          <IconButton size="small" onClick={handleExport} title="导出CSV">
            <DownloadOutlinedIcon fontSize="small" />
          </IconButton>
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={volumeHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
              formatter={(value: number) => [`${value}%`, CALC_MODE_LABEL[calcMode]]}
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
              name={CALC_MODE_LABEL[calcMode]}
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
