/**
 * CronPanel — 后端 Cron Engine 可视化面板
 *
 * 展示 /api/cron 中所有任务，支持：
 * - 列出全部 cron 任务
 * - 立即运行（调用后端 /api/cron/:id/run 或 CLI 端点）
 * - 查看最近日志（轻量内嵌执行记录）
 * - 显示下次运行时间（通过 /api/cron/parse 解析）
 * - 启用/禁用、删除
 *
 * 数据源：services/cronApi.ts
 * 降级：API 不可用时显示空状态而非崩溃
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Switch,
  useTheme,
  Divider,
  TextField,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TerminalIcon from '@mui/icons-material/Terminal';
import { getGrayScale } from '../../constants/theme';
import {
  listCronJobs,
  deleteCronJob,
  parseCronExpression,
  runCronJobNow,
  updateCronJob,
  type CronJob,
  type CronParseResult,
} from '../../services/cronApi';
import { useToast } from '../../contexts/ToastContext';

interface CronLogEntry {
  id: string;
  jobId: string;
  jobName: string;
  status: 'success' | 'failed' | 'running';
  startedAt: string;
  durationMs: number;
  message: string;
}

const formatNextRun = (ms: number | undefined): string => {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatSchedule = (schedule: CronJob['schedule']): string => {
  if (schedule.kind === 'cron') return schedule.expr ?? '(未设置表达式)';
  if (schedule.kind === 'every') return `每 ${Math.round((schedule.everyMs || 0) / 1000)}s`;
  if (schedule.kind === 'at') return `一次性 @ ${new Date(schedule.at as string | number).toLocaleString('zh-CN')}`;
  return JSON.stringify(schedule);
};

const CronPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [parseCache, setParseCache] = useState<Record<string, CronParseResult>>({});

  // 演示日志（在没有后端日志接口时使用）
  const [demoLogs, setDemoLogs] = useState<CronLogEntry[]>([]);

  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'parser' | 'logs'>('tasks');

  // Cron 解析器子标签
  const [parseExpr, setParseExpr] = useState('0 9 * * *');
  const [parseResult, setParseResult] = useState<CronParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCronJobs();
      setJobs(data);
      // 自动预解析每个 cron 任务的下次运行时间
      for (const job of data) {
        if (job.schedule.kind === 'cron' && job.schedule.expr) {
          try {
            const result = await parseCronExpression(job.schedule.expr, job.schedule.tz);
            setParseCache(prev => ({ ...prev, [job.id]: result }));
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Cron 任务失败');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleRunNow = useCallback(async (id: string) => {
    setRunningIds(prev => new Set(prev).add(id));
    const startTime = Date.now();
    try {
      const res = await runCronJobNow(id);
      const duration = Date.now() - startTime;
      const logEntry: CronLogEntry = {
        id: `log-${Date.now()}`,
        jobId: id,
        jobName: jobs.find(j => j.id === id)?.name || id,
        status: res.success ? 'success' : 'failed',
        startedAt: new Date(startTime).toISOString(),
        durationMs: duration,
        message: res.message || (res.success ? '执行成功' : '执行失败'),
      };
      setDemoLogs(prev => [logEntry, ...prev].slice(0, 100));
      showToast(res.success ? '已触发' : '执行失败', res.success ? 'success' : 'error');
      void loadJobs();
    } catch (err) {
      const logEntry: CronLogEntry = {
        id: `log-${Date.now()}`,
        jobId: id,
        jobName: jobs.find(j => j.id === id)?.name || id,
        status: 'failed',
        startedAt: new Date(startTime).toISOString(),
        durationMs: Date.now() - startTime,
        message: err instanceof Error ? err.message : '执行失败',
      };
      setDemoLogs(prev => [logEntry, ...prev].slice(0, 100));
      showToast(err instanceof Error ? err.message : '执行失败', 'error');
    } finally {
      setRunningIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [jobs, loadJobs, showToast]);

  const handleToggle = useCallback(async (job: CronJob, enabled: boolean) => {
    try {
      await updateCronJob(job.id, { enabled });
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled } : j));
      showToast(enabled ? '已启用' : '已禁用', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新失败', 'error');
    }
  }, [showToast]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm(`确定要删除 Cron 任务 "${id}" 吗？`)) return;
    try {
      await deleteCronJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      showToast('已删除', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }, [showToast]);

  const handleParse = useCallback(async () => {
    if (!parseExpr.trim()) {
      setParseError('请输入 cron 表达式');
      return;
    }
    setParseLoading(true);
    setParseError(null);
    try {
      const r = await parseCronExpression(parseExpr.trim());
      setParseResult(r);
    } catch (err) {
      setParseResult(null);
      setParseError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setParseLoading(false);
    }
  }, [parseExpr]);

  const handleCopyExpr = useCallback((expr: string) => {
    navigator.clipboard?.writeText(expr).then(
      () => showToast('已复制', 'success'),
      () => showToast('复制失败', 'error'),
    );
  }, [showToast]);

  const renderTasksTab = () => (
    <Box>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}（已展示空状态）
        </Alert>
      )}

      <Card sx={{ bgcolor: gs.bgPanel }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ScheduleIcon color="primary" />
              <Typography variant="h6">Cron 任务列表</Typography>
              <Chip size="small" label={`共 ${jobs.length} 个`} />
            </Box>
            <Button size="small" startIcon={<RefreshIcon />} onClick={loadJobs}>刷新</Button>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : jobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              暂无 Cron 任务。CLI 用法：<code>cdf-cli cron add --cron "0 9 * * *" --name "..."</code>
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>名称</TableCell>
                    <TableCell>调度</TableCell>
                    <TableCell>下次运行</TableCell>
                    <TableCell>会话</TableCell>
                    <TableCell>唤醒</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.map(job => {
                    const nextRun = parseCache[job.id]?.nextRunAt ?? job.state?.nextRunAtMs;
                    return (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {job.id.slice(0, 8)}…
                          </Typography>
                        </TableCell>
                        <TableCell>{job.name}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <code style={{ fontSize: 12 }}>{formatSchedule(job.schedule)}</code>
                            {job.schedule.kind === 'cron' && job.schedule.expr && (
                              <Tooltip title="复制表达式">
                                <IconButton size="small" onClick={() => handleCopyExpr(job.schedule.expr!)}>
                                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{formatNextRun(nextRun)}</Typography>
                        </TableCell>
                        <TableCell><Chip size="small" label={job.sessionTarget} /></TableCell>
                        <TableCell><Chip size="small" label={job.wakeMode} color={job.wakeMode === 'now' ? 'warning' : 'default'} /></TableCell>
                        <TableCell>
                          <Switch
                            size="small"
                            checked={job.enabled}
                            onChange={(e) => handleToggle(job, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title="立即运行">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleRunNow(job.id)}
                                disabled={runningIds.has(job.id) || !job.enabled}
                              >
                                {runningIds.has(job.id) ? <CircularProgress size={14} /> : <PlayArrowIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="删除">
                            <IconButton size="small" onClick={() => handleDelete(job.id)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  const renderParserTab = () => (
    <Box>
      <Card sx={{ bgcolor: gs.bgPanel }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TerminalIcon color="primary" />
            <Typography variant="h6">Cron 表达式解析</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            输入 5 段 cron 表达式，立即获得下次运行时间、描述等元信息。
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="Cron 表达式"
              placeholder="0 9 * * *"
              value={parseExpr}
              onChange={(e) => setParseExpr(e.target.value)}
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
            <Button
              variant="contained"
              onClick={handleParse}
              disabled={parseLoading}
              startIcon={parseLoading ? <CircularProgress size={14} /> : <ScheduleIcon />}
            >
              解析
            </Button>
          </Box>
          {parseError && (
            <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>
          )}
          {parseResult && (
            <Box sx={{ p: 2, bgcolor: gs.bgHover, borderRadius: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">表达式</Typography>
                  <Typography sx={{ fontFamily: 'monospace' }}>{parseResult.expression}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">时区</Typography>
                  <Typography>{parseResult.timezone}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">下次运行</Typography>
                  <Typography color="primary" sx={{ fontWeight: 500 }}>
                    {new Date(parseResult.nextRunAt).toLocaleString('zh-CN')}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">上次运行</Typography>
                  <Typography>
                    {parseResult.previousRunAt
                      ? new Date(parseResult.previousRunAt).toLocaleString('zh-CN')
                      : '—'}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">描述</Typography>
                  <Typography>{parseResult.description}</Typography>
                </Grid>
              </Grid>
            </Box>
          )}
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            常用预设：
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {['0 9 * * *', '*/15 * * * *', '0 0 * * 0', '0 0 1 * *'].map(expr => (
              <Chip
                key={expr}
                size="small"
                label={expr}
                onClick={() => setParseExpr(expr)}
                sx={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );

  const renderLogsTab = () => (
    <Box>
      <Card sx={{ bgcolor: gs.bgPanel }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <VisibilityIcon color="primary" />
            <Typography variant="h6">最近执行日志</Typography>
            <Chip size="small" label={`共 ${demoLogs.length} 条`} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            在前端的「立即运行」操作产生的日志会被记录在这里。如需查看后端完整日志，请使用 CLI：<code>cdf-cli cron logs</code>
          </Typography>
          {demoLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              暂无日志
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>时间</TableCell>
                    <TableCell>任务</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>耗时</TableCell>
                    <TableCell>消息</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {demoLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(log.startedAt).toLocaleString('zh-CN')}
                        </Typography>
                      </TableCell>
                      <TableCell>{log.jobName}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : '运行中'}
                          color={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'info'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {log.durationMs < 1000 ? `${log.durationMs}ms` : `${(log.durationMs / 1000).toFixed(1)}s`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{log.message}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, borderBottom: `1px solid ${gs.border}` }}>
        {[
          { key: 'tasks', label: '任务列表', icon: <ScheduleIcon fontSize="small" /> },
          { key: 'parser', label: '解析器', icon: <TerminalIcon fontSize="small" /> },
          { key: 'logs', label: '最近日志', icon: <VisibilityIcon fontSize="small" /> },
        ].map(item => (
          <Box
            key={item.key}
            onClick={() => setActiveSubTab(item.key as 'tasks' | 'parser' | 'logs')}
            sx={{
              px: 2,
              py: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              color: activeSubTab === item.key ? gs.textPrimary : gs.textMuted,
              borderBottom: activeSubTab === item.key ? `2px solid ${gs.textPrimary}` : '2px solid transparent',
              fontSize: '0.8125rem',
              fontWeight: activeSubTab === item.key ? 600 : 400,
            }}
          >
            {item.icon}
            {item.label}
          </Box>
        ))}
      </Box>

      {activeSubTab === 'tasks' && renderTasksTab()}
      {activeSubTab === 'parser' && renderParserTab()}
      {activeSubTab === 'logs' && renderLogsTab()}
    </Box>
  );
};

export default CronPanel;
