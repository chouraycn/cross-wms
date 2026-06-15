/**
 * ApiTemplatesPage — API 模板管理页
 *
 * v3.0: 管理 API 模板的 CRUD + 测试执行
 * - MUI Table 列表展示模板
 * - 新建/编辑 Dialog 表单
 * - 测试按钮（在 Dialog 中显示结果）
 * - 删除按钮（仅非内置模板）
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ApiIcon from '@mui/icons-material/Api';
import SecurityIcon from '@mui/icons-material/Security';
import PublicIcon from '@mui/icons-material/Public';

import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  testTemplate,
  type ApiTemplateInfo,
} from '../services/apiTemplates/api';

// ===================== Config Maps =====================

const methodColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning'> = {
  GET: 'success',
  POST: 'info',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'error',
  OPTIONS: 'default',
};

const riskConfig: Record<string, { label: string; color: 'default' | 'warning' | 'error' }> = {
  auto: { label: '自动', color: 'default' },
  confirm: { label: '确认', color: 'warning' },
  'high-risk': { label: '高风险', color: 'error' },
};

const extractorOptions = [
  { value: 'none', label: '无提取' },
  { value: 'jsonpath', label: 'JSONPath' },
  { value: 'css', label: 'CSS Selector' },
  { value: 'regex', label: '正则表达式' },
];

const riskOptions = [
  { value: 'auto', label: '自动批准' },
  { value: 'confirm', label: '需要确认' },
  { value: 'high-risk', label: '高风险' },
];

const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// ===================== Default Form State =====================

interface FormData {
  name: string;
  description: string;
  domain: string;
  method: string;
  pathTemplate: string;
  headersJson: string;
  bodyTemplate: string;
  responsePath: string;
  responseExtractor: string;
  riskLevel: string;
  tags: string;
}

const defaultFormData: FormData = {
  name: '',
  description: '',
  domain: '',
  method: 'GET',
  pathTemplate: '/',
  headersJson: '{}',
  bodyTemplate: '',
  responsePath: '',
  responseExtractor: 'none',
  riskLevel: 'confirm',
  tags: '',
};

// ===================== Component =====================

const ApiTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<ApiTemplateInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑/新建 Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...defaultFormData });
  const [saving, setSaving] = useState(false);

  // 测试 Dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testTemplateId, setTestTemplateId] = useState<string | null>(null);
  const [testVariables, setTestVariables] = useState('{}');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ApiTemplateInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 通知
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // ===================== Data Loading =====================

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTemplates({
        search: search || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      });
      setTemplates(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, [search, page, rowsPerPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ===================== Handlers =====================

  /** 打开新建 Dialog */
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ ...defaultFormData });
    setEditDialogOpen(true);
  };

  /** 打开编辑 Dialog */
  const handleOpenEdit = (tpl: ApiTemplateInfo) => {
    setEditingId(tpl.id);
    setFormData({
      name: tpl.name,
      description: tpl.description,
      domain: tpl.domain,
      method: tpl.method,
      pathTemplate: tpl.pathTemplate,
      headersJson: tpl.headersJson || '{}',
      bodyTemplate: tpl.bodyTemplate || '',
      responsePath: tpl.responsePath || '',
      responseExtractor: tpl.responseExtractor || 'none',
      riskLevel: tpl.riskLevel,
      tags: Array.isArray(tpl.tags) ? tpl.tags.join(', ') : '',
    });
    setEditDialogOpen(true);
  };

  /** 保存模板（新建或更新） */
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.domain.trim()) {
      setSnackbar({ open: true, message: '名称和域名为必填项', severity: 'error' });
      return;
    }

    // 验证 headersJson 格式
    try {
      JSON.parse(formData.headersJson || '{}');
    } catch {
      setSnackbar({ open: true, message: 'Headers JSON 格式无效', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const payload: Partial<ApiTemplateInfo> = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        domain: formData.domain.trim(),
        method: formData.method,
        pathTemplate: formData.pathTemplate,
        headersJson: formData.headersJson,
        bodyTemplate: formData.bodyTemplate,
        responsePath: formData.responsePath,
        responseExtractor: formData.responseExtractor,
        riskLevel: formData.riskLevel,
        tags: tagsArray,
      };

      if (editingId) {
        await updateTemplate(editingId, payload);
        setSnackbar({ open: true, message: '模板已更新', severity: 'success' });
      } else {
        await createTemplate(payload);
        setSnackbar({ open: true, message: '模板已创建', severity: 'success' });
      }

      setEditDialogOpen(false);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '保存失败', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 删除模板 */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTemplate(deleteTarget.id);
      setSnackbar({ open: true, message: `模板 ${deleteTarget.name} 已删除`, severity: 'success' });
      setDeleteTarget(null);
      loadData();
    } catch (e) {
      setSnackbar({ open: true, message: e instanceof Error ? e.message : '删除失败', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  /** 测试模板 */
  const handleTest = async () => {
    if (!testTemplateId) return;
    setTesting(true);
    setTestResult(null);
    try {
      let variables: Record<string, string> = {};
      try {
        variables = JSON.parse(testVariables || '{}');
      } catch {
        variables = {};
      }
      const result = await testTemplate(testTemplateId, variables);
      setTestResult(result);
    } catch (e) {
      setTestResult({ error: e instanceof Error ? e.message : '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  /** 打开测试 Dialog */
  const handleOpenTest = (tpl: ApiTemplateInfo) => {
    setTestTemplateId(tpl.id);
    setTestVariables('{}');
    setTestResult(null);
    setTestDialogOpen(true);
  };

  // ===================== Form Helper =====================

  const updateForm = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ===================== Render =====================

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <ApiIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          API 模板管理
        </Typography>
        <Tooltip title="新建模板">
          <IconButton color="primary" onClick={handleOpenCreate}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        管理 API 调用模板，配置域名、路径、请求头和响应提取规则。AI 可通过 web_api_call 工具使用模板调用外部 API。
      </Typography>

      {/* 搜索栏 */}
      <TextField
        size="small"
        placeholder="搜索模板名称、描述..."
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
              <TableCell>名称</TableCell>
              <TableCell>域名</TableCell>
              <TableCell width={80}>方法</TableCell>
              <TableCell width={90}>风险等级</TableCell>
              <TableCell width={80}>类型</TableCell>
              <TableCell width={160}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  加载中...
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  暂无模板数据
                </TableCell>
              </TableRow>
            ) : (
              templates.map((tpl) => {
                const risk = riskConfig[tpl.riskLevel] || riskConfig.confirm;
                return (
                  <TableRow key={tpl.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {tpl.name}
                        </Typography>
                        {tpl.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tpl.description}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                        {tpl.domain}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={tpl.method} size="small" color={methodColors[tpl.method] || 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={risk.label} size="small" color={risk.color} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {tpl.isBuiltin ? (
                        <Chip label="内置" size="small" color="primary" icon={<SecurityIcon fontSize="small" />} variant="filled" />
                      ) : (
                        <Chip label="用户" size="small" color="secondary" icon={<PublicIcon fontSize="small" />} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="测试">
                          <IconButton size="small" color="info" onClick={() => handleOpenTest(tpl)}>
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="编辑">
                          <IconButton size="small" color="primary" onClick={() => handleOpenEdit(tpl)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!tpl.isBuiltin ? (
                          <Tooltip title="删除">
                            <IconButton size="small" color="error" onClick={() => setDeleteTarget(tpl)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="内置模板不可删除">
                            <span>
                              <IconButton size="small" disabled>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
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

      {/* ==================== 编辑/新建 Dialog ==================== */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑模板' : '新建模板'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="模板名称"
              required
              fullWidth
              size="small"
              value={formData.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="例如: 获取天气信息"
            />
            <TextField
              label="描述"
              fullWidth
              size="small"
              value={formData.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="模板用途说明"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="域名"
                required
                fullWidth
                size="small"
                value={formData.domain}
                onChange={(e) => updateForm('domain', e.target.value)}
                placeholder="api.example.com"
                helperText="不含协议前缀"
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>方法</InputLabel>
                <Select
                  value={formData.method}
                  label="方法"
                  onChange={(e) => updateForm('method', e.target.value)}
                >
                  {httpMethods.map(m => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <TextField
              label="路径模板"
              fullWidth
              size="small"
              value={formData.pathTemplate}
              onChange={(e) => updateForm('pathTemplate', e.target.value)}
              placeholder="/users/{username}/repos"
              helperText="支持 {{变量}} 占位符"
            />
            <TextField
              label="Headers (JSON)"
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={formData.headersJson}
              onChange={(e) => updateForm('headersJson', e.target.value)}
              placeholder='{"Authorization": "{{credential:xxx}}", "Accept": "application/json"}'
              helperText="支持 {{变量}} 和 {{credential:ID}} 占位符"
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
            <TextField
              label="Body 模板"
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={formData.bodyTemplate}
              onChange={(e) => updateForm('bodyTemplate', e.target.value)}
              placeholder="POST 请求体模板（支持 {{变量}}）"
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>响应提取器</InputLabel>
                <Select
                  value={formData.responseExtractor}
                  label="响应提取器"
                  onChange={(e) => updateForm('responseExtractor', e.target.value)}
                >
                  {extractorOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="提取路径"
                fullWidth
                size="small"
                value={formData.responsePath}
                onChange={(e) => updateForm('responsePath', e.target.value)}
                placeholder="$.data.items 或 div.content"
                helperText={formData.responseExtractor === 'jsonpath' ? 'JSONPath 表达式' : formData.responseExtractor === 'css' ? 'CSS 选择器' : formData.responseExtractor === 'regex' ? '正则表达式' : '选择提取器后输入'}
              />
            </Box>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>风险等级</InputLabel>
              <Select
                value={formData.riskLevel}
                label="风险等级"
                onChange={(e) => updateForm('riskLevel', e.target.value)}
              >
                {riskOptions.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="标签（逗号分隔）"
              fullWidth
              size="small"
              value={formData.tags}
              onChange={(e) => updateForm('tags', e.target.value)}
              placeholder="天气, API, 第三方"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving || !formData.name.trim() || !formData.domain.trim()}>
            {saving ? '保存中...' : editingId ? '更新' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== 测试 Dialog ==================== */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>测试模板</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="模板变量 (JSON)"
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={testVariables}
              onChange={(e) => setTestVariables(e.target.value)}
              placeholder='{"username": "octocat"}'
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
            <Button
              variant="contained"
              color="info"
              onClick={handleTest}
              disabled={testing}
              startIcon={testing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            >
              {testing ? '执行中...' : '执行测试'}
            </Button>
            {testResult && (
              <Paper variant="outlined" sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
                <Typography variant="subtitle2" gutterBottom>
                  测试结果
                </Typography>
                <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </Paper>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* ==================== 删除确认 Dialog ==================== */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除模板 <strong>{deleteTarget?.name}</strong> 吗？删除后 AI 将无法使用此模板调用 API。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={deleting}>
            {deleting ? '删除中...' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== 通知条 ==================== */}
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

export default ApiTemplatesPage;
