import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  useTheme, Alert, Stack, Switch, FormControlLabel, List, ListItem, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import BugReportIcon from '@mui/icons-material/BugReport';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { McpServerState, McpServerConfig } from '../services/api';
import {
  fetchMcpServers, createMcpServer, updateMcpServer, deleteMcpServer,
  connectMcpServer, disconnectMcpServer, testMcpConnection,
} from '../services/api';

const STATE_COLORS: Record<string, { bg: string; color: string; label: string; icon: React.ReactElement }> = {
  connected: { bg: '#D1FAE5', color: '#059669', label: '已连接', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  connecting: { bg: '#FEF3C7', color: '#D97706', label: '连接中', icon: <CircularProgress size={16} /> },
  disconnected: { bg: '#F3F4F6', color: '#6B7280', label: '已断开', icon: <StopIcon sx={{ fontSize: 16 }} /> },
  error: { bg: '#FEE2E2', color: '#DC2626', label: '错误', icon: <ErrorIcon sx={{ fontSize: 16 }} /> },
};

function StateChip({ state }: { state: string }) {
  const cfg = STATE_COLORS[state] || STATE_COLORS.disconnected;
  return (
    <Chip
      icon={cfg.icon}
      label={cfg.label}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: '0.7rem',
        height: 24,
        '& .MuiChip-icon': { ml: 0.5 },
      }}
    />
  );
}

const McpServersPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [servers, setServers] = useState<McpServerState[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerState | null>(null);
  const [formData, setFormData] = useState<Partial<McpServerConfig>>({
    name: '',
    command: '',
    args: [],
    env: {},
    enabled: true,
    transportType: 'stdio',
  });
  const [argsText, setArgsText] = useState('');
  const [envText, setEnvText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<McpServerState | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMcpServers();
      setServers(data);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const openCreateDialog = () => {
    setEditingServer(null);
    setFormData({
      name: '',
      command: '',
      args: [],
      env: {},
      enabled: true,
      transportType: 'stdio',
    });
    setArgsText('');
    setEnvText('');
    setDialogOpen(true);
  };

  const openEditDialog = (server: McpServerState) => {
    setEditingServer(server);
    setFormData(server.config);
    setArgsText(server.config.args?.join('\n') || '');
    setEnvText(
      Object.entries(server.config.env || {})
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') || ''
    );
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.command) {
      showToast('请填写名称和命令', 'error');
      return;
    }

    const args = argsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const env: Record<string, string> = {};
    envText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          env[line.slice(0, idx)] = line.slice(idx + 1);
        }
      });

    const data = { ...formData, args, env };

    try {
      if (editingServer) {
        await updateMcpServer(editingServer.config.id!, data);
        showToast('更新成功', 'success');
      } else {
        await createMcpServer(data);
        showToast('创建成功', 'success');
      }
      setDialogOpen(false);
      loadServers();
    } catch (e) {
      showToast(`操作失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个 MCP Server 吗？')) return;
    try {
      await deleteMcpServer(id);
      showToast('删除成功', 'success');
      loadServers();
    } catch (e) {
      showToast(`删除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleConnect = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await connectMcpServer(id);
      showToast(res.success ? '连接成功' : '连接失败', res.success ? 'success' : 'error');
      loadServers();
    } catch (e) {
      showToast(`连接失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    setActionLoading(id);
    try {
      await disconnectMcpServer(id);
      showToast('已断开', 'success');
      loadServers();
    } catch (e) {
      showToast(`断开失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTest = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await testMcpConnection(id);
      showToast(res.success ? '测试连接成功' : '测试连接失败', res.success ? 'success' : 'error');
      loadServers();
    } catch (e) {
      showToast(`测试失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          MCP Server 管理
        </Typography>
        <Stack direction="row" spacing={1}>
          <IconButton size="small" onClick={loadServers} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={openCreateDialog}
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            添加 Server
          </Button>
        </Stack>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={24} />
        </Box>
      ) : servers.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          暂无 MCP Server 配置，点击右上角添加
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          {servers.map((server) => (
            <Paper
              key={server.config.id}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' },
              }}
              onClick={() => setSelectedServer(selectedServer?.config.id === server.config.id ? null : server)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <StateChip state={server.connectionState} />
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {server.config.name}
                  </Typography>
                  <Chip
                    label={server.config.transportType}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />
                  <Chip
                    label={`${server.tools.length} 个工具`}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      height: 20,
                      backgroundColor: '#EFF6FF',
                      color: '#2563EB',
                    }}
                  />
                </Stack>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="测试连接">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleTest(server.config.id!); }}
                      disabled={actionLoading === server.config.id}
                    >
                      <BugReportIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {server.connectionState === 'connected' ? (
                    <Tooltip title="断开连接">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleDisconnect(server.config.id!); }}
                        disabled={actionLoading === server.config.id}
                      >
                        <StopIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="连接">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleConnect(server.config.id!); }}
                        disabled={actionLoading === server.config.id}
                      >
                        <PlayArrowIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="编辑">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); openEditDialog(server); }}
                    >
                      <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleDelete(server.config.id!); }}
                      color="error"
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1, fontFamily: 'monospace' }}>
                {server.config.command}
              </Typography>

              {server.config.args && server.config.args.length > 0 && (
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.5 }}>
                  参数: {server.config.args.join(' ')}
                </Typography>
              )}

              {server.error && (
                <Alert severity="error" sx={{ mt: 1, fontSize: '0.75rem', borderRadius: 1 }}>
                  {server.error}
                </Alert>
              )}

              {selectedServer?.config.id === server.config.id && server.tools.length > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 1 }}>
                    可用工具 ({server.tools.length})
                  </Typography>
                  <List dense disablePadding sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {server.tools.map((tool) => (
                      <ListItem key={tool.name} sx={{ px: 0, py: 0.5 }}>
                        <ListItemText
                          primary={tool.name}
                          secondary={tool.description}
                          primaryTypographyProps={{ fontSize: '0.75rem', fontWeight: 600 }}
                          secondaryTypographyProps={{ fontSize: '0.7rem' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>
          {editingServer ? '编辑 MCP Server' : '添加 MCP Server'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="名称"
              size="small"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="my-mcp-server"
            />
            <TextField
              label="命令"
              size="small"
              value={formData.command}
              onChange={(e) => setFormData({ ...formData, command: e.target.value })}
              placeholder="uvx mcp-server-filesystem"
            />
            <TextField
              label="参数（每行一个）"
              size="small"
              multiline
              rows={3}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="arg1&#10;arg2"
            />
            <TextField
              label="环境变量（KEY=VALUE，每行一个）"
              size="small"
              multiline
              rows={3}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="MY_KEY=my_value"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  size="small"
                />
              }
              label="启用"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} size="small" sx={{ textTransform: 'none' }}>
            取消
          </Button>
          <Button onClick={handleSubmit} variant="contained" size="small" sx={{ textTransform: 'none' }}>
            {editingServer ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default McpServersPage;