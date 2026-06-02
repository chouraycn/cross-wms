/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  IconButton,
  Chip,
  Card,
  CardContent,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import type { AppSettings, ModelConfig } from '../../../contexts/AppSettingsContext';
import { textFieldSx } from '../sharedStyles';

// ===================== Types =====================

export interface ModelManagementSectionProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// ===================== Helper =====================

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  tencent: '腾讯',
  custom: '自定义',
};

// ===================== Component =====================

const ModelManagementSection: React.FC<ModelManagementSectionProps> = ({
  draft,
  setDraft,
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

  // ---- Render ----

  return (
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
                    label={PROVIDER_LABELS[model.provider] || model.provider}
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
  );
};

export default ModelManagementSection;
