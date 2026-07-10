/**
 * SystemMonitorPage — 系统监控面板
 *
 * 展示插件、扩展、消息、内存等系统运行指标。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  IconButton,
  Button,
  Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import ExtensionIcon from '@mui/icons-material/Extension';
import HubIcon from '@mui/icons-material/Hub';
import MessageIcon from '@mui/icons-material/Message';
import TimerIcon from '@mui/icons-material/Timer';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import ReplayIcon from '@mui/icons-material/Replay';

import type { SystemMetricsData } from '../services/metrics/api';
import {
  fetchCurrentMetrics,
  fetchMetricsHistory,
} from '../services/metrics/api';
import {
  getPerformanceSummary,
  getPerformanceSnapshots,
  getHealthStatus,
  subscribeToHealthUpdates,
} from '../services/systemMonitorApi';
import type {
  PerformanceSnapshot,
  HealthStatus,
} from '../services/systemMonitorApi';
import { getGrayScale } from '../constants/theme';
import SpeedIcon from '@mui/icons-material/Speed';
import AssessmentIcon from '@mui/icons-material/Assessment';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import CloudOffIcon from '@mui/icons-material/CloudOff';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  if (parts.length === 0) parts.push(`${secs}秒`);
  return parts.join(' ');
}

const SystemMonitorPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [metrics, setMetrics] = useState<SystemMetricsData | null>(null);
  const [history, setHistory] = useState<SystemMetricsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // 性能数据
  const [performanceSummary, setPerformanceSummary] = useState<{
    avgResponseTime: number;
    totalRequests: number;
    errorRate: number;
    slowestOperations: PerformanceSnapshot[];
  } | null>(null);
  const [performanceSnapshots, setPerformanceSnapshots] = useState<PerformanceSnapshot[]>([]);

  // 健康状态
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await fetchCurrentMetrics();
      setMetrics(current);
      setLastUpdate(new Date());

      const hist = await fetchMetricsHistory(60);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();

    // 每 10 秒自动刷新
    const interval = setInterval(() => {
      loadMetrics();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadMetrics]);

  // 加载性能数据
  useEffect(() => {
    let cancelled = false;

    const loadPerformance = async () => {
      try {
        const [summary, snapshotsResp] = await Promise.all([
          getPerformanceSummary(),
          getPerformanceSnapshots(),
        ]);
        if (cancelled) return;
        setPerformanceSummary(summary);
        setPerformanceSnapshots(snapshotsResp.snapshots);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    loadPerformance();
    const interval = setInterval(loadPerformance, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // 订阅健康状态实时更新
  useEffect(() => {
    let cancelled = false;

    // 首次拉取一次
    getHealthStatus()
      .then((status) => {
        if (!cancelled) setHealthStatus(status);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    // 通过 SSE 订阅实时更新
    const unsubscribe = subscribeToHealthUpdates((status) => {
      setHealthStatus(status);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const memoryUsagePercent = useMemo(() => {
    if (!metrics) return 0;
    return (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
  }, [metrics]);

  const pluginHealthPercent = useMemo(() => {
    if (!metrics || metrics.plugins.total === 0) return 100;
    return (metrics.plugins.enabled / metrics.plugins.total) * 100;
  }, [metrics]);

  const extHealthPercent = useMemo(() => {
    if (!metrics || metrics.extensions.total === 0) return 100;
    return (metrics.extensions.enabled / metrics.extensions.total) * 100;
  }, [metrics]);

  const messageSuccessRate = useMemo(() => {
    if (!metrics || metrics.messages.total === 0) return 100;
    const completed = metrics.messages.completed;
    const total = metrics.messages.total;
    return (completed / total) * 100;
  }, [metrics]);

  if (!metrics && !loading && error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={loadMetrics} startIcon={<RefreshIcon />}>
          重试
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            系统监控
          </Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {loading && <LinearProgress sx={{ width: 100 }} />}
          <IconButton onClick={loadMetrics} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* 插件 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ExtensionIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  插件状态
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {metrics?.plugins.enabled ?? '-'}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}/ {metrics?.plugins.total ?? '-'}
                </Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={pluginHealthPercent}
                  color={pluginHealthPercent >= 80 ? 'success' : pluginHealthPercent >= 50 ? 'warning' : 'error'}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
              {metrics && metrics.plugins.errors > 0 && (
                <Chip
                  icon={<ErrorOutlineIcon />}
                  label={`${metrics.plugins.errors} 错误`}
                  color="error"
                  size="small"
                  sx={{ mt: 1 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 扩展 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <HubIcon color="secondary" />
                <Typography variant="body2" color="text.secondary">
                  扩展状态
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {metrics?.extensions.enabled ?? '-'}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}/ {metrics?.extensions.total ?? '-'}
                </Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={extHealthPercent}
                  color={extHealthPercent >= 80 ? 'success' : extHealthPercent >= 50 ? 'warning' : 'error'}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 消息 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MessageIcon color="info" />
                <Typography variant="body2" color="text.secondary">
                  消息状态
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {metrics?.messages.active ?? '-'}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}活跃
                </Typography>
              </Typography>
              <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {metrics && (
                  <>
                    <Chip
                      icon={<CheckCircleIcon />}
                      label={`完成 ${metrics.messages.completed}`}
                      color="success"
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      icon={<ErrorOutlineIcon />}
                      label={`失败 ${metrics.messages.failed}`}
                      color="error"
                      size="small"
                      variant="outlined"
                    />
                  </>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 内存 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MemoryIcon color="warning" />
                <Typography variant="body2" color="text.secondary">
                  内存使用
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {metrics ? formatBytes(metrics.memory.heapUsed) : '-'}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={memoryUsagePercent}
                  color={memoryUsagePercent >= 90 ? 'error' : memoryUsagePercent >= 70 ? 'warning' : 'success'}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {metrics ? `${formatBytes(metrics.memory.heapUsed)} / ${formatBytes(metrics.memory.heapTotal)}` : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 详细信息 */}
      <Grid container spacing={3}>
        {/* 扩展类型分布 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                扩展类型分布
              </Typography>
              {metrics && Object.keys(metrics.extensions.byKind).length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>类型</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell>占比</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.extensions.byKind)
                        .sort(([, a], [, b]) => b - a)
                        .map(([kind, count]) => {
                          const total = metrics.extensions.total || 1;
                          const percent = (count / total) * 100;
                          return (
                            <TableRow key={kind}>
                              <TableCell>
                                <Chip label={kind} size="small" />
                              </TableCell>
                              <TableCell align="right">{count}</TableCell>
                              <TableCell sx={{ width: '50%' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={percent}
                                    sx={{ flex: 1, height: 8, borderRadius: 4 }}
                                  />
                                  <Typography variant="caption" sx={{ minWidth: 40 }}>
                                    {percent.toFixed(1)}%
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无扩展数据
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 消息生命周期分布 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                消息生命周期
              </Typography>
              {metrics && Object.keys(metrics.messages.byPhase).length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>阶段</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell>占比</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.messages.byPhase)
                        .sort(([, a], [, b]) => b - a)
                        .map(([phase, count]) => {
                          const total = metrics.messages.total || 1;
                          const percent = (count / total) * 100;
                          return (
                            <TableRow key={phase}>
                              <TableCell>
                                <Chip
                                  label={phase}
                                  size="small"
                                  color={
                                    phase === 'sent' || phase === 'delivered' || phase === 'read'
                                      ? 'success'
                                      : phase === 'failed'
                                      ? 'error'
                                      : phase === 'active'
                                      ? 'info'
                                      : 'default'
                                  }
                                />
                              </TableCell>
                              <TableCell align="right">{count}</TableCell>
                              <TableCell sx={{ width: '50%' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={percent}
                                    sx={{ flex: 1, height: 8, borderRadius: 4 }}
                                  />
                                  <Typography variant="caption" sx={{ minWidth: 40 }}>
                                    {percent.toFixed(1)}%
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无消息数据
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 重试队列 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                重试队列
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <PendingIcon color="info" sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                      {metrics?.retryQueue.queued ?? '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      队列中
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <ReplayIcon color="warning" sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                      {metrics?.retryQueue.processing ?? '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      处理中
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <ErrorOutlineIcon color="error" sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                      {metrics?.retryQueue.deadLetter ?? '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      死信
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* 系统信息 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                系统信息
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>运行时间</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                          <TimerIcon fontSize="small" color="action" />
                          <Typography>
                            {metrics ? formatDuration(metrics.uptime) : '-'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>RSS 内存</TableCell>
                      <TableCell align="right">
                        {metrics ? formatBytes(metrics.memory.rss) : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>外部内存</TableCell>
                      <TableCell align="right">
                        {metrics ? formatBytes(metrics.memory.external) : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>消息成功率</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${messageSuccessRate.toFixed(1)}%`}
                          color={messageSuccessRate >= 95 ? 'success' : messageSuccessRate >= 80 ? 'warning' : 'error'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ===== 性能监控 ===== */}
      <Box sx={{ mt: 4, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <SpeedIcon color="primary" />
        <Typography variant="h5" fontWeight={600}>
          性能监控
        </Typography>
      </Box>

      {/* 性能 KPI 卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* 平均响应时间 */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TimerIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  平均响应时间
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {performanceSummary ? performanceSummary.avgResponseTime.toFixed(2) : '-'}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}ms
                </Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                {performanceSummary && (
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(performanceSummary.avgResponseTime / 10, 100)}
                    color={
                      performanceSummary.avgResponseTime >= 1000
                        ? 'error'
                        : performanceSummary.avgResponseTime >= 500
                        ? 'warning'
                        : 'success'
                    }
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 总请求数 */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AssessmentIcon color="info" />
                <Typography variant="body2" color="text.secondary">
                  总请求数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {performanceSummary ? performanceSummary.totalRequests.toLocaleString() : '-'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                累计处理请求
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 错误率 */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorOutlineIcon color="error" />
                <Typography variant="body2" color="text.secondary">
                  错误率
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {performanceSummary ? performanceSummary.errorRate.toFixed(2) : '-'}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}%
                </Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                {performanceSummary && (
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(performanceSummary.errorRate, 100)}
                    color={
                      performanceSummary.errorRate >= 10
                        ? 'error'
                        : performanceSummary.errorRate >= 5
                        ? 'warning'
                        : 'success'
                    }
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 最慢操作列表 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            最慢操作
          </Typography>
          {performanceSummary && performanceSummary.slowestOperations.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>操作名称</TableCell>
                    <TableCell align="right">耗时 (ms)</TableCell>
                    <TableCell align="right">时间戳</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {performanceSummary.slowestOperations.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>
                        <Chip label={op.operation} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(op.duration / 10, 100)}
                            sx={{ width: 60, height: 6, borderRadius: 3 }}
                            color={op.duration >= 1000 ? 'error' : op.duration >= 500 ? 'warning' : 'success'}
                          />
                          <Typography variant="body2" fontWeight={600}>
                            {op.duration.toFixed(2)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" color="text.secondary">
                          {new Date(op.timestamp).toLocaleString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              暂无性能数据
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ===== 健康状态 ===== */}
      <Box sx={{ mt: 4, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <HealthAndSafetyIcon color="success" />
        <Typography variant="h5" fontWeight={600}>
          健康状态
        </Typography>
        {healthStatus && (
          <Chip
            label={
              healthStatus.status === 'healthy'
                ? '健康'
                : healthStatus.status === 'degraded'
                ? '降级'
                : '异常'
            }
            color={
              healthStatus.status === 'healthy'
                ? 'success'
                : healthStatus.status === 'degraded'
                ? 'warning'
                : 'error'
            }
            size="small"
            sx={{ ml: 1 }}
          />
        )}
      </Box>

      <Grid container spacing={3}>
        {/* 健康检查 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                健康检查
              </Typography>
              {healthStatus && healthStatus.checks.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>状态</TableCell>
                        <TableCell>名称</TableCell>
                        <TableCell align="right">延迟 (ms)</TableCell>
                        <TableCell>消息</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {healthStatus.checks.map((check) => (
                        <TableRow key={check.name}>
                          <TableCell>
                            <Chip
                              icon={
                                check.status === 'up' ? (
                                  <CheckCircleIcon />
                                ) : check.status === 'down' ? (
                                  <CloudOffIcon />
                                ) : (
                                  <ErrorOutlineIcon />
                                )
                              }
                              label={check.status === 'up' ? '正常' : check.status === 'down' ? '宕机' : '降级'}
                              color={
                                check.status === 'up'
                                  ? 'success'
                                  : check.status === 'down'
                                  ? 'error'
                                  : 'warning'
                              }
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{check.name}</TableCell>
                          <TableCell align="right">{check.latency.toFixed(2)}</TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {check.message || '-'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无健康检查数据
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 通道状态 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                通道状态
              </Typography>
              {healthStatus && healthStatus.channels.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>状态</TableCell>
                        <TableCell>名称</TableCell>
                        <TableCell>类型</TableCell>
                        <TableCell align="right">延迟 (ms)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {healthStatus.channels.map((channel) => (
                        <TableRow key={channel.name}>
                          <TableCell>
                            <Chip
                              icon={
                                channel.status === 'up' ? <CheckCircleIcon /> : <CloudOffIcon />
                              }
                              label={channel.status === 'up' ? '正常' : '宕机'}
                              color={channel.status === 'up' ? 'success' : 'error'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{channel.name}</TableCell>
                          <TableCell>
                            <Chip label={channel.type} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell align="right">{channel.latency.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无通道数据
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemMonitorPage;