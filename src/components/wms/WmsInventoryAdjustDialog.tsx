/**
 * 库存盘点差异调整确认弹窗
 *
 * 在 counted 状态下，用户点击"确认调整"后弹出此对话框
 * 显示盘点差异详情，确认后调用后端 API 执行库存调整
 *
 * 状态流转: counted → adjusted
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import { adjustInventoryCount } from '../../api/wmsInventoryApi';
import type { InventoryCount } from '../../types/wms';

interface WmsInventoryAdjustDialogProps {
  /** 弹窗是否打开 */
  open: boolean;
  /** 待调整的盘点记录 */
  inventoryItem: InventoryCount | null;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 调整成功回调 */
  onSuccess: () => void;
}

const WmsInventoryAdjustDialog: React.FC<WmsInventoryAdjustDialogProps> = ({
  open,
  inventoryItem,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  /** 差异颜色 */
  const getVarianceColor = (variance: number): string => {
    if (variance > 0) return '#059669';
    if (variance < 0) return '#DC2626';
    return '#6B7280';
  };

  /** 差异标签 */
  const getVarianceLabel = (variance: number): string => {
    if (variance > 0) return `盘盈 +${variance}`;
    if (variance < 0) return `盘亏 ${variance}`;
    return '无差异';
  };

  /** 确认调整 */
  const handleConfirm = async () => {
    if (!inventoryItem?.id) return;

    setSubmitting(true);
    try {
      const result = await adjustInventoryCount(
        inventoryItem.id,
        inventoryItem.counter || 'system'
      );

      if (result.success) {
        showToast(result.message || '差异调整成功，库存已更新', 'success');
        onSuccess();
        onClose();
      } else {
        showToast(result.message || '调整失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '网络错误', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /** 关闭弹窗 */
  const handleClose = () => {
    if (submitting) return;  // 防止重复提交
    onClose();
  };

  if (!inventoryItem) return null;

  const variance = inventoryItem.variance ?? 0;
  const actualQty = inventoryItem.actualQuantity ?? 0;
  const systemQty = inventoryItem.systemQuantity;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
        确认差异调整
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Stack spacing={2}>
          {/* 警告提示 */}
          <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
            确认后将根据实盘数量调整系统库存，此操作不可撤销！
          </Alert>

          {/* 盘点信息 */}
          <Box sx={{ bgcolor: '#F9FAFB', p: 2, borderRadius: 1, border: '1px solid #E5E7EB' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
              盘点详情
            </Typography>

            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">仓库ID：</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {inventoryItem.warehouseId}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">库位编码：</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {inventoryItem.locationCode}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">SKU：</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {inventoryItem.sku}
                </Typography>
              </Box>

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">系统数量：</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {systemQty}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">实盘数量：</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {actualQty}
                </Typography>
              </Box>

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">差异：</Typography>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 700,
                    color: getVarianceColor(variance),
                  }}
                >
                  {getVarianceLabel(variance)}
                </Typography>
              </Box>

              {inventoryItem.counter && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">盘点人：</Typography>
                  <Typography variant="body2">{inventoryItem.counter}</Typography>
                </Box>
              )}
            </Stack>
          </Box>

          {/* 调整说明 */}
          <DialogContentText sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
            点击"确认调整"后，系统将自动调整库存数量。盘盈将增加库存，盘亏将减少库存。
          </DialogContentText>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={handleClose} disabled={submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={submitting}
          sx={{
            backgroundColor: variance > 0 ? '#059669' : variance < 0 ? '#DC2626' : '#111827',
            '&:hover': {
              backgroundColor: variance > 0 ? '#047857' : variance < 0 ? '#B91C1C' : '#374151',
            },
          }}
        >
          {submitting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} color="inherit" />
              调整中...
            </Box>
          ) : (
            '确认调整'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WmsInventoryAdjustDialog;
