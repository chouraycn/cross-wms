/**
 * EventLedgerPanel - 事件溯源查询面板
 *
 * 功能：
 * - 会话列表查询（按状态筛选）
 * - 会话事件查询（按会话ID、时间范围、事件类型）
 * - 事件列表展示（时间戳、类型、来源、目标）
 * - 事件详情查看
 * - 事件统计图表
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tooltip,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  Visibility as ViewIcon,
  Timeline as TimelineIcon,
  Storage as StorageIcon,
  Event as EventIcon,
  Assessment as StatsIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getGrayScale } from '../../constants/theme';
import { eventLedgerApi, LedgerEvent, SessionMeta, LedgerStats } from '../../services/eventLedgerApi';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SessionListItem {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  lastEventSeq: number;
  eventCount: number;
  status: string;
  lastEventType?: string;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  事件类型配置                                                       */
/* ------------------------------------------------------------------ */

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'session.created': { label: '会话创建', color: '#4CAF50', icon: '📝' },
  'session.updated': { label: '会话更新', color: '#8BC34A', icon: '✏️' },
  'session.archived': { label: '会话归档', color: '#9E9E9E', icon: '📦' },
  'session.deleted': { label: '会话删除', color: '#F44336', icon: '🗑️' },
  'message.created': { label: '消息创建', color: '#2196F3', icon: '💬' },
  'message.updated': { label: '消息更新', color: '#03A9F4', icon: '📝' },
  'message.deleted': { label: '消息删除', color: '#FF9800', icon: '❌' },
  'turn.started': { label: '回合开始', color: '#9C27B0', icon: '▶️' },
  'turn.completed': { label: '回合完成', color: '#4CAF50', icon: '✅' },
  'turn.failed': { label: '回合失败', color: '#F44336', icon: '❌' },
  'tool.call.started': { label: '工具调用开始', color: '#FF5722', icon: '🔧' },
  'tool.call.completed': { label: '工具调用完成', color: '#8BC34A', icon: '⚙️' },
  'tool.call.failed': { label: '工具调用失败', color: '#F44336', icon: '⚠️' },
  'model.stream.start': { label: '流式开始', color: '#00BCD4', icon: '🌊' },
  'model.stream.end': { label: '流式结束', color: '#009688', icon: '🏁' },
  'memory.added': { label: '记忆添加', color: '#E91E63', icon: '🧠' },
  'memory.deleted': { label: '记忆删除', color: '#795548', icon: '🗑️' },
  'system.error': { label: '系统错误', color: '#F44336', icon: '🚨' },
  'custom': { label: '自定义', color: '#607D8B', icon: '📌' },
};

function getEventConfig(type: string) {
  return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG['custom'];
}

/* ------------------------------------------------------------------ */
/*  时间格式化                                                         */
/* ------------------------------------------------------------------ */

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}天前`;
  return formatTimestamp(ts);
}

/* ------------------------------------------------------------------ */
/*  组件                                                               */
/* ------------------------------------------------------------------ */

const EventLedgerPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // ==================== 状态 ====================

  // 统计数据
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 会话列表
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<string>('all');

  // 事件列表
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // 查询条件
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [timeRangeStart, setTimeRangeStart] = useState<string>('');
  const [timeRangeEnd, setTimeRangeEnd] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);

  // 事件详情
  const [selectedEvent, setSelectedEvent] = useState<LedgerEvent | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // 错误提示
  const [error, setError] = useState<string | null>(null);

  // ==================== 加载统计数据 ====================

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setError(null);
    try {
      const res = await eventLedgerApi.getStats();
      if (res.ok && res.data) {
        setStats(res.data);
      } else {
        setError(res.error || '获取统计信息失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ==================== 加载会话列表 ====================

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setError(null);
    try {
      const options: { status?: string; limit?: number; sortBy?: string } = {
        limit: 50,
        sortBy: 'updated_at',
      };
      if (sessionFilter !== 'all') {
        options.status = sessionFilter;
      }
      const res = await eventLedgerApi.listSessions(options);
      if (res.ok && res.data) {
        setSessions(res.data);
      } else {
        setError(res.error || '获取会话列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionFilter]);

  // ==================== 加载事件列表 ====================

  const loadEvents = useCallback(async () => {
    if (!selectedSessionId) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    setError(null);
    try {
      const options: { types?: string; limit?: number; reverse?: boolean } = {
        limit,
        reverse: true,
      };
      if (eventTypeFilter !== 'all') {
        options.types = eventTypeFilter;
      }
      const res = await eventLedgerApi.getEvents(selectedSessionId, options);
      if (res.ok && res.data) {
        // 时间范围过滤
        let filtered = res.data;
        if (timeRangeStart) {
          const startTs = new Date(timeRangeStart).getTime();
          filtered = filtered.filter(e => e.timestamp >= startTs);
        }
        if (timeRangeEnd) {
          const endTs = new Date(timeRangeEnd).getTime();
          filtered = filtered.filter(e => e.timestamp <= endTs);
        }
        setEvents(filtered);
      } else {
        setError(res.error || '获取事件列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setEventsLoading(false);
    }
  }, [selectedSessionId, eventTypeFilter, timeRangeStart, timeRangeEnd, limit]);

  // ==================== 初始化加载 ====================

  useEffect(() => {
    loadStats();
    loadSessions();
  }, [loadStats, loadSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      loadEvents();
    }
  }, [selectedSessionId, loadEvents]);

  // ==================== 统计图表数据 ====================

  const eventTypeChartData = useMemo(() => {
    if (!events.length) return [];
    const counts: Record<string, number> = {};
    events.forEach(e => {
      const config = getEventConfig(e.type);
      counts[config.label] = (counts[config.label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [events]);

  const PIE_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#E91E63', '#607D8B'];

  // ==================== 渲染 ====================

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
          事件溯源查询
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="刷新">
            <IconButton
              size="small"
              onClick={() => { loadStats(); loadSessions(); if (selectedSessionId) loadEvents(); }}
              disabled={statsLoading || sessionsLoading || eventsLoading}
              sx={{ color: gs.textSecondary, '&:hover': { color: gs.textPrimary } }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 统计信息卡片 */}
      <Paper
        sx={{
          p: 2,
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.03)',
          border: `1px solid ${isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)'}`,
          flexShrink: 0,
        }}
      >
        {statsLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : stats ? (
          <Grid container spacing={2}>
            <Grid item xs={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageIcon sx={{ fontSize: 20, color: '#6366F1' }} />
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>总会话数</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
                    {stats.totalSessions}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimelineIcon sx={{ fontSize: 20, color: '#22C55E' }} />
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>活跃会话</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
                    {stats.activeSessions}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EventIcon sx={{ fontSize: 20, color: '#F59E0B' }} />
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>总事件数</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
                    {stats.totalEvents}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StatsIcon sx={{ fontSize: 20, color: '#8B5CF6' }} />
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>数据库大小</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
                    {stats.dbSizeHuman}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>暂无统计数据</Typography>
        )}
      </Paper>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 会话列表 */}
      <Paper sx={{ borderRadius: 2, flexShrink: 0 }}>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimelineIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                会话列表
              </Typography>
              <Chip
                label={`${sessions.length} 个`}
                size="small"
                sx={{
                  ml: 1,
                  height: 20,
                  fontSize: '0.65rem',
                  backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                }}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {/* 会话筛选 */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>状态筛选</InputLabel>
                <Select
                  value={sessionFilter}
                  label="状态筛选"
                  onChange={(e) => setSessionFilter(e.target.value)}
                >
                  <MenuItem value="all">全部</MenuItem>
                  <MenuItem value="active">活跃</MenuItem>
                  <MenuItem value="archived">归档</MenuItem>
                  <MenuItem value="incomplete">不完整</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {sessionsLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} />
              </Box>
            ) : sessions.length === 0 ? (
              <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, textAlign: 'center', py: 2 }}>
                暂无会话数据
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 200 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>会话 ID</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>事件数</TableCell>
                      <TableCell>最后事件类型</TableCell>
                      <TableCell>更新时间</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow
                        key={session.sessionId}
                        hover
                        selected={selectedSessionId === session.sessionId}
                        onClick={() => setSelectedSessionId(session.sessionId)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          {session.sessionId.slice(0, 16)}...
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={session.status}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              backgroundColor:
                                session.status === 'active' ? 'rgba(34,197,94,0.15)' :
                                session.status === 'incomplete' ? 'rgba(244,67,54,0.15)' :
                                'rgba(156,163,175,0.15)',
                              color:
                                session.status === 'active' ? '#22C55E' :
                                session.status === 'incomplete' ? '#F44336' :
                                gs.textMuted,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{session.eventCount}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          {session.lastEventType ? getEventConfig(session.lastEventType).label : '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          {formatRelativeTime(session.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="查看事件">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSessionId(session.sessionId);
                              }}
                              sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </AccordionDetails>
        </Accordion>
      </Paper>

      {/* 事件查询表单 */}
      {selectedSessionId && (
        <Paper sx={{ p: 2, borderRadius: 2, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
              事件查询条件
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, ml: 1 }}>
              会话: {selectedSessionId.slice(0, 20)}...
            </Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>事件类型</InputLabel>
                <Select
                  value={eventTypeFilter}
                  label="事件类型"
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                >
                  <MenuItem value="all">全部类型</MenuItem>
                  {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
                    <MenuItem key={key} value={key}>
                      {config.icon} {config.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={3}>
              <TextField
                size="small"
                label="开始时间"
                type="datetime-local"
                value={timeRangeStart}
                onChange={(e) => setTimeRangeStart(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                size="small"
                label="结束时间"
                type="datetime-local"
                value={timeRangeEnd}
                onChange={(e) => setTimeRangeEnd(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>数量限制</InputLabel>
                <Select
                  value={limit}
                  label="数量限制"
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                  <MenuItem value={200}>200</MenuItem>
                  <MenuItem value={500}>500</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={loadEvents}
              disabled={eventsLoading}
              startIcon={eventsLoading ? <CircularProgress size={16} /> : <SearchIcon />}
            >
              查询
            </Button>
          </Box>
        </Paper>
      )}

      {/* 事件列表与统计图表 */}
      <Paper sx={{ flex: 1, borderRadius: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {selectedSessionId ? (
          <>
            {/* 事件统计图表 */}
            {eventTypeChartData.length > 0 && (
              <Box sx={{ p: 2, flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
                  事件类型分布
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, height: 150 }}>
                  {/* 柱状图 */}
                  <Box sx={{ flex: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={eventTypeChartData}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" fill="#6366F1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                  {/* 饼图 */}
                  <Box sx={{ width: 150 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={eventTypeChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={20}
                          outerRadius={50}
                          paddingAngle={2}
                        >
                          {eventTypeChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              </Box>
            )}

            {/* 事件列表 */}
            <Divider />
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <EventIcon sx={{ fontSize: 16, color: gs.textSecondary }} />
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                  事件列表
                </Typography>
                <Chip
                  label={`${events.length} 个`}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                  }}
                />
              </Box>
              {eventsLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : events.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
                    暂无事件数据
                  </Typography>
                </Box>
              ) : (
                <TableContainer sx={{ flex: 1 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>序号</TableCell>
                        <TableCell>时间</TableCell>
                        <TableCell>类型</TableCell>
                        <TableCell>来源</TableCell>
                        <TableCell>目标</TableCell>
                        <TableCell>操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {events.map((event) => {
                        const config = getEventConfig(event.type);
                        return (
                          <TableRow
                            key={event.id}
                            hover
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                              #{event.seq}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>
                              {formatTimestamp(event.timestamp)}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={`${config.icon} ${config.label}`}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  backgroundColor: isDark
                                    ? `${config.color}20`
                                    : `${config.color}15`,
                                  color: config.color,
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                              {event.actor || '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                              {event.runId ? event.runId.slice(0, 12) + '...' : '-'}
                            </TableCell>
                            <TableCell>
                              <Tooltip title="查看详情">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setSelectedEvent(event);
                                    setDetailDialogOpen(true);
                                  }}
                                  sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}
                                >
                                  <ViewIcon fontSize="small" />
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
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
              请先选择一个会话查看事件
            </Typography>
          </Box>
        )}
      </Paper>

      {/* 事件详情对话框 */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          事件详情
          {selectedEvent && (
            <Chip
              label={`#${selectedEvent.seq}`}
              size="small"
              sx={{ ml: 1, height: 20, fontSize: '0.65rem' }}
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {selectedEvent && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 基本信息 */}
              <Card variant="outlined">
                <CardContent>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 1 }}>
                    基本信息
                  </Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                        Event ID
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem' }}>
                        {selectedEvent.id}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                        Session ID
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem' }}>
                        {selectedEvent.sessionId}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                        类型
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem' }}>
                        {getEventConfig(selectedEvent.type).icon} {getEventConfig(selectedEvent.type).label}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                        时间戳
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem' }}>
                        {formatTimestamp(selectedEvent.timestamp)}
                      </Typography>
                    </Grid>
                    {selectedEvent.runId && (
                      <Grid item xs={6}>
                        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                          Run ID
                        </Typography>
                        <Typography sx={{ fontSize: '0.85rem' }}>
                          {selectedEvent.runId}
                        </Typography>
                      </Grid>
                    )}
                    {selectedEvent.actor && (
                      <Grid item xs={6}>
                        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                          Actor
                        </Typography>
                        <Typography sx={{ fontSize: '0.85rem' }}>
                          {selectedEvent.actor}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>

              {/* Payload */}
              {selectedEvent.payload && Object.keys(selectedEvent.payload).length > 0 && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 1 }}>
                      Payload
                    </Typography>
                    <Box
                      sx={{
                        backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                        p: 2,
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 300,
                      }}
                    >
                      <pre
                        style={{
                          fontSize: '0.75rem',
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {JSON.stringify(selectedEvent.payload, null, 2)}
                      </pre>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EventLedgerPanel;