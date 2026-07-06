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
import { getGrayScale } from '../constants/theme';

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
    </Box>
  );
};

export default SystemMonitorPage;