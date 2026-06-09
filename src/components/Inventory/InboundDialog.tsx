/**
 * 入库操作弹窗组件
 *
 * 通过 POST /api/inbound 创建入库记录，成功后通知父组件刷新数据。
 * 点击「确认入库」时先弹出二次确认 Dialog，确认后才调用 API。
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
  Stack,
  Alert,
  CircularProgress,
  Box,
  Typography,
  Divider,
  Autocomplete,
} from '@mui/material';
import { createInbound, getAllPartners, quickCreatePartner } from '../../services/api';
import { getWarehouses } from '../../capabilities/warehouse';
import type { Warehouse } from '../../types';
import type { PartnerOption } from '../../types/partners';
import { matchPartnerName } from '../../utils/pinyin';
import { useToast } from '../../contexts/ToastContext';

export interface InboundDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  warehouseId?: string;
}

const InboundDialog: React.FC<InboundDialogProps> = ({ open, onClose, onSuccess, warehouseId }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // 表单状态
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouseId ?? '');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [supplier, setSupplier] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierInputValue, setSupplierInputValue] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [remark, setRemark] = useState('');

  // Autocomplete 选项
  const [supplierOptions, setSupplierOptions] = useState<PartnerOption[]>([]);

  // UI 状态
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { showToast } = useToast();

  /** 快速创建供应商的 sentinel ID */
  const CREATE_SENTINEL = '__CREATE_NEW_SUPPLIER__';

  // 加载仓库列表
  useEffect(() => {
    if (open) {
      setWarehouses(getWarehouses());
    }
  }, [open]);

  // 加载供应商选项
  useEffect(() => {
    if (open) {
      getAllPartners('supplier')
        .then((opts) => setSupplierOptions(opts))
        .catch(() => setSupplierOptions([]));
    }
  }, [open]);

  // 当 warehouseId prop 变化时同步默认值
  useEffect(() => {
    if (warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [warehouseId]);

  /** 重置表单 */
  const resetForm = () => {
    setSku('');
    setName('');
    setSelectedWarehouseId(warehouseId ?? '');
    setQuantity('');
    setSupplier('');
    setSupplierId('');
    setSupplierInputValue('');
    setBatchNo('');
    setRemark('');
    setSubmitting(false);
    setConfirmOpen(false);
  };

  /** 关闭弹窗时重置 */
  const handleClose = () => {
    resetForm();
    onClose();
  };

  /** 表单验证 */
  const validate = (): string | null => {
    if (!sku.trim()) return '请输入SKU编号';
    if (!name.trim()) return '请输入商品名称';
    if (!selectedWarehouseId) return '请选择仓库';
    if (!quantity || Number(quantity) <= 0) return '数量必须大于0';
    return null;
  };

  /** 点击确认入库 → 弹出二次确认 */
  const handleConfirmClick = () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }
    setConfirmOpen(true);
  };

  /** 获取仓库名称 */
  const getWarehouseName = (whId: string): string => {
    const wh = warehouses.find((w) => w.id === whId);
    return wh?.name ?? whId;
  };

  /** 快速创建供应商 */
  const handleQuickCreateSupplier = useCallback(async (newName: string) => {
    if (!newName.trim()) return;
    try {
      const created = await quickCreatePartner({ name: newName.trim(), type: 'supplier' });
      setSupplierOptions((prev) => {
        if (prev.some((o) => o.id === created.id)) return prev;
        return [...prev, created];
      });
      setSupplierId(created.id);
      setSupplier(created.name);
      setSupplierInputValue(created.name);
      showToast(`已创建供应商「${created.name}」`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建供应商失败';
      showToast(message, 'error');
    }
  }, [showToast]);

  /** 二次确认后真正提交 */
  const handleConfirmedSubmit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      await createInbound({
        sku: sku.trim(),
        name: name.trim(),
        warehouseId: selectedWarehouseId,
        quantity: Number(quantity),
        supplier: supplier.trim() || undefined,
        supplier_id: supplierId || undefined,
        batchNo: batchNo.trim() || undefined,
        remark: remark.trim() || undefined,
      });
      showToast('入库成功', 'success');
      resetForm();
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '入库失败';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            minWidth: 480,
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          },
        }}
        BackdropProps={{
          sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
          入库操作
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="SKU编号"
              required
              size="small"
              fullWidth
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="例如：SKU001"
            />
            <TextField
              label="商品名称"
              required
              size="small"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：蓝牙耳机"
            />
            <FormControl size="small" fullWidth required>
              <InputLabel>仓库</InputLabel>
              <Select
                value={selectedWarehouseId}
                label="仓库"
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
              >
                {warehouses.map((wh) => (
                  <MenuItem key={wh.id} value={wh.id}>
                    {wh.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="数量"
              required
              size="small"
              fullWidth
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              inputProps={{ min: 1 }}
              placeholder="请输入入库数量"
            />
            <Autocomplete
              freeSolo
              size="small"
              options={supplierOptions}
              value={supplierOptions.find((o) => o.id === supplierId) || null}
              inputValue={supplierInputValue}
              onInputChange={(_event, newInputValue, reason) => {
                if (reason === 'input') setSupplierInputValue(newInputValue);
                if (reason === 'clear') {
                  setSupplierInputValue('');
                  setSupplierId('');
                  setSupplier('');
                }
              }}
              onChange={(_event, newValue) => {
                if (!newValue) {
                  setSupplierId('');
                  setSupplier('');
                  return;
                }
                if (typeof newValue === 'string') {
                  // freeSolo: user typed and pressed Enter
                  const existing = supplierOptions.find(
                    (o) => o.name.toLowerCase() === newValue.trim().toLowerCase(),
                  );
                  if (existing) {
                    setSupplierId(existing.id);
                    setSupplier(existing.name);
                    setSupplierInputValue(existing.name);
                  } else if (newValue.trim()) {
                    handleQuickCreateSupplier(newValue.trim());
                  }
                  return;
                }
                const option = newValue as PartnerOption & { id: string };
                if (option.id === CREATE_SENTINEL) {
                  handleQuickCreateSupplier(option.name);
                } else {
                  setSupplierId(option.id);
                  setSupplier(option.name);
                  setSupplierInputValue(option.name);
                }
              }}
              onKeyDown={(event: React.KeyboardEvent) => {
                if (event.key === 'Enter') {
                  const input = supplierInputValue.trim();
                  if (!input) return;
                  const exists = supplierOptions.some(
                    (o) => o.name.toLowerCase() === input.toLowerCase(),
                  );
                  if (!exists) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleQuickCreateSupplier(input);
                  }
                }
              }}
              filterOptions={(options, state) => {
                const input = state.inputValue.trim();
                if (!input) return options;
                const filtered = options.filter((opt) => matchPartnerName(input, opt.name));
                const exactMatch = options.some(
                  (opt) => opt.name.toLowerCase() === input.toLowerCase(),
                );
                if (!exactMatch) {
                  filtered.push({
                    id: CREATE_SENTINEL,
                    name: input,
                    type: 'supplier' as const,
                  });
                }
                return filtered;
              }}
              getOptionLabel={(option) =>
                typeof option === 'string' ? option : option.name
              }
              renderOption={(props, option) => {
                const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                const opt = option as PartnerOption;
                if (opt.id === CREATE_SENTINEL) {
                  return (
                    <li key={key} {...rest}>
                      <Box component="span" sx={{ color: '#2563EB', fontWeight: 500 }}>
                        创建新供应商「{opt.name}」
                      </Box>
                    </li>
                  );
                }
                return (
                  <li key={key} {...rest}>
                    {opt.name}
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="供应商"
                  placeholder="搜索或输入名称..."
                  InputLabelProps={{ shrink: true }}
                />
              )}
            />
            <TextField
              label="批次号"
              size="small"
              fullWidth
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              placeholder="可选"
            />
            <TextField
              label="备注"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="可选"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={handleClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmClick}
            disabled={submitting}
            sx={{ backgroundColor: '#111827' }}
          >
            {submitting ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} color="inherit" />
                提交中...
              </Box>
            ) : (
              '确认入库'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 二次确认弹窗 */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="xs"
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
          确认入库
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            请确认以下入库信息：
          </Typography>
          <Stack spacing={1} sx={{ backgroundColor: '#F9FAFB', borderRadius: 1.5, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">SKU</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{sku.trim()}</Typography>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">商品名称</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{name.trim()}</Typography>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">仓库</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{getWarehouseName(selectedWarehouseId)}</Typography>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">数量</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#059669' }}>+{Number(quantity)}</Typography>
            </Box>
            {supplierInputValue.trim() && (
              <>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">供应商</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{supplierInputValue.trim()}</Typography>
                </Box>
              </>
            )}
            {batchNo.trim() && (
              <>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">批次号</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{batchNo.trim()}</Typography>
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleConfirmedSubmit} sx={{ backgroundColor: '#111827' }}>
            确认
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default InboundDialog;
