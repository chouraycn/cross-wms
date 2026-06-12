/**
 * 出库复核表单组件
 *
 * 用于新增/编辑出库复核记录，支持扫描数量核对。
 * 通过 POST/PUT /api/wms/outbound 与后端交互。
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
  Chip,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import type { OutboundReview } from '../../types/wms';
import { API_BASE_URL } from '../../constants/api';

const BASE_URL = API_BASE_URL;

export interface WmsOutboundFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: OutboundReview | null;
}

const emptyForm: OutboundReview = {
  outboundOrderId: '',
  warehouseId: '',
  sku: '',
  productName: '',
  expectedQuantity: 0,
  scannedQuantity: 0,
  reviewStatus: 'pending',
  reviewer: '',
  notes: '',
};

const WmsOutboundForm: React.FC<WmsOutboundFormProps> = ({ open, onClose, onSuccess, initialData }) => {
  const isEdit = Boolean(initialData?.id);
  const { showToast } = useToast();

  const [form, setForm] = useState<OutboundReview>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...initialData } : { ...emptyForm });
      setSubmitting(false);
    }
  }, [open, initialData]);

  const handleChange = (field: keyof OutboundReview, value: string | number) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // 自动判定复核状态：已扫描数量 >= 预期数量 → 通过
      if (field === 'scannedQuantity' || field === 'expectedQuantity') {
        if (next.scannedQuantity >= next.expectedQuantity && next.expectedQuantity > 0) {
          next.reviewStatus = 'passed';
        } else if (next.scannedQuantity > 0) {
          next.reviewStatus = 'pending';
        }
      }
      return next;
    });
  };

  /** 模拟扫描：递增已扫描数量 */
  const handleSimulateScan = () => {
    setForm((prev) => {
      const newScanned = prev.scannedQuantity + 1;
      const newStatus = newScanned >= prev.expectedQuantity && prev.expectedQuantity > 0 ? 'passed' : 'pending';
      return { ...prev, scannedQuantity: newScanned, reviewStatus: newStatus };
    });
    showToast(`已扫描第 ${form.scannedQuantity + 1} 件`, 'info');
  };

  const validate = (): string | null => {
    if (!form.outboundOrderId.trim()) return '请输入出库单号';
    if (!form.warehouseId.trim()) return '请选择仓库';
    if (!form.sku.trim()) return '请输入SKU';
    if (!form.expectedQuantity || form.expectedQuantity <= 0) return '预期数量必须大于0';
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
        ? `${BASE_URL}/api/wms/outbound/${initialData!.id}`
        : `${BASE_URL}/api/wms/outbound`;
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

  const scanProgress = form.expectedQuantity > 0
    ? Math.min((form.scannedQuantity / form.expectedQuantity) * 100, 100)
    : 0;

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
        {isEdit ? '编辑复核记录' : '新增出库复核'}
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="出库单号"
            required
            size="small"
            fullWidth
            value={form.outboundOrderId}
            onChange={(e) => handleChange('outboundOrderId', e.target.value)}
            placeholder="例如：OUT-20240001"
          />
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
              label="已扫描数量"
              size="small"
              fullWidth
              type="number"
              value={form.scannedQuantity}
              onChange={(e) => handleChange('scannedQuantity', Number(e.target.value))}
              inputProps={{ min: 0 }}
            />
          </Stack>
          {/* 扫描进度条 */}
          {form.expectedQuantity > 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Chip
                  label={`${form.scannedQuantity} / ${form.expectedQuantity}`}
                  size="small"
                  color={scanProgress >= 100 ? 'success' : 'default'}
                />
                <Button size="small" variant="outlined" onClick={handleSimulateScan} disabled={submitting}>
                  模拟扫描 +1
                </Button>
              </Box>
              <Box sx={{ height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
                <Box
                  sx={{
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: scanProgress >= 100 ? '#059669' : '#2563EB',
                    width: `${scanProgress}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </Box>
            </Box>
          )}
          <FormControl size="small" fullWidth>
            <InputLabel>复核状态</InputLabel>
            <Select
              value={form.reviewStatus}
              label="复核状态"
              onChange={(e) => handleChange('reviewStatus', e.target.value)}
            >
              <MenuItem value="pending">待复核</MenuItem>
              <MenuItem value="passed">已通过</MenuItem>
              <MenuItem value="failed">未通过</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="复核人"
            size="small"
            fullWidth
            value={form.reviewer || ''}
            onChange={(e) => handleChange('reviewer', e.target.value)}
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

export default WmsOutboundForm;
