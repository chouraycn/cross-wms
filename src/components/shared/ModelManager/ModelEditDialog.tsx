/**
 * ModelEditDialog — 分步添加模型 Step 2：补全信息
 *
 * 在 Step 1 选择了预设模型后，进入此页面补全 API Key 等信息。
 * 编辑模式下直接使用此组件（不分步）。
 *
 * 设计原则：
 * - 左侧导航栏：分步骤指示，快速跳转
 * - 右侧内容区：按步骤分组，信息层级清晰
 * - 高级设置默认折叠，点击展开
 * - 未设置的属性使用推荐默认值
 */

import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Switch, FormControlLabel, IconButton, Dialog,
  Slider, InputAdornment, Chip, List, ListItemButton, ListItemText,
  Select, MenuItem, FormControl, Divider, useTheme,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import KeyIcon from '@mui/icons-material/Key';
import TuneIcon from '@mui/icons-material/Tune';
import ScienceIcon from '@mui/icons-material/Science';
import { providerLabel, providerIcon } from '../../../utils/providerIcons';
import { PROVIDER_API_KEY_URLS } from '../../../utils/providerApiKeyUrls';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../../types/models';
import { getModelManagerStyles } from './styles';
import type { ModelEditDialogProps, ModelFormState } from './types';
import { SpinningIcon } from '../SpinningIcon';

/** pywebview 环境下用系统浏览器打开 URL */
function openInSystemBrowser(url: string): void {
  if ((window as any).pywebview?.api?.open_in_browser) {
    (window as any).pywebview.api.open_in_browser(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** 导航步骤定义 */
const STEPS = [
  { id: 'basic', label: '基础配置', icon: <SettingsIcon sx={{ fontSize: 16 }} /> },
  { id: 'keys', label: 'API Key', icon: <KeyIcon sx={{ fontSize: 16 }} /> },
  { id: 'advanced', label: '高级参数', icon: <TuneIcon sx={{ fontSize: 16 }} /> },
  { id: 'test', label: '连接测试', icon: <ScienceIcon sx={{ fontSize: 16 }} /> },
] as const;

type StepId = typeof STEPS[number]['id'];

// ====== 基础配置区域 ======
const BasicSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  isAddMode: boolean;
  isCustomMode: boolean;
  modelDialogMode: 'add' | 'edit' | null;
  modelFormErrors: Record<string, string>;
  styles: ReturnType<typeof getModelManagerStyles>;
  /** "获取 Key"按钮点击回调，关闭对话框并跳转到帮助页 */
  onGetApiKey?: () => void;
}> = ({ modelForm, setModelForm, isAddMode, isCustomMode, modelDialogMode, modelFormErrors, styles, onGetApiKey }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    {/* 模型概览卡片（添加模式只读展示） */}
    {isAddMode && !isCustomMode && (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          borderRadius: 2,
          backgroundColor: styles.bgHover,
          border: `1px solid ${styles.border}`,
        }}
      >
        {providerIcon(modelForm.provider, 28)}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: styles.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {modelForm.name || modelForm.id}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>
            {providerLabel(modelForm.provider)} · {modelForm.id}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {(modelForm.capabilities || []).slice(0, 3).map(cap => (
            <Chip
              key={cap}
              label={CAPABILITY_LABELS[cap as ModelCapability]}
              size="small"
              sx={{
                fontSize: '0.625rem',
                height: 20,
                backgroundColor: `${CAPABILITY_COLORS[cap as ModelCapability]}15`,
                color: CAPABILITY_COLORS[cap as ModelCapability],
              }}
            />
          ))}
        </Box>
      </Box>
    )}

    {/* 提供商信息（编辑模式/自定义模式） */}
    {(modelDialogMode === 'edit' || isCustomMode) && (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          borderRadius: 1.5,
          backgroundColor: styles.bgHover,
        }}
      >
        {providerIcon(modelForm.provider, 20)}
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textPrimary }}>
          {providerLabel(modelForm.provider)}
        </Typography>
      </Box>
    )}

    {/* 模型 ID（自定义模式可编辑） */}
    {isCustomMode && (
      <TextField
        label="模型 ID"
        value={modelForm.id}
        onChange={e => setModelForm(p => ({ ...p, id: e.target.value }))}
        error={!!modelFormErrors['model.id']}
        helperText={modelFormErrors['model.id'] || '输入模型标识符，如 gpt-4o'}
        fullWidth
        size="small"
        sx={styles.input}
      />
    )}

    {/* 模型名称（自定义模式可编辑） */}
    {isCustomMode && (
      <TextField
        label="模型名称（显示用）"
        value={modelForm.name}
        onChange={e => setModelForm(p => ({ ...p, name: e.target.value }))}
        error={!!modelFormErrors['model.name']}
        helperText={modelFormErrors['model.name'] || '留空则使用模型 ID'}
        fullWidth
        size="small"
        sx={styles.input}
      />
    )}

    {/* API 端点 */}
    <TextField
      label="API 端点"
      value={modelForm.apiEndpoint}
      onChange={e => setModelForm(p => ({ ...p, apiEndpoint: e.target.value }))}
      fullWidth
      size="small"
      placeholder="https://api.example.com/v1"
      helperText={
        PROVIDER_API_KEY_URLS[modelForm.provider] ? (
          <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>{!isCustomMode ? '已根据提供商自动填充，可按需修改' : '请输入自定义 API 端点地址'}</span>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                if (onGetApiKey) {
                  onGetApiKey();
                } else {
                  // fallback: 直接打开 URL（兼容未传 navigate 的场景）
                  const url = PROVIDER_API_KEY_URLS[modelForm.provider];
                  if (url) openInSystemBrowser(url);
                }
              }}
              sx={{
                fontSize: '0.7rem',
                textTransform: 'none',
                color: styles.textMuted,
                p: 0,
                minWidth: 'auto',
                fontWeight: 400,
                flexShrink: 0,
                ml: 1,
                '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline', color: styles.textSecondary },
              }}
            >
              获取 {providerLabel(modelForm.provider)} Key →
            </Button>
          </Box>
        ) : (!isCustomMode ? '已根据提供商自动填充，可按需修改' : '请输入自定义 API 端点地址')
      }
      sx={styles.input}
    />

    {/* 描述 */}
    <TextField
      label="描述（可选）"
      value={modelForm.description}
      onChange={e => setModelForm(p => ({ ...p, description: e.target.value }))}
      fullWidth
      size="small"
      multiline
      rows={2}
      placeholder="简要描述模型的特点和适用场景"
      sx={styles.input}
    />

    {/* 能力标签 */}
    <Box>
      <Typography sx={{ fontSize: '0.8125rem', color: styles.textSecondary, mb: 0.75 }}>
        能力标签
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {(['code', 'longContext', 'reasoning', 'multimodal', 'fast', 'costEffective', 'general'] as ModelCapability[]).map(cap => {
          const selected = modelForm.capabilities?.includes(cap);
          return (
            <Chip
              key={cap}
              label={CAPABILITY_LABELS[cap]}
              size="small"
              onClick={() => {
                setModelForm(p => ({
                  ...p,
                  capabilities: selected
                    ? (p.capabilities || []).filter(c => c !== cap)
                    : [...(p.capabilities || []), cap],
                }));
              }}
              sx={{
                fontSize: '0.75rem',
                height: 28,
                cursor: 'pointer',
                backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}20` : styles.bgHover,
                color: selected ? CAPABILITY_COLORS[cap] : styles.textMuted,
                border: selected ? `1px solid ${CAPABILITY_COLORS[cap]}50` : '1px solid transparent',
                fontWeight: selected ? 600 : 400,
                '&:hover': {
                  backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}30` : styles.border,
                },
              }}
            />
          );
        })}
      </Box>
    </Box>

    {/* 启用开关 */}
    <FormControlLabel
      control={
        <Switch
          checked={modelForm.enabled}
          onChange={e => setModelForm(p => ({ ...p, enabled: e.target.checked }))}
          size="small"
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': { color: styles.textPrimary },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: styles.textPrimary },
          }}
        />
      }
      label={<Typography sx={{ fontSize: '0.8rem' }}>启用此模型</Typography>}
    />
  </Box>
);

// ====== API Key 区域 ======
const KeysSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  showApiKey: boolean;
  toggleApiKeyVisibility: () => void;
  styles: ReturnType<typeof getModelManagerStyles>;
  /** "获取 Key"按钮点击回调 */
  onGetApiKey?: () => void;
}> = ({ modelForm, setModelForm, showApiKey, toggleApiKeyVisibility, styles, onGetApiKey }) => {
  const isLocalProvider = modelForm.provider === 'ollama'
    || (modelForm.apiEndpoint || '').includes('localhost')
    || (modelForm.apiEndpoint || '').includes('127.0.0.1');

  // v1.9.3: 检查是否已保存过 Key（有 apiKeyRef 且当前未输入新 Key）
  const hasSavedKey = !!modelForm.apiKeyRef && !modelForm.apiKey.trim();

  return (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    {/* 本地模型提示 */}
    {isLocalProvider && (
      <Box sx={{
        px: 1.5, py: 1, borderRadius: 1,
        bgcolor: '#F0FDF4', border: '1px solid #BBF7D0',
        fontSize: '0.8125rem', color: '#166534',
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <span>🔒</span>
        <span>本地模型（Ollama）无需 API Key，可直接跳过此步骤。</span>
      </Box>
    )}
    {/* 已保存 Key 提示 */}
    {hasSavedKey && (
      <Box sx={{
        px: 1.5, py: 1, borderRadius: 1,
        bgcolor: '#EFF6FF', border: '1px solid #BFDBFE',
        fontSize: '0.8125rem', color: '#1E40AF',
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <span>✓</span>
        <span>已保存 API Key（出于安全考虑不显示）。如需更换请输入新 Key，留空则保留现有 Key。</span>
      </Box>
    )}
    {/* 单 Key 输入 */}
    <Box>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textSecondary, mb: 0.75 }}>
        主 API Key
      </Typography>
      <TextField
        label="API Key（可选，留空则使用环境变量）"
        value={modelForm.apiKey}
        onChange={e => setModelForm(p => ({ ...p, apiKey: e.target.value }))}
        fullWidth
        size="small"
        type={showApiKey ? 'text' : 'password'}
        sx={styles.input}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={toggleApiKeyVisibility}
                edge="end"
                sx={{ color: styles.textMuted }}
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      {PROVIDER_API_KEY_URLS[modelForm.provider] && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              if (onGetApiKey) {
                onGetApiKey();
              } else {
                const url = PROVIDER_API_KEY_URLS[modelForm.provider];
                if (url) openInSystemBrowser(url);
              }
            }}
            sx={{
              fontSize: '0.7rem',
              textTransform: 'none',
              color: styles.textMuted,
              p: 0,
              minWidth: 'auto',
              fontWeight: 400,
              '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline', color: styles.textSecondary },
            }}
          >
            获取 {providerLabel(modelForm.provider)} API Key →
          </Button>
        </Box>
      )}
    </Box>

    <Divider sx={{ my: 0.5 }} />

    {/* 多 Key 管理 */}
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textSecondary }}>
          多 Key 轮询管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select
              value={modelForm.keyStrategy}
              onChange={e => setModelForm(p => ({ ...p, keyStrategy: e.target.value as 'round-robin' | 'random' | 'failover' }))}
              sx={{ fontSize: '0.75rem', height: 28 }}
            >
              <MenuItem value="round-robin" sx={{ fontSize: '0.75rem' }}>轮询</MenuItem>
              <MenuItem value="random" sx={{ fontSize: '0.75rem' }}>随机</MenuItem>
              <MenuItem value="failover" sx={{ fontSize: '0.75rem' }}>故障转移</MenuItem>
            </Select>
          </FormControl>
          <Button
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => setModelForm(p => ({
              ...p,
              apiKeys: [...p.apiKeys, { label: `Key ${p.apiKeys.length + 1}`, key: '', enabled: true, _uid: `${Date.now()}-${p.apiKeys.length}` }],
            }))}
            sx={{ fontSize: '0.7rem', textTransform: 'none', minWidth: 'auto', px: 1 }}
          >
            添加
          </Button>
        </Box>
      </Box>

      {modelForm.apiKeys.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {modelForm.apiKeys.map((entry, index) => (
            <Box
              key={entry._uid || index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 0.75,
                borderRadius: 1.5,
                backgroundColor: entry.enabled ? styles.bgHover : styles.bgPanel,
                border: `1px solid ${entry.enabled ? styles.borderLight : styles.border}`,
                opacity: entry.enabled ? 1 : 0.6,
              }}
            >
              <TextField
                placeholder="标识"
                value={entry.label}
                onChange={e => {
                  const newKeys = [...modelForm.apiKeys];
                  newKeys[index] = { ...entry, label: e.target.value };
                  setModelForm(p => ({ ...p, apiKeys: newKeys }));
                }}
                size="small"
                sx={{ ...styles.input, width: 90, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
              />
              <TextField
                placeholder="API Key"
                value={entry.key}
                onChange={e => {
                  const newKeys = [...modelForm.apiKeys];
                  newKeys[index] = { ...entry, key: e.target.value };
                  setModelForm(p => ({ ...p, apiKeys: newKeys }));
                }}
                size="small"
                type={showApiKey ? 'text' : 'password'}
                sx={{ ...styles.input, flex: 1, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
              />
              <Switch
                checked={entry.enabled}
                onChange={e => {
                  const newKeys = [...modelForm.apiKeys];
                  newKeys[index] = { ...entry, enabled: e.target.checked };
                  setModelForm(p => ({ ...p, apiKeys: newKeys }));
                }}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: styles.textPrimary },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: styles.textPrimary },
                }}
              />
              <IconButton
                size="small"
                onClick={() => {
                  const newKeys = modelForm.apiKeys.filter((_, i) => i !== index);
                  setModelForm(p => ({ ...p, apiKeys: newKeys }));
                }}
                sx={{ color: styles.textSecondary, p: 0.25 }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ p: 2, textAlign: 'center', backgroundColor: styles.bgHover, borderRadius: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: styles.textDisabled }}>
            暂无多 Key 配置，点击"添加"按钮配置轮询 Key
          </Typography>
        </Box>
      )}
    </Box>
  </Box>
  );
};

// ====== 高级参数区域 ======
const AdvancedSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  modelFormErrors: Record<string, string>;
  styles: ReturnType<typeof getModelManagerStyles>;
}> = ({ modelForm, setModelForm, modelFormErrors, styles }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <TextField
        label="上下文窗口 (tokens)"
        value={modelForm.contextWindow}
        onChange={e => setModelForm(p => ({ ...p, contextWindow: e.target.value }))}
        error={!!modelFormErrors['model.contextWindow']}
        helperText={modelFormErrors['model.contextWindow'] || '留空使用默认值'}
        size="small"
        type="number"
        placeholder="如 128000"
        sx={{ ...styles.input, flex: 1 }}
      />
      <TextField
        label="最大输出 (tokens)"
        value={modelForm.maxTokens}
        onChange={e => setModelForm(p => ({ ...p, maxTokens: e.target.value }))}
        error={!!modelFormErrors['model.maxTokens']}
        helperText={modelFormErrors['model.maxTokens'] || '留空使用默认值'}
        size="small"
        type="number"
        placeholder="如 4096"
        sx={{ ...styles.input, flex: 1 }}
      />
    </Box>

    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={styles.label}>Temperature</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted, minWidth: 32, textAlign: 'right' }}>{modelForm.temperature || '1'}</Typography>
      </Box>
      <Slider
        value={Number(modelForm.temperature) || 1}
        onChange={(_e, value) => setModelForm(p => ({ ...p, temperature: String(value) }))}
        min={0}
        max={2}
        step={0.1}
        size="small"
        valueLabelDisplay="auto"
        valueLabelFormat={v => Number(v).toFixed(1)}
        sx={{
          color: styles.textPrimary,
          '& .MuiSlider-thumb': { width: 14, height: 14 },
          '& .MuiSlider-valueLabel': { fontSize: '0.7rem' },
        }}
      />
      {modelFormErrors['model.temperature'] && (
        <Typography sx={{ fontSize: '0.7rem', color: styles.textSecondary, mt: -0.5 }}>
          {modelFormErrors['model.temperature']}
        </Typography>
      )}
    </Box>

    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={styles.label}>Top P</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted, minWidth: 32, textAlign: 'right' }}>{modelForm.topP || '1'}</Typography>
      </Box>
      <Slider
        value={Number(modelForm.topP) || 1}
        onChange={(_e, value) => setModelForm(p => ({ ...p, topP: String(value) }))}
        min={0}
        max={1}
        step={0.05}
        size="small"
        valueLabelDisplay="auto"
        valueLabelFormat={v => Number(v).toFixed(2)}
        sx={{
          color: styles.textPrimary,
          '& .MuiSlider-thumb': { width: 14, height: 14 },
          '& .MuiSlider-valueLabel': { fontSize: '0.7rem' },
        }}
      />
      {modelFormErrors['model.topP'] && (
        <Typography sx={{ fontSize: '0.7rem', color: styles.textSecondary, mt: -0.5 }}>
          {modelFormErrors['model.topP']}
        </Typography>
      )}
    </Box>
  </Box>
);

// ====== 测试连接区域 ======
const TestSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testMessage: string;
  testModelValid: boolean;
  testAvailableModels: string[];
  handleTestApi: () => void;
  styles: ReturnType<typeof getModelManagerStyles>;
}> = ({ modelForm, setModelForm, testStatus, testMessage, testModelValid, testAvailableModels, handleTestApi, styles }) => {
  const handleSelectTestModel = useCallback((modelId: string) => {
    setModelForm(p => ({
      ...p,
      id: modelId,
      name: p.name || modelId,
    }));
  }, [setModelForm]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textSecondary }}>
          连接测试
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={testStatus === 'testing' ? <SpinningIcon spinning={testStatus === 'testing'}><AutorenewIcon sx={{ fontSize: 14 }} /></SpinningIcon> : null}
          onClick={handleTestApi}
          disabled={testStatus === 'testing'}
          sx={{
            fontSize: '0.75rem',
            borderColor: styles.borderDarker,
            color: styles.textMuted,
            '&:hover': { borderColor: styles.border },
          }}
        >
          {testStatus === 'testing' ? '测试中...' : '测试连接'}
        </Button>
      </Box>

      {testMessage && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0.75,
            p: 1,
            borderRadius: 1.5,
            backgroundColor: testStatus === 'success'
              ? testModelValid ? '#F0FDF4' : '#FFFBEB'
              : '#FEF2F2',
            border: `1px solid ${
              testStatus === 'success'
                ? testModelValid ? '#BBF7D0' : '#FDE68A'
                : '#FECACA'
            }`,
          }}
        >
          {testStatus === 'success' ? (
            testModelValid ? (
              <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#16A34A', flexShrink: 0, mt: 0.25 }} />
            ) : (
              <ErrorOutlineIcon sx={{ fontSize: 18, color: '#D97706', flexShrink: 0, mt: 0.25 }} />
            )
          ) : (
            <ErrorOutlineIcon sx={{ fontSize: 18, color: '#DC2626', flexShrink: 0, mt: 0.25 }} />
          )}
          <Typography sx={{
            fontSize: '0.75rem',
            color: testStatus === 'success'
              ? testModelValid ? '#166534' : '#92400E'
              : '#991B1B',
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
          }}>
            {testMessage}
          </Typography>
        </Box>
      )}

      {testAvailableModels.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted, mb: 0.5 }}>
            可用模型列表（点击选择作为模型 ID）：
          </Typography>
          <Box
            sx={{
              maxHeight: 160,
              overflow: 'auto',
              border: `1px solid ${styles.borderLight}`,
              borderRadius: 1.5,
              backgroundColor: styles.bgHover,
            }}
          >
            <List dense sx={{ py: 0 }}>
              {testAvailableModels.map(modelId => (
                <ListItemButton
                  key={modelId}
                  onClick={() => handleSelectTestModel(modelId)}
                  selected={modelForm.id === modelId}
                  sx={{
                    py: 0.5,
                    '&.Mui-selected': {
                      backgroundColor: styles.bgActive,
                      '&:hover': { backgroundColor: styles.bgActive },
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {modelId}
                      </Typography>
                    }
                  />
                  {modelForm.id === modelId && (
                    <CheckCircleOutlineIcon sx={{ fontSize: 16, color: styles.textSecondary }} />
                  )}
                </ListItemButton>
              ))}
            </List>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// ====== 主组件 ======
const ModelEditDialog: React.FC<ModelEditDialogProps> = ({ state, actions, navigate }) => {
  const {
    modelForm, modelFormErrors, modelDialogMode,
    testStatus, testMessage, showApiKey,
    testAvailableModels, testModelValid,
  } = state;
  const { closeModelDialog, setModelForm, handleSaveModel, handleTestApi, toggleApiKeyVisibility } = actions;

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const styles = getModelManagerStyles(isDark);

  // 当前步骤
  const [activeStep, setActiveStep] = useState<StepId>('basic');

  /** "获取 Key"回调：关闭对话框并跳转到帮助页 */
  const handleGetApiKey = useCallback(() => {
    const provider = modelForm.provider;
    closeModelDialog();
    if (navigate) {
      navigate(`/api-key-help/${provider}`);
    } else {
      // fallback: 直接打开 URL
      const url = PROVIDER_API_KEY_URLS[provider];
      if (url) openInSystemBrowser(url);
    }
  }, [modelForm.provider, closeModelDialog, navigate]);

  if (!modelDialogMode) return null;

  const isAddMode = modelDialogMode === 'add';
  const isCustomMode = modelForm.provider === 'custom';

  return (
    <Dialog
      open
      onClose={closeModelDialog}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      <Box sx={{ display: 'flex', height: '80vh', maxHeight: 700 }}>
        {/* ====== 左侧导航栏 ====== */}
        <Box
          sx={{
            width: 180,
            backgroundColor: styles.bgHover,
            borderRight: `1px solid ${styles.borderLight}`,
            display: 'flex',
            flexDirection: 'column',
            p: 2,
            gap: 0.5,
          }}
        >
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: styles.textPrimary, mb: 1.5 }}>
            {modelDialogMode === 'add' ? '补全模型信息' : '编辑模型'}
          </Typography>

          {STEPS.map((step) => (
            <Box
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                borderRadius: 1.5,
                cursor: 'pointer',
                backgroundColor: activeStep === step.id ? styles.bgActive : 'transparent',
                color: activeStep === step.id ? styles.textPrimary : styles.textSecondary,
                '&:hover': {
                  backgroundColor: activeStep === step.id ? styles.bgActive : styles.bgHover,
                },
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: activeStep === step.id ? styles.textPrimary : styles.border,
                  color: activeStep === step.id ? '#fff' : styles.textMuted,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}
              >
                {step.icon}
              </Box>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: activeStep === step.id ? 600 : 400 }}>
                {step.label}
              </Typography>
            </Box>
          ))}

          <Box sx={{ flex: 1 }} />

          {/* 底部操作按钮 */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 2, borderTop: `1px solid ${styles.borderLight}` }}>
            <Button
              variant="contained"
              onClick={handleSaveModel}
              size="small"
              fullWidth
              sx={{ ...styles.primaryButton, fontSize: '0.8rem' }}
            >
              保存
            </Button>
            <Button
              variant="outlined"
              onClick={closeModelDialog}
              size="small"
              fullWidth
              sx={{ fontSize: '0.8rem', color: styles.textSecondary, borderColor: styles.borderDarker }}
            >
              取消
            </Button>
          </Box>
        </Box>

        {/* ====== 右侧内容区 ====== */}
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          {activeStep === 'basic' && (
            <BasicSection
              modelForm={modelForm}
              setModelForm={setModelForm}
              isAddMode={isAddMode}
              isCustomMode={isCustomMode}
              modelDialogMode={modelDialogMode}
              modelFormErrors={modelFormErrors}
              styles={styles}
              onGetApiKey={handleGetApiKey}
            />
          )}
          {activeStep === 'keys' && (
            <KeysSection
              modelForm={modelForm}
              setModelForm={setModelForm}
              showApiKey={showApiKey}
              toggleApiKeyVisibility={toggleApiKeyVisibility}
              styles={styles}
              onGetApiKey={handleGetApiKey}
            />
          )}
          {activeStep === 'advanced' && (
            <AdvancedSection
              modelForm={modelForm}
              setModelForm={setModelForm}
              modelFormErrors={modelFormErrors}
              styles={styles}
            />
          )}
          {activeStep === 'test' && (
            <TestSection
              modelForm={modelForm}
              setModelForm={setModelForm}
              testStatus={testStatus}
              testMessage={testMessage}
              testModelValid={testModelValid}
              testAvailableModels={testAvailableModels}
              handleTestApi={handleTestApi}
              styles={styles}
            />
          )}
        </Box>
      </Box>
    </Dialog>
  );
};

export default ModelEditDialog;
