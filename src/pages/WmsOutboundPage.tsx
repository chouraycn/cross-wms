/**
 * 出库复核页面
 *
 * 管理出库复核记录：列表查看、新增、编辑、删除、模拟扫描。
 * API: GET/POST/PUT/DELETE /api/wms/outbound
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Chip,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PageHeader from '../components/Common/PageHeader';
import WmsOutboundForm from '../components/wms/WmsOutboundForm';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { exportToCsv } from '../utils/exportCsv';
import type { OutboundReview } from '../types/wms';

const BASE_URL = 'http://localhost:3001';

/** 复核状态映射 */
const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'error' }> = {
  pending: { label: '待复核', color: 'warning' },
  passed: { label: '已通过', color: 'success' },
  failed: { label: '未通过', color: 'error' },
};

const WmsOutboundPage: React.FC = () => {
  const { showToast } = useToast();

  const [data, setData] = useState<OutboundReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OutboundReview | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [scanningId, setScanningId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/outbound`);
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setData(json.data || []);
      } else {
        showToast(json.message || json.message || json.error || '获取数据失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-outbound', fetchData);
    return unsub;
  }, [fetchData]);

  const filteredData = filterStatus === 'all'
    ? data
    : data.filter((item) => item.reviewStatus === filterStatus);

  const paginatedData = filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: OutboundReview) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleDeleteClick = (id: number | undefined) => {
    if (id === undefined) return;
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deletingId === null) return;
    try {
      const res = await fetch(`${BASE_URL}/api/wms/outbound/${deletingId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast('删除成功', 'success');
        fetchData();
      } else {
        showToast(json.message || json.error || '删除失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  /** 模拟扫描：调用 API 递增已扫描数量 */
  const handleScan = async (id: number | undefined) => {
    if (id === undefined) return;
    setScanningId(id);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/outbound/${id}/scan`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast('扫描成功', 'success');
        fetchData();
      } else {
        showToast(json.message || json.error || '扫描失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setScanningId(null);
    }
  };

  const handleExport = () => {
    if (filteredData.length === 0) return;
    const headers = ['ID', '出库单号', 'SKU', '商品名称', '预期数量', '已扫描数量', '复核状态', '复核人', '复核时间', '备注'];
    const rows = filteredData.map((item) => [
      String(item.id ?? ''),
      item.outboundOrderId,
      item.sku,
      item.productName || '',
      String(item.expectedQuantity),
      String(item.scannedQuantity),
      STATUS_CONFIG[item.reviewStatus]?.label || item.reviewStatus,
      item.reviewer || '',
      item.reviewTime || '',
      item.notes || '',
    ]);
    exportToCsv('outbound-reviews.csv', headers, rows);
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString('zh-CN'); } catch { return dateStr; }
  };

  return (
    <Box>
      <PageHeader
        title="出库复核"
        subtitle="出库前商品扫描复核，确保发货准确"
        summary={`共 ${filteredData.length} 条记录 · 通过 ${data.filter((i) => i.reviewStatus === 'passed').length} 条`}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>状态筛选</InputLabel>
              <Select
                value={filterStatus}
                label="状态筛选"
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
              >
                <MenuItem value="all">全部</MenuItem>
                <MenuItem value="pending">待复核</MenuItem>
                <MenuItem value="passed">已通过</MenuItem>
                <MenuItem value="failed">未通过</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={handleAdd}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                backgroundColor: '#111827',
                '&:hover': { backgroundColor: '#374151' },
              }}
            >
              新增复核
            </Button>
            <Tooltip title="导出 CSV">
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
                onClick={handleExport}
                sx={{
                  textTransform: 'none',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  borderColor: '#E5E7EB',
                  color: '#6B7280',
                  '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
                }}
              >
                导出
              </Button>
            </Tooltip>
          </Box>
        }
      />

      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">正在加载数据...</Typography>
          </Box>
        ) : filteredData.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">暂无复核记录</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>出库单号</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>商品名称</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>预期数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>已扫描</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>进度</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>复核状态</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>复核人</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>复核时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 140 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((item) => {
                    const statusConf = STATUS_CONFIG[item.reviewStatus] || { label: item.reviewStatus, color: 'default' as const };
                    const progress = item.expectedQuantity > 0
                      ? Math.min((item.scannedQuantity / item.expectedQuantity) * 100, 100)
                      : 0;
                    return (
                      <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.outboundOrderId}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.sku}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.productName || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.expectedQuantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {item.scannedQuantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
                            <LinearProgress
                              variant="determinate"
                              value={progress}
                              sx={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#E5E7EB',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: progress >= 100 ? '#059669' : '#2563EB',
                                },
                              }}
                            />
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#6B7280' }}>
                              {Math.round(progress)}%
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={statusConf.label}
                            size="small"
                            color={statusConf.color}
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.reviewer || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {formatDate(item.reviewTime)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="模拟扫描 +1">
                              <IconButton
                                size="small"
                                onClick={() => handleScan(item.id)}
                                disabled={scanningId === item.id}
                                sx={{ color: '#7C3AED' }}
                              >
                                <QrCodeScannerIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                            <IconButton size="small" onClick={() => handleEdit(item)} sx={{ color: '#2563EB' }}>
                              <EditIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleDeleteClick(item.id)} sx={{ color: '#DC2626' }}>
                              <DeleteIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredData.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 20, 50]}
              labelRowsPerPage="每页行数："
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
            />
          </>
        )}
      </Card>

      <WmsOutboundForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(null); }}
        onSuccess={fetchData}
        initialData={editingItem}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
          确认删除
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <DialogContentText>确定删除该复核记录吗？此操作不可撤销。</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>确认删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WmsOutboundPage;
