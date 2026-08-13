/**
 * 仓库调拨页面
 *
 * 管理多仓库间的调拨单：列表查看、新增、编辑、删除、提交、确认收货、绑定/解绑物流。
 * API: /api/transfer-orders
 * 状态流转: draft → submitted → in_transit → completed
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
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
  TextField,
  Grid,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../constants/theme';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PageHeader from '../components/Common/PageHeader';
import TransferFormDialog from '../components/wms/TransferFormDialog';
import ConfirmReceiveDialog from '../components/wms/ConfirmReceiveDialog';
import BindTransitDialog from '../components/wms/BindTransitDialog';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { STATUS_CONFIG, STATUS_ACTIONS } from '../constants/transferStatus';
import type { TransferOrder, TransferStats } from '../types/wms';
import { useI18n, getDateLocale } from '../components/staff/i18n/index.js';

const TransferPage: React.FC = () => {
  const { showToast } = useToast();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { t } = useI18n();
  const dateLocale = getDateLocale();

  const [data, setData] = useState<TransferOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSku, setFilterSku] = useState<string>('');
  const [stats, setStats] = useState<TransferStats>({ total: 0, draft: 0, submitted: 0, in_transit: 0, completed: 0 });

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TransferOrder | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivingItem, setReceivingItem] = useState<TransferOrder | null>(null);

  const [bindTransitDialogOpen, setBindTransitDialogOpen] = useState(false);
  const [bindingItem, setBindingItem] = useState<TransferOrder | null>(null);

  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<TransferOrder | null>(null);

  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // ===================== 数据获取 =====================

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { fetchTransferOrders, calculateTransferStats } = await import('../api/transferApi');
      const currentPage = page + 1; // API uses 1-based page
      const result = await fetchTransferOrders({
        status: filterStatus === 'all' ? undefined : filterStatus as TransferOrder['status'],
        sku: filterSku || undefined,
        page: currentPage,
        pageSize: rowsPerPage,
      });
      setData(result.items || []);
      setTotal(result.total);
      // Calculate stats from full dataset (fetch all for stats)
      const allResult = await fetchTransferOrders({ pageSize: 9999 });
      const allStats = calculateTransferStats(allResult.items || []);
      setStats(allStats);
    } catch {
      showToast(t('获取数据失败'), 'error');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSku, page, rowsPerPage, showToast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = subscribeRefresh('transfer', fetchData);
    return unsub;
  }, [fetchData]);

  // ===================== 操作处理 =====================

  const handleAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleEdit = (item: TransferOrder) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      const { deleteTransferOrder } = await import('../api/transferApi');
      const success = await deleteTransferOrder(deletingId);
      if (success) {
        showToast(t('删除成功'), 'success');
        fetchData();
      } else {
        showToast(t('删除失败'), 'error');
      }
    } catch (e) {
      showToast((e as Error).message || t('网络错误'), 'error');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const handleSubmitClick = (id: string) => {
    setSubmittingId(id);
    setSubmitDialogOpen(true);
  };

  const handleSubmitConfirm = async () => {
    if (!submittingId) return;
    try {
      const { submitTransferOrder } = await import('../api/transferApi');
      await submitTransferOrder(submittingId, '当前用户');
      showToast(t('提交成功，已扣减出库仓库存'), 'success');
      fetchData();
    } catch (e) {
      showToast((e as Error).message || t('提交失败'), 'error');
    } finally {
      setSubmitDialogOpen(false);
      setSubmittingId(null);
    }
  };

  const handleReceiveClick = (item: TransferOrder) => {
    setReceivingItem(item);
    setReceiveDialogOpen(true);
  };

  const handleBindTransitClick = (item: TransferOrder) => {
    setBindingItem(item);
    setBindTransitDialogOpen(true);
  };

  const handleUnbindTransit = async (id: string) => {
    try {
      const { unbindTransitOrder } = await import('../api/transferApi');
      await unbindTransitOrder(id);
      showToast(t('已解绑物流'), 'success');
      fetchData();
    } catch (e) {
      showToast((e as Error).message || t('解绑失败'), 'error');
    }
  };

  const handleViewDetail = (item: TransferOrder) => {
    setViewingItem(item);
    setViewDialogOpen(true);
  };

  // ===================== 渲染辅助 =====================

  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString(dateLocale); } catch { return dateStr; }
  };

  // ===================== 统计卡片 =====================

  const statCards = [
    { label: t('草稿'), value: stats.draft, color: gs.textDisabled, bgColor: gs.bgHover },
    { label: t('已提交'), value: stats.submitted, color: '#D97706', bgColor: '#FEF3C7' },
    { label: t('在途'), value: stats.in_transit, color: '#2563EB', bgColor: '#DBEAFE' },
    { label: t('已完成'), value: stats.completed, color: '#059669', bgColor: '#D1FAE5' },
  ];

  return (
    <Box>
      <PageHeader
        title={t('仓库调拨')}
        subtitle={t('管理多仓库间的商品调拨')}
        summary={t('共 {count} 条记录', { count: total })}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t('状态筛选')}</InputLabel>
              <Select
                value={filterStatus}
                label={t('状态筛选')}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
              >
                <MenuItem value="all">{t('全部')}</MenuItem>
                <MenuItem value="draft">{t('草稿')}</MenuItem>
                <MenuItem value="submitted">{t('已提交')}</MenuItem>
                <MenuItem value="in_transit">{t('在途')}</MenuItem>
                <MenuItem value="completed">{t('已完成')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder={t('搜索 SKU')}
              value={filterSku}
              onChange={(e) => setFilterSku(e.target.value)}
              sx={{ width: 140 }}
            />
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
              {t('新增调拨')}
            </Button>
          </Box>
        }
      />

      {/* 统计卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid item xs={3} key={card.label}>
            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.75rem', mb: 0.5 }}>
                {card.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: card.color }}>
                {card.value}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* 数据表格 */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">{t('正在加载数据...')}</Typography>
          </Box>
        ) : data.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">{t('暂无调拨记录')}</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: gs.bgHover }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('调拨单号')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('品名')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('数量')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('体积')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('出库仓')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('入库仓')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('状态')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('创建人')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{t('创建时间')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 200 }}>{t('操作')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((item) => {
                    const statusConf = STATUS_CONFIG[item.status] || { label: item.status, color: 'default' as const };
                    const actions = STATUS_ACTIONS[item.status] || [];
                    return (
                      <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.transferNo || item.id.slice(0, 8)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {item.sku}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.name || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {item.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.volume || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.fromWarehouseName || item.fromWarehouseId}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {item.toWarehouseName || item.toWarehouseId}
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
                            {item.createdBy || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                            {formatDate(item.createdAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {/* draft: 编辑 + 提交 + 删除 */}
                            {actions.includes('edit') && (
                              <Tooltip title={t('编辑')}>
                                <IconButton size="small" onClick={() => handleEdit(item)} sx={{ color: '#2563EB' }}>
                                  <EditIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {actions.includes('submit') && (
                              <Tooltip title={t('提交')}>
                                <IconButton size="small" onClick={() => handleSubmitClick(item.id)} sx={{ color: '#D97706' }}>
                                  <SendIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {actions.includes('delete') && (
                              <Tooltip title={t('删除')}>
                                <IconButton size="small" onClick={() => handleDeleteClick(item.id)} sx={{ color: '#DC2626' }}>
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {actions.includes('receive') && (
                              <Tooltip title={t('确认收货')}>
                                <IconButton size="small" onClick={() => handleReceiveClick(item)} sx={{ color: '#059669' }}>
                                  <CheckCircleIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {actions.includes('bindTransit') && (
                              <Tooltip title={t('绑定物流')}>
                                <IconButton size="small" onClick={() => handleBindTransitClick(item)} sx={{ color: '#2563EB' }}>
                                  <LocalShippingIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {actions.includes('unbindTransit') && (
                              <Tooltip title={t('解绑物流')}>
                                <IconButton size="small" onClick={() => handleUnbindTransit(item.id)} sx={{ color: '#DC2626' }}>
                                  <LinkOffIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {actions.includes('view') && (
                              <Tooltip title={t('查看详情')}>
                                <IconButton size="small" onClick={() => handleViewDetail(item)} sx={{ color: gs.textMuted }}>
                                  <VisibilityIcon sx={{ fontSize: 18 }} />
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
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 20, 50]}
              labelRowsPerPage={t('每页行数：')}
              labelDisplayedRows={({ from, to, count }) => t('{from}-{to} / 共 {count} 条', { from, to, count })}
            />
          </>
        )}
      </Box>

      {/* 新增/编辑调拨单弹窗 */}
      <TransferFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(null); }}
        onSuccess={fetchData}
        initialData={editingItem}
      />

      {/* 确认收货弹窗 */}
      <ConfirmReceiveDialog
        open={receiveDialogOpen}
        transferOrder={receivingItem}
        onClose={() => { setReceiveDialogOpen(false); setReceivingItem(null); }}
        onSuccess={() => {
          fetchData();
          setReceiveDialogOpen(false);
          setReceivingItem(null);
        }}
      />

      {/* 绑定物流弹窗 */}
      <BindTransitDialog
        open={bindTransitDialogOpen}
        transferOrder={bindingItem}
        onClose={() => { setBindTransitDialogOpen(false); setBindingItem(null); }}
        onSuccess={() => {
          fetchData();
          setBindTransitDialogOpen(false);
          setBindingItem(null);
        }}
      />

      {/* 提交确认 */}
      <Dialog
        open={submitDialogOpen}
        onClose={() => setSubmitDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>
          {t('确认提交')}
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <DialogContentText>
            {t('提交后将扣减出库仓库存，此操作不可撤销。确定继续？')}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => setSubmitDialogOpen(false)}>{t('取消')}</Button>
          <Button variant="contained" onClick={handleSubmitConfirm} sx={{ backgroundColor: '#D97706' }}>
            {t('确认提交')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>
          {t('确认删除')}
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <DialogContentText>{t('确定删除该调拨单吗？此操作不可撤销。')}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('取消')}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>{t('确认删除')}</Button>
        </DialogActions>
      </Dialog>

      {/* 查看详情弹窗 */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => { setViewDialogOpen(false); setViewingItem(null); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>
          {t('调拨单详情')}
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          {viewingItem && (
            <Box sx={{ bgcolor: gs.bgHover, p: 2, borderRadius: 1, border: `1px solid ${gs.border}` }}>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('调拨单号：')}</strong>{viewingItem.transferNo || '-'}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>SKU：</strong>{viewingItem.sku}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('品名：')}</strong>{viewingItem.name || '-'}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('数量：')}</strong>{viewingItem.quantity}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('体积：')}</strong>{viewingItem.volume}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('出库仓：')}</strong>{viewingItem.fromWarehouseName || viewingItem.fromWarehouseId}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('入库仓：')}</strong>{viewingItem.toWarehouseName || viewingItem.toWarehouseId}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('状态：')}</strong>{STATUS_CONFIG[viewingItem.status]?.label || viewingItem.status}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('创建人：')}</strong>{viewingItem.createdBy || '-'}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('提交人：')}</strong>{viewingItem.submittedBy || '-'}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('提交时间：')}</strong>{formatDate(viewingItem.submittedAt)}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('收货人：')}</strong>{viewingItem.receivedBy || '-'}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('收货时间：')}</strong>{formatDate(viewingItem.receivedAt)}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('完成时间：')}</strong>{formatDate(viewingItem.completedAt)}</Typography>
              {viewingItem.transitTrackingNo && (
                <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('物流单号：')}</strong>{viewingItem.transitTrackingNo}</Typography>
              )}
              {viewingItem.remark && (
                <Typography variant="body2" sx={{ mb: 1 }}><strong>{t('备注：')}</strong>{viewingItem.remark}</Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => { setViewDialogOpen(false); setViewingItem(null); }}>{t('关闭')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransferPage;
