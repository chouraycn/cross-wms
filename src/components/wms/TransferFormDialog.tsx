/**
 * 调拨单新增/编辑表单弹窗
 *
 * 功能：
 * - 仓库下拉选择（出库仓/入库仓，互斥）
 * - SKU 失焦查库存（显示当前出库仓库存）
 * - 数量校验
 * - 备注
 * - 「保存草稿」+「保存并提交」
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Box,
  Typography,
  Alert,
  FormHelperText,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import type { TransferOrder } from '../../types/wms';

// ===================== Types =====================

interface WarehouseOption {
  id: string;
  name: string;
}

interface InventoryInfo {
  quantity: number;
  name: string;
}

interface TransferFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: TransferOrder | null;
}

// ===================== Component =====================

const TransferFormDialog: React.FC<TransferFormDialogProps> = ({ open, onClose, onSuccess, initialData }) => {
  const { showToast } = useToast();
  const isEdit = !!initialData;

  // Form state
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0);
  const [remark, setRemark] = useState('');
  const [createdBy, setCreatedBy] = useState('');

  // Lookup data
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [inventoryInfo, setInventoryInfo] = useState<InventoryInfo | null>(null);
  const [skuLoading, setSkuLoading] = useState(false);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load initial data when editing
  useEffect(() => {
    if (initialData) {
      setFromWarehouseId(initialData.fromWarehouseId);
      setToWarehouseId(initialData.toWarehouseId);
      setSku(initialData.sku);
      setName(initialData.name);
      setQuantity(initialData.quantity);
      setVolume(initialData.volume);
      setRemark(initialData.remark);
      setCreatedBy(initialData.createdBy);
    } else {
      setFromWarehouseId('');
      setToWarehouseId('');
      setSku('');
      setName('');
      setQuantity(0);
      setVolume(0);
      setRemark('');
      setCreatedBy('');
    }
    setErrors({});
    setInventoryInfo(null);
  }, [initialData, open]);

  // Fetch warehouses
  useEffect(() => {
    if (open) {
      fetch('/api/warehouses')
        .then((res) => res.json())
        .then((json) => {
          if (json.code === 0 && Array.isArray(json.data)) {
            setWarehouses(json.data.map((w: Record<string, unknown>) => ({ id: w.id as string, name: w.name as string })));
          }
        })
        .catch(() => { /* ignore */ });
    }
  }, [open]);

  // SKU blur: lookup inventory in source warehouse
  const handleSkuBlur = useCallback(async () => {
    if (!sku || !fromWarehouseId) {
      setInventoryInfo(null);
      return;
    }
    setSkuLoading(true);
    try {
      const resp = await fetch(`/api/inventory?warehouseId=${encodeURIComponent(fromWarehouseId)}`);
      const json = await resp.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        const found = json.data.find((item: Record<string, unknown>) => item.sku === sku);
        if (found) {
          setInventoryInfo({ quantity: found.quantity as number, name: found.name as string });
          if (!name) setName(found.name as string);
        } else {
          setInventoryInfo(null);
        }
      }
    } catch {
      setInventoryInfo(null);
    } finally {
      setSkuLoading(false);
    }
  }, [sku, fromWarehouseId, name]);

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!fromWarehouseId) newErrors.fromWarehouseId = '请选择出库仓';
    if (!toWarehouseId) newErrors.toWarehouseId = '请选择入库仓';
    if (fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId) {
      newErrors.toWarehouseId = '入库仓不能与出库仓相同';
    }
    if (!sku) newErrors.sku = '请输入 SKU';
    if (quantity <= 0) newErrors.quantity = '数量必须大于 0';
    if (inventoryInfo && quantity > inventoryInfo.quantity) {
      newErrors.quantity = `库存不足（当前库存 ${inventoryInfo.quantity}）`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!validate()) return;
    try {
      const { updateTransferOrder, createTransferOrder } = await import('../../api/transferApi');
      if (isEdit && initialData) {
        await updateTransferOrder(initialData.id, {
          fromWarehouseId, toWarehouseId, sku, name, quantity, volume, remark,
        });
        showToast('草稿已更新', 'success');
      } else {
        await createTransferOrder({
          fromWarehouseId, toWarehouseId, sku, name, quantity, volume, remark,
          status: 'draft',
          createdBy: createdBy || '当前用户',
        });
        showToast('草稿已保存', 'success');
      }
      onSuccess();
      onClose();
    } catch (e) {
      showToast((e as Error).message || '保存失败', 'error');
    }
  };

  // Save and submit
  const handleSaveAndSubmit = async () => {
    if (!validate()) return;
    try {
      const { updateTransferOrder, createTransferOrder, submitTransferOrder } = await import('../../api/transferApi');
      if (isEdit && initialData) {
        // Update draft first, then submit
        await updateTransferOrder(initialData.id, {
          fromWarehouseId, toWarehouseId, sku, name, quantity, volume, remark,
        });
        await submitTransferOrder(initialData.id, createdBy || '当前用户');
      } else {
        await createTransferOrder({
          fromWarehouseId, toWarehouseId, sku, name, quantity, volume, remark,
          createdBy: createdBy || '当前用户',
          autoSubmit: true,
          submittedBy: createdBy || '当前用户',
        });
      }
      showToast('提交成功，已扣减出库仓库存', 'success');
      onSuccess();
      onClose();
    } catch (e) {
      showToast((e as Error).message || '操作失败', 'error');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
    >
      <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
        {isEdit ? '编辑调拨单' : '新增调拨单'}
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth size="small" error={!!errors.fromWarehouseId}>
              <InputLabel>出库仓</InputLabel>
              <Select
                value={fromWarehouseId}
                label="出库仓"
                onChange={(e) => { setFromWarehouseId(e.target.value); setInventoryInfo(null); }}
              >
                {warehouses
                  .filter((w) => w.id !== toWarehouseId)
                  .map((w) => (
                    <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                  ))}
              </Select>
              {errors.fromWarehouseId && <FormHelperText>{errors.fromWarehouseId}</FormHelperText>}
            </FormControl>
            <FormControl fullWidth size="small" error={!!errors.toWarehouseId}>
              <InputLabel>入库仓</InputLabel>
              <Select
                value={toWarehouseId}
                label="入库仓"
                onChange={(e) => setToWarehouseId(e.target.value)}
              >
                {warehouses
                  .filter((w) => w.id !== fromWarehouseId)
                  .map((w) => (
                    <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                  ))}
              </Select>
              {errors.toWarehouseId && <FormHelperText>{errors.toWarehouseId}</FormHelperText>}
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="SKU"
              value={sku}
              onChange={(e) => { setSku(e.target.value); setInventoryInfo(null); }}
              onBlur={handleSkuBlur}
              error={!!errors.sku}
              helperText={errors.sku}
              disabled={isEdit}
            />
            <TextField
              fullWidth
              size="small"
              label="品名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Box>

          {/* 库存提示 */}
          {skuLoading && (
            <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
              正在查询库存...
            </Typography>
          )}
          {inventoryInfo && (
            <Alert severity={inventoryInfo.quantity >= quantity ? 'info' : 'warning'} sx={{ py: 0 }}>
              出库仓当前库存: <strong>{inventoryInfo.quantity}</strong>
              {inventoryInfo.quantity < quantity && ' （库存不足）'}
            </Alert>
          )}
          {!inventoryInfo && !skuLoading && sku && fromWarehouseId && (
            <Alert severity="warning" sx={{ py: 0 }}>
              未在出库仓找到该 SKU 的库存
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="数量"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
              error={!!errors.quantity}
              helperText={errors.quantity}
              inputProps={{ min: 1 }}
            />
            <TextField
              fullWidth
              size="small"
              label="体积"
              type="number"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value) || 0)}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Box>

          {!isEdit && (
            <TextField
              fullWidth
              size="small"
              label="创建人"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="请输入创建人"
            />
          )}

          <TextField
            fullWidth
            size="small"
            label="备注"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            multiline
            rows={2}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB', justifyContent: 'space-between' }}>
        <Button onClick={onClose}>取消</Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleSaveDraft}
            sx={{ textTransform: 'none' }}
          >
            保存草稿
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveAndSubmit}
            sx={{ textTransform: 'none', backgroundColor: '#D97706', '&:hover': { backgroundColor: '#B45309' } }}
          >
            保存并提交
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default TransferFormDialog;
