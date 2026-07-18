import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, useTheme, Alert, Divider,
  LinearProgress, Switch, FormControlLabel, Stack,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import StopIcon from '@mui/icons-material/Stop';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type {
  ProcessSnapshot,
  ProcessState,
  ProcessHealthResponse,
  ProcessResourcesResponse,
  HealthStatus,
  HealthCheckResult,
} from '../services/processApi';
import {
  listProcesses,
  getProcess,
  restartProcess,
  stopProcess,
  getProcessHealth,
  getProcessResources,
} from '../services/processApi';

// ===================== 工具函数 / 配置 =====================

/** 进程状态 → 中文标签 + 颜色 */
const STATE_META: Record<ProcessState, { label: string; bg: string; color: string }> = {
  pending: { label: '等待中', bg: '#F3F4F6', color: '#6B7280' },
  starting: { label: '启动中', bg: '#DBEAFE', color: '#2563EB' },
  running: { label: '运行中', bg: '#D1FAE5', color: '#059669' },
  stopping: { label: '停止中', bg: '#FEF3C7', color: '#D97706' },
  exited: { label: '已停止', bg: '#F3F4F6', color: '#6B7280' },
  crashed: { label: '已崩溃', bg: '#FEE2E2', color: '#DC2626' },
  zombie: { label: '僵尸', bg: '#FFEDD5', color: '#EA580C' },
};

/** 健康状态 → 中文标签 + 颜色 */
const HEALTH_META: Record<HealthStatus, { label: string; bg: string; color: string }> = {
  healthy: { label: '健康', bg: '#D1FAE5', color: '#059669' },
  degraded: { label: '降级', bg: '#FEF3C7', color: '#D97706' },
  unhealthy: { label: '不健康', bg: '#FEE2E2', color: '#DC2626' },
  unknown: { label: '未知', bg: '#F3F4F6', color: '#6B7280' },
};

function formatDateTime(ts?: number): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch {
    return '-';
  }
}

/** 格式化运行时长（毫秒 → 1h 23m 45s） */
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

/** 格式化内存（MB） */
function formatMemory(mb?: number): string {
  if (mb == null) return '-';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

// ===================== 主组件 =====================

const ProcessManagementPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [processes, setProcesses] = useState<ProcessSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动刷新
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 详情对话框
  const [detailProcess, setDetailProcess] = useState<ProcessSnapshot | null>(null);
  const [detailHealth, setDetailHealth] = useState<ProcessHealthResponse | null>(null);
  const [detailResources, setDetailResources] = useState<ProcessResourcesResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作中的进程 ID（用于禁用按钮）
  const [actioningId, setActioningId] = useState<string | null>(null);

  const loadProcesses = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await listProcesses();
      setProcesses(res);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`加载进程列表失败: ${msg}`);
      if (!silent) showToast(`加载进程列表失败: ${msg}`, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  // 初始加载
  useEffect(() => {
    loadProcesses();
  }, [loadProcesses]);

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
      loadProcesses(true);
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh, loadProcesses]);

  const handleRestart = async (id: string) => {
    setActioningId(id);
    try {
      await restartProcess(id);
      showToast('进程重启指令已发送', 'success');
      await loadProcesses(true);
    } catch (e) {
      showToast(`重启失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleStop = async (id: string) => {
    if (!window.confirm('确定要停止该进程吗？')) return;
    setActioningId(id);
    try {
      await stopProcess(id);
      showToast('进程停止指令已发送', 'success');
      await loadProcesses(true);
    } catch (e) {
      showToast(`停止失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleViewDetail = async (proc: ProcessSnapshot) => {
    setDetailProcess(proc);
    setDetailHealth(null);
    setDetailResources(null);
    setDetailLoading(true);
    try {
      // 同时获取最新详情、健康检查与资源使用
      const [latest, health, resources] = await Promise.all([
        getProcess(proc.id).catch(() => proc),
        getProcessHealth(proc.id).catch(() => null),
        getProcessResources(proc.id).catch(() => null),
      ]);
      setDetailProcess(latest);
      if (health) setDetailHealth(health);
      if (resources) setDetailResources(resources);
    } catch (e) {
      showToast(`加载详情失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 1 }}>
          <MemoryIcon /> 进程管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                color="primary"
              />
            }
            label={<Typography sx={{ fontSize: '0.8rem' }}>自动刷新（5秒）</Typography>}
            sx={{ mr: 0 }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => loadProcesses()}
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

      {/* 进程列表表格 */}
      <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: gs.bgPanel }}>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>名称</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>PID</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>状态</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">CPU%</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">内存</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>启动时间</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>运行时长</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processes.map((p) => {
              const meta = STATE_META[p.state] || STATE_META.pending;
              const cpu = p.usage?.cpuPercent ?? 0;
              const mem = p.usage?.memoryMb;
              const isActive = p.state === 'running' || p.state === 'starting';
              return (
                <TableRow key={p.id} sx={{ '&:hover': { backgroundColor: gs.bgHover } }}>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{p.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                    {p.pid ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={meta.label}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        backgroundColor: meta.bg,
                        color: meta.color,
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', textAlign: 'right' }}>
                    {cpu.toFixed(1)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', textAlign: 'right' }}>
                    {formatMemory(mem)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {formatDateTime(p.startedAtMs)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {formatUptime(p.uptimeMs)}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title="查看详情">
                        <IconButton size="small" onClick={() => handleViewDetail(p)}>
                          <InfoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="重启">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleRestart(p.id)}
                            disabled={actioningId === p.id || !isActive}
                            sx={{ color: '#2563EB' }}
                          >
                            {actioningId === p.id ? <CircularProgress size={14} /> : <ReplayIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="停止">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleStop(p.id)}
                            disabled={actioningId === p.id || !isActive}
                            sx={{ color: '#EF4444' }}
                          >
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {processes.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                  暂无托管进程
                </TableCell>
              </TableRow>
            )}
            {loading && processes.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 进程详情对话框 */}
      <Dialog
        open={!!detailProcess}
        onClose={() => setDetailProcess(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon fontSize="small" /> 进程详情
          {detailProcess && (
            <Chip
              label={(STATE_META[detailProcess.state] || STATE_META.pending).label}
              size="small"
              sx={{
                fontSize: '0.65rem',
                height: 20,
                ml: 1,
                backgroundColor: (STATE_META[detailProcess.state] || STATE_META.pending).bg,
                color: (STATE_META[detailProcess.state] || STATE_META.pending).color,
                fontWeight: 600,
              }}
            />
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {detailLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!detailLoading && detailProcess && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 基本信息 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 1, color: 'text.secondary' }}>
                  基本信息
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <DetailRow label="进程 ID" value={detailProcess.id} mono />
                  <DetailRow label="进程名称" value={detailProcess.name} />
                  <DetailRow label="PID" value={detailProcess.pid != null ? String(detailProcess.pid) : '-'} mono />
                  <DetailRow label="状态" value={(STATE_META[detailProcess.state] || STATE_META.pending).label} />
                  <DetailRow label="启动时间" value={formatDateTime(detailProcess.startedAtMs)} />
                  <DetailRow label="运行时长" value={formatUptime(detailProcess.uptimeMs)} />
                  <DetailRow label="最后输出" value={formatDateTime(detailProcess.lastOutputAtMs)} />
                  <DetailRow label="重启次数" value={String(detailProcess.restartCount)} />
                  <DetailRow label="健康状态" value={detailProcess.health ? (HEALTH_META[detailProcess.health] || HEALTH_META.unknown).label : '-'} />
                  <DetailRow label="工作目录" value={detailProcess.cwd || '-'} mono />
                </Box>
                <Box sx={{ mt: 1 }}>
                  <DetailRow label="命令行" value={[detailProcess.command, ...detailProcess.args].join(' ')} mono />
                </Box>
              </Box>

              <Divider />

              {/* 资源使用 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 1, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MemoryIcon fontSize="small" /> 资源使用
                </Typography>
                {detailResources?.current ? (
                  <Stack spacing={1.5}>
                    <ResourceBar
                      label="CPU 使用率"
                      value={detailResources.current.cpuPercent}
                      max={100}
                      unit="%"
                      color={detailResources.current.cpuPercent > 80 ? '#DC2626' : '#2563EB'}
                    />
                    <ResourceBar
                      label="内存使用"
                      value={detailResources.current.memoryMb}
                      max={2048}
                      unit="MB"
                      color={detailResources.current.memoryMb > 1024 ? '#DC2626' : '#059669'}
                    />
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailRow label="RSS 字节" value={formatBytes(detailResources.current.rssBytes)} mono />
                      <DetailRow label="句柄数" value={detailResources.current.handles != null ? String(detailResources.current.handles) : '-'} mono />
                    </Box>
                  </Stack>
                ) : (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>暂无资源使用数据</Typography>
                )}
              </Box>

              <Divider />

              {/* 健康检查历史 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 1, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HealthAndSafetyIcon fontSize="small" /> 健康检查历史
                </Typography>
                {detailHealth && detailHealth.history.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: gs.bgPanel }}>
                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 600 }}>时间</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 600 }}>状态</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 600 }}>检查项</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 600 }} align="right">耗时</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 600 }}>消息</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailHealth.history.map((h: HealthCheckResult, idx: number) => {
                          const hm = HEALTH_META[h.status] || HEALTH_META.unknown;
                          return (
                            <TableRow key={idx}>
                              <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{formatDateTime(h.timestamp)}</TableCell>
                              <TableCell>
                                <Chip
                                  label={hm.label}
                                  size="small"
                                  sx={{ fontSize: '0.6rem', height: 18, backgroundColor: hm.bg, color: hm.color, fontWeight: 600 }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.7rem' }}>{h.name}</TableCell>
                              <TableCell sx={{ fontSize: '0.7rem', fontFamily: 'monospace', textAlign: 'right' }}>{h.durationMs}ms</TableCell>
                              <TableCell sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{h.message || '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>暂无健康检查历史</Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailProcess(null)} size="small" sx={{ textTransform: 'none' }}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ===================== 子组件 =====================

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 80, flexShrink: 0 }}>{label}</Typography>
    <Typography sx={{ fontSize: '0.8rem', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
      {value}
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

/** 格式化字节数 */
function formatBytes(bytes?: number): string {
  if (bytes == null) return '-';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

export default ProcessManagementPage;
