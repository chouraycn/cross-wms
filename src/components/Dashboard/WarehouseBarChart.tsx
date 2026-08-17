import React, { useMemo } from 'react';
import { Typography, Box, IconButton } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import { exportToCsv } from '../../utils/exportCsv';
import { calcUtilizationByItems } from '../../utils/volumeCalculator';
import CustomTooltip from './CustomTooltip';
import type { TimeRange } from './TimeRangeSelector';

interface WarehouseBarChartProps {
  warehouseId: string;
  timeRange?: TimeRange;
}

 
const WarehouseBarChart: React.FC<WarehouseBarChartProps> = ({ warehouseId, timeRange }) => {
  // 从 Context 获取数据
  const { warehouses, loading, error } = useWarehouseCapability({ includeDashboard: true });

  const filtered = warehouseId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter((w) => w.id === warehouseId);

  const data = useMemo(() => {
    return filtered.map((wh) => {
      const used = Number.isFinite(wh.usedItems) && wh.usedItems! >= 0
        ? wh.usedItems!
        : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0);

      const total = Number.isFinite(wh.totalItems) && wh.totalItems! > 0
        ? wh.totalItems!
        : (Number.isFinite(wh.totalVolume) ? wh.totalVolume : 1);

      const free = Math.max(0, total - used);
      const rate = calcUtilizationByItems(wh);

      return {
        name: wh.name.replace('仓', ''),
        used,
        free,
        rate,
      };
    });
  }, [filtered]);

  // 导出仓库容积数据
  const handleExport = () => {
    exportToCsv(
      'warehouse_volume.csv',
      ['仓库名称', '已用件数', '空闲件数', '容积利用率(%)'],
      data.map((d) => [d.name, String(d.used), String(d.free), String(d.rate)])
    );
  };

  // 加载状态
  if (loading) {
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              仓库容积使用情况
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 260 }}>
          <Box sx={{ textAlign: 'center' }}>
            <div className="MuiCircularProgress-root MuiCircularProgress-indeterminate" style={{ width: 40, height: 40 }}>
              <svg className="MuiCircularProgress-svg" viewBox="22 22 44 44">
                <circle className="MuiCircularProgress-circle MuiCircularProgress-circleIndeterminate" cx="44" cy="44" r="20" fill="none" stroke="#111827" strokeWidth="4" />
              </svg>
            </div>
          </Box>
        </Box>
      </Box>
    );
  }

  // 错误状态
  if (error) {
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              仓库容积使用情况
            </Typography>
          </Box>
        </Box>
        <Box sx={{ p: 2, pt: 0, pb: 2 }}>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#EF4444' }}>
              {error}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  // 没有仓库时显示空状态
  if (filtered.length === 0) {
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              仓库容积使用情况
            </Typography>
          </Box>
          <Box sx={{ flexShrink: 0 }}>
            <IconButton size="small" onClick={handleExport} title="导出CSV" disabled>
              <DownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        <Box sx={{ p: 2 }}>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
              暂无仓库数据，请先添加仓库
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              {warehouseId === ALL_WAREHOUSES
                ? '各仓库容积使用情况'
                : `${filtered[0]?.name ?? ''}容积使用情况`}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
              已用 / 空闲（件数）
            </Typography>
          </Box>
          <Box sx={{ flexShrink: 0 }}>
            <IconButton size="small" onClick={handleExport} title="导出CSV">
              <DownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      <Box sx={{ p: 2, pt: 0, pb: 2 }}>
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
            <Tooltip content={<CustomTooltip unit=" 件" />} />
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
      </Box>
    </Box>
  );
};

export default WarehouseBarChart;
