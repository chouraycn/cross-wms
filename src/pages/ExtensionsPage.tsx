/**
 * ExtensionsPage — 扩展管理面板
 *
 * 展示已安装扩展列表，支持启用/禁用/加载/发现等操作。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  Button,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  LinearProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
} from '@mui/material';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';

import {
  getExtensions,
  getDiscoveredExtensions,
  getExtensionStats,
  getExtensionKinds,
  isExtensionLoading,
  isExtensionDiscovering,
  isExtensionActionLoading,
  getExtensionError,
  onExtensionsChange,
  refreshExtensionsFromApi,
  refreshExtensionStats,
  refreshExtensionKinds,
  discoverExtensionsFromApi,
  enableExtensionAction,
  disableExtensionAction,
  loadExtensionAction,
  loadAllExtensionsAction,
  clearExtensionError,
} from '../stores/extensionStore';
import type { ExtensionInfo, ExtensionKind } from '../services/extensions/api';
import { getGrayScale } from '../constants/theme';

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'error'; icon: React.ReactElement }> = {
  enabled: {
    label: '已启用',
    color: 'success',
    icon: <CheckCircleOutlineIcon fontSize="small" />,
  },
  disabled: {
    label: '已禁用',
    color: 'warning',
    icon: <RemoveCircleOutlineIcon fontSize="small" />,
  },
  error: {
    label: '异常',
    color: 'error',
    icon: <ErrorOutlineIcon fontSize="small" />,
  },
};

const KIND_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error'> = {
  provider: 'primary',
  'embedding-provider': 'info',
  'memory-host': 'success',
  channel: 'secondary',
  tool: 'warning',
  service: 'default',
  'audio-provider': 'info',
  'image-generation': 'secondary',
  'video-generation': 'secondary',
  'web-search': 'primary',
  'security-provider': 'error',
  'api-integration': 'info',
};

const ExtensionsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [, setVersion] = useState(0);
  const extensions = getExtensions();
  const discovered = getDiscoveredExtensions();
  const stats = getExtensionStats();
  const kinds = getExtensionKinds();
  const loading = isExtensionLoading();
  const discovering = isExtensionDiscovering();
  const error = getExtensionError();

  const [kindFilter, setKindFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    const unsubscribe = onExtensionsChange(() => {
      setVersion((v) => v + 1);
    });

    refreshExtensionsFromApi().catch((e) => {
      console.error('[ExtensionsPage] refreshExtensionsFromApi failed:', e);
    });
    refreshExtensionStats().catch((e) => {
      console.error('[ExtensionsPage] refreshExtensionStats failed:', e);
    });
    refreshExtensionKinds().catch((e) => {
      console.error('[ExtensionsPage] refreshExtensionKinds failed:', e);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (error) {
      setSnackbar({ open: true, message: error, severity: 'error' });
    }
  }, [error]);

  const filteredExtensions = extensions.filter((ext) => {
    if (kindFilter !== 'all' && ext.kind !== kindFilter) return false;
    if (statusFilter === 'enabled' && !ext.enabled) return false;
    if (statusFilter === 'disabled' && ext.enabled) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        ext.id.toLowerCase().includes(q) ||
        ext.name.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q) ||
        ext.kind.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDiscover = useCallback(async () => {
    await discoverExtensionsFromApi();
    setDiscoverDialogOpen(true);
  }, []);

  const handleToggleEnable = useCallback(async (ext: ExtensionInfo) => {
    try {
      if (ext.enabled) {
        await disableExtensionAction(ext.id);
      } else {
        await enableExtensionAction(ext.id);
      }
    } catch (e) {
      setSnackbar({
        open: true,
        message: e instanceof Error ? e.message : '操作失败',
        severity: 'error',
      });
    }
  }, []);

  const handleLoad = useCallback(async (id: string) => {
    try {
      await loadExtensionAction(id);
      setSnackbar({ open: true, message: '扩展加载成功', severity: 'success' });
    } catch (e) {
      setSnackbar({
        open: true,
        message: e instanceof Error ? e.message : '加载失败',
        severity: 'error',
      });
    }
  }, []);

  const handleLoadAll = useCallback(async () => {
    try {
      await loadAllExtensionsAction();
      setSnackbar({ open: true, message: '全部扩展加载成功', severity: 'success' });
    } catch (e) {
      setSnackbar({
        open: true,
        message: e instanceof Error ? e.message : '加载失败',
        severity: 'error',
      });
    }
  }, []);

  const getStatusConfig = (enabled: boolean) =>
    enabled ? STATUS_CONFIG.enabled : STATUS_CONFIG.disabled;

  const getKindLabel = useCallback((kind: string) => {
    return kinds.find((k: ExtensionKind) => k.kind === kind)?.label || kind;
  }, [kinds]);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          扩展管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => refreshExtensionsFromApi()}
            disabled={loading}
          >
            刷新
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleLoadAll}
            disabled={loading}
          >
            全部加载
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleDiscover}
            disabled={discovering}
          >
            发现扩展
          </Button>
        </Box>
      </Box>

      {/* 统计卡片 */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  扩展总数
                </Typography>
                <Typography variant="h4" fontWeight={600}>
                  {stats.total}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  已启用
                </Typography>
                <Typography variant="h4" fontWeight={600} color="success.main">
                  {stats.enabled}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  已禁用
                </Typography>
                <Typography variant="h4" fontWeight={600} color="warning.main">
                  {stats.disabled}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* 过滤器 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                placeholder="搜索扩展..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>扩展类型</InputLabel>
                <Select
                  value={kindFilter}
                  label="扩展类型"
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <MenuItem value="all">全部类型</MenuItem>
                  {kinds.map((kind: ExtensionKind) => (
                    <MenuItem key={kind.kind} value={kind.kind}>
                      {kind.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>状态</InputLabel>
                <Select
                  value={statusFilter}
                  label="状态"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">全部状态</MenuItem>
                  <MenuItem value="enabled">已启用</MenuItem>
                  <MenuItem value="disabled">已禁用</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 扩展列表 */}
      <Card>
        <CardContent>
          {(loading || discovering) && <LinearProgress sx={{ mb: 2 }} />}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>扩展</TableCell>
                  <TableCell>类型</TableCell>
                  <TableCell>版本</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>依赖</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredExtensions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: gs.textMuted }}>
                      <ExtensionOutlinedIcon sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} />
                      <Typography variant="body1">暂无扩展</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExtensions.map((ext: ExtensionInfo) => {
                    const status = getStatusConfig(ext.enabled);
                    const isLoading = isExtensionActionLoading(ext.id);

                    return (
                      <TableRow key={ext.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body1" fontWeight={500}>
                              {ext.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {ext.id} — {ext.description}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={getKindLabel(ext.kind)}
                            color={KIND_COLORS[ext.kind] || 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{ext.version}</TableCell>
                        <TableCell>
                          <Chip
                            icon={status.icon}
                            label={status.label}
                            color={status.color}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {ext.dependencies && Object.keys(ext.dependencies).length > 0 ? (
                            <Typography variant="caption">
                              {Object.keys(ext.dependencies).length} 个依赖
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              无
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            {!ext.enabled && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleLoad(ext.id)}
                                disabled={isLoading}
                              >
                                加载
                              </Button>
                            )}
                            <Tooltip title={ext.enabled ? '禁用' : '启用'}>
                              <Switch
                                checked={ext.enabled}
                                onChange={() => handleToggleEnable(ext)}
                                disabled={isLoading}
                              />
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 发现扩展对话框 */}
      <Dialog
        open={discoverDialogOpen}
        onClose={() => setDiscoverDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>发现可用扩展</DialogTitle>
        <DialogContent>
          {discovered.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">未发现新扩展</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>扩展</TableCell>
                    <TableCell>类型</TableCell>
                    <TableCell>版本</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {discovered.map((ext: ExtensionInfo) => (
                    <TableRow key={ext.id}>
                      <TableCell>
                        <Typography variant="body1" fontWeight={500}>
                          {ext.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {ext.id} — {ext.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getKindLabel(ext.kind)}
                          color={KIND_COLORS[ext.kind] || 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{ext.version}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleLoad(ext.id).then(() => setDiscoverDialogOpen(false))}
                          disabled={isExtensionActionLoading(ext.id)}
                        >
                          加载
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscoverDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 错误提示 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => {
          setSnackbar({ ...snackbar, open: false });
          clearExtensionError();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => {
            setSnackbar({ ...snackbar, open: false });
            clearExtensionError();
          }}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ExtensionsPage;