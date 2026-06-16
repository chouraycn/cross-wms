/**
 * 库存盘点统计卡片组件
 *
 * 显示 4 个统计卡片：
 * - 总盘点数量
 * - 待盘点数量
 * - 已盘点数量
 * - 已调整数量 + 总差异
 */

import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box, Stack, LinearProgress } from '@mui/material';
import { InventoryOutlined, PendingOutlined, CheckCircleOutline, TrendingUp } from '@mui/icons-material';
import type { InventoryCount, InventoryStats } from '../../types/wms';

interface WmsInventoryStatsProps {
  data: InventoryCount[];
}

const WmsInventoryStats = React.memo<WmsInventoryStatsProps>(function WmsInventoryStats({ data }) {
  const stats: InventoryStats = useMemo(() => {
    const result: InventoryStats = {
      total: data.length,
      pending: 0,
      counted: 0,
      adjusted: 0,
      totalVariance: 0,
    };

    data.forEach((item) => {
      switch (item.status) {
        case 'pending':
          result.pending++;
          break;
        case 'counted':
          result.counted++;
          break;
        case 'adjusted':
          result.adjusted++;
          if (item.variance) {
            result.totalVariance += item.variance;
          }
          break;
      }
    });

    return result;
  }, [data]);

  const cards = [
    {
      label: '总盘点数量',
      value: stats.total,
      icon: <InventoryOutlined sx={{ fontSize: 28, color: '#6B7280' }} />,
      bgColor: '#F9FAFB',
      borderColor: '#E5E7EB',
    },
    {
      label: '待盘点',
      value: stats.pending,
      icon: <PendingOutlined sx={{ fontSize: 28, color: '#F59E0B' }} />,
      bgColor: '#FFFBEB',
      borderColor: '#FCD34D',
      progress: stats.total > 0 ? (stats.pending / stats.total) * 100 : 0,
    },
    {
      label: '已盘点',
      value: stats.counted,
      icon: <CheckCircleOutline sx={{ fontSize: 28, color: '#3B82F6' }} />,
      bgColor: '#EFF6FF',
      borderColor: '#93C5FD',
      progress: stats.total > 0 ? (stats.counted / stats.total) * 100 : 0,
    },
    {
      label: '已调整',
      value: stats.adjusted,
      subLabel: `差异: ${stats.totalVariance > 0 ? '+' : ''}${stats.totalVariance}`,
      icon: <TrendingUp sx={{ fontSize: 28, color: '#059669' }} />,
      bgColor: '#ECFDF5',
      borderColor: '#6EE7B7',
      progress: stats.total > 0 ? (stats.adjusted / stats.total) * 100 : 0,
    },
  ];

  return (
    <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
      {cards.map((card) => (
        <Card
          key={card.label}
          elevation={0}
          sx={{
            flex: '1 1 200px',
            minWidth: 200,
            border: '1px solid',
            borderColor: card.borderColor,
            borderRadius: 2,
            backgroundColor: card.bgColor,
          }}
        >
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.75rem', mb: 0.5 }}>
                  {card.label}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, fontSize: '1.5rem', color: '#111827' }}>
                  {card.value}
                </Typography>
                {card.subLabel && (
                  <Typography variant="body2" sx={{ color: '#059669', fontSize: '0.75rem', mt: 0.5 }}>
                    {card.subLabel}
                  </Typography>
                )}
              </Box>
              {card.icon}
            </Box>
            {card.progress !== undefined && (
              <LinearProgress
                variant="determinate"
                value={card.progress}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 2,
                  },
                }}
              />
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
});

export default WmsInventoryStats;
