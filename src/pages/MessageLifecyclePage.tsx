/**
 * MessageLifecyclePage — 消息生命周期监控页面
 *
 * 展示消息生命周期统计、活跃消息、失败消息、重试队列、死信队列等
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  IconButton,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MessageIcon from '@mui/icons-material/Message';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PendingIcon from '@mui/icons-material/Pending';
import ReplayIcon from '@mui/icons-material/Replay';
import CancelIcon from '@mui/icons-material/Cancel';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TimerIcon from '@mui/icons-material/Timer';
import InboxIcon from '@mui/icons-material/Inbox';
import SendIcon from '@mui/icons-material/Send';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';

import {
  getLifecycleStats,
  getActiveMessages,
  getFailedMessages,
  getMessageState,
  getMessageAuditLog,
  cancelMessage,
  cleanupExpired,
  getRetryStats,
  getRetryQueue,
  getDeadLetterItems,
  processNextRetry,
  startRetryQueue,
  stopRetryQueue,
  clearDeadLetter,
} from '../services/messageLifecycleApi';
import type {
  LifecycleStats,
  MessageState,
  StateTransition,
  RetryStats,
  DeadLetterItem,
  RetryQueueSize,
} from '../services/messageLifecycleApi';
import { getGrayScale } from '../constants/theme';

// 格式化时间戳
function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

// 格式化相对时间
function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return `${seconds}秒前`;
}

// 获取状态对应的颜色和图标
function getStatusChip(status: MessageState['status']) {
  const config: Record<string, { color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'; icon: React.ReactElement; label: string }> = {
    pending: { color: 'default', icon: <PendingIcon />, label: '待处理' },
    processing: { color: 'info', icon: <SendIcon />, label: '处理中' },
    sent: { color: 'primary', icon: <SendIcon />, label: '已发送' },
    delivered: { color: 'success', icon: <DoneAllIcon />, label: '已送达' },
    read: { color: 'success', icon: <RemoveRedEyeIcon />, label: '已阅读' },
    failed: { color: 'error', icon: <ErrorOutlineIcon />, label: '失败' },
    cancelled: { color: 'warning', icon: <CancelIcon />, label: '已取消' },
  };
  return config[status] || { color: 'default', icon: <PendingIcon />, label: status };
}

const MessageLifecyclePage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [stats, setStats] = useState<LifecycleStats | null>(null);
  const [activeMessages, setActiveMessages] = useState<MessageState[]>([]);
  const [failedMessages, setFailedMessages] = useState<MessageState[]>([]);
  const [retryStats, setRetryStats] = useState<RetryStats | null>(null);
  const [retryQueueSize, setRetryQueueSize] = useState<RetryQueueSize | null>(null);
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // 消息详情对话框
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<MessageState | null>(null);
  const [auditLog, setAuditLog] = useState<StateTransition[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 取消消息对话框
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // 清空死信对话框
  const [clearDeadLetterDialogOpen, setClearDeadLetterDialogOpen] = useState(false);

  // 加载所有数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        statsData,
        activeData,
        failedData,
        retryStatsData,
        retryQueueData,
        deadLetterData,
      ] = await Promise.all([
        getLifecycleStats(),
        getActiveMessages(),
        getFailedMessages(),
        getRetryStats(),
        getRetryQueue(),
        getDeadLetterItems(50),
      ]);

      setStats(statsData);
      setActiveMessages(activeData);
      setFailedMessages(failedData);
      setRetryStats(retryStatsData);
      setRetryQueueSize(retryQueueData);
      setDeadLetterItems(deadLetterData);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // 每 10 秒自动刷新
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // 查看消息详情
  const handleViewDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailDialogOpen(true);
    try {
      const [state, log] = await Promise.all([
        getMessageState(id),
        getMessageAuditLog(id),
      ]);
      setSelectedMessage(state);
      setAuditLog(log);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDetailDialogOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // 取消消息
  const handleCancelMessage = async () => {
    if (!cancelTargetId) return;
    try {
      await cancelMessage(cancelTargetId, cancelReason || 'Cancelled by user');
      setCancelDialogOpen(false);
      setCancelTargetId(null);
      setCancelReason('');
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 清理过期消息
  const handleCleanup = async () => {
    try {
      const result = await cleanupExpired();
      if (result.cleaned > 0) {
        loadData();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 启动/停止重试队列
  const handleToggleRetryQueue = async () => {
    try {
      if (retryStats?.isRunning) {
        await stopRetryQueue();
      } else {
        await startRetryQueue();
      }
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 手动处理重试
  const handleProcessNextRetry = async () => {
    try {
      await processNextRetry();
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 清空死信队列
  const handleClearDeadLetter = async () => {
    try {
      await clearDeadLetter();
      setClearDeadLetterDialogOpen(false);
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 计算活跃消息占比
  const activePercent = stats ? (stats.active / (stats.total || 1)) * 100 : 0;
  const failedPercent = stats ? (stats.failed / (stats.total || 1)) * 100 : 0;

  if (!stats && !loading && error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={loadData} startIcon={<RefreshIcon />}>
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
            消息生命周期监控
          </Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {loading && <LinearProgress sx={{ width: 100 }} />}
          <Tooltip title="刷新数据">
            <IconButton onClick={loadData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="清理过期消息">
            <IconButton onClick={handleCleanup} disabled={loading}>
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* 总消息数 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MessageIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  总消息数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.total ?? '-'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                累计消息数量
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 活跃消息 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PendingIcon color="info" />
                <Typography variant="body2" color="text.secondary">
                  活跃消息
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.active ?? '-'}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={activePercent}
                  color="info"
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 成功消息 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="text.secondary">
                  成功消息
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.completed ?? '-'}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={stats ? (stats.completed / (stats.total || 1)) * 100 : 0}
                  color="success"
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 失败消息 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorOutlineIcon color="error" />
                <Typography variant="body2" color="text.secondary">
                  失败消息
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.failed ?? '-'}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={failedPercent}
                  color={failedPercent >= 10 ? 'error' : failedPercent >= 5 ? 'warning' : 'success'}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 详细信息 */}
      <Grid container spacing={3}>
        {/* 活跃消息列表 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  活跃消息
                </Typography>
                <Chip label={activeMessages.length} color="info" size="small" />
              </Box>
              {activeMessages.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>状态</TableCell>
                        <TableCell>ID</TableCell>
                        <TableCell>创建时间</TableCell>
                        <TableCell>更新时间</TableCell>
                        <TableCell align="right">操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeMessages.slice(0, 20).map((msg) => {
                        const statusConfig = getStatusChip(msg.status);
                        return (
                          <TableRow key={msg.id}>
                            <TableCell>
                              <Chip
                                icon={statusConfig.icon}
                                label={statusConfig.label}
                                color={statusConfig.color}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                {msg.id}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                {formatRelativeTime(msg.createdAt)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                {formatRelativeTime(msg.updatedAt)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="查看详情">
                                <IconButton size="small" onClick={() => handleViewDetail(msg.id)}>
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="取消消息">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setCancelTargetId(msg.id);
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无活跃消息
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 失败消息列表 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  失败消息
                </Typography>
                <Chip label={failedMessages.length} color="error" size="small" />
              </Box>
              {failedMessages.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>错误信息</TableCell>
                        <TableCell align="right">重试次数</TableCell>
                        <TableCell>失败时间</TableCell>
                        <TableCell align="right">操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {failedMessages.slice(0, 20).map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell>
                            <Typography variant="caption" sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                              {msg.id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              color="error"
                              sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                            >
                              {msg.error || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={`${msg.retryCount}/${msg.maxRetries}`}
                              size="small"
                              color={msg.retryCount >= msg.maxRetries ? 'error' : 'warning'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {formatRelativeTime(msg.updatedAt)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="查看详情">
                              <IconButton size="small" onClick={() => handleViewDetail(msg.id)}>
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无失败消息
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 重试队列 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  重试队列
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant={retryStats?.isRunning ? 'outlined' : 'contained'}
                    color={retryStats?.isRunning ? 'error' : 'primary'}
                    startIcon={retryStats?.isRunning ? <StopIcon /> : <PlayArrowIcon />}
                    onClick={handleToggleRetryQueue}
                  >
                    {retryStats?.isRunning ? '停止' : '启动'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ReplayIcon />}
                    onClick={handleProcessNextRetry}
                  >
                    手动处理
                  </Button>
                </Box>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: gs.bgHover, borderRadius: 2 }}>
                    <InboxIcon color="info" sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                      {retryStats?.size ?? retryQueueSize?.data ?? '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      队列中
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: gs.bgHover, borderRadius: 2 }}>
                    <ReplayIcon color="warning" sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                      {retryStats?.processing ?? '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      处理中
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: gs.bgHover, borderRadius: 2 }}>
                    <TimerIcon color="success" sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                      {retryStats?.successCount ?? '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      成功数
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  运行状态: {retryStats?.isRunning ? '运行中' : '已停止'}
                </Typography>
                {retryStats?.avgProcessingTime && (
                  <Typography variant="body2" color="text.secondary">
                    平均处理时间: {retryStats.avgProcessingTime.toFixed(2)} ms
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 死信队列 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  死信队列
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip label={retryStats?.deadLetterSize ?? retryQueueSize?.deadLetter ?? 0} color="error" size="small" />
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setClearDeadLetterDialogOpen(true)}
                    disabled={(retryStats?.deadLetterSize ?? retryQueueSize?.deadLetter ?? 0) === 0}
                  >
                    清空
                  </Button>
                </Box>
              </Box>
              {deadLetterItems.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>错误</TableCell>
                        <TableCell align="right">重试次数</TableCell>
                        <TableCell>失败时间</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {deadLetterItems.slice(0, 10).map((item) => (
                        <TableRow key={item.messageId}>
                          <TableCell>
                            <Typography variant="caption" sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                              {item.messageId}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              color="error"
                              sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                            >
                              {item.originalError}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{item.retryCount}</TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {formatRelativeTime(item.failedAt)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  死信队列已清空
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 状态分布 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                状态分布
              </Typography>
              {stats && Object.keys(stats.byStatus).length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>状态</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell>占比</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(stats.byStatus)
                        .sort(([, a], [, b]) => b - a)
                        .map(([status, count]) => {
                          const total = stats.total || 1;
                          const percent = (count / total) * 100;
                          const statusConfig = getStatusChip(status as MessageState['status']);
                          return (
                            <TableRow key={status}>
                              <TableCell>
                                <Chip
                                  icon={statusConfig.icon}
                                  label={statusConfig.label}
                                  color={statusConfig.color}
                                  size="small"
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
                  暂无状态分布数据
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 消息详情对话框 */}
      <Dialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>消息详情</DialogTitle>
        <DialogContent>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : selectedMessage ? (
            <Box sx={{ pt: 1 }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">消息 ID</Typography>
                  <Typography variant="body1">{selectedMessage.id}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">状态</Typography>
                  {(() => {
                    const config = getStatusChip(selectedMessage.status);
                    return <Chip icon={config.icon} label={config.label} color={config.color} size="small" />;
                  })()}
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">创建时间</Typography>
                  <Typography variant="body1">{formatTimestamp(selectedMessage.createdAt)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">更新时间</Typography>
                  <Typography variant="body1">{formatTimestamp(selectedMessage.updatedAt)}</Typography>
                </Grid>
                {selectedMessage.completedAt && (
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">完成时间</Typography>
                    <Typography variant="body1">{formatTimestamp(selectedMessage.completedAt)}</Typography>
                  </Grid>
                )}
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">重试次数</Typography>
                  <Typography variant="body1">{selectedMessage.retryCount} / {selectedMessage.maxRetries}</Typography>
                </Grid>
                {selectedMessage.channel && (
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">通道</Typography>
                    <Typography variant="body1">{selectedMessage.channel}</Typography>
                  </Grid>
                )}
                {selectedMessage.recipient && (
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">接收者</Typography>
                    <Typography variant="body1">{selectedMessage.recipient}</Typography>
                  </Grid>
                )}
                {selectedMessage.error && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">错误信息</Typography>
                    <Typography variant="body1" color="error">{selectedMessage.error}</Typography>
                  </Grid>
                )}
              </Grid>

              {/* 审计日志 */}
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                审计日志
              </Typography>
              {auditLog.length > 0 ? (
                <List dense>
                  {auditLog.map((transition) => (
                    <ListItem key={transition.id} sx={{ bgcolor: gs.bgHover, mb: 1, borderRadius: 1 }}>
                      <ListItemText
                        primary={`${transition.fromStatus} → ${transition.toStatus}`}
                        secondary={`${formatTimestamp(transition.timestamp)}${transition.reason ? ` | ${transition.reason}` : ''}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                  暂无审计日志
                </Typography>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary">消息不存在</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 取消消息对话框 */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)}>
        <DialogTitle>取消消息</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            确认取消消息 {cancelTargetId}？
          </Typography>
          <Typography variant="body2" color="text.secondary">
            取消原因（可选）:
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleCancelMessage}>
            确认取消
          </Button>
        </DialogActions>
      </Dialog>

      {/* 清空死信队列对话框 */}
      <Dialog open={clearDeadLetterDialogOpen} onClose={() => setClearDeadLetterDialogOpen(false)}>
        <DialogTitle>清空死信队列</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            确认清空死信队列？此操作不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDeadLetterDialogOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleClearDeadLetter}>
            确认清空
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MessageLifecyclePage;