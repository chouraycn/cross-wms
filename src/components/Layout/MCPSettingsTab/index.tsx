/**
 * MCPSettingsTab — AI 设置对话框的 MCP Tab 页面
 *
 * 管理 MCP Server 配置：添加、连接、断开、删除。
 */

import React, { useState, useCallback } from 'react';
import { Box, Typography, Snackbar, Alert } from '@mui/material';
import MCPToolbar from './MCPToolbar';
import MCPServerList from './MCPServerList';
import AddServerDialog from './AddServerDialog';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { useMCPServers } from './useMCPServers';
import { getGrayScale } from '../../../constants/theme';
import { useTheme } from '@mui/material';

const MCPSettingsTab: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const {
    servers, loading, error: loadError,
    refresh, addServer, updateServer, deleteServer,
    connectServer, disconnectServer, testServer,
  } = useMCPServers();

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingServerId, setDeletingServerId] = useState('');
  const [deletingServerName, setDeletingServerName] = useState('');

  // Toast
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const showToast = (message: string, severity: 'success' | 'error' = 'success') => {
    setToast({ open: true, message, severity });
  };

  const connectedCount = servers.filter(s => s.connectionState === 'connected').length;

  // 添加 Server
  const handleAdd = useCallback(async (req: Parameters<typeof addServer>[0]) => {
    const result = await addServer(req);
    if (result.success) {
      showToast('MCP Server 已添加');
    }
    return result;
  }, [addServer]);

  // 切换启用状态
  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    const result = await updateServer(id, { enabled });
    if (result.success) {
      showToast(enabled ? '已启用' : '已禁用');
    } else {
      showToast(result.error || '操作失败', 'error');
    }
  }, [updateServer]);

  // 手动连接
  const handleConnect = useCallback(async (id: string) => {
    const result = await connectServer(id);
    if (result.success) {
      showToast('连接成功');
    } else {
      showToast(result.error || '连接失败', 'error');
    }
  }, [connectServer]);

  // 手动断开
  const handleDisconnect = useCallback(async (id: string) => {
    const success = await disconnectServer(id);
    if (success) {
      showToast('已断开连接');
    } else {
      showToast('断开失败', 'error');
    }
  }, [disconnectServer]);

  // 删除确认
  const handleDeleteRequest = useCallback((id: string) => {
    const server = servers.find(s => s.config.id === id);
    if (server) {
      setDeletingServerId(id);
      setDeletingServerName(server.config.name);
      setDeleteDialogOpen(true);
    }
  }, [servers]);

  const handleDeleteConfirm = useCallback(async () => {
    const success = await deleteServer(deletingServerId);
    if (success) {
      showToast('已删除');
    } else {
      showToast('删除失败', 'error');
    }
    setDeleteDialogOpen(false);
  }, [deleteServer, deletingServerId]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏 */}
      <MCPToolbar
        serverCount={servers.length}
        connectedCount={connectedCount}
        onAdd={() => setAddDialogOpen(true)}
        onRefresh={refresh}
      />

      {/* 简要说明 */}
      <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2 }}>
        MCP (Model Context Protocol) Server 为 AI 提供外部工具能力。添加后连接即可扩展 AI 的工具范围。
      </Typography>

      {/* Server 列表 */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <MCPServerList
          servers={servers}
          loading={loading}
          error={loadError}
          onToggleEnabled={handleToggleEnabled}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onDelete={handleDeleteRequest}
        />
      </Box>

      {/* 添加对话框 */}
      <AddServerDialog
        open={addDialogOpen}
        onAdd={handleAdd}
        onClose={() => setAddDialogOpen(false)}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        serverName={deletingServerName}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ fontSize: '0.85rem' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MCPSettingsTab;
