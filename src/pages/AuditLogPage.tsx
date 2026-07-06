/**
 * AuditLogPage — 审计日志查看面板
 *
 * 展示消息审计日志，支持查询、过滤和导出。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  LinearProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  IconButton,
  Snackbar,
  Alert,
  Tooltip,
  Pagination,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';

import {
  fetchAuditLogs,
  fetchAuditSummary,
  exportAuditJson,
  exportAuditCsv,
  type AuditEntry,
  type AuditSeverity,
} from '../services/audit/api';
import { getGrayScale } from '../constants/theme';

const SEVERITY_CONFIG: Record<AuditSeverity, { color: 'default' | 'success' | 'warning' | 'error' | 'info'; icon: React.ReactElement }> = {
  debug: { color: 'default', icon: <InfoIcon fontSize="small" /> },
  info: { color: 'info', icon: <InfoIcon fontSize="small" /> },
  warning: { color: 'warning', icon: <WarningIcon fontSize="small" /> },
  error: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
  critical: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
};

const ACTION_LABELS: Record<string, string> = {
  message_created: '消息创建',
  message_sent: '消息发送',
  message_delivered: '消息送达',
  message_read: '消息已读',
  message_failed: '消息失败',
  message_retry: '消息重试',
  message_cancelled: '消息取消',
  session_created: '会话创建',
  session_ended: '会话结束',
  session_archived: '会话归档',
  content_modified: '内容修改',
  recipient_added: '添加收件人',
  recipient_removed: '移除收件人',
};

const AuditLogPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLogs({
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        actor: searchQuery || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [severityFilter, actionFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleExportJson = async () => {
    try {
      const blob = await exportAuditJson();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${Date.now()}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    }
  };

  const handleExportCsv = async () => {
    try {
      const blob = await exportAuditCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    }
  };

  const formatTimestamp = (ts: number): string => {
    return new Date(ts).toLocaleString('zh-CN');
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          审计日志
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadLogs} disabled={loading}>
            刷新
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportJson}>
            导出 JSON
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportCsv}>
            导出 CSV
          </Button>
        </Box>
      </Box>

      {/* 过滤器 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                placeholder="搜索 actor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>严重级别</InputLabel>
                <Select value={severityFilter} label="严重级别" onChange={(e) => setSeverityFilter(e.target.value)}>
                  <MenuItem value="all">全部</MenuItem>
                  <MenuItem value="debug">Debug</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>动作</InputLabel>
                <Select value={actionFilter} label="动作" onChange={(e) => setActionFilter(e.target.value)}>
                  <MenuItem value="all">全部</MenuItem>
                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 日志列表 */}
      <Card>
        <CardContent>
          {loading && <LinearProgress sx={{ mb: 2 }} />}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>时间</TableCell>
                  <TableCell>严重级别</TableCell>
                  <TableCell>动作</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>描述</TableCell>
                  <TableCell>会话</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: gs.textMuted }}>
                      <Typography>暂无审计日志</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const severity = SEVERITY_CONFIG[entry.severity];
                    return (
                      <TableRow key={entry.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {formatTimestamp(entry.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={severity.icon}
                            label={entry.severity.toUpperCase()}
                            color={severity.color}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip label={ACTION_LABELS[entry.action] || entry.action} size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {entry.actor}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {entry.actorType}
                          </Typography>
                        </TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell>
                          <Tooltip title={entry.sessionKey}>
                            <Typography
                              variant="caption"
                              sx={{
                                maxWidth: 120,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'block',
                              }}
                            >
                              {entry.sessionKey}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </CardContent>
      </Card>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AuditLogPage;
