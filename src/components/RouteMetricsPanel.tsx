/**
 * RouteMetricsPanel — 路由命中率监控面板
 *
 * 展示 CDF Auto Model 路由决策的命中/降级统计：
 * - 4 张 KPI 卡片：总路由次数 / 绑定命中率 / 显式选择命中率 / 降级回落次数
 * - 员工命中率排行表（按 total 降序，可切换排序）
 * - 最近降级原因列表
 *
 * 数据来源：GET /api/staffdeck/route-metrics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import RouteIcon from '@mui/icons-material/AltRoute';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

import {
  getRouteMetrics,
  listAgentMetrics,
  type RouteMetricsSnapshot,
  type AgentMetricsList,
} from '../services/routeMetricsApi';
import { getGrayScale } from '../constants/theme';

// ===================== 工具函数 =====================

function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}:${ss}`;
}

function hitRateColor(rate: number, isDark: boolean): string {
  if (rate >= 0.8) return '#4caf50';
  if (rate >= 0.5) return '#ff9800';
  return '#f44336';
}

// ===================== KPI 卡片 =====================

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon, color }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  return (
    <Box sx={{ bgcolor: gs.bgPanel, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Box sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography variant="caption" sx={{ color: gs.textMuted, fontWeight: 500 }}>{label}</Typography>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: gs.textPrimary, lineHeight: 1.1 }}>{value}</Typography>
        {sub && <Typography variant="body2" sx={{ color: gs.textMuted, mt: 0.5 }}>{sub}</Typography>}
      </Box>
    </Box>
  );
};

// ===================== 主组件 =====================

const RouteMetricsPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [summary, setSummary] = useState<RouteMetricsSnapshot | null>(null);
  const [agentList, setAgentList] = useState<AgentMetricsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'total' | 'hitRate' | 'miss_fallback' | 'lastMissAt'>('total');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, agents] = await Promise.all([
        getRouteMetrics(),
        listAgentMetrics(sortBy, 200),
      ]);
      setSummary(sum);
      setAgentList(agents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载路由指标失败');
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    fetchData();
    // 30 秒自动刷新
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const hitPct = summary ? (summary.hitRate * 100).toFixed(1) : '0.0';
  const hitColor = summary ? hitRateColor(summary.hitRate, isDark) : '#999';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* 头部操作栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RouteIcon sx={{ color: gs.textMuted }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            路由命中率监控
          </Typography>
          <Chip
            size="small"
            label={`${hitPct}%`}
            sx={{
              bgcolor: `${hitColor}22`,
              color: hitColor,
              fontWeight: 700,
              ml: 0.5,
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {loading && <CircularProgress size={16} />}
          <Tooltip title="刷新">
            <IconButton size="small" onClick={fetchData} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI 卡片行 */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="总路由次数"
            value={summary?.total ?? '—'}
            sub="员工对话模型决策总数"
            icon={<TrendingUpIcon />}
            color="#2196f3"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="绑定命中"
            value={summary?.hit_binding ?? '—'}
            sub={`占比 ${summary && summary.total > 0 ? ((summary.hit_binding / summary.total) * 100).toFixed(1) : 0}%`}
            icon={<CheckCircleIcon />}
            color="#4caf50"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="显式选择命中"
            value={summary?.hit_explicit ?? '—'}
            sub={`占比 ${summary && summary.total > 0 ? ((summary.hit_explicit / summary.total) * 100).toFixed(1) : 0}%`}
            icon={<TouchAppIcon />}
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="降级回落 Auto"
            value={summary?.miss_fallback ?? '—'}
            sub={summary?.lastMissAt ? `最近: ${formatTime(summary.lastMissAt)}` : '无降级记录'}
            icon={<WarningAmberIcon />}
            color="#ff9800"
          />
        </Grid>
      </Grid>

      {/* 命中率进度条 */}
      {summary && summary.total > 0 && (
        <Box sx={{ bgcolor: gs.bgPanel, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" sx={{ color: gs.textMuted, fontWeight: 500 }}>
                综合命中率
              </Typography>
              <Typography variant="body2" sx={{ color: hitColor, fontWeight: 700 }}>
                {hitPct}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={summary.hitRate * 100}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: `${hitColor}22`,
                '& .MuiLinearProgress-bar': { bgcolor: hitColor },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#4caf50' }}>
                绑定+显式: {summary.hit_binding + summary.hit_explicit}
              </Typography>
              <Typography variant="caption" sx={{ color: '#ff9800' }}>
                降级: {summary.miss_fallback}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* 员工排行表 */}
      <Box sx={{ bgcolor: gs.bgPanel, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
              员工路由命中率排行
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {([
                { key: 'total', label: '次数' },
                { key: 'hitRate', label: '命中率' },
                { key: 'miss_fallback', label: '降级' },
                { key: 'lastMissAt', label: '最近降级' },
              ] as const).map((opt) => (
                <Chip
                  key={opt.key}
                  size="small"
                  label={opt.label}
                  variant={sortBy === opt.key ? 'filled' : 'outlined'}
                  color={sortBy === opt.key ? 'primary' : 'default'}
                  onClick={() => setSortBy(opt.key)}
                  sx={{ fontSize: 12 }}
                />
              ))}
            </Box>
          </Box>
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, color: gs.textMuted, borderBottom: `1px solid ${gs.border}` } }}>
                  <TableCell>员工 ID</TableCell>
                  <TableCell align="right">总次数</TableCell>
                  <TableCell align="right">绑定命中</TableCell>
                  <TableCell align="right">显式命中</TableCell>
                  <TableCell align="right">降级</TableCell>
                  <TableCell align="center" sx={{ minWidth: 120 }}>命中率</TableCell>
                  <TableCell align="right">最近降级</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agentList?.items.map((item) => {
                  const rate = item.total > 0 ? item.hitRate : 0;
                  const pct = (rate * 100).toFixed(1);
                  const c = hitRateColor(rate, isDark);
                  return (
                    <TableRow key={item.agentId} sx={{ '&:hover': { bgcolor: gs.bgHover }, '& td': { borderBottom: `1px solid ${gs.border}` } }}>
                      <TableCell sx={{ color: gs.textPrimary, fontFamily: 'monospace', fontSize: 13 }}>
                        {item.agentId}
                      </TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>{item.total}</TableCell>
                      <TableCell align="right" sx={{ color: '#4caf50' }}>{item.hit_binding}</TableCell>
                      <TableCell align="right" sx={{ color: '#9c27b0' }}>{item.hit_explicit}</TableCell>
                      <TableCell align="right" sx={{ color: item.miss_fallback > 0 ? '#ff9800' : gs.textMuted }}>
                        {item.miss_fallback}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                          <Box sx={{ width: 60 }}>
                            <LinearProgress
                              variant="determinate"
                              value={rate * 100}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: `${c}22`,
                                '& .MuiLinearProgress-bar': { bgcolor: c },
                              }}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ color: c, fontWeight: 600, minWidth: 36 }}>
                            {pct}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ color: gs.textMuted, fontSize: 12 }}>
                        {formatTime(item.lastMissAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {agentList && agentList.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ color: gs.textMuted, py: 3 }}>
                      暂无路由记录（员工对话后将自动统计）
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      {/* 最近降级原因 */}
      {summary && summary.recentMissReasons.length > 0 && (
        <Box sx={{ bgcolor: gs.bgPanel, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
              最近降级原因（最近 {summary.recentMissReasons.length} 条）
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {summary.recentMissReasons.map((reason, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: isDark ? 'rgba(255,152,0,0.08)' : 'rgba(255,152,0,0.05)',
                    border: '1px solid rgba(255,152,0,0.2)',
                  }}
                >
                  <WarningAmberIcon sx={{ color: '#ff9800', fontSize: 18, mt: 0.1 }} />
                  <Typography variant="body2" sx={{ color: gs.textPrimary, fontSize: 13, flex: 1 }}>
                    {reason}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Typography variant="caption" sx={{ color: gs.textMuted, textAlign: 'center', mt: 0.5 }}>
        数据为内存计数器，进程重启后清零 · 每 30 秒自动刷新
      </Typography>
    </Box>
  );
};

export default RouteMetricsPanel;
