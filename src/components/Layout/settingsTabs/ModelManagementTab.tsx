import React, { useState, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, IconButton, FormControl,
  FormControlLabel, InputLabel, Select, MenuItem, Switch, Chip, List,
  ListItem, ListItemText, Tooltip, Dialog,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import type { AppSettings, ModelConfig } from '../../../contexts/AppSettingsContext';

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
};

export interface ModelManagementTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const ModelManagementTab: React.FC<ModelManagementTabProps> = ({ draft, setDraft }) => {
  const [modelDialogMode, setModelDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [modelForm, setModelForm] = useState<{
    id: string; name: string; provider: ModelConfig['provider'];
    apiEndpoint: string; apiKey: string; enabled: boolean;
    description: string; contextWindow: string; maxTokens: string;
  }>({
    id: '', name: '', provider: 'openai', apiEndpoint: '', apiKey: '',
    enabled: true, description: '', contextWindow: '', maxTokens: '',
  });
  const [modelFormErrors, setModelFormErrors] = useState<Record<string, string>>({});

  const openModelDialog = useCallback((mode: 'add' | 'edit', model?: ModelConfig) => {
    setModelDialogMode(mode);
    if (mode === 'edit' && model) {
      setEditingModel(model);
      setModelForm({
        id: model.id, name: model.name, provider: model.provider,
        apiEndpoint: model.apiEndpoint || '', apiKey: model.apiKey || '',
        enabled: model.enabled, description: model.description || '',
        contextWindow: model.contextWindow?.toString() || '',
        maxTokens: model.maxTokens?.toString() || '',
      });
    } else {
      setEditingModel(null);
      setModelForm({
        id: `model-${Date.now()}`, name: '', provider: 'openai',
        apiEndpoint: '', apiKey: '', enabled: true, description: '',
        contextWindow: '', maxTokens: '',
      });
    }
    setModelFormErrors({});
  }, []);

  const closeModelDialog = useCallback(() => {
    setModelDialogMode(null);
    setEditingModel(null);
    setModelFormErrors({});
  }, []);

  const handleSaveModel = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!modelForm.id.trim()) errs['model.id'] = 'ID 不能为空';
    else if (modelDialogMode === 'add' && draft.models.models.some(m => m.id === modelForm.id.trim())) errs['model.id'] = 'ID 已存在';
    if (!modelForm.name.trim()) errs['model.name'] = '名称不能为空';
    if (modelForm.contextWindow && isNaN(Number(modelForm.contextWindow))) errs['model.contextWindow'] = '必须是数字';
    if (modelForm.maxTokens && isNaN(Number(modelForm.maxTokens))) errs['model.maxTokens'] = '必须是数字';
    setModelFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const modelData: ModelConfig = {
      id: modelForm.id.trim(), name: modelForm.name.trim(), provider: modelForm.provider,
      enabled: modelForm.enabled,
      description: modelForm.description.trim() || undefined,
      contextWindow: modelForm.contextWindow ? Number(modelForm.contextWindow) : undefined,
      maxTokens: modelForm.maxTokens ? Number(modelForm.maxTokens) : undefined,
    };
    if (modelForm.apiEndpoint.trim()) modelData.apiEndpoint = modelForm.apiEndpoint.trim();
    if (modelForm.apiKey.trim()) modelData.apiKey = modelForm.apiKey.trim();

    if (modelDialogMode === 'edit' && editingModel) {
      setDraft(prev => ({
        ...prev,
        models: { ...prev.models, models: prev.models.models.map(m => m.id === editingModel.id ? { ...m, ...modelData, id: modelForm.id.trim() } : m) },
      }));
    } else {
      setDraft(prev => ({
        ...prev,
        models: { ...prev.models, models: [...prev.models.models, modelData] },
      }));
    }
    closeModelDialog();
  }, [modelForm, modelDialogMode, editingModel, draft.models.models, setDraft, closeModelDialog]);

  const handleDeleteModel = useCallback((modelId: string) => {
    if (!window.confirm('确定要删除此模型吗？')) return;
    setDraft(prev => {
      const newModels = prev.models.models.filter(m => m.id !== modelId);
      let newDefaultId = prev.models.defaultModelId;
      if (modelId === prev.models.defaultModelId && newModels.length > 0) {
        const first = newModels.find(m => m.enabled);
        newDefaultId = first ? first.id : newModels[0].id;
      }
      return { ...prev, models: { ...prev.models, models: newModels, defaultModelId: newDefaultId } };
    });
  }, [setDraft]);

  const handleSetDefaultModel = useCallback((modelId: string) => {
    setDraft(prev => ({
      ...prev,
      models: { ...prev.models, defaultModelId: modelId, models: prev.models.models.map(m => ({ ...m, isDefault: m.id === modelId })) },
    }));
  }, [setDraft]);

  const handleToggleModelEnabled = useCallback((modelId: string, enabled: boolean) => {
    setDraft(prev => ({
      ...prev,
      models: { ...prev.models, models: prev.models.models.map(m => m.id === modelId ? { ...m, enabled } : m) },
    }));
  }, [setDraft]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
          默认模型：
          <Chip
            label={draft.models.models.find(m => m.id === draft.models.defaultModelId)?.name || '未设置'}
            size="small"
            sx={{ ml: 0.5, backgroundColor: '#EFF6FF', color: '#1E40AF', fontSize: '0.7rem', height: 22 }}
          />
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => openModelDialog('add')}
          sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, fontSize: '0.7rem', py: 0.3 }}
        >
          添加
        </Button>
      </Box>

      <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #E5E7EB', p: 0 }}>
        {draft.models.models.length === 0 && (
          <ListItem><ListItemText primary={<Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', textAlign: 'center' }}>暂无模型配置</Typography>} /></ListItem>
        )}
        {draft.models.models.map(model => (
          <ListItem
            key={model.id}
            sx={{
              py: 1, px: 1.5, borderBottom: '1px solid #F3F4F6',
              backgroundColor: model.id === draft.models.defaultModelId ? '#F0FDF4' : 'transparent',
              '&:last-child': { borderBottom: 'none' },
            }}
            secondaryAction={
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {model.id !== draft.models.defaultModelId && (
                  <Tooltip title="设为默认">
                    <Button size="small" variant="outlined" onClick={() => handleSetDefaultModel(model.id)}
                      sx={{ borderColor: '#10B981', color: '#10B981', fontSize: '0.6rem', py: 0.1, minWidth: 32, '&:hover': { borderColor: '#059669' } }}>
                      默认
                    </Button>
                  </Tooltip>
                )}
                <Switch checked={model.enabled} onChange={e => handleToggleModelEnabled(model.id, e.target.checked)} size="small" sx={{ ...switchSx, '& .MuiSwitch-switchBase': { py: 0 } }} />
                <IconButton size="small" onClick={() => openModelDialog('edit', model)} sx={{ color: '#6B7280' }}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                <IconButton size="small" onClick={() => handleDeleteModel(model.id)} sx={{ color: '#EF4444' }}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
              </Box>
            }
          >
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#111827' }}>{model.name}</Typography>
                  {model.id === draft.models.defaultModelId && (
                    <Chip label="默认" size="small" sx={{ backgroundColor: '#10B981', color: '#FFF', fontSize: '0.6rem', height: 18 }} />
                  )}
                  <Chip label={model.provider} size="small" sx={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontSize: '0.6rem', height: 18 }} />
                  {!model.enabled && <Chip label="禁用" size="small" sx={{ backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.6rem', height: 18 }} />}
                </Box>
              }
              secondary={
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                  {model.description || model.id}
                  {model.contextWindow ? ` · ${model.contextWindow.toLocaleString()} ctx` : ''}
                  {model.maxTokens ? ` · ${model.maxTokens.toLocaleString()} out` : ''}
                </Typography>
              }
            />
          </ListItem>
        ))}
      </List>

      {/* Model add/edit dialog */}
      {modelDialogMode && (
        <Dialog open onClose={closeModelDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>
              {modelDialogMode === 'add' ? '添加模型' : '编辑模型'}
            </Typography>
            <TextField label="模型 ID" value={modelForm.id} onChange={e => setModelForm(p => ({ ...p, id: e.target.value }))}
              error={!!modelFormErrors['model.id']} helperText={modelFormErrors['model.id']}
              disabled={modelDialogMode === 'edit'} fullWidth size="small" sx={textFieldSx} />
            <TextField label="模型名称" value={modelForm.name} onChange={e => setModelForm(p => ({ ...p, name: e.target.value }))}
              error={!!modelFormErrors['model.name']} helperText={modelFormErrors['model.name']}
              fullWidth size="small" sx={textFieldSx} />
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.8125rem' }}>提供商</InputLabel>
              <Select value={modelForm.provider} label="提供商" onChange={e => setModelForm(p => ({ ...p, provider: e.target.value as ModelConfig['provider'] }))}>
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="anthropic">Anthropic</MenuItem>
                <MenuItem value="tencent">腾讯</MenuItem>
                <MenuItem value="custom">自定义</MenuItem>
              </Select>
            </FormControl>
            {modelForm.provider === 'custom' && (
              <TextField label="API 端点" value={modelForm.apiEndpoint} onChange={e => setModelForm(p => ({ ...p, apiEndpoint: e.target.value }))}
                fullWidth size="small" placeholder="https://api.example.com/v1" sx={textFieldSx} />
            )}
            <TextField label="API Key（可选）" value={modelForm.apiKey} onChange={e => setModelForm(p => ({ ...p, apiKey: e.target.value }))}
              fullWidth size="small" type="password" sx={textFieldSx} />
            <TextField label="描述" value={modelForm.description} onChange={e => setModelForm(p => ({ ...p, description: e.target.value }))}
              fullWidth size="small" multiline rows={2} sx={textFieldSx} />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField label="上下文窗口" value={modelForm.contextWindow} onChange={e => setModelForm(p => ({ ...p, contextWindow: e.target.value }))}
                error={!!modelFormErrors['model.contextWindow']} helperText={modelFormErrors['model.contextWindow']}
                size="small" type="number" sx={{ ...textFieldSx, flex: 1 }} />
              <TextField label="最大输出" value={modelForm.maxTokens} onChange={e => setModelForm(p => ({ ...p, maxTokens: e.target.value }))}
                error={!!modelFormErrors['model.maxTokens']} helperText={modelFormErrors['model.maxTokens']}
                size="small" type="number" sx={{ ...textFieldSx, flex: 1 }} />
            </Box>
            <FormControlLabel control={<Switch checked={modelForm.enabled} onChange={e => setModelForm(p => ({ ...p, enabled: e.target.checked }))} size="small" sx={switchSx} />}
              label={<Typography sx={{ fontSize: '0.8rem' }}>启用此模型</Typography>} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
              <Button variant="outlined" onClick={closeModelDialog} size="small" sx={{ fontSize: '0.8rem' }}>取消</Button>
              <Button variant="contained" onClick={handleSaveModel} size="small" sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, fontSize: '0.8rem' }}>保存</Button>
            </Box>
          </Box>
        </Dialog>
      )}
    </Box>
  );
};

export default ModelManagementTab;
