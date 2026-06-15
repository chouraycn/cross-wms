/**
 * ApiHistoryPage — API 请求历史页
 *
 * v3.0: 展示 API 模板执行的历史记录
 * - 分页列表（URL、方法、状态码、耗时、成功/失败）
 * - 支持查看请求/响应详情
 * - 支持删除单条和清空全部
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CodeIcon from '@mui/icons-material/Code';

import {
  fetchHistory,
  deleteHistoryRecord,
  clearAllHistory,
  type ApiHistoryRecord,
} from '../services/apiHistory/api';

// ===================== Method Colors =====================

const METHOD_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'warning' | 'success'> = {
  GET: 'success',
  POST: 'primary',
  PUT: 'warning',
  PATCH: 'info',
  DELETE: 'error',
};

// ===================== Component =====================

const ApiHistoryPage: React.FC = () => {
  const [records, setRecords] = useState<ApiHistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 详情对话框
  const [detailRecord, setDetailRecord] = useState<ApiHistoryRecord | null>(null);

  // 清空确认对话框
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // 删除单条
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 通知
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHistory({
        page: page + 1,
        pageSize: rowsPerPage,
      });
      setRecords(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载历史记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 删除单条记录 */
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHistoryRecord(id);
      setSnackbar({ open: true, message: '记录已删除', severity: 'success' });
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '删除失败', severity: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  /** 清空全部记录 */
  const handleClearAll = async () => {
    setClearing(true);
    try {
      const result = await clearAllHistory();
      setSnackbar({ open: true, message: `已清空 ${result.deletedCount} 条记录`, severity: 'success' });
      setClearDialogOpen(false);
      setPage(0);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '清空失败', severity: 'error' });
    } finally {
      setClearing(false);
    }
  };

  /** 格式化时间 */
  const formatTime = (isoStr: string): string => {
    try {
      return new Date(isoStr).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  /** 渲染 JSON 内容 */
  const renderJsonContent = (label: string, content: string | null): React.ReactNode => {
    if (!content) return null;
    let displayText = content;
    try {
      displayText = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // 非 JSON 直接展示
    }
    return (
      <Accordion variant="outlined" sx={{ mb: 1 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
          <Typography variant="caption" fontWeight={600}>{label}</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Box
            component="pre"
            sx={{
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              m: 0,
              maxHeight: 300,
              overflow: 'auto',
              bgcolor: 'action.hover',
              p: 1.5,
              borderRadius: 1,
            }}
          >
            {displayText.substring(0, 5000)}
            {displayText.length > 5000 ? '\n...（已截断）' : ''}
          </Box>
        </AccordionDetails>
      </Accordion>
    );
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <HistoryIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          API 请求历史
        </Typography>
        {total > 0 && (
          <Tooltip title="清空全部历史">
            <IconButton color="error" onClick={() => setClearDialogOpen(true)}>
              <DeleteSweepIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        记录每次 API 模板执行的请求和响应信息，支持查看详情。
      </Typography>

      {/* 错误提示 */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 表格 */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={60}>状态</TableCell>
              <TableCell width={70}>方法</TableCell>
              <TableCell>URL</TableCell>
              <TableCell width={70}>状态码</TableCell>
              <TableCell width={70}>耗时</TableCell>
              <TableCell width={120}>时间</TableCell>
              <TableCell width={60}>详情</TableCell>
              <TableCell width={50}>删除</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  加载中...
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  暂无请求记录
                </TableCell>
              </TableRow>
            ) : (
              records.map((rec) => (
                <TableRow key={rec.id} hover>
                  <TableCell>
                    {rec.isSuccess ? (
                      <Tooltip title="成功">
                        <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main' }} />
                      </Tooltip>
                    ) : (
                      <Tooltip title={rec.error || '失败'}>
                        <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main' }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={rec.method}
                      size="small"
                      color={METHOD_COLORS[rec.method] || 'default'}
                      variant="filled"
                      sx={{ fontSize: '0.7rem', fontWeight: 600, minWidth: 48 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      fontFamily="monospace"
                      fontSize="0.8rem"
                      sx={{
                        maxWidth: 360,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rec.url}
                    </Typography>
                    {rec.error && (
                      <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                        {rec.error.substring(0, 80)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {rec.statusCode !== null ? (
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        color={rec.statusCode < 400 ? 'success.main' : 'error.main'}
                      >
                        {rec.statusCode}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {rec.durationMs}ms
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(rec.executedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="查看详情">
                      <IconButton size="small" onClick={() => setDetailRecord(rec)}>
                        <CodeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(rec.id)}
                        disabled={deletingId === rec.id}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 分页 */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      {/* 详情对话框 */}
      <Dialog
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem' }}>
          请求详情
        </DialogTitle>
        <DialogContent dividers>
          {detailRecord && (
            <Box>
              {/* 基本信息 */}
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  label={detailRecord.method}
                  size="small"
                  color={METHOD_COLORS[detailRecord.method] || 'default'}
                />
                {detailRecord.statusCode !== null && (
                  <Chip
                    label={`${detailRecord.statusCode}`}
                    size="small"
                    color={detailRecord.statusCode < 400 ? 'success' : 'error'}
                    variant="outlined"
                  />
                )}
                <Chip
                  label={`${detailRecord.durationMs}ms`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  icon={detailRecord.isSuccess ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}
                  label={detailRecord.isSuccess ? '成功' : '失败'}
                  size="small"
                  color={detailRecord.isSuccess ? 'success' : 'error'}
                  variant="outlined"
                />
              </Box>

              <Typography variant="body2" fontFamily="monospace" sx={{ mb: 2, wordBreak: 'break-all' }}>
                {detailRecord.url}
              </Typography>

              {detailRecord.error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {detailRecord.error}
                </Alert>
              )}

              {detailRecord.extractedPreview && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    提取预览
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      m: 0,
                      bgcolor: 'action.hover',
                      p: 1,
                      borderRadius: 1,
                      mt: 0.5,
                    }}
                  >
                    {detailRecord.extractedPreview}
                  </Box>
                </Box>
              )}

              {/* 请求/响应详情 */}
              {renderJsonContent('请求头', detailRecord.requestHeaders)}
              {renderJsonContent('请求体', detailRecord.requestBody)}
              {renderJsonContent('响应头', detailRecord.responseHeaders)}
              {renderJsonContent('响应体', detailRecord.responseBody)}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailRecord(null)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 清空确认对话框 */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>确认清空</DialogTitle>
        <DialogContent>
          <Typography>
            确定要清空所有 {total} 条请求历史记录吗？此操作不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>取消</Button>
          <Button onClick={handleClearAll} variant="contained" color="error" disabled={clearing}>
            {clearing ? '清空中...' : '确认清空'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 通知条 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ApiHistoryPage;
