/**
 * 库存盘点差异历史图表
 *
 * 使用 Recharts 绘制差异历史折线图
 * 显示一段时间内盘点差异的变化趋势
 *
 * 数据结构：按日期聚合的差异统计数据
 */

import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { InventoryCount } from '../../../types/wms';

/** 图表数据类型 */
interface VarianceDataPoint {
  date: string;
  avgVariance: number;
  totalVariance: number;
  count: number;
  positiveCount: number;  // 盘盈次数
  negativeCount: number;  // 盘亏次数
}

/** 时间范围类型 */
type TimeRange = '7d' | '30d' | '90d' | 'all';

/** 图表类型 */
type ChartType = 'trend' | 'distribution';

interface WmsVarianceChartProps {
  /** 盘点数据 */
  data: InventoryCount[];
  /** 卡片标题（可选） */
  title?: string;
}

const WmsVarianceChart: React.FC<WmsVarianceChartProps> = ({
  data,
  title = '盘点差异趋势',
}) => {
  const [timeRange, setTimeRange] = React.useState<TimeRange>('30d');
  const [chartType, setChartType] = React.useState<ChartType>('trend');

  // ===================== 数据聚合 =====================

  const chartData = useMemo(() => {
    // 筛选已调整的数据（有差异数据）
    const adjustedData = data.filter(
      (item) => item.status === 'adjusted' && item.variance !== undefined && item.countTime
    );

    if (adjustedData.length === 0) return [];

    // 按日期聚合
    const dateMap = new Map<string, VarianceDataPoint>();

    adjustedData.forEach((item) => {
      if (!item.countTime) return;

      const date = new Date(item.countTime).toISOString().split('T')[0];
      const existing = dateMap.get(date) || {
        date,
        avgVariance: 0,
        totalVariance: 0,
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
      };

      existing.count += 1;
      existing.totalVariance += item.variance || 0;
      if ((item.variance || 0) > 0) existing.positiveCount += 1;
      if ((item.variance || 0) < 0) existing.negativeCount += 1;

      dateMap.set(date, existing);
    });

    // 计算平均值并转换 to 数组
    const result: VarianceDataPoint[] = Array.from(dateMap.entries()).map(([date, stats]) => ({
      ...stats,
      avgVariance: stats.totalVariance / stats.count,
    }));

    // 按日期排序
    result.sort((a, b) => a.date.localeCompare(b.date));

    // 根据时间范围筛选
    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      return result.filter((d) => d.date >= cutoffStr);
    }

    return result;
  }, [data, timeRange]);

  // ===================== 统计摘要 =====================

  const summary = useMemo(() => {
    const adjusted = data.filter((item) => item.status === 'adjusted');
    const variances = adjusted
      .map((item) => item.variance || 0)
      .filter((v) => v !== 0);

    if (variances.length === 0) {
      return { avg: 0, max: 0, min: 0, positiveRate: 0 };
    }

    const avg = variances.reduce((a, b) => a + b, 0) / variances.length;
    const max = Math.max(...variances);
    const min = Math.min(...variances);
    const positiveRate = (variances.filter((v) => v > 0).length / variances.length) * 100;

    return { avg, max, min, positiveRate };
  }, [data]);

  // ===================== 事件处理 =====================

  const handleTimeRangeChange = (_: React.MouseEvent<HTMLElement>, newRange: TimeRange | null) => {
    if (newRange !== null) {
      setTimeRange(newRange);
    }
  };

  const handleChartTypeChange = (_: React.MouseEvent<HTMLElement>, newType: ChartType | null) => {
    if (newType !== null) {
      setChartType(newType);
    }
  };

  // ===================== 空状态 =====================

  if (chartData.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <CardContent sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            暂无差异数据
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
            完成盘点并确认调整后，此处将显示差异趋势
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        {/* 标题栏 */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
            {title}
          </Typography>

          <Stack direction="row" spacing={1}>
            {/* 图表类型切换 */}
            <ToggleButtonGroup
              value={chartType}
              exclusive
              onChange={handleChartTypeChange}
              size="small"
            >
              <ToggleButton value="trend" sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                趋势
              </ToggleButton>
              <ToggleButton value="distribution" sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                分布
              </ToggleButton>
            </ToggleButtonGroup>

            {/* 时间范围选择 */}
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>时间范围</InputLabel>
              <Select
                value={timeRange}
                label="时间范围"
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              >
                <MenuItem value="7d">近 7 天</MenuItem>
                <MenuItem value="30d">近 30 天</MenuItem>
                <MenuItem value="90d">近 90 天</MenuItem>
                <MenuItem value="all">全部</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        {/* 统计摘要 */}
        <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              平均差异
            </Typography>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                color: summary.avg > 0 ? '#059669' : summary.avg < 0 ? '#DC2626' : '#6B7280',
              }}
            >
              {summary.avg > 0 ? '+' : ''}{summary.avg.toFixed(1)}
            </Typography>
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              最大盘盈
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#059669' }}>
              +{summary.max}
            </Typography>
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              最大盘亏
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#DC2626' }}>
              {summary.min}
            </Typography>
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              盘盈率
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#6B7280' }}>
              {summary.positiveRate.toFixed(1)}%
            </Typography>
          </Box>
        </Stack>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={300}>
          {chartType === 'trend' ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: string) => value.split('-').slice(1).join('/')}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    totalVariance: '总差异',
                    avgVariance: '平均差异',
                    count: '盘点次数',
                  };
                  return [value, labels[name] || name];
                }}
                labelFormatter={(label: string) => `日期: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalVariance"
                stroke="#3B82F6"
                strokeWidth={2}
                name="总差异"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="avgVariance"
                stroke="#F59E0B"
                strokeWidth={2}
                name="平均差异"
                dot={{ r: 3 }}
              />
            </LineChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: string) => value.split('-').slice(1).join('/')}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="positiveCount"
                stroke="#059669"
                strokeWidth={2}
                name="盘盈次数"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="negativeCount"
                stroke="#DC2626"
                strokeWidth={2}
                name="盘亏次数"
                dot={{ r: 3 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>

        {/* 提示信息 */}
        <Typography
          variant="body2"
          color="text.disabled"
          sx={{ mt: 1, fontSize: '0.7rem', textAlign: 'center' }}
        >
          {chartType === 'trend' ? '显示差异金额变化趋势' : '显示盘盈/盘亏次数分布'}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default WmsVarianceChart;
