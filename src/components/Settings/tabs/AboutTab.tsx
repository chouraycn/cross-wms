import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Slider,
  Button,
  IconButton,
  Alert,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Card,
  CardContent,
  Tooltip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import type { AppSettings, SidebarConfig, ModelConfig } from '../../../contexts/AppSettingsContext';
import { formatVersion, type UpdateStatus } from '../../../services/updateService';
import { useUpdateContext } from '../../../contexts/UpdateContext';
import { isPyWebView } from '../../../services/tencentDocsApi';
import { switchSx, textFieldSx, APP_VERSION } from '../sharedStyles';

// ===================== Props =====================

export interface AboutTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

// ===================== Helpers =====================

/** Update a sidebar config field */
const updateSidebar = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  key: keyof SidebarConfig,
  value: SidebarConfig[keyof SidebarConfig],
) => {
  setDraft((prev) => ({
    ...prev,
    sidebar: { ...prev.sidebar, [key]: value },
  }));
};

// ===================== Component =====================

const AboutTab: React.FC<AboutTabProps> = ({
  draft,
  setDraft,
  errors,
  setErrors,
}) => {
  // ---- Model management state ----
  const [modelDialogMode, setModelDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [modelForm, setModelForm] = useState<{
    id: string;
    name: string;
    provider: ModelConfig['provider'];
    apiEndpoint: string;
    apiKey: string;
    enabled: boolean;
    description: string;
    contextWindow: string;
    maxTokens: string;
  }>({
    id: '',
    name: '',
    provider: 'openai',
    apiEndpoint: '',
    apiKey: '',
    enabled: true,
    description: '',
    contextWindow: '',
    maxTokens: '',
  });
  const [modelFormErrors, setModelFormErrors] = useState<Record<string, string>>({});

  // ---- Update check state ----
  const { checkForUpdates: globalCheckForUpdates, updateStatus, showUpdateNotification, downloadUpdate } = useUpdateContext();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [localUpdateStatus, setLocalUpdateStatus] = useState<UpdateStatus | null>(null);
  const effectiveUpdateStatus = showUpdateNotification ? updateStatus : localUpdateStatus;

  // ---- Traffic light offset state (pywebview macOS) ----
  const [trafficLightOffset, setTrafficLightOffset] = useState({ x: 0, y: 0 });
  const [loadingTrafficLight, setLoadingTrafficLight] = useState(false);
  const [savingTrafficLight, setSavingTrafficLight] = useState(false);
  const [trafficLightMessage, setTrafficLightMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ---- Initialize traffic light offset ----
  useEffect(() => {
    if (!isPyWebView() || !window.pywebview?.api?.get_traffic_light_offset) return;
    setLoadingTrafficLight(true);
    window.pywebview.api.get_traffic_light_offset()
      .then((res: string) => {
        try {
          const data = JSON.parse(res);
          if (data.ok) {
            setTrafficLightOffset({ x: data.offset_x || 0, y: data.offset_y || 0 });
          }
        } catch (e) {
          console.warn('获取红黄绿按钮偏移量失败:', e);
        }
      })
      .catch((err: any) => {
        console.warn('调用 get_traffic_light_offset 失败:', err);
      })
      .finally(() => setLoadingTrafficLight(false));
  }, []);

  // ---- Model management handlers ----

  const openModelDialog = useCallback((mode: 'add' | 'edit', model?: ModelConfig) => {
    setModelDialogMode(mode);
    if (mode === 'edit' && model) {
      setEditingModel(model);
      setModelForm({
        id: model.id,
        name: model.name,
        provider: model.provider,
        apiEndpoint: model.apiEndpoint || '',
        apiKey: model.apiKey || '',
        enabled: model.enabled,
        description: model.description || '',
        contextWindow: model.contextWindow?.toString() || '',
        maxTokens: model.maxTokens?.toString() || '',
      });
    } else {
      setEditingModel(null);
      setModelForm({
        id: `model-${Date.now()}`,
        name: '',
        provider: 'openai',
        apiEndpoint: '',
        apiKey: '',
        enabled: true,
        description: '',
        contextWindow: '',
        maxTokens: '',
      });
    }
    setModelFormErrors({});
  }, []);

  const closeModelDialog = useCallback(() => {
    setModelDialogMode(null);
    setEditingModel(null);
    setModelFormErrors({});
  }, []);

  const validateModelForm = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!modelForm.id.trim()) {
      errs['model.id'] = '模型 ID 不能为空';
    } else if (modelDialogMode === 'add' && draft.models.models.some((m) => m.id === modelForm.id.trim())) {
      errs['model.id'] = '模型 ID 已存在';
    }
    if (!modelForm.name.trim()) {
      errs['model.name'] = '模型名称不能为空';
    }
    if (modelForm.contextWindow && isNaN(Number(modelForm.contextWindow))) {
      errs['model.contextWindow'] = '上下文窗口必须是数字';
    }
    if (modelForm.maxTokens && isNaN(Number(modelForm.maxTokens))) {
      errs['model.maxTokens'] = '最大输出 token 必须是数字';
    }
    setModelFormErrors(errs);
    return Object.keys(errs).length === 0;
  }, [modelForm, modelDialogMode, draft.models.models]);

  const handleSaveModel = useCallback(() => {
    if (!validateModelForm()) return;

    const modelData: ModelConfig = {
      id: modelForm.id.trim(),
      name: modelForm.name.trim(),
      provider: modelForm.provider,
      enabled: modelForm.enabled,
      description: modelForm.description.trim() || undefined,
      contextWindow: modelForm.contextWindow ? Number(modelForm.contextWindow) : undefined,
      maxTokens: modelForm.maxTokens ? Number(modelForm.maxTokens) : undefined,
    };

    if (modelForm.apiEndpoint.trim()) {
      modelData.apiEndpoint = modelForm.apiEndpoint.trim();
    }
    if (modelForm.apiKey.trim()) {
      modelData.apiKey = modelForm.apiKey.trim();
    }

    if (modelDialogMode === 'edit' && editingModel) {
      setDraft((prev) => ({
        ...prev,
        models: {
          ...prev.models,
          models: prev.models.models.map((m) =>
            m.id === editingModel.id ? { ...m, ...modelData, id: modelForm.id.trim() } : m
          ),
        },
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        models: {
          ...prev.models,
          models: [...prev.models.models, modelData],
        },
      }));
    }

    closeModelDialog();
  }, [modelForm, modelDialogMode, editingModel, validateModelForm, closeModelDialog, setDraft]);

  const handleDeleteModel = useCallback((modelId: string) => {
    if (!window.confirm('确定要删除此模型吗？此操作不可恢复。')) return;

    setDraft((prev) => {
      const newModels = prev.models.models.filter((m) => m.id !== modelId);
      let newDefaultId = prev.models.defaultModelId;
      if (modelId === prev.models.defaultModelId && newModels.length > 0) {
        const firstEnabled = newModels.find((m) => m.enabled);
        newDefaultId = firstEnabled ? firstEnabled.id : newModels[0].id;
      }
      return {
        ...prev,
        models: {
          ...prev.models,
          models: newModels,
          defaultModelId: newDefaultId,
        },
      };
    });
  }, [setDraft]);

  const handleSetDefaultModel = useCallback((modelId: string) => {
    setDraft((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        defaultModelId: modelId,
        models: prev.models.models.map((m) => ({
          ...m,
          isDefault: m.id === modelId,
        })),
      },
    }));
  }, [setDraft]);

  const handleToggleModelEnabled = useCallback((modelId: string, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        models: prev.models.models.map((m) =>
          m.id === modelId ? { ...m, enabled } : m
        ),
      },
    }));
  }, [setDraft]);

  // ---- Update check handlers ----

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setLocalUpdateStatus(null);
    try {
      const result = await globalCheckForUpdates();
      if (!result.hasUpdate) {
        setLocalUpdateStatus(result);
      }
      if (result.error) {
        console.warn('检查更新失败:', result.error);
        setLocalUpdateStatus(result);
      }
    } catch (err) {
      const errorStatus: UpdateStatus = {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        error: err instanceof Error ? err.message : '检查更新失败',
      };
      setLocalUpdateStatus(errorStatus);
    } finally {
      setCheckingUpdate(false);
    }
  }, [globalCheckForUpdates]);

  const handleDownloadUpdate = useCallback(() => {
    downloadUpdate();
  }, [downloadUpdate]);

  // ---- Traffic light offset handlers ----

  const applyTrafficLightOffset = useCallback(async () => {
    if (!isPyWebView() || !window.pywebview?.api?.set_traffic_light_offset) return;
    setSavingTrafficLight(true);
    setTrafficLightMessage(null);
    try {
      const res = await window.pywebview.api.set_traffic_light_offset(trafficLightOffset.x, trafficLightOffset.y);
      const data = JSON.parse(res);
      if (data.ok) {
        setTrafficLightMessage({ type: 'success', text: '已应用偏移量，请观察红黄绿按钮位置' });
      } else {
        setTrafficLightMessage({ type: 'error', text: data.error || '应用失败' });
      }
    } catch (err: any) {
      setTrafficLightMessage({ type: 'error', text: err.message || '调用失败' });
    } finally {
      setSavingTrafficLight(false);
    }
  }, [trafficLightOffset]);

  const resetTrafficLightOffset = useCallback(async () => {
    setTrafficLightOffset({ x: 0, y: 0 });
    if (isPyWebView() && window.pywebview?.api?.set_traffic_light_offset) {
      try {
        await window.pywebview.api.set_traffic_light_offset(0, 0);
        setTrafficLightMessage({ type: 'success', text: '已重置为默认位置' });
      } catch (err: any) {
        setTrafficLightMessage({ type: 'error', text: err.message || '重置失败' });
      }
    }
  }, []);

  // ---- Render ----

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ===== Model Management ===== */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>
            模型管理
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => openModelDialog('add')}
            sx={{
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
              fontSize: '0.8rem',
            }}
          >
            添加模型
          </Button>
        </Box>

        <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
          管理 AI 模型配置，设置默认模型。当前默认模型：
          <Chip
            label={draft.models.models.find((m) => m.id === draft.models.defaultModelId)?.name || '未设置'}
            size="small"
            sx={{ ml: 1, backgroundColor: '#EFF6FF', color: '#1E40AF', fontSize: '0.75rem' }}
          />
        </Typography>

        {/* Model list */}
        <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #E5E7EB' }}>
          {draft.models.models.map((model) => (
            <ListItem
              key={model.id}
              sx={{
                py: 1.5,
                px: 2,
                borderBottom: '1px solid #E5E7EB',
                backgroundColor: model.id === draft.models.defaultModelId ? '#F0FDF4' : 'transparent',
                '&:last-child': { borderBottom: 'none' },
              }}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {model.id !== draft.models.defaultModelId && (
                    <Tooltip title="设为默认">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleSetDefaultModel(model.id)}
                        sx={{
                          borderColor: '#10B981',
                          color: '#10B981',
                          fontSize: '0.7rem',
                          py: 0.2,
                          '&:hover': { borderColor: '#059669', backgroundColor: '#ECFDF5' },
                        }}
                      >
                        默认
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip title={model.enabled ? '禁用' : '启用'}>
                    <Switch
                      checked={model.enabled}
                      onChange={(e) => handleToggleModelEnabled(model.id, e.target.checked)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#10B981' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#10B981' },
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="编辑">
                    <IconButton size="small" onClick={() => openModelDialog('edit', model)} sx={{ color: '#6B7280' }}>
                      <TuneIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton size="small" onClick={() => handleDeleteModel(model.id)} sx={{ color: '#EF4444' }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                      {model.name}
                    </Typography>
                    {model.id === draft.models.defaultModelId && (
                      <Chip label="默认" size="small" sx={{ backgroundColor: '#10B981', color: '#FFF', fontSize: '0.65rem' }} />
                    )}
                    <Chip
                      label={model.provider}
                      size="small"
                      sx={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontSize: '0.65rem' }}
                    />
                    {!model.enabled && (
                      <Chip label="已禁用" size="small" sx={{ backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.65rem' }} />
                    )}
                  </Box>
                }
                secondary={
                  <Box sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                      ID: {model.id}
                    </Typography>
                    {model.description && (
                      <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.5 }}>
                        {model.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                      {model.contextWindow && (
                        <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                          上下文：{model.contextWindow.toLocaleString()} tokens
                        </Typography>
                      )}
                      {model.maxTokens && (
                        <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                          最大输出：{model.maxTokens.toLocaleString()} tokens
                        </Typography>
                      )}
                    </Box>
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>

        {/* Model dialog */}
        {modelDialogMode && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1300,
            }}
            onClick={closeModelDialog}
          >
            <Card
              sx={{ width: 500, maxWidth: '90%', p: 3 }}
              onClick={(e) => e.stopPropagation()}
            >
              <CardContent>
                <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827', mb: 2 }}>
                  {modelDialogMode === 'add' ? '添加模型' : '编辑模型'}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="模型 ID"
                    value={modelForm.id}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, id: e.target.value }))}
                    error={!!modelFormErrors['model.id']}
                    helperText={modelFormErrors['model.id']}
                    disabled={modelDialogMode === 'edit'}
                    fullWidth
                    size="small"
                    sx={textFieldSx}
                  />

                  <TextField
                    label="模型名称"
                    value={modelForm.name}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, name: e.target.value }))}
                    error={!!modelFormErrors['model.name']}
                    helperText={modelFormErrors['model.name']}
                    fullWidth
                    size="small"
                    sx={textFieldSx}
                  />

                  <FormControl fullWidth size="small">
                    <InputLabel>提供商</InputLabel>
                    <Select
                      value={modelForm.provider}
                      label="提供商"
                      onChange={(e) => setModelForm((prev) => ({ ...prev, provider: e.target.value as ModelConfig['provider'] }))}
                    >
                      <MenuItem value="openai">OpenAI</MenuItem>
                      <MenuItem value="anthropic">Anthropic</MenuItem>
                      <MenuItem value="tencent">腾讯</MenuItem>
                      <MenuItem value="custom">自定义</MenuItem>
                    </Select>
                  </FormControl>

                  {modelForm.provider === 'custom' && (
                    <TextField
                      label="API 端点"
                      value={modelForm.apiEndpoint}
                      onChange={(e) => setModelForm((prev) => ({ ...prev, apiEndpoint: e.target.value }))}
                      fullWidth
                      size="small"
                      placeholder="https://api.example.com/v1"
                      sx={textFieldSx}
                    />
                  )}

                  <TextField
                    label="API Key（可选）"
                    value={modelForm.apiKey}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                    fullWidth
                    size="small"
                    type="password"
                    sx={textFieldSx}
                  />

                  <TextField
                    label="描述"
                    value={modelForm.description}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, description: e.target.value }))}
                    fullWidth
                    size="small"
                    multiline
                    rows={2}
                    sx={textFieldSx}
                  />

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="上下文窗口 (tokens)"
                      value={modelForm.contextWindow}
                      onChange={(e) => setModelForm((prev) => ({ ...prev, contextWindow: e.target.value }))}
                      error={!!modelFormErrors['model.contextWindow']}
                      helperText={modelFormErrors['model.contextWindow']}
                      size="small"
                      type="number"
                      sx={{ ...textFieldSx, flex: 1 }}
                    />
                    <TextField
                      label="最大输出 (tokens)"
                      value={modelForm.maxTokens}
                      onChange={(e) => setModelForm((prev) => ({ ...prev, maxTokens: e.target.value }))}
                      error={!!modelFormErrors['model.maxTokens']}
                      helperText={modelFormErrors['model.maxTokens']}
                      size="small"
                      type="number"
                      sx={{ ...textFieldSx, flex: 1 }}
                    />
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={modelForm.enabled}
                        onChange={(e) => setModelForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                        size="small"
                      />
                    }
                    label={<Typography sx={{ fontSize: '0.875rem' }}>启用此模型</Typography>}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                  <Button variant="outlined" onClick={closeModelDialog} size="small">
                    取消
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSaveModel}
                    size="small"
                    sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }}
                  >
                    保存
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* ===== About Section ===== */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 400 }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
          关于系统
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>系统名称</Typography>
          <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>CDF Know CrossWMS</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>版本</Typography>
          <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>V{APP_VERSION}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>构建日期</Typography>
          <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>运行环境</Typography>
          <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>
            {window.electronAPI ? 'Electron 桌面应用' : '浏览器'}
          </Typography>
        </Box>

        {/* Auto-update area */}
        <Box sx={{ mt: 1, mb: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            startIcon={checkingUpdate ? <Box component="span" sx={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #9CA3AF', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} /> : undefined}
            sx={{
              borderColor: '#E5E7EB',
              color: '#6B7280',
              fontSize: '0.8rem',
              '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
            }}
          >
            {checkingUpdate ? '检查中...' : effectiveUpdateStatus ? '重新检查更新' : '检查更新'}
          </Button>

          {effectiveUpdateStatus && !effectiveUpdateStatus.error && (
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, backgroundColor: effectiveUpdateStatus.hasUpdate ? '#FFF7ED' : '#F9FAFB', border: `1px solid ${effectiveUpdateStatus.hasUpdate ? '#FDBA74' : '#E5E7EB'}` }}>
              {effectiveUpdateStatus.hasUpdate && effectiveUpdateStatus.releaseInfo ? (
                <Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#9A3412', mb: 0.5 }}>
                    发现新版本 V{formatVersion(effectiveUpdateStatus.latestVersion)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9A3412', mb: 1, whiteSpace: 'pre-wrap' }}>
                    {effectiveUpdateStatus.releaseInfo.notes}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#B45309', mb: 1 }}>
                    发布时间：{effectiveUpdateStatus.releaseInfo.pubDate}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleDownloadUpdate}
                    sx={{
                      backgroundColor: '#9A3412',
                      '&:hover': { backgroundColor: '#7C2D12' },
                      fontSize: '0.8rem',
                    }}
                  >
                    下载最新版本
                  </Button>
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  ✓ 当前已是最新版本
                </Typography>
              )}
            </Box>
          )}

          {effectiveUpdateStatus?.error && (
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
              <Typography sx={{ fontSize: '0.8rem', color: '#991B1B' }}>
                检查更新失败：{effectiveUpdateStatus.error}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#991B1B', mt: 0.5 }}>
                请确保应用可以访问互联网，或联系管理员获取最新版本
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Sidebar settings */}
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', mt: 0.5 }}>
          侧边栏设置
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={draft.sidebar.showVersion}
              onChange={(e) => updateSidebar(setDraft, 'showVersion', e.target.checked)}
              size="small"
              sx={switchSx}
            />
          }
          label={
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>显示版本号</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                在侧边栏 Logo 旁显示当前版本号（v{APP_VERSION}）
              </Typography>
            </Box>
          }
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Traffic light offset (macOS pywebview only) */}
        {isPyWebView() && (
          <>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', mt: 0.5, mb: 1 }}>
              红黄绿按钮位置
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mb: 1.5 }}>
              调整 macOS 窗口标题栏左上角红黄绿按钮的偏移量。正值向右/向下，负值向左/向上。
            </Typography>

            {loadingTrafficLight ? (
              <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF' }}>加载中...</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', color: '#374151', mb: 0.5 }}>
                    水平偏移: {trafficLightOffset.x}px
                  </Typography>
                  <Slider
                    value={trafficLightOffset.x}
                    onChange={(_, v) => setTrafficLightOffset(prev => ({ ...prev, x: v as number }))}
                    min={-50}
                    max={150}
                    step={1}
                    valueLabelDisplay="auto"
                    sx={{ color: '#111827', '& .MuiSlider-thumb': { width: 16, height: 16 } }}
                  />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', color: '#374151', mb: 0.5 }}>
                    垂直偏移: {trafficLightOffset.y}px
                  </Typography>
                  <Slider
                    value={trafficLightOffset.y}
                    onChange={(_, v) => setTrafficLightOffset(prev => ({ ...prev, y: v as number }))}
                    min={-50}
                    max={150}
                    step={1}
                    valueLabelDisplay="auto"
                    sx={{ color: '#111827', '& .MuiSlider-thumb': { width: 16, height: 16 } }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={applyTrafficLightOffset}
                    disabled={savingTrafficLight}
                    sx={{
                      backgroundColor: '#111827',
                      '&:hover': { backgroundColor: '#1F2937' },
                      fontSize: '0.8rem',
                    }}
                  >
                    {savingTrafficLight ? '应用中...' : '应用位置'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={resetTrafficLightOffset}
                    sx={{
                      borderColor: '#E5E7EB',
                      color: '#6B7280',
                      fontSize: '0.8rem',
                      '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
                    }}
                  >
                    重置默认
                  </Button>
                </Box>

                {trafficLightMessage && (
                  <Alert
                    severity={trafficLightMessage.type}
                    sx={{ fontSize: '0.75rem', py: 0 }}
                    onClose={() => setTrafficLightMessage(null)}
                  >
                    {trafficLightMessage.text}
                  </Alert>
                )}

                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mt: 0.5 }}>
                  提示：此设置仅在 macOS 系统的 pywebview 环境中生效，重启应用后自动生效。
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default AboutTab;
