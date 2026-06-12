/**
 * 入库质检表单组件
 *
 * 用于新增/编辑质检记录，支持手动校验 + 二次确认提交。
 * 通过 POST/PUT /api/wms/quality 与后端交互。
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  CircularProgress,
  Box,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import type { QualityCheck } from '../../types/wms';
import { API_BASE_URL } from '../../constants/api';

const BASE_URL = API_BASE_URL;

export interface WmsQualityFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: QualityCheck | null;
}

const emptyForm: QualityCheck = {
  warehouseId: '',
  sku: '',
  productName: '',
  batchNo: '',
  expiryDate: '',
  expectedQuantity: 0,
  actualQuantity: 0,
  qualityStatus: 'pending',
  inspector: '',
  notes: '',
};

const WmsQualityForm: React.FC<WmsQualityFormProps> = ({ open, onClose, onSuccess, initialData }) => {
  const isEdit = Boolean(initialData?.id);
  const { showToast } = useToast();

  const [form, setForm] = useState<QualityCheck>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...initialData } : { ...emptyForm });
      setSubmitting(false);
    }
  }, [open, initialData]);

  const handleChange = (field: keyof QualityCheck, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): string | null => {
    if (!form.warehouseId.trim()) return '请选择仓库';
    if (!form.sku.trim()) return '请输入SKU';
    if (!form.expectedQuantity || form.expectedQuantity <= 0) return '预期数量必须大于0';
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
        ? `${BASE_URL}/api/wms/quality/${initialData!.id}`
        : `${BASE_URL}/api/wms/quality`;
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
        {isEdit ? '编辑质检记录' : '新增质检记录'}
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
            label="SKU"
            required
            size="small"
            fullWidth
            value={form.sku}
            onChange={(e) => handleChange('sku', e.target.value)}
            placeholder="例如：SKU001"
          />
          <TextField
            label="商品名称"
            size="small"
            fullWidth
            value={form.productName || ''}
            onChange={(e) => handleChange('productName', e.target.value)}
            placeholder="例如：蓝牙耳机"
          />
          <TextField
            label="批次号"
            size="small"
            fullWidth
            value={form.batchNo || ''}
            onChange={(e) => handleChange('batchNo', e.target.value)}
            placeholder="可选"
          />
          <TextField
            label="有效期"
            size="small"
            fullWidth
            type="date"
            value={form.expiryDate || ''}
            onChange={(e) => handleChange('expiryDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="预期数量"
              required
              size="small"
              fullWidth
              type="number"
              value={form.expectedQuantity}
              onChange={(e) => handleChange('expectedQuantity', Number(e.target.value))}
              inputProps={{ min: 0 }}
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
          </Stack>
          <FormControl size="small" fullWidth>
            <InputLabel>质检状态</InputLabel>
            <Select
              value={form.qualityStatus}
              label="质检状态"
              onChange={(e) => handleChange('qualityStatus', e.target.value)}
            >
              <MenuItem value="pending">待检</MenuItem>
              <MenuItem value="qualified">合格</MenuItem>
              <MenuItem value="unqualified">不合格</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="检验员"
            size="small"
            fullWidth
            value={form.inspector || ''}
            onChange={(e) => handleChange('inspector', e.target.value)}
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

export default WmsQualityForm;
