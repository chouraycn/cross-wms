/**
 * CDFChat 批量消息操作工具栏组件
 *
 * 特性：
 * - 消息多选模式支持
 * - 支持批量删除、批量复制、批量导出
 * - 显示选中数量统计
 * - 取消选择功能
 */
import React, { useState, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../constants/theme.js';
import type { Message } from '../../types/chat.js';

/** 组件属性 */
export interface BatchMessageToolbarProps {
  /** 选中的消息列表 */
  selectedMessages: Message[];
  /** 是否显示工具栏 */
  visible: boolean;
  /** 取消选择回调 */
  onCancelSelection: () => void;
  /** 批量删除回调 */
  onBatchDelete?: (messageIds: string[]) => void;
  /** 批量复制回调 */
  onBatchCopy?: (messages: Message[]) => void;
  /** 批量导出回调 */
  onBatchExport?: (messages: Message[], format: 'markdown' | 'pdf') => void;
}

/**
 * 批量消息操作工具栏组件
 */
export const BatchMessageToolbar: React.FC<BatchMessageToolbarProps> = memo(({
  selectedMessages,
  visible,
  onCancelSelection,
  onBatchDelete,
  onBatchCopy,
  onBatchExport,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  /** 显示 Toast 提示 */
  const showToast = useCallback((message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
  }, []);

  /** 关闭 Toast */
  const handleCloseToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  /** 批量复制 */
  const handleBatchCopy = useCallback(() => {
    if (selectedMessages.length === 0) return;

    const combinedContent = selectedMessages
      .map(msg => `[${msg.role === 'user' ? '用户' : 'AI'}]\n${msg.content}`)
      .join('\n\n---\n\n');

    navigator.clipboard.writeText(combinedContent).then(() => {
      showToast(`已复制 ${selectedMessages.length} 条消息`, 'success');
      onBatchCopy?.(selectedMessages);
    }).catch(() => {
      showToast('复制失败，请重试', 'error');
    });
  }, [selectedMessages, onBatchCopy, showToast]);

  /** 批量删除确认 */
  const handleBatchDeleteConfirm = useCallback(() => {
    if (selectedMessages.length === 0) return;

    const messageIds = selectedMessages.map(msg => msg.id);
    onBatchDelete?.(messageIds);
    setDeleteDialogOpen(false);
    showToast(`已删除 ${selectedMessages.length} 条消息`, 'success');
    onCancelSelection();
  }, [selectedMessages, onBatchDelete, showToast, onCancelSelection]);

  /** 批量导出 */
  const handleBatchExport = useCallback((format: 'markdown' | 'pdf') => {
    if (selectedMessages.length === 0) return;

    onBatchExport?.(selectedMessages, format);
    setExportDialogOpen(false);
    showToast(`已导出 ${selectedMessages.length} 条消息为 ${format === 'markdown' ? 'Markdown' : 'PDF'}`, 'success');
  }, [selectedMessages, onBatchExport, showToast]);

  if (!visible || selectedMessages.length === 0) return null;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1,
          bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#EFF6FF',
          border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.2)' : '#BFDBFE'}`,
          borderRadius: 2,
          maxWidth: 600,
          mx: 'auto',
          mb: 1.5,
        }}
      >
        {/* 选中数量 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>
            已选中 {selectedMessages.length} 条消息
          </Typography>
        </Box>

        {/* 分割线 */}
        <Box sx={{ width: 1, height: 20, bgcolor: gs.border }} />

        {/* 批量操作按钮 */}
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <Tooltip title="批量复制">
            <IconButton
              size="small"
              onClick={handleBatchCopy}
              sx={{
                color: '#3b82f6',
                bgcolor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#DBEAFE',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#BFDBFE',
                },
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="批量导出">
            <IconButton
              size="small"
              onClick={() => setExportDialogOpen(true)}
              sx={{
                color: '#3b82f6',
                bgcolor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#DBEAFE',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#BFDBFE',
                },
              }}
            >
              <DownloadIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="批量删除">
            <IconButton
              size="small"
              onClick={() => setDeleteDialogOpen(true)}
              sx={{
                color: '#ef4444',
                bgcolor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FECACA',
                },
              }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* 取消选择 */}
        <Box sx={{ ml: 'auto' }}>
          <Tooltip title="取消选择">
            <IconButton
              size="small"
              onClick={onCancelSelection}
              sx={{
                color: gs.textMuted,
                '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
              }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 批量删除确认对话框 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
          },
        }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600, color: gs.textPrimary }}>
          确认批量删除
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, color: gs.textMuted }}>
            将删除 {selectedMessages.length} 条消息，删除后无法恢复，确定要继续吗？
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            sx={{
              fontSize: 13,
              color: gs.textMuted,
              '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            取消
          </Button>
          <Button
            onClick={handleBatchDeleteConfirm}
            variant="contained"
            sx={{
              fontSize: 13,
              bgcolor: '#ef4444',
              color: '#fff',
              '&:hover': { bgcolor: '#dc2626' },
            }}
          >
            删除 {selectedMessages.length} 条
          </Button>
        </DialogActions>
      </Dialog>

      {/* 批量导出格式选择对话框 */}
      <Dialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
          },
        }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600, color: gs.textPrimary }}>
          批量导出 {selectedMessages.length} 条消息
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, color: gs.textMuted, mb: 2 }}>
            请选择要导出的文件格式：
          </DialogContentText>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => handleBatchExport('markdown')}
              sx={{
                fontSize: 13,
                borderColor: gs.border,
                color: gs.textPrimary,
                '&:hover': { borderColor: '#3b82f6', bgcolor: isDark ? 'rgba(59,130,246,0.08)' : '#EFF6FF' },
              }}
            >
              Markdown
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => handleBatchExport('pdf')}
              sx={{
                fontSize: 13,
                borderColor: gs.border,
                color: gs.textPrimary,
                '&:hover': { borderColor: '#3b82f6', bgcolor: isDark ? 'rgba(59,130,246,0.08)' : '#EFF6FF' },
              }}
            >
              PDF
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button
            onClick={() => setExportDialogOpen(false)}
            sx={{
              fontSize: 13,
              color: gs.textMuted,
              '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            取消
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast 提示 */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={2000}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseToast}
          severity={toastSeverity}
          sx={{
            fontSize: 13,
            bgcolor: gs.bgPanel,
            color: gs.textPrimary,
            border: `1px solid ${gs.border}`,
          }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </>
  );
});

BatchMessageToolbar.displayName = 'BatchMessageToolbar';

export default BatchMessageToolbar;