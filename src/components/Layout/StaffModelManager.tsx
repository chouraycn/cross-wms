import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Switch,
  FormControlLabel,
  Chip,
  Stack,
  Divider,
  useTheme,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import LinkTestIcon from '@mui/icons-material/ScienceOutlined';
import { getGrayScale } from '../../constants/theme';
import type { ModelConfigRead } from '../staff/types';

const API_BASE = '/api/staffdeck/model-configs';
const DEFAULT_TENANT = 'default';

const PROTOCOLS = [
  { value: 'openai_chat_completions', label: 'OpenAI Chat Completions' },
  { value: 'anthropic_messages', label: 'Anthropic Messages' },
  { value: 'gemini_generate_content', label: 'Gemini Generate Content' },
];

const PROVIDERS = [
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'moonshot', label: 'Moonshot' },
  { value: 'zhipu', label: 'Zhipu (智谱)' },
  { value: 'volcengine', label: 'Volcengine (火山)' },
  { value: 'dashscope', label: 'DashScope (百炼)' },
];

type FormData = {
  name: string;
  provider: string;
  api_protocol: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_output_tokens: number;
  enabled: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  provider: 'openai_compatible',
  api_protocol: 'openai_chat_completions',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  max_output_tokens: 8192,
  enabled: true,
};

// ---------- API 层 (内联，避免额外文件依赖) ----------

async function apiFetch<T>(
  method: string,
  path: string,
  body?: any,
  expectCode0 = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  if (expectCode0 && json.code !== undefined && json.code !== 0) {
    throw new Error(json.message || '接口返回错误');
  }
  return json.data ?? (json as T);
}

function listConfigs(): Promise<ModelConfigRead[]> {
  return apiFetch<ModelConfigRead[]>('GET', `?tenant_id=${DEFAULT_TENANT}`);
}

function createConfig(payload: Partial<FormData> & { tenant_id?: string }): Promise<ModelConfigRead> {
  return apiFetch<ModelConfigRead>('POST', '/', { ...payload, tenant_id: DEFAULT_TENANT });
}

function updateConfig(id: string, payload: Partial<FormData>): Promise<ModelConfigRead> {
  return apiFetch<ModelConfigRead>('PUT', `/${id}?tenant_id=${DEFAULT_TENANT}`, { ...payload, tenant_id: DEFAULT_TENANT });
}

function setDefaultConfig(id: string): Promise<ModelConfigRead> {
  return apiFetch<ModelConfigRead>('POST', `/${id}/set-default?tenant_id=${DEFAULT_TENANT}`, { tenant_id: DEFAULT_TENANT });
}

function testConfig(id: string): Promise<{ success: boolean; message: string; output?: string }> {
  return apiFetch<any>('POST', `/${id}/test?tenant_id=${DEFAULT_TENANT}`, { tenant_id: DEFAULT_TENANT });
}

// ---------- 主组件 ----------

const StaffModelManager: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [configs, setConfigs] = useState<ModelConfigRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listConfigs();
      setConfigs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEdit = (cfg: ModelConfigRead) => {
    setEditingId(cfg.id);
    setForm({
      name: cfg.name,
      provider: cfg.provider,
      api_protocol: cfg.api_protocol,
      base_url: cfg.base_url || '',
      api_key: '', // 编辑时不返回明文 key，留空表示不修改
      model: cfg.model,
      temperature: cfg.temperature ?? 0.2,
      max_output_tokens: cfg.max_output_tokens ?? 8192,
      enabled: cfg.enabled,
    });
    setDialogError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) { setDialogError('请填写配置名称'); return; }
    if (!editingId && !form.api_key.trim()) { setDialogError('请填写 API Key'); return; }
    if (!form.model.trim()) { setDialogError('请填写模型名称'); return; }

    setSaving(true);
    setDialogError(null);
    try {
      const payload: any = { ...form };
      // 编辑模式且 api_key 为空 → 不传 key，保持原有
      if (editingId && !payload.api_key) delete payload.api_key;
      if (editingId) {
        await updateConfig(editingId, payload);
      } else {
        await createConfig(payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      setDialogError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('确定要删除该模型配置吗？')) return;
    try {
      // 后端暂未提供 delete 端点，走 update 把 enabled 置为 false 作为软删除提示
      await updateConfig(id, { enabled: false });
      await load();
    } catch (e: any) {
      setError(e?.message || '操作失败');
    }
  };

  const onSetDefault = async (id: string) => {
    try {
      await setDefaultConfig(id);
      await load();
    } catch (e: any) {
      setError(e?.message || '设置默认失败（请先验证并启用该模型）');
      setTimeout(() => setError(null), 4000);
    }
  };

  const onToggleEnabled = async (cfg: ModelConfigRead) => {
    try {
      await updateConfig(cfg.id, { enabled: !cfg.enabled });
      await load();
    } catch (e: any) {
      setError(e?.message || '切换失败');
      setTimeout(() => setError(null), 4000);
    }
  };

  const onTest = async (cfg: ModelConfigRead) => {
    setTestingId(cfg.id);
    try {
      const r: any = await testConfig(cfg.id);
      if (r?.success) {
        alert(`连接成功：${r.message || ''}`);
      } else {
        alert(`连接失败：${r?.message || '未知错误'}`);
      }
    } catch (e: any) {
      alert(`测试失败：${e?.message || '网络错误'}`);
    } finally {
      setTestingId(null);
    }
  };

  const trustChip = (trust: string) => {
    const map: Record<string, { label: string; color: any }> = {
      verified: { label: '已验证', color: 'success' },
      legacy_trusted: { label: '已信任', color: 'success' },
      unverified: { label: '未验证', color: 'warning' },
    };
    const v = map[trust] || { label: trust, color: 'default' };
    return <Chip size="small" label={v.label} color={v.color} variant="outlined" />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: gs.textPrimary }}>
            员工模型配置
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, mt: 0.25 }}>
            员工模块（数字员工）使用的专属模型配置，独立于主程序通用模型
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small" onClick={load} title="刷新">
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon fontSize="small" />}
            onClick={openCreate}
            sx={{
              backgroundColor: '#10b981',
              '&:hover': { backgroundColor: '#059669' },
              textTransform: 'none',
              fontSize: '0.8rem',
            }}
          >
            新增模型
          </Button>
        </Box>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 列表 */}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6, gap: 1 }}>
          <CircularProgress size={18} />
          <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted }}>加载员工模型配置...</Typography>
        </Box>
      ) : configs.length === 0 ? (
        <Box
          sx={{
            py: 6,
            px: 3,
            border: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            borderRadius: 2,
            textAlign: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', color: gs.textSecondary, mb: 1 }}>
            暂无员工模型配置
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 2 }}>
            配置至少一个模型以启用数字员工对话功能
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon fontSize="small" />}
            onClick={openCreate}
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            添加第一个模型
          </Button>
        </Box>
      ) : (
        <Stack
          spacing={1.5}
          sx={{
            border: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {/* 表头 */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '32px 1.2fr 1fr 1.2fr auto auto 40px 40px 40px 40px',
              gap: 1,
              alignItems: 'center',
              px: 2,
              py: 1.25,
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderBottom: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            {['默认', '名称', '提供商', '模型 / URL', '协议', '状态', '测试', '', '', ''].map((t, i) => (
              <Typography key={i} sx={{ fontSize: '0.7rem', color: gs.textMuted, fontWeight: 600 }}>
                {t}
              </Typography>
            ))}
          </Box>

          {configs.map((cfg, idx) => (
            <React.Fragment key={cfg.id}>
              {idx > 0 && (
                <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', mx: 1 }} />
              )}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1.2fr 1fr 1.2fr auto auto 40px 40px 40px 40px',
                  gap: 1,
                  alignItems: 'center',
                  px: 2,
                  py: 1.25,
                  backgroundColor: cfg.is_default
                    ? (isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)')
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
                  },
                }}
              >
                {/* 默认星标 */}
                <Box sx={{ justifySelf: 'start' }}>
                  <IconButton
                    size="small"
                    onClick={() => onSetDefault(cfg.id)}
                    title={cfg.is_default ? '当前默认' : '设为默认'}
                    sx={{ p: 0.25, color: cfg.is_default ? '#F59E0B' : gs.textDisabled }}
                  >
                    {cfg.is_default ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Box>

                {/* 名称 */}
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: cfg.enabled ? gs.textPrimary : gs.textDisabled,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cfg.name}
                  </Typography>
                </Box>

                {/* 提供商 */}
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      color: cfg.enabled ? gs.textSecondary : gs.textDisabled,
                    }}
                  >
                    {cfg.provider}
                  </Typography>
                  {cfg.api_key_masked && (
                    <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, fontFamily: 'monospace' }}>
                      key: {cfg.api_key_masked}
                    </Typography>
                  )}
                </Box>

                {/* 模型 / URL */}
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      color: cfg.enabled ? gs.textPrimary : gs.textDisabled,
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cfg.model}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      color: gs.textDisabled,
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cfg.base_url || ''}
                  </Typography>
                </Box>

                {/* 协议 */}
                <Box sx={{ justifySelf: 'start' }}>
                  <Chip
                    size="small"
                    label={cfg.api_protocol.replace(/_/g, ' ')}
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 22 }}
                  />
                </Box>

                {/* 状态：启用开关 + 信任标记 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifySelf: 'start' }}>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={cfg.enabled}
                        onChange={() => onToggleEnabled(cfg)}
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': { color: '#10b981' },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#10b981' },
                        }}
                      />
                    }
                    label={trustChip(cfg.trust_status)}
                    labelPlacement="end"
                  />
                </Box>

                {/* 按钮组 */}
                <Tooltip title="测试连接">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => onTest(cfg)}
                      disabled={testingId === cfg.id || !cfg.enabled}
                      sx={{ p: 0.5 }}
                    >
                      {testingId === cfg.id
                        ? <CircularProgress size={16} thickness={3} />
                        : <LinkTestIcon sx={{ fontSize: 16, color: '#3b82f6' }} />}
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="编辑">
                  <IconButton size="small" onClick={() => openEdit(cfg)} sx={{ p: 0.5 }}>
                    <EditIcon sx={{ fontSize: 16, color: '#6366f1' }} />
                  </IconButton>
                </Tooltip>

                <Tooltip title="删除（软禁用）">
                  <IconButton size="small" onClick={() => onDelete(cfg.id)} sx={{ p: 0.5 }}>
                    <DeleteIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                  </IconButton>
                </Tooltip>

                <Box />
              </Box>
            </React.Fragment>
          ))}
        </Stack>
      )}

      {/* 新增 / 编辑对话框 */}
      <Dialog
        open={dialogOpen}
        onClose={saving ? undefined : closeDialog}
        maxWidth="sm"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: 2,
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {editingId ? '编辑模型配置' : '新增模型配置'}
          </Typography>
          <IconButton size="small" onClick={closeDialog} disabled={saving}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {dialogError && (
            <Alert severity="error" sx={{ borderRadius: 1.5 }} onClose={() => setDialogError(null)}>
              {dialogError}
            </Alert>
          )}

          <TextField
            size="small"
            label="配置名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例如：公司 OpenAI 主账号"
            required
            fullWidth
            InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
            inputProps={{ style: { fontSize: '0.85rem' } }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              size="small"
              select
              label="提供商"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              fullWidth
              InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
              inputProps={{ style: { fontSize: '0.85rem' } }}
            >
              {PROVIDERS.map(p => (
                <MenuItem key={p.value} value={p.value} sx={{ fontSize: '0.8rem' }}>{p.label}</MenuItem>
              ))}
            </TextField>

            <TextField
              size="small"
              select
              label="API 协议"
              value={form.api_protocol}
              onChange={(e) => setForm({ ...form, api_protocol: e.target.value })}
              fullWidth
              InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
              inputProps={{ style: { fontSize: '0.85rem' } }}
            >
              {PROTOCOLS.map(p => (
                <MenuItem key={p.value} value={p.value} sx={{ fontSize: '0.8rem' }}>{p.label}</MenuItem>
              ))}
            </TextField>
          </Box>

          <TextField
            size="small"
            label="Base URL"
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            fullWidth
            InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
            inputProps={{ style: { fontSize: '0.85rem', fontFamily: 'monospace' } }}
          />

          <TextField
            size="small"
            label={`API Key${editingId ? '（留空则不修改）' : ''}`}
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder="sk-..."
            fullWidth
            required={!editingId}
            InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
            inputProps={{ style: { fontSize: '0.85rem', fontFamily: 'monospace' } }}
          />

          <TextField
            size="small"
            label="模型名称 (Model ID)"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="gpt-4o-mini / claude-3-haiku / ..."
            required
            fullWidth
            InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
            inputProps={{ style: { fontSize: '0.85rem', fontFamily: 'monospace' } }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              size="small"
              type="number"
              label="Temperature"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
              inputProps={{ min: 0, max: 2, step: 0.1, style: { fontSize: '0.85rem' } }}
              fullWidth
              InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
            />
            <TextField
              size="small"
              type="number"
              label="最大输出 Token"
              value={form.max_output_tokens}
              onChange={(e) => setForm({ ...form, max_output_tokens: parseInt(e.target.value, 10) || 1024 })}
              inputProps={{ min: 1, step: 1, style: { fontSize: '0.85rem' } }}
              fullWidth
              InputLabelProps={{ sx: { fontSize: '0.8rem' } }}
            />
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#10b981' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#10b981' },
                }}
              />
            }
            label={<Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary }}>立即启用</Typography>}
            sx={{ alignSelf: 'flex-start', m: 0 }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button size="small" onClick={closeDialog} disabled={saving} sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onSubmit}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} thickness={3} /> : null}
            sx={{
              backgroundColor: '#10b981',
              '&:hover': { backgroundColor: '#059669' },
              textTransform: 'none',
              fontSize: '0.8rem',
              minWidth: 80,
            }}
          >
            {saving ? '保存中' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StaffModelManager;
