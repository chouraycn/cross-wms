import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, Typography, Box, IconButton, CircularProgress, Alert } from '@mui/material';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { dashboardApi } from '../../services/dashboardApi';
import { exportToCsv } from '../../utils/exportCsv';
import type { TransitStatusDistribution } from '../../types';

const TransitPieChart: React.FC = () => {
  const [transitStatusDistribution, setTransitStatusDistribution] = useState<TransitStatusDistribution[]>([
    { name: '已发出', value: 0, color: '#9CA3AF' },
    { name: '运输中', value: 0, color: '#111827' },
    { name: '清关中', value: 0, color: '#6B7280' },
    { name: '已到达', value: 0, color: '#D1D5DB' },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dashboardApi.getTransitStatusDistribution()
      .then((data) => {
        setTransitStatusDistribution(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || '获取数据失败');
        setLoading(false);
      });
  }, []);

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
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, height: '100%' }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 220 }}>
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
            在途货物状态分布
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.25 }}>
            共 {total} 单在途运单
          </Typography>
        }
        action={
          <IconButton size="small" onClick={handleExport} title="导出CSV">
            <DownloadOutlinedIcon fontSize="small" />
          </IconButton>
        }
      />
      <CardContent sx={{ pt: 0, pb: '16px !important' }}>
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
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value} 单 (${((value / total) * 100).toFixed(1)}%)`,
                  name,
                ]}
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
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '0.8rem' }}
                formatter={(value) => <span style={{ color: '#6B7280' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TransitPieChart;
