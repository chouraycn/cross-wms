/**
 * 库存盘点表单组件
 *
 * 用于新增/编辑盘点记录，系统数量可从库存数据自动填充。
 * 通过 POST/PUT /api/wms/inventory 与后端交互。
 */

import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import type { InventoryCount } from '../../types/wms';

const BASE_URL = 'http://localhost:3001';

export interface WmsInventoryFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: InventoryCount | null;
}

const emptyForm: InventoryCount = {
  warehouseId: '',
  locationCode: '',
  sku: '',
  systemQuantity: 0,
  actualQuantity: 0,
  counter: '',
  status: 'pending',
  notes: '',
};

const WmsInventoryForm: React.FC<WmsInventoryFormProps> = ({ open, onClose, onSuccess, initialData }) => {
  const isEdit = Boolean(initialData?.id);
  const { showToast } = useToast();

  const [form, setForm] = useState<InventoryCount>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...initialData } : { ...emptyForm });
      setSubmitting(false);
    }
  }, [open, initialData]);

  const handleChange = (field: keyof InventoryCount, value: string | number) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // 自动计算差异
      if (field === 'actualQuantity' || field === 'systemQuantity') {
        next.variance = next.actualQuantity - next.systemQuantity;
      }
      return next;
    });
  };

  const validate = (): string | null => {
    if (!form.warehouseId.trim()) return '请选择仓库';
    if (!form.locationCode.trim()) return '请输入库位编码';
    if (!form.sku.trim()) return '请输入SKU';
    if (form.actualQuantity < 0) return '实际数量不能为负';
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
        ? `${BASE_URL}/api/wms/inventory/${initialData!.id}`
        : `${BASE_URL}/api/wms/inventory`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (json.code === 0 || json.success) {
        showToast(isEdit ? '更新成功' : '创建成功', 'success');
        onSuccess();
        onClose();
      } else {
        showToast(json.message || json.error || '操作失败', 'error');
      }
    } catch (err) {
      showToast('网络错误', 'error');
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
        {isEdit ? '编辑盘点记录' : '新增盘点记录'}
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="仓库ID"
            required
            size="small"
            fullWidth
            value={form.warehouseId}
            onChange={(e) => handleChange('warehouseId', e.target.value)}
            placeholder="例如：WH-001"
          />
          <TextField
            label="库位编码"
            required
            size="small"
            fullWidth
            value={form.locationCode}
            onChange={(e) => handleChange('locationCode', e.target.value)}
            placeholder="例如：A-01-01"
          />
          <TextField
            label="SKU"
            required
            size="small"
            fullWidth
            value={form.sku}
            onChange={(e) => handleChange('sku', e.target.value)}
            placeholder="例如：SKU001"
          />
          <TextField
            label="系统数量"
            size="small"
            fullWidth
            type="number"
            value={form.systemQuantity}
            onChange={(e) => handleChange('systemQuantity', Number(e.target.value))}
            inputProps={{ min: 0, readOnly: !isEdit }}
            helperText="系统库存数据（自动填充，不可手动修改）"
          />
          <TextField
            label="实际数量"
            required
            size="small"
            fullWidth
            type="number"
            value={form.actualQuantity}
            onChange={(e) => handleChange('actualQuantity', Number(e.target.value))}
            inputProps={{ min: 0 }}
          />
          {form.variance !== undefined && (
            <TextField
              label="差异"
              size="small"
              fullWidth
              type="number"
              value={form.variance ?? ''}
              InputProps={{ readOnly: true }}
              helperText={form.variance > 0 ? '盘盈' : form.variance < 0 ? '盘亏' : '无差异'}
              sx={{
                '& .MuiInputBase-input': {
                  color: form.variance > 0 ? '#059669' : form.variance < 0 ? '#DC2626' : 'inherit',
                  fontWeight: 600,
                },
              }}
            />
          )}
          <TextField
            label="盘点人"
            size="small"
            fullWidth
            value={form.counter || ''}
            onChange={(e) => handleChange('counter', e.target.value)}
            placeholder="可选"
          />
          <TextField
            label="备注"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={form.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="可选"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>
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
          ) : (
            isEdit ? '更新' : '创建'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WmsInventoryForm;
