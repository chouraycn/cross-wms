/**
 * 入库管理页面
 *
 * 管理入库记录：列表查看、新增、编辑、删除、状态筛选、CSV 导出。
 * API: GET/POST/PUT/DELETE /api/inbound-records
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  TextField,
  Stack,
  CircularProgress,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AskWarehouseAgentButton from '../components/wms/AskWarehouseAgentButton';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { exportToCsv } from '../utils/exportCsv';
import type { InboundRecord, Warehouse } from '../types';
import { API_BASE_URL } from '../constants/api';
import { getWarehouses } from '../capabilities/warehouse';
import { useI18n, getDateLocale } from '../components/staff/i18n/index.js';

const BASE_URL = API_BASE_URL;

const WmsInboundPage: React.FC = () => {
  const { showToast } = useToast();
  const { t } = useI18n();
  const dateLocale = getDateLocale();

  /** 入库状态映射 */
  const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'default' }> = {
    pending: { label: t('待入库'), color: 'warning' },
    completed: { label: t('已入库'), color: 'success' },
    cancelled: { label: t('已取消'), color: 'default' },
  };

  /** SOP 风格状态徽章色板 */
  const STATUS_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
    warning: { bg: '#fff2e5', color: '#ff7f00' },
    success: { bg: '#e9f7ef', color: '#2cb360' },
    default: { bg: '#f2f3f7', color: '#858b9c' },
  };

  const [data, setData] = useState<InboundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InboundRecord | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const warehouses = useMemo(() => getWarehouses(), []);

  const getWarehouseName = useCallback((whId: string): string => {
    const wh = warehouses.find((w) => w.id === whId);
    return wh?.name ?? whId;
  }, [warehouses]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/inbound-records`);
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setData(json.data || []);
      } else {
        showToast(json.message || json.error || t('获取数据失败'), 'error');
      }
    } catch {
      showToast(t('网络错误'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-inbound', fetchData);
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

  const handleEdit = (item: InboundRecord) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleDeleteClick = (id: string | undefined) => {
    if (!id) return;
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deletingId === null) return;
    try {
      const res = await fetch(`${BASE_URL}/api/inbound-records/${deletingId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast(t('删除成功'), 'success');
        fetchData();
      } else {
        showToast(json.message || json.error || t('删除失败'), 'error');
      }
    } catch {
      showToast(t('网络错误'), 'error');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const handleExport = () => {
    if (filteredData.length === 0) return;
    const headers = [t('入库单号'), t('仓库'), 'SKU', t('商品名称'), t('数量'), t('供应商'), t('批次号'), t('状态'), t('操作人'), t('创建时间')];
    const rows = filteredData.map((item) => [
      item.id,
      getWarehouseName(item.warehouseId),
      item.sku,
      item.name || '',
      String(item.quantity),
      item.supplier || '',
      item.batchNo || '',
      STATUS_CONFIG[item.status]?.label || item.status,
      item.operator || '',
      item.createdAt || '',
    ]);
    exportToCsv('inbound-records.csv', headers, rows);
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString(dateLocale); } catch { return dateStr; }
  };

  return (
    <Box>
      {/* SOP 风格页头 */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: '40px' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Typography sx={{ fontSize: '16px', fontWeight: 500, color: '#464c5e', lineHeight: 'normal' }}>
            {t('入库管理')}
          </Typography>
          <Typography sx={{ fontSize: '14px', color: '#757f9c', lineHeight: 'normal' }}>
            {t('共 {total} 条记录 · 已入库 {completed} 条', { total: filteredData.length, completed: data.filter((i) => i.status === 'completed').length })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('状态筛选')}</InputLabel>
            <Select
              value={filterStatus}
              label={t('状态筛选')}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
              sx={{ height: '34px', borderRadius: '10px', fontSize: '12px', color: '#464c5e' }}
            >
              <MenuItem value="all">{t('全部')}</MenuItem>
              <MenuItem value="pending">{t('待入库')}</MenuItem>
              <MenuItem value="completed">{t('已入库')}</MenuItem>
              <MenuItem value="cancelled">{t('已取消')}</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
            onClick={handleAdd}
            sx={{
              textTransform: 'none',
              height: '34px',
              borderRadius: '10px',
              fontSize: '12px',
              px: '20px',
              backgroundColor: '#18181a',
              '&:hover': { backgroundColor: '#303030' },
              boxShadow: 'none',
            }}
          >
            {t('新增入库')}
          </Button>
          <Tooltip title={t('导出 CSV')}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
              onClick={handleExport}
              sx={{
                textTransform: 'none',
                height: '34px',
                borderRadius: '10px',
                fontSize: '12px',
                px: '20px',
                border: '0.5px solid #e3e7f1',
                backgroundColor: '#fff',
                color: '#757f9c',
                '&:hover': { borderColor: '#cbd3e6', backgroundColor: '#fff', color: '#18181a' },
              }}
            >
              {t('导出')}
            </Button>
          </Tooltip>
          <AskWarehouseAgentButton
            disabled={filteredData.length === 0}
            buildPrompt={() => {
              const completed = data.filter(i => i.status === 'completed').length;
              const pending = data.filter(i => i.status === 'pending').length;
              return `帮我分析当前入库情况：共 ${filteredData.length} 条记录（已入库 ${completed}、待入库 ${pending}）。请识别待入库积压原因、预估按时完成率，给出优化建议并按仓库汇总。`;
            }}
            label={t('让仓库专员帮我查')}
          />
        </Box>
      </Box>

      {/* SOP 风格主卡片 */}
      <Box sx={{ mt: '20px', mb: '16px' }} />
      <Card elevation={0} sx={{
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 16px 0 rgba(0,0,0,0.05)',
        p: '18px 18px 24px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        backgroundColor: '#fff',
      }}>
        {/* 列表区标题 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px' }}>
          <Inventory2OutlinedIcon sx={{ fontSize: 14, color: '#757f9c' }} />
          <Typography sx={{ fontSize: '14px', fontWeight: 400, color: '#757f9c', lineHeight: 'normal' }}>
            {t('入库记录列表')}
          </Typography>
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography sx={{ fontSize: '13px', color: '#858b9c' }}>{t('正在加载数据...')}</Typography>
          </Box>
        ) : filteredData.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography sx={{ fontSize: '13px', color: '#858b9c' }}>{t('暂无入库记录')}</Typography>
          </Box>
        ) : (
          <>
            {/* SOP 风格表格容器 */}
            <TableContainer sx={{ borderRadius: '14px', border: '1px solid #f2f3f7', overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f2f3f7' }}>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('入库单号')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('仓库')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>SKU</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('商品名称')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('数量')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('供应商')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('状态')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7' }}>{t('创建时间')}</TableCell>
                    <TableCell sx={{ height: '36px', px: '16px', py: '12px', fontSize: '12px', fontWeight: 400, color: '#464c5e', borderBottom: '1px solid #f2f3f7', width: 120 }}>{t('操作')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((item) => {
                    const statusConf = STATUS_CONFIG[item.status] || { label: item.status, color: 'default' as const };
                    const badgeStyle = STATUS_BADGE_STYLE[statusConf.color] || STATUS_BADGE_STYLE.default;
                    return (
                      <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 }, minHeight: '64px', '&:hover': { backgroundColor: '#fafbfc' } }}>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontFamily: 'monospace', fontSize: '12px', color: '#18181a' }}>
                            {item.id}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontSize: '12px', color: '#858b9c' }}>
                            {getWarehouseName(item.warehouseId)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontFamily: 'monospace', fontSize: '12px', color: '#858b9c' }}>
                            {item.sku}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontSize: '12px', color: '#18181a' }}>
                            {item.name || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#18181a' }}>
                            {item.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontSize: '12px', color: '#858b9c' }}>
                            {item.supplier || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Chip
                            label={statusConf.label}
                            size="small"
                            sx={{
                              fontSize: '10px',
                              height: 'auto',
                              borderRadius: '9999px',
                              px: '12px',
                              py: '4px',
                              backgroundColor: badgeStyle.bg,
                              color: badgeStyle.color,
                              border: 'none',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Typography sx={{ fontSize: '12px', color: '#858b9c' }}>
                            {formatDate(item.createdAt)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ px: '16px', py: '12px', borderBottom: '1px solid #f2f3f7' }}>
                          <Box sx={{ display: 'flex', gap: '4px' }}>
                            <IconButton size="small" onClick={() => handleEdit(item)} sx={{ color: '#1a71ff', borderRadius: '8px', '&:hover': { backgroundColor: 'rgba(0,0,0,0.05)', color: '#4a8dff' } }}>
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleDeleteClick(item.id)} sx={{ color: '#1a71ff', borderRadius: '8px', '&:hover': { backgroundColor: 'rgba(0,0,0,0.05)', color: '#4a8dff' } }}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
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
              labelRowsPerPage={t('每页行数：')}
              labelDisplayedRows={({ from, to, count }) => t('{from}-{to} / 共 {count} 条', { from, to, count })}
              sx={{ mt: '16px' }}
            />
          </>
        )}
      </Card>

      <WmsInboundFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(null); }}
        onSuccess={fetchData}
        initialData={editingItem}
        warehouses={warehouses}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
        BackdropProps={{ sx: { backgroundColor: 'rgba(0,0,0,0.3)' } }}
      >
        <DialogTitle sx={{ fontSize: '16px', fontWeight: 500, color: '#464c5e', px: '20px', py: '16px' }}>
          {t('确认删除')}
        </DialogTitle>
        <DialogContent sx={{ px: '20px', py: '4px' }}>
          <DialogContentText sx={{ fontSize: '13px', color: '#858b9c' }}>{t('确定删除该入库记录吗？此操作不可撤销。')}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: '20px', pb: '16px', pt: '12px' }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ textTransform: 'none', borderRadius: '10px', fontSize: '12px', color: '#757f9c' }}>{t('取消')}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} sx={{ textTransform: 'none', borderRadius: '10px', fontSize: '12px', height: '34px', px: '20px', boxShadow: 'none' }}>{t('确认删除')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ===================== 入库表单对话框（新增/编辑） =====================

interface WmsInboundFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: InboundRecord | null;
  warehouses: Warehouse[];
}

const emptyForm: InboundRecord = {
  id: '',
  warehouseId: '',
  sku: '',
  name: '',
  quantity: 0,
  volume: 0,
  createdAt: '',
  operator: '',
  status: 'pending',
};

const WmsInboundFormDialog: React.FC<WmsInboundFormDialogProps> = ({ open, onClose, onSuccess, initialData, warehouses }) => {
  const isEdit = Boolean(initialData?.id);
  const { showToast } = useToast();
  const { t } = useI18n();

  const [form, setForm] = useState<InboundRecord>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...initialData } : { ...emptyForm });
      setSubmitting(false);
    }
  }, [open, initialData]);

  const handleChange = (field: keyof InboundRecord, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): string | null => {
    if (!form.warehouseId) return t('请选择仓库');
    if (!form.sku.trim()) return t('请输入SKU');
    if (!form.name.trim()) return t('请输入商品名称');
    if (!form.quantity || form.quantity <= 0) return t('数量必须大于0');
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }
    setSubmitting(true);
    try {
      const url = isEdit
        ? `${BASE_URL}/api/inbound-records/${initialData!.id}`
        : `${BASE_URL}/api/inbound-records`;
      const method = isEdit ? 'PUT' : 'POST';
      const payload: Partial<InboundRecord> = { ...form };
      // 新增时不传 id（由后端生成）
      if (!isEdit) delete payload.id;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast(isEdit ? t('更新成功') : t('创建成功'), 'success');
        onSuccess();
        onClose();
      } else {
        showToast(json.message || json.error || t('操作失败'), 'error');
      }
    } catch {
      showToast(t('网络错误'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      BackdropProps={{ sx: { backgroundColor: 'rgba(0,0,0,0.3)' } }}
    >
      <DialogTitle sx={{ fontSize: '16px', fontWeight: 500, color: '#464c5e', px: '20px', py: '16px' }}>
        {isEdit ? t('编辑入库记录') : t('新增入库')}
      </DialogTitle>
      <DialogContent sx={{ px: '20px', py: '4px' }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {isEdit && (
            <TextField
              label={t('入库单号')}
              size="small"
              fullWidth
              value={form.id}
              disabled
            />
          )}
          <FormControl size="small" fullWidth required>
            <InputLabel>{t('仓库')}</InputLabel>
            <Select
              value={form.warehouseId}
              label={t('仓库')}
              onChange={(e) => handleChange('warehouseId', e.target.value)}
            >
              {warehouses.map((wh) => (
                <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="SKU"
            required
            size="small"
            fullWidth
            value={form.sku}
            onChange={(e) => handleChange('sku', e.target.value)}
            placeholder={t('例如：SKU001')}
          />
          <TextField
            label={t('商品名称')}
            required
            size="small"
            fullWidth
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('例如：蓝牙耳机')}
          />
          <TextField
            label={t('数量')}
            required
            size="small"
            fullWidth
            type="number"
            value={form.quantity}
            onChange={(e) => handleChange('quantity', Number(e.target.value))}
            inputProps={{ min: 0 }}
          />
          <TextField
            label={t('供应商')}
            size="small"
            fullWidth
            value={form.supplier || ''}
            onChange={(e) => handleChange('supplier', e.target.value)}
            placeholder={t('可选')}
          />
          <TextField
            label={t('批次号')}
            size="small"
            fullWidth
            value={form.batchNo || ''}
            onChange={(e) => handleChange('batchNo', e.target.value)}
            placeholder={t('可选')}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>{t('状态')}</InputLabel>
            <Select
              value={form.status}
              label={t('状态')}
              onChange={(e) => handleChange('status', e.target.value)}
            >
              <MenuItem value="pending">{t('待入库')}</MenuItem>
              <MenuItem value="completed">{t('已入库')}</MenuItem>
              <MenuItem value="cancelled">{t('已取消')}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label={t('操作人')}
            size="small"
            fullWidth
            value={form.operator || ''}
            onChange={(e) => handleChange('operator', e.target.value)}
            placeholder={t('可选')}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: '20px', pb: '16px', pt: '12px' }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none', borderRadius: '10px', fontSize: '12px', color: '#757f9c' }}>{t('取消')}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          sx={{
            textTransform: 'none',
            borderRadius: '10px',
            fontSize: '12px',
            height: '34px',
            px: '20px',
            backgroundColor: '#18181a',
            '&:hover': { backgroundColor: '#303030' },
            boxShadow: 'none',
          }}
        >
          {submitting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} color="inherit" />
              {t('提交中...')}
            </Box>
          ) : (
            isEdit ? t('更新') : t('创建')
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WmsInboundPage;
