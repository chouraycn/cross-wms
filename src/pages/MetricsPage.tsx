import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
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
  TextField,
  CircularProgress,
  IconButton,
  Divider,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SpeedIcon from '@mui/icons-material/Speed';
import MemoryIcon from '@mui/icons-material/Memory';
import ExtensionIcon from '@mui/icons-material/Extension';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import TimerIcon from '@mui/icons-material/Timer';
import ReplayIcon from '@mui/icons-material/Replay';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentIcon from '@mui/icons-material/Assessment';

import {
  getCurrentMetrics,
  getHistoryMetrics,
  recordCustomMetric,
  getCustomMetric,
  getCustomMetricNames,
} from '../services/metricsApi';
import type { SystemMetrics, CustomMetricSeries } from '../services/metricsApi';
import { getGrayScale } from '../constants/theme';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
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

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function MiniChart({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  return (
    <Box sx={{ height: 40, display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
      {data.map((value, index) => (
        <Box
          key={index}
          sx={{
            flex: 1,
            backgroundColor: color,
            height: `${((value - min) / range) * 100}%`,
            minHeight: 4,
            borderRadius: 1,
          }}
        />
      ))}
    </Box>
  );
}

const MetricsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [currentMetrics, setCurrentMetrics] = useState<SystemMetrics | null>(null);
  const [historyMetrics, setHistoryMetrics] = useState<SystemMetrics[]>([]);
  const [customMetricNames, setCustomMetricNames] = useState<string[]>([]);
  const [selectedCustomMetric, setSelectedCustomMetric] = useState<CustomMetricSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [customMetricName, setCustomMetricName] = useState('');
  const [customMetricValue, setCustomMetricValue] = useState('');
  const [customMetricLabels, setCustomMetricLabels] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await getCurrentMetrics();
      setCurrentMetrics(current);
      setLastUpdate(new Date());

      const history = await getHistoryMetrics(60);
      setHistoryMetrics(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomMetricNames = useCallback(async () => {
    try {
      const names = await getCustomMetricNames();
      setCustomMetricNames(names);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    loadCustomMetricNames();

    const interval = setInterval(() => {
      loadMetrics();
      loadCustomMetricNames();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadMetrics, loadCustomMetricNames]);

  const handleLoadCustomMetric = async (name: string) => {
    try {
      const series = await getCustomMetric(name);
      setSelectedCustomMetric(series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRecordCustomMetric = async () => {
    if (!customMetricName.trim() || !customMetricValue.trim()) {
      setError('请填写指标名称和值');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSubmitSuccess(false);

    try {
      let labels: Record<string, string> | undefined;
      if (customMetricLabels.trim()) {
        try {
          labels = JSON.parse(customMetricLabels);
        } catch {
          setError('标签格式错误，应为 JSON 对象');
          setSubmitting(false);
          return;
        }
      }

      await recordCustomMetric(customMetricName.trim(), {
        value: parseFloat(customMetricValue),
        labels,
      });

      setSubmitSuccess(true);
      setCustomMetricName('');
      setCustomMetricValue('');
      setCustomMetricLabels('');
      await loadCustomMetricNames();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const cpuHistory = useMemo(() => historyMetrics.map(m => m.cpu.usage), [historyMetrics]);
  const memoryHistory = useMemo(() => historyMetrics.map(m => m.memory.percentage), [historyMetrics]);
  const diskHistory = useMemo(() => historyMetrics.map(m => m.disk.percentage), [historyMetrics]);
  const networkHistory = useMemo(() => historyMetrics.map(m => m.network.rx + m.network.tx), [historyMetrics]);

  const getStatusColor = (value: number, highThreshold: number = 80, lowThreshold: number = 60): 'success' | 'warning' | 'error' => {
    if (value >= highThreshold) return 'error';
    if (value >= lowThreshold) return 'warning';
    return 'success';
  };

  if (!currentMetrics && !loading && error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="contained" onClick={loadMetrics} startIcon={<RefreshIcon />}>重试</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto', backgroundColor: gs.bgPage }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} sx={{ color: gs.textPrimary }}>系统指标</Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {loading && <CircularProgress size={20} />}
          <IconButton onClick={loadMetrics} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: gs.textPrimary }}>
            <AssessmentIcon sx={{ mr: 1, fontSize: 20 }} />
            当前系统指标
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <SpeedIcon color="primary" />
                    <Typography variant="body2" color="text.secondary">CPU 使用率</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600} sx={{ color: gs.textPrimary }}>
                    {currentMetrics ? currentMetrics.cpu.usage.toFixed(1) : '-'}%
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={currentMetrics?.cpu.usage || 0}
                      color={getStatusColor(currentMetrics?.cpu.usage || 0)}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {currentMetrics ? `${currentMetrics.cpu.cores} 核` : '-'}
                  </Typography>
                  <MiniChart data={cpuHistory} color={theme.palette.primary.main} />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <MemoryIcon color="secondary" />
                    <Typography variant="body2" color="text.secondary">内存使用</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600} sx={{ color: gs.textPrimary }}>
                    {currentMetrics ? formatBytes(currentMetrics.memory.used) : '-'}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={currentMetrics?.memory.percentage || 0}
                      color={getStatusColor(currentMetrics?.memory.percentage || 0, 90, 70)}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {currentMetrics ? `${currentMetrics.memory.percentage.toFixed(1)}% / ${formatBytes(currentMetrics.memory.total)}` : '-'}
                  </Typography>
                  <MiniChart data={memoryHistory} color={theme.palette.secondary.main} />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <ExtensionIcon color="info" />
                    <Typography variant="body2" color="text.secondary">磁盘使用</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600} sx={{ color: gs.textPrimary }}>
                    {currentMetrics ? formatBytes(currentMetrics.disk.used) : '-'}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={currentMetrics?.disk.percentage || 0}
                      color={getStatusColor(currentMetrics?.disk.percentage || 0, 95, 80)}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {currentMetrics ? `${currentMetrics.disk.percentage.toFixed(1)}% / ${formatBytes(currentMetrics.disk.total)}` : '-'}
                  </Typography>
                  <MiniChart data={diskHistory} color={theme.palette.info.main} />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <NetworkCheckIcon color="success" />
                    <Typography variant="body2" color="text.secondary">网络 I/O</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600} sx={{ color: gs.textPrimary }}>
                    {currentMetrics ? `${formatBytes(currentMetrics.network.rx)}/s` : '-'}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      label={`上传: ${currentMetrics ? formatBytes(currentMetrics.network.tx) : '-'}s`}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip
                      label={`下载: ${currentMetrics ? formatBytes(currentMetrics.network.rx) : '-'}s`}
                      size="small"
                    />
                  </Box>
                  <MiniChart data={networkHistory} color={theme.palette.success.main} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ mt: 3, backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: gs.textPrimary }}>
                <TimerIcon sx={{ mr: 1, fontSize: 20 }} />
                系统信息
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>运行时间</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics ? formatDuration(currentMetrics.uptime) : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>进程 ID</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics?.process.pid || '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>进程内存</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics ? formatBytes(currentMetrics.process.memoryUsage) : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>进程 CPU</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics ? `${currentMetrics.process.cpuUsage.toFixed(1)}%` : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>CPU 负载</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics ? currentMetrics.cpu.loadAverage.slice(0, 3).join(', ') : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>可用内存</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics ? formatBytes(currentMetrics.memory.available) : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: gs.textSecondary }}>磁盘剩余</TableCell>
                      <TableCell align="right" sx={{ color: gs.textPrimary }}>
                        {currentMetrics ? formatBytes(currentMetrics.disk.free) : '-'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3, backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: gs.textPrimary }}>
                <TrendingUpIcon sx={{ mr: 1, fontSize: 20 }} />
                历史趋势（最近 60 分钟）
              </Typography>
              {historyMetrics.length > 0 ? (
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>CPU 使用率趋势</Typography>
                    <MiniChart data={cpuHistory} color={theme.palette.primary.main} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>内存使用率趋势</Typography>
                    <MiniChart data={memoryHistory} color={theme.palette.secondary.main} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>磁盘使用率趋势</Typography>
                    <MiniChart data={diskHistory} color={theme.palette.info.main} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>网络流量趋势</Typography>
                    <MiniChart data={networkHistory} color={theme.palette.success.main} />
                  </Grid>
                </Grid>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>暂无历史数据</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: gs.textPrimary }}>自定义指标</Typography>

          <Card sx={{ backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, color: gs.textPrimary }}>
                <ReplayIcon sx={{ mr: 1, fontSize: 18 }} />
                记录新指标
              </Typography>
              {submitSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>指标记录成功</Alert>
              )}
              <TextField
                label="指标名称"
                fullWidth
                value={customMetricName}
                onChange={(e) => setCustomMetricName(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
              />
              <TextField
                label="指标值"
                type="number"
                fullWidth
                value={customMetricValue}
                onChange={(e) => setCustomMetricValue(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
              />
              <TextField
                label="标签 (可选，JSON)"
                fullWidth
                value={customMetricLabels}
                onChange={(e) => setCustomMetricLabels(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
                helperText="例如: {type: 'test'}"
              />
              <Button
                variant="contained"
                fullWidth
                onClick={handleRecordCustomMetric}
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} /> : <ReplayIcon />}
              >
                {submitting ? '提交中...' : '记录指标'}
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3, backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, color: gs.textPrimary }}>指标列表</Typography>
              {customMetricNames.length > 0 ? (
                <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {customMetricNames.map((name) => (
                    <Button
                      key={name}
                      fullWidth
                      variant={selectedCustomMetric?.name === name ? 'contained' : 'outlined'}
                      onClick={() => handleLoadCustomMetric(name)}
                      sx={{ justifyContent: 'flex-start', mb: 1 }}
                    >
                      {name}
                    </Button>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>暂无自定义指标</Typography>
              )}
            </CardContent>
          </Card>

          {selectedCustomMetric && (
            <Card sx={{ mt: 3, backgroundColor: gs.bgPanel, border: `1px solid ${gs.border}` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ color: gs.textPrimary }}>
                    {selectedCustomMetric.name}
                  </Typography>
                  <Button size="small" onClick={() => setSelectedCustomMetric(null)}>关闭</Button>
                </Box>
                {selectedCustomMetric.records.length > 0 ? (
                  <TableContainer sx={{ maxHeight: 250 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ color: gs.textSecondary }}>时间</TableCell>
                          <TableCell sx={{ color: gs.textSecondary }} align="right">值</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedCustomMetric.records.slice(-20).reverse().map((record, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ color: gs.textPrimary }}>
                              {formatTimestamp(record.timestamp)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: gs.textPrimary }}>
                              {record.value}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography color="text.secondary" align="center" sx={{ py: 4 }}>暂无数据</Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default MetricsPage;