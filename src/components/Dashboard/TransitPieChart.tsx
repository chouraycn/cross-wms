import React from 'react';
import { Typography, Box, IconButton, CircularProgress, Alert } from '@mui/material';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import { exportToCsv } from '../../utils/exportCsv';
import CustomTooltip from './CustomTooltip';
import type { TimeRange } from './TimeRangeSelector';

interface TransitPieChartProps {
  timeRange?: TimeRange;
}

 
const TransitPieChart: React.FC<TransitPieChartProps> = ({ timeRange }) => {
  // 从 Context 获取数据
  const { transitStatusDistribution, loading, error } = useWarehouseCapability({ includeDashboard: true });

  const total = transitStatusDistribution.reduce((s, d) => s + d.value, 0);

  // ==================== 导出在途状态分布数据 ====================
  const handleExport = () => {
    exportToCsv(
      'transit_status.csv',
      ['状态', '运单数', '占比(%)'],
      transitStatusDistribution.map((d) => [
        d.name,
        String(d.value),
        ((d.value / total) * 100).toFixed(1),
      ])
    );
  };

  if (loading) {
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 220 }}>
          <CircularProgress size={30} sx={{ color: '#111827' }} />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
        <Box sx={{ p: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
            在途货物状态分布
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            共 {total} 单在途运单
          </Typography>
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          <IconButton size="small" onClick={handleExport} title="导出CSV">
            <DownloadOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ p: 2, pt: 0, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={transitStatusDistribution}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={0}
              >
                {transitStatusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip unit=" 单" />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '0.8rem' }}
                formatter={(value) => <span style={{ color: '#6B7280' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </Box>
  );
};

export default TransitPieChart;
