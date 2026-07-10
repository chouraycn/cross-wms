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
  Tooltip,
  Switch,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import InfoIcon from '@mui/icons-material/Info';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MessageIcon from '@mui/icons-material/Message';

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
  getChannelAccounts,
  addChannelAccount,
  removeChannelAccount,
  type ChannelType,
  type ChannelStatus,
  type ChannelConfig,
  type ChannelTypeInfo,
  type ChannelListItem,
  type ChannelDetail as ChannelDetailType,
  type ChannelAccount,
} from '../services/channelsApi';
import { getGrayScale } from '../constants/theme';

const ChannelsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

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

  const loadChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const types = await getChannelTypes();
      setChannelTypes(types);
      const list = await getChannels();
      setChannels(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载通道失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">通道管理</Typography>
        <Button onClick={loadChannels} startIcon={<RefreshIcon />}>
          刷新
        </Button>
      </Box>

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
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {renderDialog()}
      {renderDetailDialog()}
      {renderSendDialog()}
    </Box>
  );
};

export default ChannelsPage;