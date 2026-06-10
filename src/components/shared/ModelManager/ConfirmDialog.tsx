/**
 * ConfirmDialog — 通用确认对话框
 *
 * 替代 window.confirm / alert，使用 MUI Dialog 实现统一的确认体验。
 * 支持自定义标题、内容、确认按钮文本和颜色。
 */

import React from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, useTheme,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { getModelManagerStyles } from './styles';
import type { ConfirmDialogProps } from './types';

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ config }) => {
  const { open, title, content, confirmText, confirmColor = 'primary', onConfirm, onCancel } = config;

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);

  if (!open) return null;

  const iconMap = {
    error: <ErrorOutlineIcon sx={{ color: styles.textSecondary, fontSize: 22 }} />,
    warning: <WarningAmberIcon sx={{ color: styles.textSecondary, fontSize: 22 }} />,
    primary: <InfoOutlinedIcon sx={{ color: styles.textSecondary, fontSize: 22 }} />,
  };

  const confirmBgMap = {
    error: styles.textSecondary,
    warning: styles.textSecondary,
    primary: styles.textSecondary,
  };

  const confirmHoverMap = {
    error: styles.textMuted,
    warning: styles.textMuted,
    primary: styles.textMuted,
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        {iconMap[confirmColor]}
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: styles.textPrimary }}>
          {title}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: '0.8125rem', color: styles.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {content}
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
            ...styles.primaryButton,
            backgroundColor: confirmBgMap[confirmColor],
            '&:hover': { backgroundColor: confirmHoverMap[confirmColor] },
          }}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
