/**
 * DeleteConfirmDialog — 删除 MCP Server 确认对话框
 */

import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button,
} from '@mui/material';

interface DeleteConfirmDialogProps {
  open: boolean;
  serverName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({ open, serverName, onConfirm, onCancel }) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 600 }}>确认删除</DialogTitle>
    <DialogContent>
      <DialogContentText sx={{ fontSize: '0.85rem' }}>
        确定要删除 MCP Server「{serverName}」吗？此操作将同时断开连接，且不可撤销。
      </DialogContentText>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button onClick={onCancel} size="small" sx={{ fontSize: '0.8rem' }}>取消</Button>
      <Button onClick={onConfirm} color="error" size="small" variant="contained" sx={{ fontSize: '0.8rem' }}>删除</Button>
    </DialogActions>
  </Dialog>
);

export default DeleteConfirmDialog;
