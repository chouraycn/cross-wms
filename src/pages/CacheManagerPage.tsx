import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderIcon from '@mui/icons-material/Folder';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import TimerIcon from '@mui/icons-material/Timer';
import MemoryIcon from '@mui/icons-material/Memory';
import BarChartIcon from '@mui/icons-material/BarChart';
import StorageIcon from '@mui/icons-material/Storage';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import XIcon from '@mui/icons-material/Close';

import {
  getCacheStats,
  getCacheNamespaces,
  getNamespaceInfo,
  clearAllCache,
  clearNamespaceCache,
  deleteNamespace,
  pruneExpired,
  resetStats,
  getNamespaceKeys,
  getCacheEntry,
  deleteCacheEntry,
} from '../services/cacheApi';
import type {
  CacheStats,
  NamespacesResponse,
  NamespaceInfo,
  NamespaceKeysResponse,
  CacheEntry,
} from '../services/cacheApi';
import { getGrayScale } from '../constants/theme';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatTTL(ms: number): string {
  if (ms <= 0) return '已过期';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}天 ${hours % 24}小时`;
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
  return `${seconds}秒`;
}

const CacheManagerPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [stats, setStats] = useState<CacheStats | null>(null);
  const [namespaces, setNamespaces] = useState<NamespacesResponse | null>(null);
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null);
  const [namespaceInfo, setNamespaceInfo] = useState<Record<string, NamespaceInfo>>({});
  const [namespaceKeys, setNamespaceKeys] = useState<Record<string, NamespaceKeysResponse>>({});
  const [selectedEntry, setSelectedEntry] = useState<CacheEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [deleteNamespaceDialogOpen, setDeleteNamespaceDialogOpen] = useState<string | null>(null);
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState<{ namespace: string; key: string } | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, namespacesData] = await Promise.all([
        getCacheStats(),
        getCacheNamespaces(),
      ]);
      setStats(statsData);
      setNamespaces(namespacesData);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExpandNamespace = async (name: string) => {
    if (expandedNamespace === name) {
      setExpandedNamespace(null);
      return;
    }

    setExpandedNamespace(name);
    if (!namespaceInfo[name]) {
      try {
        const info = await getNamespaceInfo(name);
        setNamespaceInfo((prev) => ({ ...prev, [name]: info }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    if (!namespaceKeys[name]) {
      try {
        const keys = await getNamespaceKeys(name);
        setNamespaceKeys((prev) => ({ ...prev, [name]: keys }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleViewEntry = async (namespace: string, key: string) => {
    try {
      const entry = await getCacheEntry(namespace, key);
      setSelectedEntry(entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClearAll = async () => {
    setOperationLoading(true);
    try {
      await clearAllCache();
      setClearAllDialogOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperationLoading(false);
    }
  };

  const handleClearNamespace = async (name: string) => {
    setOperationLoading(true);
    try {
      await clearNamespaceCache(name);
      await loadData();
      setNamespaceInfo((prev) => ({ ...prev, [name]: { ...prev[name], stats: { ...prev[name].stats, totalEntries: 0 } } }));
      setNamespaceKeys((prev) => ({ ...prev, [name]: { ...prev[name], keys: [], total: 0 } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteNamespace = async (name: string) => {
    setOperationLoading(true);
    try {
      await deleteNamespace(name);
      setDeleteNamespaceDialogOpen(null);
      await loadData();
      setNamespaceInfo((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setNamespaceKeys((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperationLoading(false);
    }
  };

  const handlePruneExpired = async () => {
    setOperationLoading(true);
    try {
      await pruneExpired();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperationLoading(false);
    }
  };

  const handleResetStats = async () => {
    setOperationLoading(true);
    try {
      await resetStats();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntryDialogOpen) return;
    setOperationLoading(true);
    try {
      const { namespace, key } = deleteEntryDialogOpen;
      await deleteCacheEntry(namespace, key);
      setDeleteEntryDialogOpen(null);
      setSelectedEntry(null);
      setNamespaceKeys((prev) => ({
        ...prev,
        [namespace]: {
          ...prev[namespace],
          keys: prev[namespace].keys.filter((k) => k !== key),
          total: prev[namespace].total - 1,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperationLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            缓存管理
          </Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handlePruneExpired}
            disabled={loading || operationLoading}
            startIcon={<TimerIcon />}
          >
            清理过期
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleResetStats}
            disabled={loading || operationLoading}
            startIcon={<RefreshIcon />}
          >
            重置统计
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setClearAllDialogOpen(true)}
            disabled={loading || operationLoading}
            color="error"
            startIcon={<ClearAllIcon />}
          >
            清空全部
          </Button>
          <IconButton onClick={loadData} disabled={loading || operationLoading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <FolderIcon color="primary" />
                    <Typography variant="body2" color="text.secondary">
                      命名空间数
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {stats?.totalCaches ?? 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <StorageIcon color="secondary" />
                    <Typography variant="body2" color="text.secondary">
                      缓存条目数
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {stats?.totalEntries ?? 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <MemoryIcon color="warning" />
                    <Typography variant="body2" color="text.secondary">
                      内存占用
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {stats?.totalMemoryFormatted ?? '-'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <BarChartIcon color="success" />
                    <Typography variant="body2" color="text.secondary">
                      命中率
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {stats?.overallHitRatePercent ?? '-'}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={stats?.overallHitRate ? stats.overallHitRate * 100 : 0}
                      color={(stats?.overallHitRate ?? 0) >= 0.8 ? 'success' : (stats?.overallHitRate ?? 0) >= 0.5 ? 'warning' : 'error'}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                命名空间列表
              </Typography>
              {namespaces?.active.length === 0 ? (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  暂无缓存命名空间
                </Typography>
              ) : (
                <List>
                  {namespaces?.active.map((name) => {
                    const info = namespaceInfo[name];
                    const keys = namespaceKeys[name];
                    const isExpanded = expandedNamespace === name;

                    return (
                      <React.Fragment key={name}>
                        <ListItem
                          button
                          onClick={() => handleExpandNamespace(name)}
                          sx={{
                            borderBottom: `1px solid ${gs.border}`,
                            '&:last-child': { borderBottom: 'none' },
                          }}
                        >
                          <IconButton edge="start">
                            {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
                          </IconButton>
                          <ListItemText
                            primary={name}
                            secondary={
                              info ? (
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
                                  <Chip label={`${info.stats.totalEntries} 条目`} size="small" variant="outlined" />
                                  <Chip label={info.stats.memoryEstimateFormatted} size="small" variant="outlined" />
                                  <Chip
                                    label={info.stats.hitRatePercent}
                                    size="small"
                                    color={info.stats.hitRate >= 0.8 ? 'success' : info.stats.hitRate >= 0.5 ? 'warning' : 'error'}
                                  />
                                </Box>
                              ) : (
                                '点击展开查看详情'
                              )
                            }
                          />
                          <ListItemSecondaryAction>
                            <Tooltip title="清空此命名空间">
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearNamespace(name);
                                }}
                                disabled={operationLoading}
                                color="warning"
                              >
                                <ClearAllIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="删除此命名空间">
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteNamespaceDialogOpen(name);
                                }}
                                disabled={operationLoading}
                                color="error"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </ListItemSecondaryAction>
                        </ListItem>

                        {isExpanded && info && (
                          <Box sx={{ px: 8, pb: 2, borderBottom: `1px solid ${gs.border}` }}>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                              <Grid item xs={12} sm={4}>
                                <Typography variant="body2" color="text.secondary">
                                  TTL: {info.options.ttl ? formatTTL(info.options.ttl) : '无限制'}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <Typography variant="body2" color="text.secondary">
                                  最大条目: {info.options.maxEntries ?? '无限制'}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <Typography variant="body2" color="text.secondary">
                                  最大大小: {info.options.maxSize ? formatBytes(info.options.maxSize) : '无限制'}
                                </Typography>
                              </Grid>
                            </Grid>

                            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                              缓存键列表 ({keys?.total ?? 0} 个)
                            </Typography>
                            {keys?.keys.length === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                此命名空间暂无缓存条目
                              </Typography>
                            ) : (
                              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                                <Table size="small" stickyHeader>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>键名</TableCell>
                                      <TableCell align="right">操作</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {keys?.keys.map((key) => (
                                      <TableRow key={key}>
                                        <TableCell>{key}</TableCell>
                                        <TableCell align="right">
                                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                            <Tooltip title="查看详情">
                                              <IconButton
                                                onClick={() => handleViewEntry(name, key)}
                                                size="small"
                                              >
                                                <ZoomInIcon />
                                              </IconButton>
                                            </Tooltip>
                                            <Tooltip title="删除">
                                              <IconButton
                                                onClick={() => setDeleteEntryDialogOpen({ namespace: name, key })}
                                                size="small"
                                                color="error"
                                              >
                                                <DeleteIcon />
                                              </IconButton>
                                            </Tooltip>
                                          </Box>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            )}
                          </Box>
                        )}
                      </React.Fragment>
                    );
                  })}
                </List>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={clearAllDialogOpen} onClose={() => setClearAllDialogOpen(false)}>
        <DialogTitle>确认清空全部缓存</DialogTitle>
        <DialogContent>
          <Typography>
            此操作将清空所有命名空间的缓存数据，此操作不可恢复。确定要继续吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearAllDialogOpen(false)}>取消</Button>
          <Button onClick={handleClearAll} color="error" disabled={operationLoading}>
            {operationLoading ? <CircularProgress size={20} /> : '确认清空'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteNamespaceDialogOpen} onClose={() => setDeleteNamespaceDialogOpen(null)}>
        <DialogTitle>确认删除命名空间</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除命名空间 "{deleteNamespaceDialogOpen}" 吗？此操作将删除该命名空间及其所有缓存数据，不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteNamespaceDialogOpen(null)}>取消</Button>
          <Button onClick={() => handleDeleteNamespace(deleteNamespaceDialogOpen!)} color="error" disabled={operationLoading}>
            {operationLoading ? <CircularProgress size={20} /> : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteEntryDialogOpen} onClose={() => setDeleteEntryDialogOpen(null)}>
        <DialogTitle>确认删除缓存条目</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除缓存键 "{deleteEntryDialogOpen?.key}" 吗？此操作不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteEntryDialogOpen(null)}>取消</Button>
          <Button onClick={handleDeleteEntry} color="error" disabled={operationLoading}>
            {operationLoading ? <CircularProgress size={20} /> : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>缓存条目详情</span>
          <IconButton onClick={() => setSelectedEntry(null)}>
            <XIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedEntry && (
            <Box sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">键名</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedEntry.key}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">值</Typography>
                  <Box sx={{ mt: 1, p: 2, bgcolor: gs.bgPanel, borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
                    <Typography variant="body1" fontFamily="monospace" fontSize="small">
                      {typeof selectedEntry.value === 'string'
                        ? selectedEntry.value
                        : JSON.stringify(selectedEntry.value, null, 2)}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">创建时间</Typography>
                  <Typography variant="body1">{formatTime(selectedEntry.createdAt)}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">过期时间</Typography>
                  <Typography variant="body1">{formatTime(selectedEntry.expiresAt)}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">剩余 TTL</Typography>
                  <Typography variant="body1">{formatTTL(selectedEntry.ttlRemaining)}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">访问次数</Typography>
                  <Typography variant="body1">{selectedEntry.accessCount}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">最后访问</Typography>
                  <Typography variant="body1">{formatTime(selectedEntry.lastAccessedAt)}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">大小</Typography>
                  <Typography variant="body1">{selectedEntry.sizeFormatted}</Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEntry(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CacheManagerPage;