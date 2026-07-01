/**
 * Secrets Settings - 密钥管理设置页
 *
 * 提供 API Key、密码、令牌等敏感信息的安全管理界面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
  CircularProgress,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LockIcon from '@mui/icons-material/Lock';
import HistoryIcon from '@mui/icons-material/History';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';

interface SecretItem {
  id: string;
  provider: 'env' | 'file' | 'encrypted' | 'keychain';
  key: string;
  type: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other';
  createdAt: number;
  updatedAt: number;
  metadata?: {
    description?: string;
    lastAccessedAt?: number;
    accessCount?: number;
  };
}

interface SecretStats {
  totalSecrets: number;
  byProvider: Record<string, number>;
  byType: Record<string, number>;
  cacheHitRate: number;
  lastUpdated: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  env: '环境变量',
  file: '文件存储',
  encrypted: '加密存储',
  keychain: '系统密钥链',
};

const TYPE_LABELS: Record<string, string> = {
  api_key: 'API Key',
  password: '密码',
  token: '令牌',
  certificate: '证书',
  ssh_key: 'SSH 密钥',
  other: '其他',
};

const PROVIDER_COLORS: Record<string, string> = {
  env: '#6366f1',
  file: '#8b5cf6',
  encrypted: '#10b981',
  keychain: '#f59e0b',
};

const SettingsSecrets: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [stats, setStats] = useState<SecretStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<SecretItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [secretValue, setSecretValue] = useState('');
  const [filterProvider, setFilterProvider] = useState<string>('all');

  const [formData, setFormData] = useState({
    provider: 'encrypted' as 'env' | 'file' | 'encrypted' | 'keychain',
    key: '',
    value: '',
    type: 'api_key' as SecretItem['type'],
    description: '',
  });

  const loadSecrets = useCallback(async (provider?: string) => {
    setIsLoading(true);
    try {
      const url = provider && provider !== 'all'
        ? `/api/secrets/list?provider=${encodeURIComponent(provider)}`
        : '/api/secrets/list';
      const response = await fetch(url);
      const data = await response.json();
      if (data.data) {
        setSecrets(data.data);
      }
    } catch (error) {
      console.error('Failed to load secrets:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch('/api/secrets/stats');
      const data = await response.json();
      if (data.data) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  useEffect(() => {
    loadSecrets(filterProvider);
    loadStats();
  }, [loadSecrets, loadStats, filterProvider]);

  const handleCreate = () => {
    setIsEditing(false);
    setFormData({
      provider: 'encrypted',
      key: '',
      value: '',
      type: 'api_key',
      description: '',
    });
    setDialogOpen(true);
  };

  const handleEdit = (secret: SecretItem) => {
    setIsEditing(true);
    setSelectedSecret(secret);
    setFormData({
      provider: secret.provider,
      key: secret.key,
      value: '',
      type: secret.type,
      description: secret.metadata?.description || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.key.trim()) {
      showToast('请输入密钥标识', 'error');
      return;
    }

    if (!isEditing && !formData.value.trim()) {
      showToast('请输入密钥值', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/secrets/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: formData.provider,
          key: formData.key,
          value: formData.value,
          type: formData.type,
          description: formData.description,
        }),
      });

      const data = await response.json();

      if (data.data && data.data.success) {
        showToast(isEditing ? '密钥已更新' : '密钥已创建', 'success');
        setDialogOpen(false);
        loadSecrets(filterProvider);
        loadStats();
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (error) {
      showToast(`保存失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (secret: SecretItem) => {
    if (!confirm(`确定要删除密钥 "${secret.key}" 吗？`)) return;

    try {
      const response = await fetch('/api/secrets/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: secret.provider,
          key: secret.key,
        }),
      });

      const data = await response.json();

      if (data.data && data.data.success) {
        showToast('密钥已删除', 'success');
        if (selectedSecret?.id === secret.id) {
          setSelectedSecret(null);
        }
        loadSecrets(filterProvider);
        loadStats();
      }
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleRevealValue = async (secret: SecretItem) => {
    try {
      const response = await fetch('/api/secrets/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: secret.provider,
          key: secret.key,
          type: secret.type,
          source: 'settings-ui',
        }),
      });

      const data = await response.json();

      if (data.data && data.data.value) {
        setSecretValue(data.data.value);
        setShowValue(true);
      } else {
        showToast('无法获取密钥值', 'error');
      }
    } catch (error) {
      showToast('获取密钥值失败', 'error');
    }
  };

  const handleCopyValue = (value: string) => {
    navigator.clipboard.writeText(value);
    showToast('已复制到剪贴板', 'success');
  };

  const handleClearCache = async () => {
    try {
      const response = await fetch('/api/secrets/cache/clear', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.data && data.data.success) {
        showToast('缓存已清除', 'success');
        loadStats();
      }
    } catch (error) {
      showToast('清除缓存失败', 'error');
    }
  };

  const filteredSecrets = secrets;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockIcon sx={{ fontSize: 24, color: gs.textPrimary }} />
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
            密钥管理
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="刷新">
            <IconButton size="small" onClick={() => { loadSecrets(filterProvider); loadStats(); }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="清除缓存">
            <IconButton size="small" onClick={handleClearCache}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            新建密钥
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      {stats && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: `1px solid ${gs.border}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                总密钥数
              </Typography>
              <Typography sx={{ fontWeight: 600, color: gs.textPrimary }}>
                {stats.totalSecrets}
              </Typography>
            </Box>
            {Object.entries(stats.byProvider).map(([provider, count]) => (
              <Box key={provider}>
                <Typography variant="caption" sx={{ color: gs.textMuted }}>
                  {PROVIDER_LABELS[provider] || provider}
                </Typography>
                <Typography sx={{ fontWeight: 600, color: PROVIDER_COLORS[provider] || gs.textPrimary }}>
                  {count}
                </Typography>
              </Box>
            ))}
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                缓存命中率
              </Typography>
              <Typography sx={{ fontWeight: 600, color: '#22c55e' }}>
                {Math.round(stats.cacheHitRate * 100)}%
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Filter */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>按提供者过滤</InputLabel>
          <Select
            value={filterProvider}
            label="按提供者过滤"
            onChange={(e) => setFilterProvider(e.target.value)}
            size="small"
          >
            <MenuItem value="all">全部</MenuItem>
            <MenuItem value="env">环境变量</MenuItem>
            <MenuItem value="encrypted">加密存储</MenuItem>
            <MenuItem value="file">文件存储</MenuItem>
            <MenuItem value="keychain">系统密钥链</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Content */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Secret List */}
        <Box
          sx={{
            flex: 1,
            minWidth: 300,
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isLoading && secrets.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress size={24} />
            </Box>
          ) : filteredSecrets.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, p: 3, gap: 1 }}>
              <VpnKeyIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="body2" sx={{ color: gs.textMuted }}>
                暂无密钥
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleCreate}>
                添加第一个密钥
              </Button>
            </Box>
          ) : (
            <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {filteredSecrets.map((secret, index) => (
                <React.Fragment key={secret.id}>
                  {index > 0 && <Divider />}
                  <ListItemButton
                    selected={selectedSecret?.id === secret.id}
                    onClick={() => setSelectedSecret(secret)}
                    sx={{ py: 1.5 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            size="small"
                            label={PROVIDER_LABELS[secret.provider] || secret.provider}
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor: 'transparent',
                              border: `1px solid ${PROVIDER_COLORS[secret.provider]}`,
                              color: PROVIDER_COLORS[secret.provider],
                            }}
                            variant="outlined"
                          />
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: selectedSecret?.id === secret.id ? 600 : 500,
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                            }}
                          >
                            {secret.key}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Chip
                            size="small"
                            label={TYPE_LABELS[secret.type] || secret.type}
                            sx={{ height: 18, fontSize: '0.6rem' }}
                          />
                          {secret.metadata?.description && (
                            <Typography variant="caption" sx={{ color: gs.textMuted }}>
                              {secret.metadata.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        {/* Detail Panel */}
        <Box
          sx={{
            flex: 2,
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
            p: 2,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {selectedSecret ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <VpnKeyIcon sx={{ fontSize: 20, color: gs.textMuted }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      {selectedSecret.key}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      label={PROVIDER_LABELS[selectedSecret.provider] || selectedSecret.provider}
                      sx={{
                        bgcolor: 'transparent',
                        border: `1px solid ${PROVIDER_COLORS[selectedSecret.provider]}`,
                        color: PROVIDER_COLORS[selectedSecret.provider],
                      }}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={TYPE_LABELS[selectedSecret.type] || selectedSecret.type}
                      variant="outlined"
                    />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="编辑">
                    <IconButton size="small" onClick={() => handleEdit(selectedSecret)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton size="small" color="error" onClick={() => handleDelete(selectedSecret)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              <Divider />

              {/* Description */}
              {selectedSecret.metadata?.description && (
                <Box>
                  <Typography variant="body2" sx={{ color: gs.textSecondary, mb: 0.5 }}>
                    描述
                  </Typography>
                  <Typography variant="body2">
                    {selectedSecret.metadata.description}
                  </Typography>
                </Box>
              )}

              {/* Secret Value */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ color: gs.textSecondary }}>
                    密钥值
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title={showValue ? '隐藏' : '显示'}>
                      <IconButton
                        size="small"
                        onClick={() => {
                          if (!showValue && !secretValue) {
                            handleRevealValue(selectedSecret);
                          } else {
                            setShowValue(!showValue);
                          }
                        }}
                      >
                        {showValue ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    {showValue && secretValue && (
                      <Tooltip title="复制">
                        <IconButton size="small" onClick={() => handleCopyValue(secretValue)}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                {showValue && secretValue ? (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      wordBreak: 'break-all',
                    }}
                  >
                    {secretValue}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                      color: gs.textMuted,
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      textAlign: 'center',
                    }}
                  >
                    点击眼睛图标查看
                  </Box>
                )}
              </Box>

              {/* Access Info */}
              <Divider />
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: gs.textMuted }}>
                    创建时间
                  </Typography>
                  <Typography variant="body2">
                    {new Date(selectedSecret.createdAt).toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: gs.textMuted }}>
                    更新时间
                  </Typography>
                  <Typography variant="body2">
                    {new Date(selectedSecret.updatedAt).toLocaleString()}
                  </Typography>
                </Box>
                {selectedSecret.metadata?.accessCount !== undefined && (
                  <Box>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      访问次数
                    </Typography>
                    <Typography variant="body2">
                      {selectedSecret.metadata.accessCount}
                    </Typography>
                  </Box>
                )}
                {selectedSecret.metadata?.lastAccessedAt && (
                  <Box>
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      最后访问
                    </Typography>
                    <Typography variant="body2">
                      {new Date(selectedSecret.metadata.lastAccessedAt).toLocaleString()}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1 }}>
              <LockIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="body2" sx={{ color: gs.textMuted }}>
                选择左侧密钥查看详情
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          {isEditing ? '编辑密钥' : '新建密钥'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>存储方式</InputLabel>
              <Select
                value={formData.provider}
                label="存储方式"
                onChange={(e) => setFormData({ ...formData, provider: e.target.value as any })}
                disabled={isEditing}
              >
                <MenuItem value="encrypted">加密存储（推荐）</MenuItem>
                <MenuItem value="env">环境变量</MenuItem>
                <MenuItem value="file">文件存储</MenuItem>
                <MenuItem value="keychain">系统密钥链</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="密钥标识 (Key)"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              placeholder="例如: OPENAI_API_KEY"
              size="small"
              disabled={isEditing}
            />

            <TextField
              fullWidth
              label={isEditing ? '新密钥值（留空则不修改）' : '密钥值'}
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              type="password"
              size="small"
            />

            <FormControl fullWidth size="small">
              <InputLabel>密钥类型</InputLabel>
              <Select
                value={formData.type}
                label="密钥类型"
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              >
                <MenuItem value="api_key">API Key</MenuItem>
                <MenuItem value="password">密码</MenuItem>
                <MenuItem value="token">令牌</MenuItem>
                <MenuItem value="certificate">证书</MenuItem>
                <MenuItem value="ssh_key">SSH 密钥</MenuItem>
                <MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="描述（可选）"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="密钥用途说明"
              size="small"
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} size="small">
            取消
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            size="small"
            disabled={isLoading || !formData.key.trim() || (!isEditing && !formData.value.trim())}
          >
            {isLoading ? <CircularProgress size={18} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsSecrets;
