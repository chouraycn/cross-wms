/**
 * 库存盘点页面
 *
 * 管理库存盘点记录：列表查看、新增、编辑、删除、录入实盘、确认调整。
 * API: /api/wms/inventory-count
 * 状态流转: pending → (录入实盘) → counted → (确认调整) → adjusted
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
  Alert,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../constants/theme';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PageHeader from '../components/Common/PageHeader';
import WmsInventoryForm from '../components/wms/WmsInventoryForm';
import WmsInventoryStats from '../components/wms/WmsInventoryStats';
import WmsInventoryBatchCreate from '../components/wms/WmsInventoryBatchCreate';
import WmsInventoryAdjustDialog from '../components/wms/WmsInventoryAdjustDialog';
import WmsVarianceChart from '../components/wms/charts/WmsVarianceChart';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { exportToCsv } from '../utils/exportCsv';
import {
  fetchInventoryCounts,
  deleteInventoryCount,
} from '../api/wmsInventoryApi';
import { INVENTORY_STATUS_CONFIG, EXPORT_FILENAME, EXPORT_HEADERS } from '../constants/wmsInventoryStatus';
import type { InventoryCount } from '../types/wms';

const WmsInventoryPage: React.FC = () => {
  const { showToast } = useToast();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [data, setData] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryCount | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<InventoryCount | null>(null);

  const [batchCreateOpen, setBatchCreateOpen] = useState(false);

  // ===================== 数据获取 =====================

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchInventoryCounts(
        filterStatus === 'all' ? undefined : { status: filterStatus as InventoryCount['status'] }
      );
      setData(result || []);
    } catch {
      showToast('获取数据失败', 'error');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-inventory', fetchData);
    return unsub;
  }, [fetchData]);

  // ===================== 筛选逻辑 =====================

  const filteredData = filterStatus === 'all'
    ? data
    : data.filter((item) => item.status === filterStatus);

  const paginatedData = filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ===================== 操作处理 =====================

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
      const success = await deleteInventoryCount(deletingId);
      if (success) {
        showToast('删除成功', 'success');
        fetchData();
      } else {
        showToast('删除失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  // 录入实盘（切换到 count 模式）
  const handleCountClick = (item: InventoryCount) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  // 确认调整
  const handleAdjustClick = (item: InventoryCount) => {
    setAdjustingItem(item);
    setAdjustDialogOpen(true);
  };

  // ===================== 导出功能 =====================

  const handleExport = () => {
    if (filteredData.length === 0) {
      showToast('没有数据可导出', 'warning');
      return;
    }
    const rows = filteredData.map((item) => [
      String(item.id ?? ''),
      item.warehouseId,
      item.locationCode,
      item.sku,
      String(item.systemQuantity),
      String(item.actualQuantity ?? ''),
      String(item.variance ?? 0),
      item.counter || '',
      item.countTime || '',
      INVENTORY_STATUS_CONFIG[item.status]?.label || item.status,
      item.notes || '',
    ]);
    exportToCsv(EXPORT_FILENAME, EXPORT_HEADERS, rows);
    showToast(`已导出 ${rows.length} 条记录`, 'success');
  };

  // ===================== 渲染辅助 =====================

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString('zh-CN'); } catch { return dateStr; }
  };

  const getVarianceColor = (variance: number): string => {
    if (variance > 0) return '#059669';
    if (variance < 0) return '#DC2626';
    return gs.textMuted;
  };

  return (
    <Box>
      <PageHeader
        title="库存盘点"
        subtitle="管理库存盘点与差异调整记录"
        summary={`共 ${filteredData.length} 条记录 · 待盘点 ${data.filter((i) => i.status === 'pending').length} 条`}
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
                <MenuItem value="pending">待盘点</MenuItem>
                <MenuItem value="counted">已盘点</MenuItem>
                <MenuItem value="adjusted">已调整</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setBatchCreateOpen(true)}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                borderColor: gs.border,
                color: gs.textMuted,
                '&:hover': { borderColor: gs.textDisabled, backgroundColor: gs.bgHover },
              }}
            >
              批量创建
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={handleAdd}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                backgroundColor: gs.textPrimary,
                '&:hover': { backgroundColor: gs.textSecondary },
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
                  borderColor: gs.border,
                  color: gs.textMuted,
                  '&:hover': { borderColor: gs.textDisabled, backgroundColor: gs.bgHover },
                }}
              >
                导出
              </Button>
            </Tooltip>
          </Box>
        }
      />

      {/* 统计卡片 */}
      <WmsInventoryStats data={data} />

      {/* 差异趋势图表 */}
      <Box sx={{ mt: 3 }}>
        <WmsVarianceChart data={data} />
      </Box>

      {/* 数据表格 */}
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
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
                  <TableRow sx={{ backgroundColor: gs.bgHover }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>仓库ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>库位编码</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>系统数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>实盘数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>差异</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>盘点人</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>盘点时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 180 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((item) => {
                    const statusConf = INVENTORY_STATUS_CONFIG[item.status] || { label: item.status, color: 'default' as const };
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
                            {item.actualQuantity ?? '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: getVarianceColor(item.variance ?? 0),
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
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
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
                            {/* pending: 录入实盘 + 编辑 + 删除 */}
                            {item.status === 'pending' && (
                              <>
                                <Tooltip title="录入实盘">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCountClick(item)}
                                    sx={{ color: '#059669' }}
                                  >
                                    <FactCheckIcon sx={{ fontSize: 18 }} />
                                  </IconButton>
                                </Tooltip>
                                <IconButton size="small" onClick={() => handleEdit(item)} sx={{ color: '#2563EB' }}>
                                  <EditIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDeleteClick(item.id)} sx={{ color: '#DC2626' }}>
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </>
                            )}

                            {/* counted: 确认调整 + 编辑 + 删除 */}
                            {item.status === 'counted' && (
                              <>
                                <Tooltip title="确认调整">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleAdjustClick(item)}
                                    sx={{ color: '#059669' }}
                                  >
                                    <FactCheckIcon sx={{ fontSize: 18 }} />
                                  </IconButton>
                                </Tooltip>
                                <IconButton size="small" onClick={() => handleEdit(item)} sx={{ color: '#2563EB' }}>
                                  <EditIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDeleteClick(item.id)} sx={{ color: '#DC2626' }}>
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </>
                            )}

                            {/* adjusted: 查看详情 */}
                            {item.status === 'adjusted' && (
                              <Tooltip title="查看详情">
                                <IconButton
                                  size="small"
                                  onClick={() => handleEdit(item)}
                                  sx={{ color: gs.textMuted }}
                                >
                                  <EditIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
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

      {/* 新增/编辑/录入实盘表单 */}
      <WmsInventoryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(null); }}
        onSuccess={fetchData}
        initialData={editingItem}
      />

      {/* 批量创建弹窗 */}
      <WmsInventoryBatchCreate
        open={batchCreateOpen}
        onClose={() => setBatchCreateOpen(false)}
        onSuccess={fetchData}
      />

      {/* 确认调整弹窗 */}
      <WmsInventoryAdjustDialog
        open={adjustDialogOpen}
        inventoryItem={adjustingItem}
        onClose={() => {
          setAdjustDialogOpen(false);
          setAdjustingItem(null);
        }}
        onSuccess={() => {
          fetchData();
          setAdjustDialogOpen(false);
          setAdjustingItem(null);
        }}
      />

      {/* 删除确认 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>
          确认删除
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <DialogContentText>确定删除该盘点记录吗？此操作不可撤销。</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>确认删除</Button>
        </DialogActions>
      </Dialog>

      {/* 确认调整 */}
      <Dialog
        open={adjustDialogOpen}
        onClose={() => setAdjustDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>
          确认差异调整
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {adjustingItem && (
            <Box>
              <DialogContentText sx={{ mb: 2 }}>
                确认后将根据实盘数量调整系统库存。确定继续？
              </DialogContentText>
              <Box sx={{ bgcolor: gs.bgHover, p: 2, borderRadius: 1, border: `1px solid ${gs.border}` }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>仓库：</strong>{adjustingItem.warehouseId}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>库位：</strong>{adjustingItem.locationCode}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>SKU：</strong>{adjustingItem.sku}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>系统数量：</strong>{adjustingItem.systemQuantity}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>实盘数量：</strong>{adjustingItem.actualQuantity}
                </Typography>
                <Typography variant="body2" sx={{ color: getVarianceColor(adjustingItem.variance ?? 0), fontWeight: 600 }}>
                  <strong>差异：</strong>{(adjustingItem.variance ?? 0) > 0 ? '+' : ''}{adjustingItem.variance ?? 0}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => setAdjustDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              // 调整逻辑由 WmsInventoryAdjustDialog 内部处理
              // 这里只需要关闭对话框（成功后在 onSuccess 中处理）
            }}
            sx={{ backgroundColor: '#059669' }}
          >
            确认调整
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WmsInventoryPage;
