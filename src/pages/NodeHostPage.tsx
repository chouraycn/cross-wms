import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, useTheme, Alert, Divider,
  LinearProgress, Stack, TextField, MenuItem, Card, CardContent, Grid,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DnsIcon from '@mui/icons-material/Dns';
import BuildIcon from '@mui/icons-material/Build';
import QueueIcon from '@mui/icons-material/Queue';
import MemoryIcon from '@mui/icons-material/Memory';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type {
  NodeHostInfo,
  NodeHostTool,
  NodeHostToolInvokeResult,
  NodeHostQueueStats,
  NodeHostResources,
  ToolStatus,
} from '../services/nodeHostApi';
import {
  getNodeHostInfo,
  getNodeHostTools,
  invokeNodeHostTool,
  getNodeHostQueue,
  getNodeHostResources,
} from '../services/nodeHostApi';

// ===================== 工具函数 / 配置 =====================

/** 工具状态 → 中文标签 + 颜色 */
const TOOL_STATUS_META: Record<ToolStatus, { label: string; bg: string; color: string }> = {
  active: { label: '可用', bg: '#D1FAE5', color: '#059669' },
  disabled: { label: '已禁用', bg: '#F3F4F6', color: '#6B7280' },
  error: { label: '异常', bg: '#FEE2E2', color: '#DC2626' },
};

function formatDateTime(ts?: number): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch {
    return '-';
  }
}

/** 格式化运行时长（毫秒 → 1天 2时 3分） */
function formatUptime(ms: number): string {
  if (!ms || ms < 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分 ${s}秒`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
}

/** 格式化字节数 */
function formatBytes(bytes?: number): string {
  if (bytes == null) return '-';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

// ===================== 主组件 =====================

const NodeHostPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [info, setInfo] = useState<NodeHostInfo | null>(null);
  const [tools, setTools] = useState<NodeHostTool[]>([]);
  const [queue, setQueue] = useState<NodeHostQueueStats | null>(null);
  const [resources, setResources] = useState<NodeHostResources | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动刷新
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 调用工具对话框
  const [invokeOpen, setInvokeOpen] = useState(false);
  const [invokeTool, setInvokeTool] = useState<NodeHostTool | null>(null);
  const [invokeParams, setInvokeParams] = useState('{}');
  const [invokeResult, setInvokeResult] = useState<NodeHostToolInvokeResult | null>(null);
  const [invoking, setInvoking] = useState(false);
  const [paramsError, setParamsError] = useState<string | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nodeInfo, toolsList, queueStats, res] = await Promise.all([
        getNodeHostInfo(),
        getNodeHostTools(),
        getNodeHostQueue(),
        getNodeHostResources(),
      ]);
      setInfo(nodeInfo);
      setTools(toolsList);
      setQueue(queueStats);
      setResources(res);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`加载节点信息失败: ${msg}`);
      if (!silent) showToast(`加载节点信息失败: ${msg}`, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  // 初始加载
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 自动刷新（每 5 秒）
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      loadAll(true);
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh, loadAll]);

  const handleOpenInvoke = (tool: NodeHostTool) => {
    setInvokeTool(tool);
    // 根据工具 schema 生成默认参数模板
    setInvokeParams(generateDefaultParams(tool));
    setInvokeResult(null);
    setParamsError(null);
    setInvokeOpen(true);
  };

  const handleInvoke = async () => {
    if (!invokeTool) return;
    // 校验 JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(invokeParams);
      setParamsError(null);
    } catch (e) {
      setParamsError(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setInvoking(true);
    try {
      const result = await invokeNodeHostTool(invokeTool.name, { input: parsed });
      setInvokeResult(result);
      if (result.success) {
        showToast('工具调用成功', 'success');
      } else {
        showToast(`工具调用失败: ${result.error || 'exit code ' + result.exitCode}`, 'error');
      }
      // 刷新工具列表（调用次数会变化）
      loadAll(true);
    } catch (e) {
      showToast(`调用失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setInvoking(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DnsIcon /> 节点主机
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setAutoRefresh((v) => !v)}
            sx={{
              textTransform: 'none',
              borderColor: autoRefresh ? 'primary.main' : 'divider',
              color: autoRefresh ? 'primary.main' : 'text.secondary',
            }}
          >
            {autoRefresh ? '自动刷新中' : '已暂停刷新'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => loadAll()}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            刷新
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ fontSize: '0.8rem' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !info && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {info && (
        <Grid container spacing={2}>
          {/* 节点信息卡片 */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DnsIcon fontSize="small" /> 节点信息
                </Typography>
                <Stack spacing={1}>
                  <DetailRow label="主机名" value={info.hostname} mono />
                  <DetailRow label="节点 ID" value={info.nodeId} mono />
                  <DetailRow label="版本" value={info.version} />
                  <DetailRow label="运行时间" value={formatUptime(info.uptimeMs)} />
                  <DetailRow label="PID" value={String(info.pid)} mono />
                  <DetailRow label="平台" value={info.platform} mono />
                  <DetailRow label="Node 版本" value={info.nodeVersion} mono />
                  <DetailRow label="启动时间" value={formatDateTime(info.startedAtMs)} />
                </Stack>
                {info.capabilities.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>能力</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {info.capabilities.map((cap) => (
                        <Chip
                          key={cap}
                          label={cap}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* 调用队列状态 */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <QueueIcon fontSize="small" /> 调用队列状态
                </Typography>
                {queue ? (
                  <Box>
                    <Grid container spacing={1.5}>
                      <Grid item xs={6} sm={3}>
                        <StatBox label="排队中" value={queue.pending} color="#2563EB" />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <StatBox label="运行中" value={queue.running} color="#D97706" />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <StatBox label="已完成" value={queue.completed} color="#059669" />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <StatBox label="失败" value={queue.failed} color="#DC2626" />
                      </Grid>
                    </Grid>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={1}>
                      <DetailRow label="总处理数" value={String(queue.totalProcessed)} mono />
                      <DetailRow label="平均耗时" value={`${queue.averageDurationMs.toFixed(0)}ms`} mono />
                    </Stack>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>暂无队列数据</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* 资源监控 */}
          <Grid item xs={12}>
            <Card variant="outlined" sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <CardContent>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MemoryIcon fontSize="small" /> 资源监控
                </Typography>
                {resources ? (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <ResourceBar
                        label="CPU 使用率"
                        value={resources.current?.cpuPercent ?? 0}
                        max={resources.limits.maxCpuPercent}
                        unit="%"
                        color={(resources.current?.cpuPercent ?? 0) > 80 ? '#DC2626' : '#2563EB'}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <ResourceBar
                        label="内存使用"
                        value={resources.current ? resources.current.memoryBytes / (1024 * 1024) : 0}
                        max={resources.limits.maxMemoryMB}
                        unit="MB"
                        color={(resources.current?.memoryBytes ?? 0) > resources.limits.maxMemoryMB * 1024 * 1024 * 0.8 ? '#DC2626' : '#059669'}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <DetailRow label="当前内存" value={formatBytes(resources.current?.memoryBytes)} mono />
                        <DetailRow label="内存上限" value={`${resources.limits.maxMemoryMB} MB`} mono />
                        <DetailRow label="CPU 上限" value={`${resources.limits.maxCpuPercent}%`} mono />
                        <DetailRow label="采样时间" value={formatDateTime(resources.current?.timestamp)} />
                      </Stack>
                    </Grid>
                  </Grid>
                ) : (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>暂无资源监控数据</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* 工具列表表格 */}
      {info && (
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <BuildIcon fontSize="small" /> 已注册工具
          </Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: gs.bgPanel }}>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>名称</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>描述</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>分类</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>状态</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">调用次数</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">平均耗时</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tools.map((t) => {
                  const meta = TOOL_STATUS_META[t.status] || TOOL_STATUS_META.disabled;
                  return (
                    <TableRow key={t.name} sx={{ '&:hover': { backgroundColor: gs.bgHover } }}>
                      <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500, fontFamily: 'monospace' }}>{t.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{t.description}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{t.category || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={meta.label}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 20, backgroundColor: meta.bg, color: meta.color, fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', textAlign: 'right' }}>{t.invokeCount}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', textAlign: 'right' }}>{t.averageDurationMs.toFixed(0)}ms</TableCell>
                      <TableCell align="right">
                        <Tooltip title="调用工具">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenInvoke(t)}
                              disabled={t.status !== 'active'}
                              sx={{ color: '#2563EB' }}
                            >
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {tools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                      暂无已注册工具
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 调用工具对话框 */}
      <Dialog open={invokeOpen} onClose={() => setInvokeOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <BuildIcon fontSize="small" /> 调用工具
          {invokeTool && (
            <Typography component="span" sx={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'primary.main' }}>
              {invokeTool.name}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {invokeTool && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 工具信息 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>工具说明</Typography>
                <Typography sx={{ fontSize: '0.8rem' }}>{invokeTool.description}</Typography>
              </Box>

              {/* 选择工具 */}
              <TextField
                select
                size="small"
                label="选择工具"
                value={invokeTool.name}
                onChange={(e) => {
                  const found = tools.find((t) => t.name === e.target.value);
                  if (found) {
                    setInvokeTool(found);
                    setInvokeParams(generateDefaultParams(found));
                    setInvokeResult(null);
                    setParamsError(null);
                  }
                }}
                sx={{ fontSize: '0.8rem' }}
              >
                {tools.map((t) => (
                  <MenuItem key={t.name} value={t.name} disabled={t.status !== 'active'}>
                    {t.name} {t.status !== 'active' ? `(${TOOL_STATUS_META[t.status].label})` : ''}
                  </MenuItem>
                ))}
              </TextField>

              <Divider />

              {/* JSON 参数编辑器 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                  输入参数（JSON）
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  maxRows={12}
                  value={invokeParams}
                  onChange={(e) => {
                    setInvokeParams(e.target.value);
                    setParamsError(null);
                  }}
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    '& .MuiInputBase-input': {
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                    },
                  }}
                  error={!!paramsError}
                  helperText={paramsError}
                />
              </Box>

              {/* 调用结果 */}
              {invokeResult && (
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                    调用结果
                    <Chip
                      label={invokeResult.success ? '成功' : '失败'}
                      size="small"
                      sx={{
                        fontSize: '0.6rem',
                        height: 18,
                        backgroundColor: invokeResult.success ? '#D1FAE5' : '#FEE2E2',
                        color: invokeResult.success ? '#059669' : '#DC2626',
                        fontWeight: 600,
                      }}
                    />
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                    <DetailRow label="调用 ID" value={invokeResult.invocationId} mono />
                    <DetailRow label="退出码" value={String(invokeResult.exitCode)} mono />
                    <DetailRow label="耗时" value={`${invokeResult.durationMs}ms`} mono />
                    <DetailRow label="超时" value={invokeResult.timedOut ? '是' : '否'} />
                  </Box>
                  {invokeResult.error && (
                    <Alert severity="error" sx={{ fontSize: '0.75rem', mb: 1 }}>
                      {invokeResult.error}
                    </Alert>
                  )}
                  {invokeResult.stdout && (
                    <Box sx={{ mb: 1 }}>
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>stdout</Typography>
                      <Paper variant="outlined" sx={{ p: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)', maxHeight: 200, overflow: 'auto' }}>
                        <Typography component="pre" sx={{ fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                          {invokeResult.stdout}
                        </Typography>
                      </Paper>
                    </Box>
                  )}
                  {invokeResult.stderr && (
                    <Box>
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>stderr</Typography>
                      <Paper variant="outlined" sx={{ p: 1, backgroundColor: isDark ? 'rgba(220,38,38,0.1)' : 'rgba(254,226,226,0.5)', maxHeight: 200, overflow: 'auto' }}>
                        <Typography component="pre" sx={{ fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, color: '#DC2626' }}>
                          {invokeResult.stderr}
                        </Typography>
                      </Paper>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvokeOpen(false)} size="small" sx={{ textTransform: 'none' }}>关闭</Button>
          <Button
            onClick={handleInvoke}
            size="small"
            variant="contained"
            disabled={invoking || !invokeTool}
            startIcon={invoking ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
            sx={{ textTransform: 'none' }}
          >
            {invoking ? '执行中...' : '执行'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ===================== 子组件 =====================

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 70, flexShrink: 0 }}>{label}</Typography>
    <Typography sx={{ fontSize: '0.8rem', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
      {value}
    </Typography>
  </Box>
);

/** 队列统计数字框 */
const StatBox: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      p: 1,
      textAlign: 'center',
    }}
  >
    <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1.2 }}>
      {value}
    </Typography>
    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.25 }}>
      {label}
    </Typography>
  </Box>
);

/** 资源使用进度条 */
const ResourceBar: React.FC<{
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}> = ({ label, value, max, unit, color }) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
          {value.toFixed(1)} {unit}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percent}
        sx={{
          height: 8,
          borderRadius: 4,
          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          '& .MuiLinearProgress-bar': {
            backgroundColor: color,
            borderRadius: 4,
          },
        }}
      />
    </Box>
  );
};

/** 根据工具 schema 生成默认参数模板 */
function generateDefaultParams(tool: NodeHostTool): string {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== 'object') return '{}';
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== 'object') return '{}';
  const result: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(props)) {
    if (def && typeof def === 'object') {
      const d = def as { type?: string; default?: unknown; description?: string };
      if (d.default !== undefined) {
        result[key] = d.default;
      } else if (d.type === 'string') {
        result[key] = '';
      } else if (d.type === 'number' || d.type === 'integer') {
        result[key] = 0;
      } else if (d.type === 'boolean') {
        result[key] = false;
      } else if (d.type === 'array') {
        result[key] = [];
      } else if (d.type === 'object') {
        result[key] = {};
      } else {
        result[key] = null;
      }
    }
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return '{}';
  }
}

export default NodeHostPage;
