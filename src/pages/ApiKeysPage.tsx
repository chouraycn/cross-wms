/**
 * ApiKeysPage — API Key 管理面板
 *
 * 创建、启用/禁用、删除 API Key。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';

import {
  fetchApiKeys,
  createApiKey,
  enableApiKey,
  disableApiKey,
  deleteApiKey,
  fetchApiKeyStats,
  type ApiKeyRecord,
} from '../services/apikeys/api';

const ApiKeysPage: React.FC = () => {
  const theme = useTheme();

  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [stats, setStats] = useState<{ total: number; enabled: number; disabled: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [keysData, statsData] = await Promise.all([fetchApiKeys(), fetchApiKeyStats()]);
      setKeys(keysData);
      setStats(statsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const result = await createApiKey({ name: newKeyName.trim() });
      setCreatedKey(result.data.key);
      setNewKeyName('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    }
  };

  const handleToggle = async (key: ApiKeyRecord) => {
    try {
      if (key.enabled) {
        await disableApiKey(key.id);
      } else {
        await enableApiKey(key.id);
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除此 API Key 吗？此操作不可撤销。')) return;
    try {
      await deleteApiKey(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (ts: number): string => {
    return new Date(ts).toLocaleString('zh-CN');
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          API Key 管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadData} disabled={loading}>
            刷新
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
            创建 API Key
          </Button>
        </Box>
      </Box>

      {/* 统计 */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">总数</Typography>
                <Typography variant="h4" fontWeight={600}>{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">已启用</Typography>
                <Typography variant="h4" fontWeight={600} color="success.main">{stats.enabled}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">已禁用</Typography>
                <Typography variant="h4" fontWeight={600} color="warning.main">{stats.disabled}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* 列表 */}
      <Card>
        <CardContent>
          {loading && <LinearProgress sx={{ mb: 2 }} />}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell>前缀</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>速率限制</TableCell>
                  <TableCell>创建时间</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <VpnKeyIcon sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} />
                      <Typography>暂无 API Key</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key) => (
                    <TableRow key={key.id} hover>
                      <TableCell>
                        <Typography variant="body1" fontWeight={500}>{key.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <code>{key.prefix}...</code>
                      </TableCell>
                      <TableCell>
                        {key.enabled ? (
                          <Chip icon={<CheckCircleIcon />} label="已启用" color="success" size="small" variant="outlined" />
                        ) : (
                          <Chip icon={<RemoveCircleIcon />} label="已禁用" color="warning" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>{key.rateLimitPerMinute} / 分钟</TableCell>
                      <TableCell>{formatDate(key.createdAt)}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleToggle(key)}
                          >
                            {key.enabled ? '禁用' : '启用'}
                          </Button>
                          <IconButton size="small" color="error" onClick={() => handleDelete(key.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 创建对话框 */}
      <Dialog open={createDialogOpen} onClose={() => { setCreateDialogOpen(false); setCreatedKey(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>创建 API Key</DialogTitle>
        <DialogContent>
          {createdKey ? (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                请立即复制并保存此 API Key，关闭对话框后将无法再次查看。
              </Alert>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.selected', p: 2, borderRadius: 1 }}>
                <code style={{ flex: 1, wordBreak: 'break-all', fontSize: 14 }}>{createdKey}</code>
                <Tooltip title={copied ? '已复制' : '复制'}>
                  <IconButton onClick={() => handleCopy(createdKey)}>
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            <TextField
              autoFocus
              margin="dense"
              label="API Key 名称"
              fullWidth
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="例如：Production API Key"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateDialogOpen(false); setCreatedKey(null); setNewKeyName(''); }}>
            {createdKey ? '关闭' : '取消'}
          </Button>
          {!createdKey && (
            <Button onClick={handleCreate} variant="contained" disabled={!newKeyName.trim()}>
              创建
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ApiKeysPage;
