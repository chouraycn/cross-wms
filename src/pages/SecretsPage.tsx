import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Paper, Tabs, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, CircularProgress, Alert, useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import HistoryIcon from '@mui/icons-material/History';
import CachedIcon from '@mui/icons-material/Cached';
import KeyIcon from '@mui/icons-material/Key';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { SecretItem, SecretAccessLog, SecretsStats } from '../services/api';
import {
  fetchSecretsList, fetchSecretsStats, fetchSecretLogs, setSecretApi, deleteSecretApi, clearSecretsCache,
} from '../services/api';

const PROVIDER_COLORS: Record<string, string> = {
  env: '#22C55E',
  file: '#3B82F6',
  encrypted: '#8B5CF6',
  keychain: '#F59E0B',
};

const SecretsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [stats, setStats] = useState<SecretsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'all' | 'env' | 'file' | 'encrypted' | 'keychain'>('all');

  // 创建密钥对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ provider: 'env' as string, key: '', value: '', type: '', description: '' });
  const [createLoading, setCreateLoading] = useState(false);

  // 日志对话框
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<SecretAccessLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTarget, setLogsTarget] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [secretsRes, statsRes] = await Promise.all([
        fetchSecretsList(tab === 'all' ? undefined : tab),
        fetchSecretsStats(),
      ]);
      setSecrets(secretsRes);
      setStats(statsRes);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!createForm.key.trim() || !createForm.value.trim()) {
      showToast('请填写密钥名称和值', 'warning');
      return;
    }
    setCreateLoading(true);
    try {
      await setSecretApi({
        provider: createForm.provider,
        key: createForm.key,
        value: createForm.value,
        type: createForm.type || undefined,
        description: createForm.description || undefined,
      });
      showToast('密钥已设置', 'success');
      setCreateOpen(false);
      setCreateForm({ provider: 'env', key: '', value: '', type: '', description: '' });
      loadData();
    } catch (e) {
      showToast(`设置失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (provider: string, key: string) => {
    if (!window.confirm(`确定要删除密钥 "${key}" 吗？`)) return;
    try {
      await deleteSecretApi(provider, key);
      showToast('密钥已删除', 'success');
      loadData();
    } catch (e) {
      showToast(`删除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleShowLogs = async (secretId?: string) => {
    setLogsOpen(true);
    setLogsLoading(true);
    setLogsTarget(secretId || '全部');
    try {
      const res = await fetchSecretLogs(secretId, 100);
      setLogs(res);
    } catch (e) {
      showToast(`加载日志失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await clearSecretsCache();
      showToast('缓存已清除', 'success');
    } catch (e) {
      showToast(`清除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          密钥管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" startIcon={<HistoryIcon />} onClick={() => handleShowLogs()}>
            审计日志
          </Button>
          <Button variant="outlined" size="small" startIcon={<CachedIcon />} onClick={handleClearCache}>
            清除缓存
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            添加密钥
          </Button>
          <IconButton size="small" onClick={loadData} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>密钥总数</Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalAccessCount}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>访问次数</Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{Math.round((stats.cacheHitRate || 0) * 100)}%</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>缓存命中率</Typography>
          </Paper>
          {Object.entries(stats.byProvider || {}).map(([provider, count]) => (
            <Paper key={provider} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: PROVIDER_COLORS[provider] || gs.textPrimary }}>{count}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', textTransform: 'capitalize' }}>{provider}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }} textColor="primary" indicatorColor="primary">
        <Tab value="all" label="全部" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="env" label="环境变量" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="file" label="文件" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="encrypted" label="加密" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="keychain" label="钥匙串" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
      </Tabs>

      <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Provider</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Key</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Type</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>访问次数</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {secrets.map((s) => (
              <TableRow key={s.id} sx={{ '&:hover': { backgroundColor: gs.bgHover } }}>
                <TableCell>
                  <Chip label={s.provider} size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: PROVIDER_COLORS[s.provider] + '22', color: PROVIDER_COLORS[s.provider], fontWeight: 600 }} />
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{s.key}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem' }}>{s.type || '-'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{s.description || '-'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem' }}>{s.accessCount}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="查看日志">
                      <IconButton size="small" onClick={() => handleShowLogs(s.id)}>
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" onClick={() => handleDelete(s.provider, s.key)} sx={{ color: '#EF4444' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {secrets.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                  暂无密钥
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 创建密钥对话框 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>添加密钥</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {(['env', 'file', 'encrypted', 'keychain'] as const).map((p) => (
              <Button key={p} variant={createForm.provider === p ? 'contained' : 'outlined'} size="small" onClick={() => setCreateForm((s) => ({ ...s, provider: p }))} sx={{ textTransform: 'none' }}>
                {p === 'env' && '环境变量'}
                {p === 'file' && '文件'}
                {p === 'encrypted' && '加密'}
                {p === 'keychain' && '钥匙串'}
              </Button>
            ))}
          </Box>
          <TextField label="密钥名称" size="small" value={createForm.key} onChange={(e) => setCreateForm((s) => ({ ...s, key: e.target.value }))} fullWidth />
          <TextField label="密钥值" size="small" value={createForm.value} onChange={(e) => setCreateForm((s) => ({ ...s, value: e.target.value }))} fullWidth type="password" />
          <TextField label="类型（可选）" size="small" value={createForm.type} onChange={(e) => setCreateForm((s) => ({ ...s, type: e.target.value }))} fullWidth />
          <TextField label="描述（可选）" size="small" value={createForm.description} onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} size="small" sx={{ textTransform: 'none' }}>取消</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={createLoading} sx={{ textTransform: 'none' }}>
            {createLoading ? <CircularProgress size={16} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 日志对话框 */}
      <Dialog open={logsOpen} onClose={() => setLogsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>审计日志 — {logsTarget}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {logsLoading && <CircularProgress size={20} />}
          {!logsLoading && logs.length === 0 && (
            <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>暂无日志</Typography>
          )}
          {!logsLoading && logs.length > 0 && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>时间</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>操作</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>来源</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>状态</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{new Date(log.timestamp).toLocaleString()}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{log.action}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{log.source}</TableCell>
                      <TableCell>
                        <Chip label={log.success ? '成功' : '失败'} size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: log.success ? '#D1FAE5' : '#FEE2E2', color: log.success ? '#059669' : '#DC2626' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogsOpen(false)} size="small" sx={{ textTransform: 'none' }}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecretsPage;
