import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Switch,
  Tabs,
  Tab,
  LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import MessageIcon from '@mui/icons-material/Message';
import CampaignIcon from '@mui/icons-material/Campaign';
import HubIcon from '@mui/icons-material/Hub';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

import {
  getChannelTypes,
  getChannels,
  getChannelDetail,
  createChannel,
  updateChannel,
  deleteChannel,
  enableChannel,
  disableChannel,
  sendMessage,
  addChannelAccount,
  removeChannelAccount,
  type ChannelType,
  type ChannelStatus,
  type ChannelConfig,
  type ChannelTypeInfo,
  type ChannelListItem,
  type ChannelDetail as ChannelDetailType,
} from '../services/channelsApi';
import {
  listManagedChannels,
  broadcastMessage,
  listTypers,
  listPairings,
  fetchPipelineSnapshot,
  type ManagedChannel,
  type ActiveTyper,
  type ChannelPair,
  type PipelineStageStat,
} from '../services/channelRuntimeApi';
import { getGrayScale } from '../constants/theme';

const ChannelsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [activeTab, setActiveTab] = useState<'config' | 'runtime'>('config');

  const [channelTypes, setChannelTypes] = useState<ChannelTypeInfo[]>([]);
  const [channels, setChannels] = useState<ChannelListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailChannel, setDetailChannel] = useState<ChannelDetailType | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendChannelName, setSendChannelName] = useState('');
  const [sendContent, setSendContent] = useState('');
  const [sendContentType, setSendContentType] = useState<'text' | 'markdown' | 'json'>('text');
  const [sendResult, setSendResult] = useState<string | null>(null);

  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ===================== Runtime 状态 =====================
  const [managedChannels, setManagedChannels] = useState<ManagedChannel[]>([]);
  const [managedChannelsDemo, setManagedChannelsDemo] = useState(false);
  const [typers, setTypers] = useState<ActiveTyper[]>([]);
  const [typersDemo, setTypersDemo] = useState(false);
  const [pairings, setPairings] = useState<ChannelPair[]>([]);
  const [pairingsDemo, setPairingsDemo] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStageStat[]>([]);
  const [pipelineDemo, setPipelineDemo] = useState(false);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [runtimeLoading, setRuntimeLoading] = useState(false);

  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const types = await getChannelTypes();
      setChannelTypes(types);
      const list = await getChannels();
      setChannels(list);
    } catch (err) {
      // 降级：保证 UI 完整，填充空数据
      setError(err instanceof Error ? err.message : '加载通道失败');
      setChannelTypes([
        { type: 'webhook', label: 'Webhook', description: '通用 Webhook 通道', bidirectional: false },
        { type: 'feishu', label: '飞书', description: '飞书机器人', bidirectional: true },
        { type: 'dingtalk', label: '钉钉', description: '钉钉机器人', bidirectional: true },
      ]);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuntime = useCallback(async () => {
    setRuntimeLoading(true);
    try {
      const [managed, typing, pairing, pipeline] = await Promise.all([
        listManagedChannels(),
        listTypers(),
        listPairings(),
        fetchPipelineSnapshot(),
      ]);
      setManagedChannels(managed.channels);
      setManagedChannelsDemo(managed.demo);
      setTypers(typing.typers);
      setTypersDemo(typing.demo);
      setPairings(pairing.pairs);
      setPairingsDemo(pairing.demo);
      setPipelineStages(pipeline.stages);
      setPipelineDemo(pipeline.demo);
      setPipelineTotal(pipeline.totalProcessed);
    } catch (err) {
      // 静默失败，UI 已经会展示空状态
      setError(err instanceof Error ? err.message : '加载运行时数据失败');
    } finally {
      setRuntimeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (activeTab === 'runtime') {
      void loadRuntime();
      // 每 15s 自动刷新一次
      const timer = setInterval(() => {
        void loadRuntime();
      }, 15000);
      return () => clearInterval(timer);
    }
    return;
  }, [activeTab, loadRuntime]);

  const handleOpenCreateDialog = () => {
    setEditingChannel({ name: '', type: 'webhook', enabled: true, credentials: {}, options: {} });
    setDialogMode('create');
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (channel: ChannelListItem) => {
    setEditingChannel({
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled ?? true,
      credentials: channel.credentials ?? {},
      options: channel.options ?? {},
    });
    setDialogMode('edit');
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingChannel(null);
  };

  const handleSaveChannel = async () => {
    if (!editingChannel) return;
    setOperationLoading('save');
    try {
      if (dialogMode === 'create') {
        await createChannel(editingChannel);
        setNotice('通道创建成功');
      } else {
        await updateChannel(editingChannel.name, editingChannel);
        setNotice('通道更新成功');
      }
      handleCloseDialog();
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setOperationLoading(null);
    }
  };

  const handleDeleteChannel = async (name: string) => {
    if (!window.confirm(`确定要删除通道 "${name}" 吗？`)) return;
    setOperationLoading(`delete-${name}`);
    try {
      await deleteChannel(name);
      setNotice('通道删除成功');
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setOperationLoading(null);
    }
  };

  const handleToggleChannel = async (name: string, enabled: boolean) => {
    setOperationLoading(`toggle-${name}`);
    try {
      if (enabled) {
        await enableChannel(name);
      } else {
        await disableChannel(name);
      }
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setOperationLoading(null);
    }
  };

  const handleOpenDetail = async (name: string) => {
    setDetailLoading(true);
    try {
      const detail = await getChannelDetail(name);
      setDetailChannel(detail);
      setDetailDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailDialogOpen(false);
    setDetailChannel(null);
  };

  const handleOpenSendDialog = (name: string) => {
    setSendChannelName(name);
    setSendContent('');
    setSendContentType('text');
    setSendResult(null);
    setSendDialogOpen(true);
  };

  const handleCloseSendDialog = () => {
    setSendDialogOpen(false);
    setSendChannelName('');
  };

  const handleSendMessage = async () => {
    setOperationLoading('send');
    try {
      const result = await sendMessage(sendChannelName, sendContent, sendContentType);
      setSendResult(result.ok ? '发送成功' : `发送失败: ${result.error}`);
    } catch (err) {
      setSendResult(`发送失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleAddAccount = async () => {
    if (!detailChannel) return;
    const accountName = prompt('请输入账户名称：');
    if (!accountName) return;
    const accountId = prompt('请输入账户 ID：');
    if (!accountId) return;
    try {
      await addChannelAccount(detailChannel.name, { accountId, accountName });
      setNotice('账户添加成功');
      const detail = await getChannelDetail(detailChannel.name);
      setDetailChannel(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加账户失败');
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    if (!detailChannel) return;
    if (!window.confirm(`确定要删除账户 "${accountId}" 吗？`)) return;
    try {
      await removeChannelAccount(detailChannel.name, accountId);
      setNotice('账户删除成功');
      const detail = await getChannelDetail(detailChannel.name);
      setDetailChannel(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除账户失败');
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastContent.trim()) {
      setBroadcastResult('请输入广播内容');
      return;
    }
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const r = await broadcastMessage({ content: broadcastContent, contentType: 'text' });
      setBroadcastResult(`已广播到 ${r.total} 个通道，成功 ${r.succeeded}，失败 ${r.failed}`);
    } catch (err) {
      setBroadcastResult(`广播失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBroadcastSending(false);
    }
  };

  const getStatusChip = (status: ChannelStatus) => {
    const config: Record<string, { color: 'success' | 'error' | 'info' | 'warning' | 'default'; icon: React.ReactElement; label: string }> = {
      online: { color: 'success', icon: <CheckCircleIcon />, label: '在线' },
      offline: { color: 'error', icon: <CancelIcon />, label: '离线' },
      connecting: { color: 'info', icon: <CircularProgress size={16} />, label: '连接中' },
      error: { color: 'warning', icon: <WarningIcon />, label: '异常' },
      disabled: { color: 'default', icon: <HelpOutlineIcon />, label: '已禁用' },
      connected: { color: 'success', icon: <CheckCircleIcon />, label: '已连接' },
      disconnected: { color: 'error', icon: <CancelIcon />, label: '已断开' },
      unknown: { color: 'default', icon: <HelpOutlineIcon />, label: '未知' },
    };
    return config[status] || config.unknown;
  };

  const renderDialog = () => (
    <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md">
      <DialogTitle>{dialogMode === 'create' ? '创建通道' : '编辑通道'}</DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <TextField
          fullWidth
          label="通道名称"
          value={editingChannel?.name || ''}
          onChange={(e) => {
            if (editingChannel) {
              setEditingChannel({ ...editingChannel, name: e.target.value });
            }
          }}
          margin="normal"
          required
        />
        <Select
          fullWidth
          label="通道类型"
          value={editingChannel?.type || ''}
          onChange={(e) => {
            if (editingChannel) {
              setEditingChannel({ ...editingChannel, type: e.target.value as ChannelType });
            }
          }}
          displayEmpty
          sx={{ mt: 2 }}
          required
        >
          <MenuItem value="" disabled>选择通道类型</MenuItem>
          {channelTypes.map(t => (
            <MenuItem key={t.type} value={t.type}>
              {t.label} ({t.description})
            </MenuItem>
          ))}
        </Select>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
          <Typography variant="body1">启用</Typography>
          <Switch
            checked={editingChannel?.enabled ?? true}
            onChange={(e) => {
              if (editingChannel) {
                setEditingChannel({ ...editingChannel, enabled: e.target.checked });
              }
            }}
          />
        </Box>
        <TextField
          fullWidth
          label="凭证（JSON）"
          multiline
          rows={4}
          value={JSON.stringify(editingChannel?.credentials || {}, null, 2)}
          onChange={(e) => {
            if (!editingChannel) return;
            try {
              const parsed = JSON.parse(e.target.value);
              setEditingChannel({ ...editingChannel, credentials: parsed });
            } catch {
            // ignore parse errors
          }
        }}
          margin="normal"
          placeholder='{"webhookUrl": "https://..."}'
        />
        <TextField
          fullWidth
          label="选项（JSON）"
          multiline
          rows={3}
          value={JSON.stringify(editingChannel?.options || {}, null, 2)}
          onChange={(e) => {
            if (!editingChannel) return;
            try {
              const parsed = JSON.parse(e.target.value);
              setEditingChannel({ ...editingChannel, options: parsed });
            } catch {
            // ignore parse errors
          }
        }}
          margin="normal"
          placeholder='{"autoPoll": true}'
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseDialog}>取消</Button>
        <Button
          onClick={handleSaveChannel}
          disabled={operationLoading === 'save'}
        >
          {operationLoading === 'save' ? <CircularProgress size={20} /> : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderDetailDialog = () => (
    <Dialog open={detailDialogOpen} onClose={handleCloseDetail} maxWidth="lg">
      <DialogTitle>通道详情</DialogTitle>
      <DialogContent sx={{ mt: 2, maxHeight: '70vh', overflow: 'auto' }}>
        {detailLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : detailChannel ? (
          <Box>
            <Grid container spacing={3} mb={4}>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">名称</Typography>
                <Typography variant="h6">{detailChannel.name}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">类型</Typography>
                <Chip label={detailChannel.type} color="primary" />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">状态</Typography>
                {(() => {
                  const status = getStatusChip(detailChannel.status);
                  return <Chip label={status.label} color={status.color} icon={status.icon} />;
                })()}
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">启用</Typography>
                <Switch checked={detailChannel.enabled ?? true} disabled />
              </Grid>
            </Grid>
            {detailChannel.accounts && detailChannel.accounts.length > 0 && (
              <Box mb={4}>
                <Typography variant="h6" mb={2}>账户列表</Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>账户 ID</TableCell>
                        <TableCell>账户名称</TableCell>
                        <TableCell>状态</TableCell>
                        <TableCell>操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detailChannel.accounts.map(account => (
                        <TableRow key={account.accountId}>
                          <TableCell>{account.accountId}</TableCell>
                          <TableCell>{account.accountName}</TableCell>
                          <TableCell>
                            <Chip
                              label={account.enabled ? '启用' : '禁用'}
                              color={account.enabled ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton onClick={() => handleRemoveAccount(account.accountId)}>
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Button onClick={handleAddAccount} startIcon={<AddIcon />} sx={{ mt: 2 }}>
                  添加账户
                </Button>
              </Box>
            )}
            {detailChannel.options && Object.keys(detailChannel.options).length > 0 && (
              <Box mb={4}>
                <Typography variant="h6" mb={2}>选项</Typography>
                <pre>{JSON.stringify(detailChannel.options, null, 2)}</pre>
              </Box>
            )}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseDetail}>关闭</Button>
      </DialogActions>
    </Dialog>
  );

  const renderSendDialog = () => (
    <Dialog open={sendDialogOpen} onClose={handleCloseSendDialog} maxWidth="md">
      <DialogTitle>发送消息到 {sendChannelName}</DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Select
          fullWidth
          value={sendContentType}
          onChange={(e) => setSendContentType(e.target.value as 'text' | 'markdown' | 'json')}
          sx={{ mb: 2 }}
        >
          <MenuItem value="text">文本</MenuItem>
          <MenuItem value="markdown">Markdown</MenuItem>
          <MenuItem value="json">JSON</MenuItem>
        </Select>
        <TextField
          fullWidth
          label="消息内容"
          multiline
          rows={6}
          value={sendContent}
          onChange={(e) => setSendContent(e.target.value)}
          margin="normal"
          required
        />
        {sendResult && (
          <Alert severity={sendResult.includes('成功') ? 'success' : 'error'} sx={{ mt: 2 }}>
            {sendResult}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseSendDialog}>取消</Button>
        <Button onClick={handleSendMessage} disabled={operationLoading === 'send'}>
          {operationLoading === 'send' ? <CircularProgress size={20} /> : '发送'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // ===================== Runtime 渲染 =====================

  const renderChannelManagerPanel = () => (
    <Card sx={{ bgcolor: gs.bgPanel }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HubIcon color="primary" />
            <Typography variant="h6">ChannelManager（运行时）</Typography>
            {managedChannelsDemo && <Chip size="small" color="warning" label="演示" />}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<RefreshIcon />} onClick={loadRuntime}>刷新</Button>
            <Button size="small" variant="contained" startIcon={<CampaignIcon />} onClick={() => setBroadcastDialogOpen(true)}>
              广播测试
            </Button>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          列出所有已注册通道实例，提供 <code>register / unregister / list / broadcast</code> 能力。
        </Typography>
        {managedChannels.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            暂无已注册的运行时通道
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>通道 ID</TableCell>
                  <TableCell>类型</TableCell>
                  <TableCell>运行时状态</TableCell>
                  <TableCell>启动时间</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {managedChannels.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.id}</TableCell>
                    <TableCell><Chip size="small" label={c.type} /></TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={c.status === 'ready' ? 'success' : c.status === 'error' ? 'error' : 'default'}
                        label={c.status}
                      />
                    </TableCell>
                    <TableCell>
                      {c.startedAtMs ? new Date(c.startedAtMs).toLocaleString('zh-CN') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );

  const renderTypingPanel = () => (
    <Card sx={{ bgcolor: gs.bgPanel }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <KeyboardIcon color="primary" />
          <Typography variant="h6">TypingCallbacks</Typography>
          {typersDemo && <Chip size="small" color="warning" label="演示" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          实时显示哪些用户正在某个通道中输入（typing）。
        </Typography>
        {typers.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            当前没有用户正在 typing
          </Typography>
        ) : (
          <List dense>
            {typers.map(t => (
              <ListItem key={`${t.channelId}-${t.userId}`}>
                <ListItemText
                  primary={`${t.userId} 在 ${t.channelId} 中正在输入`}
                  secondary={`起始：${new Date(t.startedAtMs).toLocaleTimeString('zh-CN')} · 过期：${new Date(t.expiresAtMs).toLocaleTimeString('zh-CN')}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );

  const renderPairingPanel = () => (
    <Card sx={{ bgcolor: gs.bgPanel }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <LinkIcon color="primary" />
          <Typography variant="h6">PairingStore</Typography>
          {pairingsDemo && <Chip size="small" color="warning" label="演示" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          已配对通道：双向桥接，用于跨通道消息转发。
        </Typography>
        {pairings.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            暂无配对通道
          </Typography>
        ) : (
          <List dense>
            {pairings.map((p, i) => (
              <ListItem key={i}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip size="small" label={p.a} />
                      <LinkOffIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
                      <Chip size="small" label={p.b} />
                    </Box>
                  }
                  secondary={`${p.a} ↔ ${p.b}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );

  const renderPipelinePanel = () => {
    const total = pipelineStages.reduce((s, st) => s + st.received, 0) || pipelineTotal;
    return (
      <Card sx={{ bgcolor: gs.bgPanel }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AccountTreeIcon color="primary" />
            <Typography variant="h6">InboundReplyPipeline</Typography>
            {pipelineDemo && <Chip size="small" color="warning" label="演示" />}
            <Box sx={{ flex: 1 }} />
            <Chip size="small" label={`已处理 ${total} 条消息`} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            入站消息处理流水线：<code>normalize → filter → route → enrich</code>。
          </Typography>
          {pipelineStages.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              暂无流水线数据
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'stretch' }}>
              {pipelineStages.map((stage, i) => {
                const passRate = stage.received > 0 ? (stage.passed / stage.received) * 100 : 0;
                return (
                  <Box key={stage.name} sx={{ flex: '1 1 220px', minWidth: 220 }}>
                    <Box sx={{ p: 1.5, border: `1px solid ${gs.border}`, borderRadius: 1, bgcolor: gs.bgPanel }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip
                          size="small"
                          color={i === 0 ? 'info' : i === pipelineStages.length - 1 ? 'success' : 'primary'}
                          label={`${i + 1}. ${stage.label}`}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {stage.avgDurationMs ? `${stage.avgDurationMs.toFixed(1)} ms` : '—'}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        {stage.description}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">通过率</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {stage.passed} / {stage.received || 0}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={passRate}
                        sx={{ height: 4, borderRadius: 1 }}
                      />
                      {stage.dropped > 0 && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          丢弃 {stage.dropped}
                        </Typography>
                      )}
                    </Box>
                    {i < pipelineStages.length - 1 && (
                      <Box sx={{ textAlign: 'center', color: gs.textDisabled, my: 0.25 }}>↓</Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderRuntimeTab = () => (
    <Box>
      {runtimeLoading && <LinearProgress sx={{ mb: 2 }} />}
      <Grid container spacing={3}>
        <Grid item xs={12}>{renderChannelManagerPanel()}</Grid>
        <Grid item xs={12} md={6}>{renderTypingPanel()}</Grid>
        <Grid item xs={12} md={6}>{renderPairingPanel()}</Grid>
        <Grid item xs={12}>{renderPipelinePanel()}</Grid>
      </Grid>

      <Dialog
        open={broadcastDialogOpen}
        onClose={() => setBroadcastDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>广播测试消息</DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            将该消息发送到所有已启用的通道。
          </Typography>
          <TextField
            fullWidth
            label="广播内容"
            multiline
            rows={4}
            value={broadcastContent}
            onChange={(e) => setBroadcastContent(e.target.value)}
          />
          {broadcastResult && (
            <Alert
              severity={broadcastResult.includes('已广播') ? 'success' : 'error'}
              sx={{ mt: 2 }}
            >
              {broadcastResult}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBroadcastDialogOpen(false)}>关闭</Button>
          <Button
            variant="contained"
            onClick={handleBroadcast}
            disabled={broadcastSending}
            startIcon={broadcastSending ? <CircularProgress size={16} /> : <CampaignIcon />}
          >
            发送
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">通道管理</Typography>
        <Button onClick={activeTab === 'config' ? loadChannels : loadRuntime} startIcon={<RefreshIcon />}>
          刷新
        </Button>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: `1px solid ${gs.border}` }}
      >
        <Tab value="config" label="通道配置" icon={<MessageIcon />} iconPosition="start" />
        <Tab value="runtime" label="运行时" icon={<HubIcon />} iconPosition="start" />
      </Tabs>

      {notice && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {activeTab === 'config' && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6">通道列表</Typography>
                  <Button onClick={handleOpenCreateDialog} startIcon={<AddIcon />}>
                    创建通道
                  </Button>
                </Box>
                {loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : channels.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    暂无通道，请创建一个
                  </Typography>
                ) : (
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>名称</TableCell>
                          <TableCell>类型</TableCell>
                          <TableCell>状态</TableCell>
                          <TableCell>账户数</TableCell>
                          <TableCell>启用</TableCell>
                          <TableCell>操作</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {channels.map(channel => (
                          <TableRow key={channel.name}>
                            <TableCell>
                              <Button onClick={() => handleOpenDetail(channel.name)} sx={{ p: 0 }}>
                                <LinkIcon sx={{ mr: 1 }} />
                                {channel.name}
                              </Button>
                            </TableCell>
                            <TableCell>{channel.type}</TableCell>
                            <TableCell>
                              {(() => {
                                const status = getStatusChip(channel.status);
                                return <Chip label={status.label} color={status.color} icon={status.icon} />;
                              })()}
                            </TableCell>
                            <TableCell>{channel.accountCount || 0}</TableCell>
                            <TableCell>
                              <Switch
                                checked={channel.enabled ?? true}
                                onChange={(e) => handleToggleChannel(channel.name, e.target.checked)}
                                disabled={operationLoading?.startsWith('toggle')}
                              />
                            </TableCell>
                            <TableCell>
                              <IconButton onClick={() => handleOpenEditDialog(channel)}>
                                <EditIcon />
                              </IconButton>
                              <IconButton onClick={() => handleOpenSendDialog(channel.name)}>
                                <SendIcon />
                              </IconButton>
                              <IconButton onClick={() => handleDeleteChannel(channel.name)}>
                                <DeleteIcon />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Typography variant="h6" mb={2}>支持的通道类型</Typography>
                <List>
                  {channelTypes.map(t => (
                    <ListItem key={t.type} sx={{ py: 1 }}>
                      <ListItemText
                        primary={t.label}
                        secondary={t.description}
                      />
                      {t.bidirectional && (
                        <Chip label="双向" size="small" color="info" />
                      )}
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>

            <Card sx={{ bgcolor: gs.bgPanel, mt: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>快捷操作</Typography>
                <Button fullWidth onClick={handleOpenCreateDialog} startIcon={<AddIcon />}>
                  创建新通道
                </Button>
                <Button fullWidth onClick={loadChannels} startIcon={<RefreshIcon />} sx={{ mt: 1 }}>
                  刷新列表
                </Button>
                <Button fullWidth onClick={() => setActiveTab('runtime')} startIcon={<HubIcon />} sx={{ mt: 1 }}>
                  查看运行时
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 'runtime' && renderRuntimeTab()}

      {renderDialog()}
      {renderDetailDialog()}
      {renderSendDialog()}
    </Box>
  );
};

export default ChannelsPage;
