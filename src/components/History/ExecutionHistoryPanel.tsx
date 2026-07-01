/**
 * 执行历史面板 — 查看工作流、触发器、手动执行的历史记录
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Collapse,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  FilterList as FilterListIcon,
  AccessTime as AccessTimeIcon,
} from '@mui/icons-material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import {
  getExecutionHistory,
  getExecutionHistoryStats,
  deleteExecutionRecord,
  purgeExecutionHistory,
  type ExecutionRecord,
  type ExecutionHistoryStats,
  type ExecutionHistoryFilter,
} from '../../services/executionHistoryApi';
import ExecutionReplay from './ExecutionReplay';

// ===================== Types =====================

interface StatusFilter {
  label: string;
  value: ExecutionHistoryFilter['status'];
  color: 'success' | 'error' | 'warning' | 'default';
  icon: React.ReactElement;
}

interface TypeFilter {
  label: string;
  value: ExecutionHistoryFilter['type'];
  icon: React.ReactElement;
}

// ===================== Constants =====================

const STATUS_FILTERS: StatusFilter[] = [
  { label: '成功', value: 'success', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  { label: '失败', value: 'failed', color: 'error', icon: <ErrorIcon fontSize="small" /> },
  { label: '运行中', value: 'running', color: 'warning', icon: <ScheduleIcon fontSize="small" /> },
  { label: '取消', value: 'cancelled', color: 'default', icon: <CancelIcon fontSize="small" /> },
];

const TYPE_FILTERS: TypeFilter[] = [
  { label: '工作流', value: 'workflow', icon: <TrendingUpIcon fontSize="small" /> },
  { label: '触发器', value: 'trigger', icon: <ScheduleIcon fontSize="small" /> },
  { label: '手动', value: 'manual', icon: <PlayArrowIcon fontSize="small" /> },
];

// ===================== Helper Functions =====================

function formatDuration(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatTimestamp(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}

function getStatusColor(status: ExecutionRecord['status']): 'success' | 'error' | 'warning' | 'default' {
  switch (status) {
    case 'success': return 'success';
    case 'failed': return 'error';
    case 'running': return 'warning';
    case 'cancelled': return 'default';
    default: return 'default';
  }
}

function getStatusIcon(status: ExecutionRecord['status']): React.ReactElement | undefined {
  switch (status) {
    case 'success': return <CheckCircleIcon fontSize="small" />;
    case 'failed': return <ErrorIcon fontSize="small" />;
    case 'running': return <ScheduleIcon fontSize="small" />;
    case 'cancelled': return <CancelIcon fontSize="small" />;
    default: return undefined;
  }
}

// ===================== Component =====================

const ExecutionHistoryPanel: React.FC = React.memo(() => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // 状态
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ExecutionHistoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 分页
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 20,
  });

  // 过滤
  const [statusFilter, setStatusFilter] = useState<ExecutionHistoryFilter['status'] | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<ExecutionHistoryFilter['type'] | undefined>(undefined);

  // 展开详情
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayDialogOpen, setReplayDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ExecutionRecord | null>(null);

  // 清理对话框
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter: ExecutionHistoryFilter = {};
      if (statusFilter) filter.status = statusFilter;
      if (typeFilter) filter.type = typeFilter;

      const offset = paginationModel.page * paginationModel.pageSize;
      const result = await getExecutionHistory(paginationModel.pageSize, offset, filter);
      setRecords(result.data);
      setTotal(result.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [paginationModel, statusFilter, typeFilter]);

  // 加载统计
  const loadStats = useCallback(async () => {
    try {
      const filter: ExecutionHistoryFilter = {};
      if (statusFilter) filter.status = statusFilter;
      if (typeFilter) filter.type = typeFilter;
      const statsResult = await getExecutionHistoryStats(filter);
      setStats(statsResult);
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadData();
    loadStats();
  }, [loadData, loadStats]);

  // 删除记录
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteExecutionRecord(id);
      loadData();
      loadStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      setError(msg);
    }
  }, [loadData, loadStats]);

  // 清理历史
  const handlePurge = useCallback(async () => {
    setPurgeLoading(true);
    try {
      await purgeExecutionHistory({ keepLatest: 100 });
      setPurgeDialogOpen(false);
      loadData();
      loadStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '清理失败';
      setError(msg);
    } finally {
      setPurgeLoading(false);
    }
  }, [loadData, loadStats]);

  // 查看回放
  const handleViewReplay = useCallback((record: ExecutionRecord) => {
    setSelectedRecord(record);
    setReplayDialogOpen(true);
  }, []);

  // 表格列定义
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'status',
      headerName: '状态',
      width: 100,
      renderCell: (params) => {
        const status = params.value as ExecutionRecord['status'];
        return (
          <Chip
            size="small"
            label={STATUS_FILTERS.find(f => f.value === status)?.label || status}
            color={getStatusColor(status)}
            icon={getStatusIcon(status)}
          />
        );
      },
    },
    {
      field: 'type',
      headerName: '类型',
      width: 100,
      renderCell: (params) => {
        const type = params.value as ExecutionRecord['type'];
        return TYPE_FILTERS.find(f => f.value === type)?.label || type;
      },
    },
    {
      field: 'startTime',
      headerName: '开始时间',
      width: 180,
      renderCell: (params) => formatTimestamp(params.value as number),
    },
    {
      field: 'duration',
      headerName: '耗时',
      width: 100,
      renderCell: (params) => formatDuration(params.value as number),
    },
    {
      field: 'workflowId',
      headerName: '工作流',
      width: 150,
      renderCell: (params) => params.value || '-',
    },
    {
      field: 'error',
      headerName: '错误',
      width: 200,
      renderCell: (params) => {
        const error = params.value as string | undefined;
        if (!error) return '-';
        return (
          <Typography variant="body2" color="error" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {error.slice(0, 50)}
          </Typography>
        );
      },
    },
    {
      field: 'actions',
      headerName: '操作',
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const id = params.row.id as string;
        const record = params.row as ExecutionRecord;
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="查看回放">
              <IconButton size="small" onClick={() => handleViewReplay(record)}>
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除">
              <IconButton size="small" onClick={() => handleDelete(id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ], [handleDelete, handleViewReplay]);

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 统计卡片 */}
      {stats && (
        <Paper sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">总计:</Typography>
            <Chip size="small" label={stats.total} />
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">成功率:</Typography>
            <Chip size="small" label={`${(stats.successRate * 100).toFixed(1)}%`} color="success" />
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">平均耗时:</Typography>
            <Chip size="small" label={formatDuration(stats.avgDuration)} />
          </Box>
        </Paper>
      )}

      {/* 过滤器 */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          <FilterListIcon color="action" />
          <Typography variant="subtitle2">过滤条件</Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setStatusFilter(undefined);
              setTypeFilter(undefined);
            }}
          >
            清除
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={() => setPurgeDialogOpen(true)}
          >
            清理历史
          </Button>
          <Box sx={{ ml: 'auto' }}>
            <Tooltip title="刷新">
              <IconButton onClick={loadData}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* 状态过滤 */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>状态:</Typography>
          {STATUS_FILTERS.map((filter) => (
            <Chip
              key={filter.value}
              size="small"
              label={filter.label}
              icon={filter.icon}
              color={statusFilter === filter.value ? filter.color : 'default'}
              variant={statusFilter === filter.value ? 'filled' : 'outlined'}
              onClick={() => setStatusFilter(filter.value === statusFilter ? undefined : filter.value)}
              clickable
            />
          ))}
        </Box>

        {/* 类型过滤 */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>类型:</Typography>
          {TYPE_FILTERS.map((filter) => (
            <Chip
              key={filter.value}
              size="small"
              label={filter.label}
              icon={filter.icon}
              color={typeFilter === filter.value ? 'primary' : 'default'}
              variant={typeFilter === filter.value ? 'filled' : 'outlined'}
              onClick={() => setTypeFilter(filter.value === typeFilter ? undefined : filter.value)}
              clickable
            />
          ))}
        </Box>
      </Paper>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 数据表格 */}
      <Paper sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={records}
          columns={columns}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 20, 50, 100]}
          rowCount={total}
          loading={loading}
          getRowId={(row) => row.id}
          sx={{
            border: 0,
            '& .MuiDataGrid-cell:focus': { outline: 'none' },
          }}
          localeText={{
            noRowsLabel: '暂无执行记录',
          }}
        />
      </Paper>

      {/* 回放对话框 */}
      <Dialog
        open={replayDialogOpen}
        onClose={() => setReplayDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>执行回放</DialogTitle>
        <DialogContent>
          {selectedRecord && <ExecutionReplay record={selectedRecord} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplayDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 清理对话框 */}
      <Dialog open={purgeDialogOpen} onClose={() => setPurgeDialogOpen(false)}>
        <DialogTitle>清理执行历史</DialogTitle>
        <DialogContent>
          <Typography>
            是否清理执行历史，保留最新的 100 条记录？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurgeDialogOpen(false)}>取消</Button>
          <Button
            color="warning"
            onClick={handlePurge}
            disabled={purgeLoading}
            startIcon={purgeLoading ? <CircularProgress size={16} /> : null}
          >
            确认清理
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

ExecutionHistoryPanel.displayName = 'ExecutionHistoryPanel';

export default ExecutionHistoryPanel;