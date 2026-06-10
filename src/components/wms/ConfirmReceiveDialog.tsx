/**
 * 确认收货弹窗
 *
 * 功能：
 * - 显示调拨摘要信息
 * - 警告提示（入库将增加库存）
 * - 收货人输入
 * - 二次确认
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import { receiveTransferOrder } from '../../api/transferApi';
import { STATUS_CONFIG } from '../../constants/transferStatus';
import type { TransferOrder } from '../../types/wms';

// ===================== Types =====================

interface ConfirmReceiveDialogProps {
  open: boolean;
  transferOrder: TransferOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ===================== Component =====================

const ConfirmReceiveDialog: React.FC<ConfirmReceiveDialogProps> = ({ open, transferOrder, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [receivedBy, setReceivedBy] = useState('');
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!transferOrder) return;
    if (!receivedBy.trim()) {
      showToast('请输入收货人', 'warning');
      return;
    }
    setConfirming(true);
    try {
      await receiveTransferOrder(transferOrder.id, receivedBy.trim());
      showToast('收货确认成功，已增加入库仓库存', 'success');
      setReceivedBy('');
      onSuccess();
    } catch (e) {
      showToast((e as Error).message || '收货确认失败', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setReceivedBy('');
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
        确认收货
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        {transferOrder && (
          <Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              确认收货后将增加入库仓库存，此操作不可撤销。
            </Alert>

            {/* 调拨摘要 */}
            <Box sx={{ bgcolor: '#F9FAFB', p: 2, borderRadius: 1, border: '1px solid #E5E7EB', mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>调拨单号：</strong>{transferOrder.transferNo || transferOrder.id.slice(0, 8)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>SKU：</strong>{transferOrder.sku}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>品名：</strong>{transferOrder.name || '-'}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>调拨数量：</strong>{transferOrder.quantity}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>出库仓：</strong>{transferOrder.fromWarehouseName || transferOrder.fromWarehouseId}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>入库仓：</strong>{transferOrder.toWarehouseName || transferOrder.toWarehouseId}
              </Typography>
              <Typography variant="body2">
                <strong>当前状态：</strong>{STATUS_CONFIG[transferOrder.status]?.label || transferOrder.status}
              </Typography>
            </Box>

            {/* 收货人 */}
            <TextField
              fullWidth
              size="small"
              label="收货人"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="请输入收货人姓名"
              required
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={handleClose} disabled={confirming}>取消</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={confirming || !receivedBy.trim()}
          sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
        >
          {confirming ? '处理中...' : '确认收货'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmReceiveDialog;
