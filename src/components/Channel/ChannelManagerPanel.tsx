/**
 * ChannelManagerPanel — 通道管理面板
 *
 * 功能：
 * - 列出所有已注册通道（含状态、类型、启停）
 * - 添加新通道（选择类型 → 填写配置）
 * - 删除通道
 * - 启用/禁用通道
 * - 发送测试消息
 *
 * 从后端 /api/channels 读取数据。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Switch,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import CableIcon from '@mui/icons-material/Cable';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchChannels,
  fetchChannelTypes,
  createChannel,
  deleteChannel,
  enableChannel,
  disableChannel,
  sendChannelMessage,
} from '../../services/channel/api';
import type { ChannelDetail, ChannelTypeDescriptor, ChannelType } from '../../services/channel/types';

const ChannelManagerPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelDetail[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelTypeDescriptor[]>([]);

  // 添加通道对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    type: 'webhook' as ChannelType,
    description: '',
    webhookUrl: '',
    botToken: '',
  });
  const [adding, setAdding] = useState(false);

  // 测试消息对话框
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<string>('');
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [channelList, types] = await Promise.all([fetchChannels(), fetchChannelTypes()]);
      setChannels(channelList);
      setChannelTypes(types);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载通道列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = useCallback(async () => {
    if (!newChannel.name.trim()) {
      showToast('请填写通道名称', 'warning');
      return;
    }
    setAdding(true);
    try {
      const credentials: Record<string, string> = {};
      if (newChannel.webhookUrl) credentials.webhookUrl = newChannel.webhookUrl;
      if (newChannel.botToken) credentials.botToken = newChannel.botToken;

      const created = await createChannel({
        name: newChannel.name.trim(),
        type: newChannel.type,
        enabled: true,
        credentials,
        description: newChannel.description.trim() || undefined,
      });
      setChannels(prev => [...prev, created]);
      setAddDialogOpen(false);
      setNewChannel({ name: '', type: 'webhook', description: '', webhookUrl: '', botToken: '' });
      showToast(`通道 "${created.name}" 已添加`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '添加通道失败', 'error');
    } finally {
      setAdding(false);
    }
  }, [newChannel, showToast]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`确定删除通道 "${name}" 吗？`)) return;
    try {
      await deleteChannel(name);
      setChannels(prev => prev.filter(c => c.name !== name));
      showToast(`通道 "${name}" 已删除`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败', 'error');
    }
  }, [showToast]);

  const handleToggle = useCallback(async (channel: ChannelDetail) => {
    try {
      if (channel.enabled) {
        await disableChannel(channel.name);
        setChannels(prev => prev.map(c => c.name === channel.name ? { ...c, enabled: false, status: 'disconnected' } : c));
      } else {
        await enableChannel(channel.name);
        setChannels(prev => prev.map(c => c.name === channel.name ? { ...c, enabled: true, status: 'connected' } : c));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
    }
  }, [showToast]);

  const handleSendTest = useCallback(async () => {
    if (!testMessage.trim()) {
      showToast('请输入测试消息', 'warning');
      return;
    }
    setSending(true);
    try {
      await sendChannelMessage(testTarget, testMessage, 'text');
      showToast('测试消息已发送', 'success');
      setTestDialogOpen(false);
      setTestMessage('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '发送失败', 'error');
    } finally {
      setSending(false);
    }
  }, [testTarget, testMessage, showToast]);

  const statusColor = (status: string): string => {
    switch (status) {
      case 'connected': return '#059669';
      case 'disconnected': return '#6B7280';
      case 'error': return '#DC2626';
      default: return '#9CA3AF';
    }
  };

  const inputSx = {
    fontSize: '0.75rem',
    '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.75 },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: gs.border },
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} sx={{ color: gs.textMuted }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Alert severity="error" sx={{ fontSize: '0.75rem' }}>{error}</Alert>
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadData} sx={{ alignSelf: 'flex-start', fontSize: '0.75rem', color: gs.textMuted }}>
          重试
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* 头部操作栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
          共 {channels.length} 个通道
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="刷新">
            <IconButton size="small" onClick={loadData} sx={{ color: gs.textMuted }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
            sx={{ fontSize: '0.7rem', color: gs.textPrimary, borderColor: gs.border }}
            variant="outlined"
          >
            添加通道
          </Button>
        </Box>
      </Box>

      {/* 通道列表 */}
      {channels.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, color: gs.textMuted }}>
          <CableIcon sx={{ fontSize: 32, mb: 1, opacity: 0.5 }} />
          <Typography sx={{ fontSize: '0.75rem' }}>暂无通道，点击"添加通道"创建</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {channels.map(channel => {
            const typeDesc = channelTypes.find(t => t.type === channel.type);
            return (
              <Box
                key={channel.name}
                sx={{
                  p: 1.5,
                  borderRadius: '8px',
                  border: `1px solid ${gs.border}`,
                  backgroundColor: gs.bgPanel,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: statusColor(channel.status),
                      flexShrink: 0,
                    }}
                  />
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>
                    {channel.name}
                  </Typography>
                  <Chip
                    label={typeDesc?.label ?? channel.type}
                    size="small"
                    sx={{
                      fontSize: '0.65rem', height: 20,
                      backgroundColor: gs.bgHover,
                      color: gs.textSecondary,
                    }}
                  />
                  <Switch
                    size="small"
                    checked={channel.enabled}
                    onChange={() => handleToggle(channel)}
                  />
                </Box>
                {channel.description && (
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 0.5 }}>
                    {channel.description}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <Chip
                    label={channel.status}
                    size="small"
                    sx={{
                      fontSize: '0.6rem', height: 18,
                      backgroundColor: statusColor(channel.status) + '20',
                      color: statusColor(channel.status),
                    }}
                  />
                  {channel.accountCount > 0 && (
                    <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                      {channel.accountCount} 个账户
                    </Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title="发送测试消息">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setTestTarget(channel.name);
                        setTestDialogOpen(true);
                      }}
                      sx={{ color: gs.textMuted }}
                    >
                      <SendIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(channel.name)}
                      sx={{ color: gs.textMuted, '&:hover': { color: '#DC2626' } }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* 添加通道对话框 */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 600 }}>添加新通道</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="通道名称"
              size="small"
              fullWidth
              value={newChannel.name}
              onChange={e => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
              placeholder="如：feishu-alert"
              sx={inputSx}
            />
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.75rem' }}>通道类型</InputLabel>
              <Select
                value={newChannel.type}
                label="通道类型"
                onChange={e => setNewChannel(prev => ({ ...prev, type: e.target.value as ChannelType }))}
                sx={inputSx}
              >
                {channelTypes.map(t => (
                  <MenuItem key={t.type} value={t.type} sx={{ fontSize: '0.75rem' }}>
                    <Box>
                      <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{t.label}</Typography>
                      <Typography component="span" sx={{ fontSize: '0.65rem', color: gs.textMuted, ml: 1 }}>
                        {t.bidirectional ? '双向' : '单向'}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="描述（可选）"
              size="small"
              fullWidth
              value={newChannel.description}
              onChange={e => setNewChannel(prev => ({ ...prev, description: e.target.value }))}
              sx={inputSx}
            />
            {(newChannel.type === 'webhook' || newChannel.type === 'feishu' || newChannel.type === 'dingtalk' || newChannel.type === 'wechat' || newChannel.type === 'wechat_work') && (
              <TextField
                label="Webhook URL"
                size="small"
                fullWidth
                value={newChannel.webhookUrl}
                onChange={e => setNewChannel(prev => ({ ...prev, webhookUrl: e.target.value }))}
                placeholder="https://..."
                sx={inputSx}
              />
            )}
            {newChannel.type === 'wechat' && (
              <>
                <TextField
                  label="网关 URL"
                  size="small"
                  fullWidth
                  value={newChannel.botToken}
                  onChange={e => setNewChannel(prev => ({ ...prev, botToken: e.target.value }))}
                  placeholder="https://wechat-gateway.example.com"
                  sx={inputSx}
                />
                <TextField
                  label="Token"
                  size="small"
                  fullWidth
                  value={newChannel.webhookUrl}
                  onChange={e => setNewChannel(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder="网关访问令牌"
                  sx={inputSx}
                />
              </>
            )}
            {newChannel.type === 'dingtalk' && (
              <TextField
                label="Access Token（可选，用于双向 Stream API）"
                size="small"
                fullWidth
                value={newChannel.botToken}
                onChange={e => setNewChannel(prev => ({ ...prev, botToken: e.target.value }))}
                placeholder="钉钉 Stream API accessToken"
                sx={inputSx}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddDialogOpen(false)} sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={adding}
            startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
            sx={{ fontSize: '0.75rem', backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary } }}
          >
            添加
          </Button>
        </DialogActions>
      </Dialog>

      {/* 发送测试消息对话框 */}
      <Dialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
          发送测试消息到 "{testTarget}"
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            label="消息内容"
            size="small"
            fullWidth
            multiline
            rows={3}
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            placeholder="输入测试消息..."
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTestDialogOpen(false)} sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSendTest}
            disabled={sending}
            startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
            sx={{ fontSize: '0.75rem', backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary } }}
          >
            发送
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChannelManagerPanel;
