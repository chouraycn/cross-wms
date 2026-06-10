/**
 * 库存盘点表单组件
 *
 * 支持三种模式：
 * - create: 新增盘点单
 * - edit: 编辑待盘点的记录
 * - count: 录入实盘数量（系统数量自动填充，计算差异）
 *
 * 通过 POST/PUT /api/wms/inventory-count 与后端交互
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  CircularProgress,
  Box,
  Typography,
  Alert,
  Divider,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import { createInventoryCount, updateInventoryCount, fetchInventoryCountById } from '../../api/wmsInventoryApi';
import type { InventoryCount } from '../../types/wms';

const BASE_URL = '/api/wms/inventory-count';

/** 表单模式 */
type FormMode = 'create' | 'edit' | 'count' | 'view';

export interface WmsInventoryFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: InventoryCount | null;
}

/** 空表单模板 */
const emptyForm: InventoryCount = {
  warehouseId: '',
  locationCode: '',
  sku: '',
  systemQuantity: 0,
  actualQuantity: undefined,
  counter: '',
  status: 'pending',
  notes: '',
};

/** 获取表单模式 */
function getFormMode(initialData: InventoryCount | null | undefined): FormMode {
  if (!initialData) return 'create';
  if (initialData.status === 'pending') return 'count';  // 录入实盘
  if (initialData.status === 'counted') return 'view';   // 查看（已盘点）
  if (initialData.status === 'adjusted') return 'view';  // 查看（已调整）
  return 'edit';
}

/** 获取对话框标题 */
function getDialogTitle(mode: FormMode): string {
  switch (mode) {
    case 'create': return '新增盘点单';
    case 'edit': return '编辑盘点记录';
    case 'count': return '录入实盘数量';
    case 'view': return '查看盘点详情';
  }
}

const WmsInventoryForm: React.FC<WmsInventoryFormProps> = ({ open, onClose, onSuccess, initialData }) => {
  const mode = getFormMode(initialData);
  const { showToast } = useToast();

  const [form, setForm] = useState<InventoryCount>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // ===================== 初始化表单 =====================

  useEffect(() => {
    if (!open) return;

    const initForm = async () => {
      setSubmitting(false);
      setLoading(false);

      if (!initialData) {
        // 新建模式
        setForm({ ...emptyForm });
      } else if (initialData.id) {
        // 编辑/录入实盘模式：从后端获取最新数据
        setLoading(true);
        try {
          const latest = await fetchInventoryCountById(initialData.id);
          if (latest) {
            setForm({ ...latest });
          } else {
            setForm({ ...initialData });
          }
        } catch {
          setForm({ ...initialData });
        } finally {
          setLoading(false);
        }
      }
    };

    initForm();
  }, [open, initialData]);

  // ===================== 表单操作 =====================

  const handleChange = useCallback((field: keyof InventoryCount, value: string | number | undefined) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      // 自动计算差异（当修改系统数量或实盘数量时）
      if (field === 'actualQuantity' || field === 'systemQuantity') {
        const sysQty = field === 'systemQuantity' ? Number(value) : (next.systemQuantity || 0);
        const actQty = field === 'actualQuantity' ? (value as number | undefined) : next.actualQuantity;
        next.variance = actQty !== undefined ? actQty - sysQty : undefined;
      }

      return next;
    });
  }, []);

  // ===================== 表单验证 =====================

  const validate = (): string | null => {
    if (!form.warehouseId?.trim()) return '请填写仓库ID';
    if (!form.locationCode?.trim()) return '请填写库位编码';
    if (!form.sku?.trim()) return '请填写SKU';

    // 录入实盘时，必须填写实盘数量
    if (mode === 'count' && (form.actualQuantity === undefined || form.actualQuantity < 0)) {
      return '请填写有效的实盘数量';
    }

    return null;
  };

  // ===================== 提交处理 =====================

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        // 创建盘点单
        await createInventoryCount(form);
        showToast('盘点单创建成功', 'success');
      } else if (mode === 'edit') {
        // 编辑盘点记录
        if (!form.id) throw new Error('缺少记录ID');
        await updateInventoryCount(form.id, form);
        showToast('盘点记录更新成功', 'success');
      } else if (mode === 'count') {
        // 录入实盘数量
        if (!form.id) throw new Error('缺少记录ID');

        const updateData: Partial<InventoryCount> = {
          actualQuantity: form.actualQuantity,
          counter: form.counter || '',
          countTime: new Date().toISOString(),
          status: 'counted',  // 状态流转：pending → counted
        };

        await updateInventoryCount(form.id, updateData);
        showToast('实盘数量录入成功', 'success');
      }

      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ===================== 渲染辅助 =====================

  const isReadOnly = mode === 'view';
  const isCountMode = mode === 'count';
  const isCreateMode = mode === 'create';

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        },
      }}
      BackdropProps={{
        sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
        {getDialogTitle(mode)}
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {/* 提示信息 */}
          {isCountMode && (
            <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
              请输入实际盘点数量，系统将自动计算差异
            </Alert>
          )}

          {/* 仓库ID */}
          <TextField
            label="仓库ID"
            required
            size="small"
            fullWidth
            value={form.warehouseId}
            onChange={(e) => handleChange('warehouseId', e.target.value)}
            placeholder="例如：WH-001"
            disabled={isReadOnly || isCountMode}  // 录入实盘时不允许修改
          />

          {/* 库位编码 */}
          <TextField
            label="库位编码"
            required
            size="small"
            fullWidth
            value={form.locationCode}
            onChange={(e) => handleChange('locationCode', e.target.value)}
            placeholder="例如：A-01-01"
            disabled={isReadOnly || isCountMode}
          />

          {/* SKU */}
          <TextField
            label="SKU"
            required
            size="small"
            fullWidth
            value={form.sku}
            onChange={(e) => handleChange('sku', e.target.value)}
            placeholder="例如：SKU001"
            disabled={isReadOnly || isCountMode}
          />

          <Divider />

          {/* 系统数量 - 自动填充，只读 */}
          <TextField
            label="系统数量"
            size="small"
            fullWidth
            type="number"
            value={form.systemQuantity}
            InputProps={{ readOnly: true }}
            helperText="系统库存数据（自动填充）"
            sx={{ '& .MuiInputBase-input': { bgcolor: '#F9FAFB' } }}
          />

          {/* 实盘数量 - 录入实盘时必填 */}
          <TextField
            label={isCountMode ? '实盘数量 *' : '实盘数量'}
            size="small"
            fullWidth
            type="number"
            value={form.actualQuantity ?? ''}
            onChange={(e) => handleChange('actualQuantity', e.target.value ? Number(e.target.value) : undefined)}
            placeholder={isCountMode ? '请输入实盘数量' : '可选，录入实盘时填写'}
            required={isCountMode}
            InputProps={{ readOnly: isReadOnly }}
            inputProps={{ min: 0 }}
            helperText={isCountMode ? '填写后系统自动计算差异' : '在录入实盘时填写'}
          />

          {/* 差异显示 - 自动计算 */}
          {form.variance !== undefined && (
            <TextField
              label="差异"
              size="small"
              fullWidth
              type="number"
              value={form.variance}
              InputProps={{ readOnly: true }}
              helperText={
                form.variance > 0 ? '盘盈（实盘 > 系统）' :
                  form.variance < 0 ? '盘亏（实盘 < 系统）' :
                    '无差异'
              }
              sx={{
                '& .MuiInputBase-input': {
                  color: form.variance > 0 ? '#059669' : form.variance < 0 ? '#DC2626' : 'inherit',
                  fontWeight: 600,
                  bgcolor: '#F9FAFB',
                },
              }}
            />
          )}

          <Divider />

          {/* 盘点人 */}
          <TextField
            label="盘点人"
            size="small"
            fullWidth
            value={form.counter || ''}
            onChange={(e) => handleChange('counter', e.target.value)}
            placeholder="请输入盘点人姓名"
            InputProps={{ readOnly: isReadOnly }}
          />

          {/* 盘点时间 - 自动填充 */}
          {form.countTime && (
            <TextField
              label="盘点时间"
              size="small"
              fullWidth
              value={new Date(form.countTime).toLocaleString('zh-CN')}
              InputProps={{ readOnly: true }}
              sx={{ '& .MuiInputBase-input': { bgcolor: '#F9FAFB' } }}
            />
          )}

          {/* 状态显示 */}
          <TextField
            label="状态"
            size="small"
            fullWidth
            value={form.status === 'pending' ? '待盘点' : form.status === 'counted' ? '已盘点' : '已调整'}
            InputProps={{ readOnly: true }}
            sx={{ '& .MuiInputBase-input': { bgcolor: '#F9FAFB' } }}
          />

          {/* 备注 */}
          <TextField
            label="备注"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={form.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="可选"
            InputProps={{ readOnly: isReadOnly }}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>

        {!isReadOnly && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            sx={{ backgroundColor: '#111827' }}
          >
            {submitting ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} color="inherit" />
                提交中...
              </Box>
            ) : isCountMode ? (
              '提交实盘数量'
            ) : isCreateMode ? (
              '创建'
            ) : (
              '更新'
            )}
          </Button>
        )}

        {isReadOnly && (
          <Button variant="contained" onClick={onClose} sx={{ backgroundColor: '#111827' }}>
            关闭
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default WmsInventoryForm;
