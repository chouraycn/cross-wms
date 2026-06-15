/**
 * ApiDomainWhitelistPage — 域名白名单管理页
 *
 * v3.0: 管理允许 web_api_call 访问的域名列表
 * - 展示系统/用户域名
 * - 支持搜索、新增、删除
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import VpnLockIcon from '@mui/icons-material/VpnLock';
import PublicIcon from '@mui/icons-material/Public';
import SecurityIcon from '@mui/icons-material/Security';

import {
  fetchWhitelist,
  addDomainToWhitelist,
  removeDomainFromWhitelist,
  type WhitelistEntry,
} from '../services/apiDomainWhitelist/api';

// ===================== Chip color helper =====================

const categoryConfig: Record<string, { label: string; color: 'default' | 'primary' | 'secondary'; icon: React.ReactElement }> = {
  system: { label: '系统', color: 'primary', icon: <SecurityIcon fontSize="small" /> },
  user: { label: '用户', color: 'secondary', icon: <PublicIcon fontSize="small" /> as React.ReactElement },
};

// ===================== Component =====================

const ApiDomainWhitelistPage: React.FC = () => {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新增对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newHostname, setNewHostname] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [adding, setAdding] = useState(false);

  // 删除确认对话框
  const [deleteTarget, setDeleteTarget] = useState<WhitelistEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 通知
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWhitelist({
        search: search || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      });
      setEntries(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载白名单失败');
    } finally {
      setLoading(false);
    }
  }, [search, page, rowsPerPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 新增域名
  const handleAdd = async () => {
    if (!newHostname.trim()) return;
    setAdding(true);
    try {
      await addDomainToWhitelist(newHostname.trim(), newDescription.trim(), 'user');
      setSnackbar({ open: true, message: `域名 ${newHostname.trim()} 已添加`, severity: 'success' });
      setAddDialogOpen(false);
      setNewHostname('');
      setNewDescription('');
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '添加失败', severity: 'error' });
    } finally {
      setAdding(false);
    }
  };

  // 删除域名
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeDomainFromWhitelist(deleteTarget.id);
      setSnackbar({ open: true, message: `域名 ${deleteTarget.hostname} 已删除`, severity: 'success' });
      setDeleteTarget(null);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '删除失败', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <VpnLockIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          API 域名白名单
        </Typography>
        <Tooltip title="新增域名">
          <IconButton color="primary" onClick={() => setAddDialogOpen(true)}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        管理 web_api_call 工具允许访问的域名。仅白名单中的域名可被调用。
      </Typography>

      {/* 搜索栏 */}
      <TextField
        size="small"
        placeholder="搜索域名..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        sx={{ mb: 2, width: '100%', maxWidth: 400 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {/* 错误提示 */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 表格 */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>域名</TableCell>
              <TableCell>描述</TableCell>
              <TableCell width={100}>分类</TableCell>
              <TableCell width={80}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  加载中...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const cfg = categoryConfig[entry.category] || categoryConfig.user;
                return (
                  <TableRow key={entry.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {entry.hostname}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {entry.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cfg.label}
                        color={cfg.color}
                        size="small"
                        icon={cfg.icon}
                        variant={entry.category === 'system' ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      {entry.is_deletable === 1 ? (
                        <Tooltip title="删除">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(entry)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="系统内置，不可删除">
                          <span>
                            <IconButton size="small" disabled>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 分页 */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新增域名</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="域名"
            placeholder="api.example.com"
            fullWidth
            variant="outlined"
            value={newHostname}
            onChange={(e) => setNewHostname(e.target.value)}
            sx={{ mb: 2 }}
            helperText="仅允许小写字母、数字、连字符和点号"
          />
          <TextField
            margin="dense"
            label="描述"
            placeholder="说明此域名的用途"
            fullWidth
            variant="outlined"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>取消</Button>
          <Button onClick={handleAdd} variant="contained" disabled={adding || !newHostname.trim()}>
            {adding ? '添加中...' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除域名 <strong>{deleteTarget?.hostname}</strong> 吗？删除后 web_api_call 将无法访问该域名。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={deleting}>
            {deleting ? '删除中...' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 通知条 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ApiDomainWhitelistPage;
