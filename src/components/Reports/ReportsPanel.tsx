import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Alert,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { dashboardApi } from '../../services/dashboardApi';
import type { MonthlyTrend, Warehouse, InventoryItem } from '../../types';

type TimeRange = 'month' | 'quarter' | 'year';

const ReportsPanel: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('year');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 从 dashboardApi 加载数据
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [warehousesData, inventoryData] = await Promise.all([
          dashboardApi.getWarehouses(),
          dashboardApi.getInventory(),
        ]);

        if (!cancelled) {
          setWarehouses(warehousesData);
          setInventory(inventoryData);

          // 基于入库/出库记录生成月度趋势（或 fallback 到 mock）
          try {
            const [inboundRecords, outboundRecords] = await Promise.all([
              dashboardApi.getInboundRecords(),
              dashboardApi.getOutboundRecords(),
            ]);

            // 按月聚合
            const monthMap = new Map<string, { inbound: number; outbound: number }>();
            inboundRecords.forEach((r) => {
              const month = r.createdAt?.substring(0, 7) || '未知';
              if (!monthMap.has(month)) monthMap.set(month, { inbound: 0, outbound: 0 });
              monthMap.get(month)!.inbound += r.quantity;
            });
            outboundRecords.forEach((r) => {
              const month = r.createdAt?.substring(0, 7) || '未知';
              if (!monthMap.has(month)) monthMap.set(month, { inbound: 0, outbound: 0 });
              monthMap.get(month)!.outbound += r.quantity;
            });

            const trend: MonthlyTrend[] = Array.from(monthMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, data]) => ({ month, inbound: data.inbound, outbound: data.outbound }));

            if (!cancelled) setMonthlyTrend(trend.length > 0 ? trend : []);
          } catch {
            // 降级到空数据
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : '未知错误';
          setError(`报表数据加载失败: ${message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  /** 根据时间范围过滤月度趋势 */
  const getFilteredTrend = () => {
    if (timeRange === 'month') return monthlyTrend.slice(-1);
    if (timeRange === 'quarter') return monthlyTrend.slice(-3);
    return monthlyTrend;
  };

  const trendData = getFilteredTrend().map((d) => ({
    month: d.month.replace('2024-', '').replace('2023-', ''),
    入库: d.inbound,
    出库: d.outbound,
  }));

  /** 仓库容积数据 */
  const warehouseVolumeData = warehouses.map((wh) => ({
    name: wh.name,
    已用容积: wh.usedItems || wh.usedVolume,
    空闲容积: parseFloat(((wh.totalItems || wh.totalVolume) - (wh.usedItems || wh.usedVolume)).toFixed(1)),
  }));

  /** 按品类的库存容积分布 */
  const categoryData: Record<string, number> = {};
  inventory.forEach((item) => {
    categoryData[item.category] = (categoryData[item.category] ?? 0) + item.totalVolume;
  });
  const categoryChartData = Object.entries(categoryData)
    .map(([category, volume]) => ({ category, volume: parseFloat(volume.toFixed(1)) }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 8);

  /** 在途时效 */
  const transitEfficiencyData = [
    { month: '1月', avgDays: 18, onTimeRate: 92 },
    { month: '2月', avgDays: 16, onTimeRate: 95 },
    { month: '3月', avgDays: 21, onTimeRate: 88 },
    { month: '4月', avgDays: 19, onTimeRate: 90 },
    { month: '5月', avgDays: 17, onTimeRate: 94 },
    { month: '6月', avgDays: 22, onTimeRate: 85 },
  ];

  const handleExportCSV = (data: object[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0] as object).join(',');
    const rows = data.map((row) => Object.values(row as object).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">正在加载报表数据...</Typography>
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Time Range Selector */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>统计报表</Typography>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(_, v) => v && setTimeRange(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { px: 2, fontSize: '0.8rem' } }}
        >
          <ToggleButton value="month">本月</ToggleButton>
          <ToggleButton value="quarter">本季</ToggleButton>
          <ToggleButton value="year">本年</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={2}>
        {/* Monthly Inbound/Outbound Trend */}
        <Grid item xs={12} lg={7}>
          <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
            <CardHeader
              title={<Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>月度入出库趋势（件）</Typography>}
              action={
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExportCSV(getFilteredTrend(), 'monthly_trend.csv')}
                  sx={{ fontSize: '0.75rem' }}
                >
                  导出CSV
                </Button>
              }
            />
            <CardContent sx={{ pt: 0, pb: '16px !important' }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9e9e9e' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9e9e9e' }} />
                  <Tooltip contentStyle={{ fontSize: '0.8rem', borderRadius: 8, border: '1px solid #e0e0e0' }} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                  <Bar dataKey="入库" fill="#111827" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="出库" fill="#90caf9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Warehouse Volume */}
        <Grid item xs={12} lg={5}>
          <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
            <CardHeader
              title={<Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>各仓库容积分析（m³）</Typography>}
              action={
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExportCSV(warehouseVolumeData, 'warehouse_volume.csv')}
                  sx={{ fontSize: '0.75rem' }}
                >
                  导出CSV
                </Button>
              }
            />
            <CardContent sx={{ pt: 0, pb: '16px !important' }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={warehouseVolumeData} layout="vertical" margin={{ top: 5, right: 20, left: 50, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9e9e9e' }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#9e9e9e' }} width={65} />
                  <Tooltip contentStyle={{ fontSize: '0.8rem', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                  <Bar dataKey="已用容积" stackId="a" fill="#111827" />
                  <Bar dataKey="空闲容积" stackId="a" fill="#F3F4F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Category Volume */}
        <Grid item xs={12} lg={5}>
          <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
            <CardHeader
              title={<Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>按品类容积占用（m³）</Typography>}
              action={
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExportCSV(categoryChartData, 'category_volume.csv')}
                  sx={{ fontSize: '0.75rem' }}
                >
                  导出CSV
                </Button>
              }
            />
            <CardContent sx={{ pt: 0, pb: '16px !important' }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryChartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9e9e9e' }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: '#9e9e9e' }} width={70} />
                  <Tooltip contentStyle={{ fontSize: '0.8rem', borderRadius: 8 }} formatter={(v: number) => [`${v} m³`, '容积']} />
                  <Bar dataKey="volume" fill="#374151" radius={[0, 4, 4, 0]} name="占用容积(m³)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Transit Efficiency */}
        <Grid item xs={12} lg={7}>
          <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
            <CardHeader
              title={<Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>在途时效分析</Typography>}
              action={
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExportCSV(transitEfficiencyData, 'transit_efficiency.csv')}
                  sx={{ fontSize: '0.75rem' }}
                >
                  导出CSV
                </Button>
              }
            />
            <CardContent sx={{ pt: 0, pb: '16px !important' }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={transitEfficiencyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9e9e9e' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9e9e9e' }} domain={[0, 30]} label={{ value: '天数', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9e9e9e' }} domain={[75, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ fontSize: '0.8rem', borderRadius: 8, border: '1px solid #e0e0e0' }}
                    formatter={(value: number, name: string) => [
                      name === '平均在途天数' ? `${value} 天` : `${value}%`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                  <Line yAxisId="left" type="monotone" dataKey="avgDays" stroke="#111827" strokeWidth={2} dot={{ r: 4 }} name="平均在途天数" />
                  <Line yAxisId="right" type="monotone" dataKey="onTimeRate" stroke="#4caf50" strokeWidth={2} dot={{ r: 4 }} name="准时率%" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ReportsPanel;
