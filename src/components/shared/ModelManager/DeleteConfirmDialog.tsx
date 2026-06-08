/**
 * DeleteConfirmDialog — 统一删除确认对话框（F3）
 *
 * 替代 window.confirm，使用 MUI Dialog 实现更优雅的确认体验。
 */

import React from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { COLORS, primaryButtonSx } from './styles';
import type { DeleteConfirmDialogProps } from './types';

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({ target, onConfirm, onCancel }) => {
  if (!target) return null;

  return (
    <Dialog
      open
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <WarningAmberIcon sx={{ color: '#F59E0B', fontSize: 22 }} />
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: COLORS.textPrimary }}>
          确认删除
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textSecondary, lineHeight: 1.6 }}>
          确定要删除模型
          <Box component="span" sx={{ fontWeight: 600, color: COLORS.textPrimary, mx: 0.5 }}>
            {target.name}
          </Box>
          （{target.id}）吗？此操作不可恢复。
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={onCancel}
          size="small"
          sx={{ fontSize: '0.8rem' }}
        >
          取消
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          size="small"
          sx={{
            ...primaryButtonSx,
            backgroundColor: COLORS.error,
            '&:hover': { backgroundColor: '#DC2626' },
          }}
        >
          删除
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmDialog;
