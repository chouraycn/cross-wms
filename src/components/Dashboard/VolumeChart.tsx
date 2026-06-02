import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, Typography, Box, IconButton, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import { exportToCsv } from '../../utils/exportCsv';
import type { VolumeHistoryPoint } from '../../types';

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

  // 从 Context 获取数据
  const { volumeHistory, loading, error } = useWarehouseCapability({ includeDashboard: true });

  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: CalcMode | null) => {
    if (newMode !== null) {
      setCalcMode(newMode);
    }
  };

  // 导出容积率趋势数据
  const handleExport = () => {
    const modeLabel = calcMode === 'items' ? '件数' : '体积';
    exportToCsv(
      'volume_trend.csv',
      ['日期', `容积利用率(%)(基于${modeLabel})`],
      volumeHistory.map((p) => [p.date, String(p.utilizationRate)])
    );
  };

  // 加载状态
  if (loading) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              容积率趋势
            </Typography>
          }
        />
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 260 }}>
          <Box sx={{ textAlign: 'center' }}>
            <div className="MuiCircularProgress-root MuiCircularProgress-indeterminate" style={{ width: 40, height: 40 }}>
              <svg className="MuiCircularProgress-svg" viewBox="22 22 44 44">
                <circle className="MuiCircularProgress-circle MuiCircularProgress-circleIndeterminate" cx="44" cy="44" r="20" fill="none" stroke="#111827" strokeWidth="4" />
              </svg>
            </div>
          </Box>
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
              容积率趋势
            </Typography>
          }
        />
        <CardContent sx={{ pt: 0, pb: '16px !important' }}>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#EF4444' }}>
              {error}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // 空数据状态
  if (volumeHistory.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              容积率趋势
            </Typography>
          }
          subheader={
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
              近 {settings.dashboard.trendCompareDays} 天 · {CALC_MODE_LABEL[calcMode]}
            </Typography>
          }
          action={
            <IconButton size="small" onClick={handleExport} title="导出CSV" disabled>
              <DownloadOutlinedIcon fontSize="small" />
            </IconButton>
          }
        />
        <CardContent sx={{ pt: 0, pb: '16px !important' }}>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
              暂无容积率趋势数据
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
            容积率趋势
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
