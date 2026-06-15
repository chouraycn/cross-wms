/**
 * ApiCredentialsPage — API 凭证管理页
 *
 * v3.0: 管理 API 凭证（密钥、Token 等）
 * - 展示凭证列表（不显示明文值）
 * - 支持新增、编辑、删除凭证
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import {
  fetchCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  type ApiCredential,
} from '../services/apiCredentials/api';

// ===================== Constants =====================

const CREDENTIAL_TYPES = [
  { value: 'api_key', label: 'API Key' },
  { value: 'bearer_token', label: 'Bearer Token' },
  { value: 'basic_auth', label: 'Basic Auth' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'custom_header', label: '自定义 Header' },
];

const TYPE_CHIP_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'info' | 'warning'> = {
  api_key: 'primary',
  bearer_token: 'secondary',
  basic_auth: 'info',
  oauth2: 'warning',
  custom_header: 'default',
};

// ===================== Component =====================

const ApiCredentialsPage: React.FC = () => {
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('api_key');
  const [formValue, setFormValue] = useState('');
  const [formDomain, setFormDomain] = useState('');
  const [formHeaderName, setFormHeaderName] = useState('Authorization');
  const [saving, setSaving] = useState(false);

  // 删除确认对话框
  const [deleteTarget, setDeleteTarget] = useState<ApiCredential | null>(null);
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
      const result = await fetchCredentials();
      setCredentials(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载凭证失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 打开新增对话框 */
  const handleOpenAdd = useCallback(() => {
    setEditingId(null);
    setFormName('');
    setFormType('api_key');
    setFormValue('');
    setFormDomain('');
    setFormHeaderName('Authorization');
    setEditDialogOpen(true);
  }, []);

  /** 打开编辑对话框 */
  const handleOpenEdit = useCallback((cred: ApiCredential) => {
    setEditingId(cred.id);
    setFormName(cred.name);
    setFormType(cred.credentialType);
    setFormValue(''); // 不回显密码
    setFormDomain(cred.domain);
    setFormHeaderName(cred.headerName);
    setEditDialogOpen(true);
  }, []);

  /** 保存凭证 */
  const handleSave = async () => {
    if (!formName.trim() || !formDomain.trim()) return;
    // 新增时必须有值，编辑时值可选（为空则不更新）
    if (!editingId && !formValue.trim()) return;

    setSaving(true);
    try {
      if (editingId) {
        const updateData: Partial<{
          name: string;
          value: string;
          domain: string;
          headerName: string;
          credentialType: string;
        }> = {
          name: formName.trim(),
          domain: formDomain.trim(),
          headerName: formHeaderName.trim(),
          credentialType: formType,
        };
        if (formValue.trim()) {
          updateData.value = formValue.trim();
        }
        await updateCredential(editingId, updateData);
        setSnackbar({ open: true, message: `凭证 ${formName.trim()} 已更新`, severity: 'success' });
      } else {
        await createCredential({
          name: formName.trim(),
          credentialType: formType,
          value: formValue.trim(),
          domain: formDomain.trim(),
          headerName: formHeaderName.trim() || 'Authorization',
        });
        setSnackbar({ open: true, message: `凭证 ${formName.trim()} 已创建`, severity: 'success' });
      }
      setEditDialogOpen(false);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '保存失败', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 删除凭证 */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCredential(deleteTarget.id);
      setSnackbar({ open: true, message: `凭证 ${deleteTarget.name} 已删除`, severity: 'success' });
      setDeleteTarget(null);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '删除失败', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  /** 格式化时间 */
  const formatTime = (isoStr: string): string => {
    try {
      return new Date(isoStr).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <VpnKeyIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          API 凭证
        </Typography>
        <Tooltip title="新增凭证">
          <IconButton color="primary" onClick={handleOpenAdd}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        管理 API 密钥、Token 等凭证。凭证值加密存储，列表中不显示明文。
      </Typography>

      {/* 错误提示 */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 表格 */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>名称</TableCell>
              <TableCell width={120}>类型</TableCell>
              <TableCell>域名</TableCell>
              <TableCell width={100}>Header</TableCell>
              <TableCell width={80}>状态</TableCell>
              <TableCell width={100}>更新时间</TableCell>
              <TableCell width={80}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  加载中...
                </TableCell>
              </TableRow>
            ) : credentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  暂无凭证，点击右上角 + 添加
                </TableCell>
              </TableRow>
            ) : (
              credentials.map((cred) => {
                const typeLabel = CREDENTIAL_TYPES.find((t) => t.value === cred.credentialType)?.label || cred.credentialType;
                const chipColor = TYPE_CHIP_COLORS[cred.credentialType] || 'default';
                return (
                  <TableRow key={cred.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {cred.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={typeLabel} color={chipColor} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        {cred.domain}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {cred.headerName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={cred.hasValue ? '已存储凭证值' : '未存储凭证值'}>
                        <Chip
                          icon={<VisibilityOffIcon sx={{ fontSize: '14px !important' }} />}
                          label={cred.hasValue ? '已存储' : '空'}
                          size="small"
                          color={cred.hasValue ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(cred.updatedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="编辑">
                          <IconButton size="small" onClick={() => handleOpenEdit(cred)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(cred)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
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

      {/* 新增/编辑对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑凭证' : '新增凭证'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="名称"
            placeholder="如：OpenAI API Key"
            fullWidth
            variant="outlined"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth variant="outlined" sx={{ mb: 2 }}>
            <InputLabel>凭证类型</InputLabel>
            <Select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              label="凭证类型"
            >
              {CREDENTIAL_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            label="凭证值"
            placeholder={editingId ? '留空则不更新' : '输入 API Key / Token 等'}
            fullWidth
            variant="outlined"
            type="password"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            sx={{ mb: 2 }}
            required={!editingId}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <VisibilityOffIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            margin="dense"
            label="域名"
            placeholder="api.openai.com"
            fullWidth
            variant="outlined"
            value={formDomain}
            onChange={(e) => setFormDomain(e.target.value)}
            sx={{ mb: 2 }}
            helperText="此凭证关联的 API 域名"
          />
          <TextField
            margin="dense"
            label="Header 名称"
            placeholder="Authorization"
            fullWidth
            variant="outlined"
            value={formHeaderName}
            onChange={(e) => setFormHeaderName(e.target.value)}
            helperText="注入请求时的 Header 名称，通常为 Authorization"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || !formName.trim() || !formDomain.trim() || (!editingId && !formValue.trim())}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除凭证 <strong>{deleteTarget?.name}</strong> 吗？删除后使用此凭证的 API 模板将无法正常工作。
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

export default ApiCredentialsPage;
