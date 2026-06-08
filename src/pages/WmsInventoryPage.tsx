/**
 * 库存盘点页面
 *
 * 管理库存盘点记录：列表查看、新增、编辑、删除、确认盘点（调整库存）。
 * API: GET/POST/PUT/DELETE /api/wms/inventory
 * 确认盘点: POST /api/wms/inventory/:id/confirm
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
import FactCheckIcon from '@mui/icons-material/FactCheck';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PageHeader from '../components/Common/PageHeader';
import WmsInventoryForm from '../components/wms/WmsInventoryForm';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { exportToCsv } from '../utils/exportCsv';
import type { InventoryCount } from '../types/wms';

const BASE_URL = 'http://localhost:3001';

/** 盘点状态映射 */
const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'info' }> = {
  pending: { label: '待确认', color: 'warning' },
  confirmed: { label: '已确认', color: 'success' },
  adjusted: { label: '已调整', color: 'info' },
};

const WmsInventoryPage: React.FC = () => {
  const { showToast } = useToast();

  const [data, setData] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryCount | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wms/inventory`);
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
    const unsub = subscribeRefresh('wms-inventory', fetchData);
    return unsub;
  }, [fetchData]);

  const filteredData = filterStatus === 'all'
    ? data
    : data.filter((item) => item.status === filterStatus);

  const paginatedData = filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: InventoryCount) => {
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
      const res = await fetch(`${BASE_URL}/api/wms/inventory/${deletingId}`, { method: 'DELETE' });
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

  const handleConfirmClick = (id: number | undefined) => {
    if (id === undefined) return;
    setConfirmingId(id);
    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (confirmingId === null) return;
    try {
      const res = await fetch(`${BASE_URL}/api/wms/inventory/${confirmingId}/confirm`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast('盘点已确认，库存已调整', 'success');
        fetchData();
      } else {
        showToast(json.message || json.error || '确认失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setConfirmDialogOpen(false);
      setConfirmingId(null);
    }
  };

  const handleExport = () => {
    if (filteredData.length === 0) return;
    const headers = ['ID', '仓库ID', '库位编码', 'SKU', '系统数量', '实际数量', '差异', '盘点人', '盘点时间', '状态', '备注'];
    const rows = filteredData.map((item) => [
      String(item.id ?? ''),
      item.warehouseId,
      item.locationCode,
      item.sku,
      String(item.systemQuantity),
      String(item.actualQuantity),
      String(item.variance ?? 0),
      item.counter || '',
      item.countTime || '',
      STATUS_CONFIG[item.status]?.label || item.status,
      item.notes || '',
    ]);
    exportToCsv('inventory-counts.csv', headers, rows);
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString('zh-CN'); } catch { return dateStr; }
  };

  return (
    <Box>
      <PageHeader
        title="库存盘点"
        subtitle="管理库存盘点与差异调整记录"
        summary={`共 ${filteredData.length} 条记录 · 待确认 ${data.filter((i) => i.status === 'pending').length} 条`}
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
                <MenuItem value="pending">待确认</MenuItem>
                <MenuItem value="confirmed">已确认</MenuItem>
                <MenuItem value="adjusted">已调整</MenuItem>
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
              新增盘点
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
            <Typography variant="body2" color="text.secondary">暂无盘点记录</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>仓库ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>库位编码</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>系统数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>实际数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>差异</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>盘点人</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>盘点时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 140 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((item) => {
                    const statusConf = STATUS_CONFIG[item.status] || { label: item.status, color: 'default' as const };
                    return (
                      <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {item.warehouseId}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {item.locationCode}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.sku}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.systemQuantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {item.actualQuantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: (item.variance ?? 0) > 0 ? '#059669'
                                : (item.variance ?? 0) < 0 ? '#DC2626'
                                : '#6B7280',
                            }}
                          >
                            {(item.variance ?? 0) > 0 ? `+${item.variance}` : (item.variance ?? 0)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.counter || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {formatDate(item.countTime)}
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
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {item.status === 'pending' && (
                              <Tooltip title="确认盘点（调整库存）">
                                <IconButton size="small" onClick={() => handleConfirmClick(item.id)} sx={{ color: '#059669' }}>
                                  <FactCheckIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
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

      <WmsInventoryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(null); }}
        onSuccess={fetchData}
        initialData={editingItem}
      />

      {/* 删除确认 */}
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
          <DialogContentText>确定删除该盘点记录吗？此操作不可撤销。</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>确认删除</Button>
        </DialogActions>
      </Dialog>

      {/* 确认盘点 */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
          确认盘点
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <DialogContentText>
            确认后将根据实际盘点数量调整系统库存。确定继续？
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setConfirmDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleConfirmSubmit} sx={{ backgroundColor: '#059669' }}>
            确认
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WmsInventoryPage;
