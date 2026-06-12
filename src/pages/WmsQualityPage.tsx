/**
 * 入库质检页面
 *
 * 管理入库质检记录：列表查看、新增、编辑、删除。
 * API: GET/POST/PUT/DELETE /api/wms/quality
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
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PageHeader from '../components/Common/PageHeader';
import WmsQualityForm from '../components/wms/WmsQualityForm';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { exportToCsv } from '../utils/exportCsv';
import type { QualityCheck } from '../types/wms';
import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;

/** 质检状态映射 */
const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'error' }> = {
  pending: { label: '待检', color: 'warning' },
  qualified: { label: '合格', color: 'success' },
  unqualified: { label: '不合格', color: 'error' },
};

const WmsQualityPage: React.FC = () => {
  const { showToast } = useToast();

  const [data, setData] = useState<QualityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // 表单弹窗
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QualityCheck | null>(null);

  // 删除确认
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/quality`);
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setData(json.data || []);
      } else {
        showToast(json.message || json.error || '获取数据失败', 'error');
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
    const unsub = subscribeRefresh('wms-quality', fetchData);
    return unsub;
  }, [fetchData]);

  const filteredData = filterStatus === 'all'
    ? data
    : data.filter((item) => item.qualityStatus === filterStatus);

  const paginatedData = filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: QualityCheck) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingItem(null);
  };

  const handleFormSuccess = () => {
    fetchData();
  };

  const handleDeleteClick = (id: number | undefined) => {
    if (id === undefined) return;
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deletingId === null) return;
    try {
      const res = await fetch(`${BASE_URL}/api/wms/quality/${deletingId}`, { method: 'DELETE' });
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

  const handleExport = () => {
    if (filteredData.length === 0) return;
    const headers = ['ID', '仓库ID', 'SKU', '商品名称', '批次号', '预期数量', '实际数量', '质检状态', '检验员', '检验时间', '备注'];
    const rows = filteredData.map((item) => [
      String(item.id ?? ''),
      item.warehouseId,
      item.sku,
      item.productName || '',
      item.batchNo || '',
      String(item.expectedQuantity),
      String(item.actualQuantity),
      STATUS_CONFIG[item.qualityStatus]?.label || item.qualityStatus,
      item.inspector || '',
      item.checkTime || '',
      item.notes || '',
    ]);
    exportToCsv('quality-checks.csv', headers, rows);
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  return (
    <Box>
      <PageHeader
        title="入库质检"
        subtitle="管理入库商品的质量检验记录"
        summary={`共 ${filteredData.length} 条记录`}
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
                <MenuItem value="pending">待检</MenuItem>
                <MenuItem value="qualified">合格</MenuItem>
                <MenuItem value="unqualified">不合格</MenuItem>
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
              新增质检
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
            <Typography variant="body2" color="text.secondary">暂无质检记录</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>商品名称</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>批次号</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>预期数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>实际数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>质检状态</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>检验员</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>检验时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 100 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((item) => {
                    const statusConf = STATUS_CONFIG[item.qualityStatus] || { label: item.qualityStatus, color: 'default' as const };
                    return (
                      <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.id}
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
                            {item.batchNo || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.expectedQuantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {item.actualQuantity}
                          </Typography>
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
                            {item.inspector || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {formatDate(item.checkTime)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
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

      {/* 表单弹窗 */}
      <WmsQualityForm
        open={formOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        initialData={editingItem}
      />

      {/* 删除确认弹窗 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
          确认删除
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <DialogContentText>
            确定删除该质检记录吗？此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WmsQualityPage;
