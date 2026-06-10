/**
 * 绑定物流弹窗
 *
 * 功能：
 * - 从匹配的 transit_orders 中选择（from/to 仓库匹配）
 * - 展示物流详情
 * - 绑定确认
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  FormHelperText,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import { bindTransitOrder } from '../../api/transferApi';
import type { TransferOrder } from '../../types/wms';

// ===================== Types =====================

interface TransitOption {
  id: string;
  trackingNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transportMode: string;
  estimatedArrival: string;
  carrier: string;
  status: string;
}

interface BindTransitDialogProps {
  open: boolean;
  transferOrder: TransferOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ===================== Component =====================

const BindTransitDialog: React.FC<BindTransitDialogProps> = ({ open, transferOrder, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [transitOrders, setTransitOrders] = useState<TransitOption[]>([]);
  const [selectedTransitId, setSelectedTransitId] = useState('');
  const [binding, setBinding] = useState(false);
  const [error, setError] = useState('');

  // Fetch matching transit orders
  useEffect(() => {
    if (open && transferOrder) {
      setSelectedTransitId('');
      setError('');
      fetch('/api/transit-orders')
        .then((res) => res.json())
        .then((json) => {
          if (json.code === 0 && Array.isArray(json.data)) {
            // Filter transit orders that match from/to warehouses
            const matched = json.data.filter(
              (t: Record<string, unknown>) =>
                t.fromWarehouseId === transferOrder.fromWarehouseId &&
                t.toWarehouseId === transferOrder.toWarehouseId
            );
            setTransitOrders(matched.map((t: Record<string, unknown>) => ({
              id: t.id as string,
              trackingNo: t.trackingNo as string,
              fromWarehouseId: t.fromWarehouseId as string,
              toWarehouseId: t.toWarehouseId as string,
              transportMode: t.transportMode as string,
              estimatedArrival: t.estimatedArrival as string,
              carrier: t.carrier as string,
              status: t.status as string,
            })));
          }
        })
        .catch(() => {
          setTransitOrders([]);
        });
    }
  }, [open, transferOrder]);

  const selectedTransit = transitOrders.find((t) => t.id === selectedTransitId);

  const handleBind = async () => {
    if (!transferOrder || !selectedTransitId) {
      setError('请选择物流单');
      return;
    }
    setBinding(true);
    try {
      await bindTransitOrder(transferOrder.id, selectedTransitId);
      showToast('物流绑定成功，状态已更新为在途', 'success');
      setSelectedTransitId('');
      onSuccess();
    } catch (e) {
      showToast((e as Error).message || '绑定失败', 'error');
    } finally {
      setBinding(false);
    }
  };

  const handleClose = () => {
    setSelectedTransitId('');
    setError('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
    >
      <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
        绑定物流
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        {transferOrder && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              绑定物流后，调拨单状态将更新为「在途」。仅显示起止仓库匹配的物流单。
            </Alert>

            {/* 调拨单摘要 */}
            <Box sx={{ bgcolor: '#F9FAFB', p: 2, borderRadius: 1, border: '1px solid #E5E7EB', mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>调拨单号：</strong>{transferOrder.transferNo || transferOrder.id.slice(0, 8)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>SKU：</strong>{transferOrder.sku} × {transferOrder.quantity}
              </Typography>
              <Typography variant="body2">
                <strong>路线：</strong>{transferOrder.fromWarehouseName || transferOrder.fromWarehouseId} → {transferOrder.toWarehouseName || transferOrder.toWarehouseId}
              </Typography>
            </Box>

            {/* 物流单选择 */}
            {transitOrders.length === 0 ? (
              <Alert severity="warning">
                未找到匹配的物流单（起止仓库须一致）
              </Alert>
            ) : (
              <FormControl fullWidth size="small" error={!!error} sx={{ mb: 2 }}>
                <InputLabel>选择物流单</InputLabel>
                <Select
                  value={selectedTransitId}
                  label="选择物流单"
                  onChange={(e) => { setSelectedTransitId(e.target.value); setError(''); }}
                >
                  {transitOrders.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.trackingNo || t.id.slice(0, 8)} — {t.carrier || '未知承运商'}
                    </MenuItem>
                  ))}
                </Select>
                {error && <FormHelperText>{error}</FormHelperText>}
              </FormControl>
            )}

            {/* 物流详情 */}
            {selectedTransit && (
              <Box sx={{ bgcolor: '#F9FAFB', p: 2, borderRadius: 1, border: '1px solid #E5E7EB' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>物流详情</Typography>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600, width: 100 }}>物流单号</TableCell>
                      <TableCell sx={{ border: 0, py: 0.5 }}>{selectedTransit.trackingNo || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600 }}>承运商</TableCell>
                      <TableCell sx={{ border: 0, py: 0.5 }}>{selectedTransit.carrier || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600 }}>运输方式</TableCell>
                      <TableCell sx={{ border: 0, py: 0.5 }}>{selectedTransit.transportMode || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600 }}>预计到达</TableCell>
                      <TableCell sx={{ border: 0, py: 0.5 }}>{selectedTransit.estimatedArrival || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600 }}>物流状态</TableCell>
                      <TableCell sx={{ border: 0, py: 0.5 }}>{selectedTransit.status || '-'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={handleClose} disabled={binding}>取消</Button>
        <Button
          variant="contained"
          onClick={handleBind}
          disabled={binding || !selectedTransitId || transitOrders.length === 0}
          sx={{ backgroundColor: '#2563EB', '&:hover': { backgroundColor: '#1D4ED8' } }}
        >
          {binding ? '绑定中...' : '确认绑定'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BindTransitDialog;
