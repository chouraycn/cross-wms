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
import LanguageIcon from '@mui/icons-material/Language';
import ImageIcon from '@mui/icons-material/Image';
import BuildIcon from '@mui/icons-material/Build';
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
  { id: 'api', label: 'API 适配', icon: <LanguageIcon sx={{ fontSize: 16 }} /> },
  { id: 'compat', label: '兼容性', icon: <BuildIcon sx={{ fontSize: 16 }} /> },
  { id: 'media', label: '媒体输入', icon: <ImageIcon sx={{ fontSize: 16 }} /> },
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

  // Secret 引用方式
  const SECRET_REF_OPTIONS = [
    { value: 'direct', label: '明文输入', desc: '直接输入 API Key（默认）', icon: '🔑' },
    { value: 'keychain', label: '系统钥匙串', desc: 'macOS Keychain 安全存储', icon: '🔒' },
    { value: 'env', label: '环境变量', desc: '从环境变量读取', icon: '📦' },
    { value: 'file', label: '文件引用', desc: '从文件路径读取', icon: '📄' },
  ];

  // 检测当前引用方式
  const getCurrentRefMode = (): string => {
    if (modelForm.apiKeyRef?.startsWith('keychain:')) return 'keychain';
    if (modelForm.apiKeyRef?.startsWith('env:')) return 'env';
    if (modelForm.apiKeyRef?.startsWith('file:')) return 'file';
    if (modelForm.apiKeyRef?.startsWith('encrypted:')) return 'encrypted';
    return 'direct';
  };

  const currentRefMode = getCurrentRefMode();

  const handleRefModeChange = (mode: string) => {
    if (mode === 'direct') {
      setModelForm(p => ({ ...p, apiKeyRef: '' }));
    } else if (mode === 'keychain') {
      setModelForm(p => ({ ...p, apiKeyRef: 'keychain:', apiKey: '' }));
    } else if (mode === 'env') {
      // 预填常见变量名提示
      setModelForm(p => ({ ...p, apiKeyRef: 'env:OPENAI_API_KEY', apiKey: '' }));
    } else if (mode === 'file') {
      setModelForm(p => ({ ...p, apiKeyRef: 'file:~/.secrets/api-key.txt', apiKey: '' }));
    }
  };

  // 提取环境变量名或文件路径
  const getRefValue = (): string => {
    if (modelForm.apiKeyRef?.startsWith('env:')) {
      return modelForm.apiKeyRef.slice(4);
    }
    if (modelForm.apiKeyRef?.startsWith('file:')) {
      return modelForm.apiKeyRef.slice(5);
    }
    return '';
  };

  const handleRefValueChange = (value: string) => {
    if (modelForm.apiKeyRef?.startsWith('env:')) {
      setModelForm(p => ({ ...p, apiKeyRef: `env:${value}` }));
    } else if (modelForm.apiKeyRef?.startsWith('file:')) {
      setModelForm(p => ({ ...p, apiKeyRef: `file:${value}` }));
    }
  };

  const refValue = getRefValue();
  const isRefMode = currentRefMode === 'env' || currentRefMode === 'file' || currentRefMode === 'keychain';

  return (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    {/* 本地模型提示 */}
    {isLocalProvider && (
      <Box sx={{
        px: 1.5, py: 1, borderRadius: 1,
        bgcolor: styles.semantic.successBg, border: `1px solid ${styles.semantic.successBorder}`,
        fontSize: '0.8125rem', color: styles.semantic.successText,
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
        bgcolor: styles.semantic.infoBg, border: `1px solid ${styles.semantic.infoBorder}`,
        fontSize: '0.8125rem', color: styles.semantic.infoText,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <span>✓</span>
        <span>已保存 API Key（出于安全考虑不显示）。如需更换请输入新 Key，留空则保留现有 Key。</span>
      </Box>
    )}

    {/* Secret 引用方式选择 */}
    <Box>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textSecondary, mb: 0.75 }}>
        Secret 引用方式
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75 }}>
        {SECRET_REF_OPTIONS.map(opt => {
          const selected = currentRefMode === opt.value;
          return (
            <Box
              key={opt.value}
              onClick={() => handleRefModeChange(opt.value)}
              sx={{
                p: 1,
                borderRadius: 1.5,
                border: `1px solid ${selected ? styles.textPrimary : styles.borderLight}`,
                backgroundColor: selected ? `${styles.textPrimary}10` : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': {
                  backgroundColor: selected ? `${styles.textPrimary}15` : styles.bgHover,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: '1rem' }}>{opt.icon}</Typography>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: styles.textPrimary }}>
                    {opt.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.625rem', color: styles.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {opt.desc}
                  </Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>

    {/* 直接输入模式 */}
    {currentRefMode === 'direct' && (
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
    )}

    {/* 环境变量模式 */}
    {currentRefMode === 'env' && (
      <Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textSecondary, mb: 0.75 }}>
          环境变量名
        </Typography>
        <TextField
          label="环境变量名称"
          value={refValue}
          onChange={e => handleRefValueChange(e.target.value)}
          fullWidth
          size="small"
          placeholder="如 OPENAI_API_KEY"
          sx={styles.input}
          InputProps={{
            startAdornment: <InputAdornment position="start">env:</InputAdornment>,
          }}
        />
        <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted, mt: 0.5 }}>
          启动应用时从系统环境变量读取 Key 值
        </Typography>
      </Box>
    )}

    {/* 文件引用模式 */}
    {currentRefMode === 'file' && (
      <Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: styles.textSecondary, mb: 0.75 }}>
          Key 文件路径
        </Typography>
        <TextField
          label="文件路径"
          value={refValue}
          onChange={e => handleRefValueChange(e.target.value)}
          fullWidth
          size="small"
          placeholder="如 /Users/me/.secrets/api-key.txt"
          sx={styles.input}
          InputProps={{
            startAdornment: <InputAdornment position="start">file:</InputAdornment>,
          }}
        />
        <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted, mt: 0.5 }}>
          从指定文件读取纯文本 Key，建议设置文件权限为 600
        </Typography>
      </Box>
    )}

    {/* Keychain 模式提示 */}
    {currentRefMode === 'keychain' && (
      <Box sx={{
        p: 1.5, borderRadius: 1.5,
        bgcolor: styles.semantic.infoBg,
        border: `1px solid ${styles.semantic.infoBorder}`,
      }}>
        <Typography sx={{ fontSize: '0.75rem', color: styles.semantic.infoText, lineHeight: 1.6 }}>
          🔒 <strong>系统钥匙串</strong><br/>
          API Key 将安全存储在 macOS Keychain 中。<br/>
          保存模型时自动写入 Keychain，读取时自动从 Keychain 获取。
        </Typography>
      </Box>
    )}

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
}> = ({ modelForm, setModelForm, modelFormErrors, styles }) => {
  const THINKING_OPTIONS = ['off', 'low', 'medium', 'high'];
  const AUTH_MODE_OPTIONS = [
    { value: 'api-key', label: 'API Key (默认)' },
    { value: 'token', label: 'Bearer Token' },
    { value: 'oauth', label: 'OAuth 2.0' },
    { value: 'aws-sdk', label: 'AWS SDK' },
    { value: 'none', label: '无需认证' },
  ];

  return (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <TextField
        label="上下文窗口 (tokens)"
        value={modelForm.contextWindow}
        onChange={e => setModelForm(p => ({ ...p, contextWindow: e.target.value }))}
        error={!!modelFormErrors['model.contextWindow']}
        helperText={modelFormErrors['model.contextWindow'] || '厂商标称的最大上下文'}
        size="small"
        type="number"
        placeholder="如 128000"
        sx={{ ...styles.input, flex: 1 }}
      />
      <TextField
        label="有效上下文上限 (tokens)"
        value={modelForm.contextTokens}
        onChange={e => setModelForm(p => ({ ...p, contextTokens: e.target.value }))}
        size="small"
        type="number"
        placeholder="如 100000"
        helperText="运行时实际使用上限，留空=同上下文窗口"
        sx={{ ...styles.input, flex: 1 }}
      />
    </Box>
    <Box sx={{ display: 'flex', gap: 1.5 }}>
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
      <FormControl size="small" sx={{ ...styles.input, flex: 1 }}>
        <Typography sx={{ ...styles.label, mb: 0.5 }}>认证模式</Typography>
        <Select
          value={modelForm.authMode}
          onChange={e => setModelForm(p => ({ ...p, authMode: e.target.value as ModelFormState['authMode'] }))}
          size="small"
        >
          {AUTH_MODE_OPTIONS.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
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

    <Divider sx={{ my: 0.5 }} />

    <Box>
      <Typography sx={{ ...styles.label, mb: 0.75, fontWeight: 600 }}>思考功能</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
        {THINKING_OPTIONS.map(level => {
          const selected = modelForm.thinkingLevels.includes(level);
          return (
            <Chip
              key={level}
              label={level === 'off' ? '关闭' : level === 'low' ? '快速' : level === 'medium' ? '标准' : '深度'}
              size="small"
              clickable
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => {
                setModelForm(p => {
                  const levels = selected
                    ? p.thinkingLevels.filter(l => l !== level)
                    : [...p.thinkingLevels, level];
                  return { ...p, thinkingLevels: levels };
                });
              }}
              sx={{ borderRadius: '16px' }}
            />
          );
        })}
      </Box>
      <FormControl size="small" fullWidth>
        <Typography sx={{ ...styles.label, mb: 0.5 }}>默认思考级别</Typography>
        <Select
          value={modelForm.defaultThinkingLevel || ''}
          onChange={e => setModelForm(p => ({ ...p, defaultThinkingLevel: e.target.value }))}
          size="small"
          displayEmpty
        >
          <MenuItem value=""><em>不设置</em></MenuItem>
          {modelForm.thinkingLevels.filter(l => l !== 'off').map(level => (
            <MenuItem key={level} value={level}>
              {level === 'low' ? '快速' : level === 'medium' ? '标准' : '深度'}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>

    <Divider sx={{ my: 0.5 }} />

    <Box>
      <Typography sx={{ ...styles.label, mb: 0.75, fontWeight: 600 }}>Token 定价 (USD / 百万 tokens)</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          label="输入"
          value={modelForm.costInput}
          onChange={e => setModelForm(p => ({ ...p, costInput: e.target.value }))}
          size="small"
          type="number"
          placeholder="如 5.0"
          sx={{ ...styles.input, flex: 1, minWidth: 100 }}
        />
        <TextField
          label="输出"
          value={modelForm.costOutput}
          onChange={e => setModelForm(p => ({ ...p, costOutput: e.target.value }))}
          size="small"
          type="number"
          placeholder="如 15.0"
          sx={{ ...styles.input, flex: 1, minWidth: 100 }}
        />
        <TextField
          label="缓存读"
          value={modelForm.costCacheRead}
          onChange={e => setModelForm(p => ({ ...p, costCacheRead: e.target.value }))}
          size="small"
          type="number"
          placeholder="可选"
          sx={{ ...styles.input, flex: 1, minWidth: 100 }}
        />
        <TextField
          label="缓存写"
          value={modelForm.costCacheWrite}
          onChange={e => setModelForm(p => ({ ...p, costCacheWrite: e.target.value }))}
          size="small"
          type="number"
          placeholder="可选"
          sx={{ ...styles.input, flex: 1, minWidth: 100 }}
        />
      </Box>
    </Box>

    <Divider sx={{ my: 0.5 }} />

    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography sx={{ ...styles.label, fontWeight: 600 }}>本地服务自动管理</Typography>
        <Switch
          size="small"
          checked={modelForm.localServiceEnabled}
          onChange={e => setModelForm(p => ({ ...p, localServiceEnabled: e.target.checked }))}
        />
      </Box>
      {modelForm.localServiceEnabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1, borderLeft: `2px solid ${styles.border}` }}>
          <TextField
            label="启动命令"
            value={modelForm.localServiceCommand}
            onChange={e => setModelForm(p => ({ ...p, localServiceCommand: e.target.value }))}
            size="small"
            placeholder="如 ollama serve"
            sx={styles.input}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="参数"
              value={modelForm.localServiceArgs}
              onChange={e => setModelForm(p => ({ ...p, localServiceArgs: e.target.value }))}
              size="small"
              placeholder="空格分隔"
              sx={{ ...styles.input, flex: 1 }}
            />
            <TextField
              label="工作目录"
              value={modelForm.localServiceCwd}
              onChange={e => setModelForm(p => ({ ...p, localServiceCwd: e.target.value }))}
              size="small"
              placeholder="可选"
              sx={{ ...styles.input, flex: 1 }}
            />
          </Box>
          <TextField
            label="健康检查 URL"
            value={modelForm.localServiceHealthUrl}
            onChange={e => setModelForm(p => ({ ...p, localServiceHealthUrl: e.target.value }))}
            size="small"
            placeholder="如 http://localhost:11434/api/tags"
            sx={styles.input}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="启动超时 (ms)"
              value={modelForm.localServiceReadyTimeoutMs}
              onChange={e => setModelForm(p => ({ ...p, localServiceReadyTimeoutMs: e.target.value }))}
              size="small"
              type="number"
              placeholder="默认 60000"
              sx={{ ...styles.input, flex: 1 }}
            />
            <TextField
              label="空闲停止 (ms)"
              value={modelForm.localServiceIdleStopMs}
              onChange={e => setModelForm(p => ({ ...p, localServiceIdleStopMs: e.target.value }))}
              size="small"
              type="number"
              placeholder="默认 300000"
              sx={{ ...styles.input, flex: 1 }}
            />
          </Box>
          <TextField
            label="环境变量"
            value={modelForm.localServiceEnv}
            onChange={e => setModelForm(p => ({ ...p, localServiceEnv: e.target.value }))}
            size="small"
            multiline
            rows={2}
            placeholder="KEY=VALUE，每行一个"
            sx={styles.input}
          />
        </Box>
      )}
    </Box>
  </Box>
  );
};

// ====== API 适配器区域 ======
const ApiAdapterSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  styles: ReturnType<typeof getModelManagerStyles>;
}> = ({ modelForm, setModelForm, styles }) => {
  const API_TYPE_OPTIONS = [
    { value: 'auto', label: '自动推断（推荐）', desc: '根据 Provider 和端点自动选择 API 格式' },
    { value: 'openai-chat', label: 'OpenAI Chat Completions', desc: '标准 OpenAI 聊天完成格式' },
    { value: 'openai-completions', label: 'OpenAI Completions', desc: '传统文本补全格式' },
    { value: 'anthropic-messages', label: 'Anthropic Messages', desc: 'Anthropic Claude API 格式' },
    { value: 'google-generative-ai', label: 'Google Generative AI', desc: 'Google Gemini API 格式' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary }}>
        API 适配器类型
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {API_TYPE_OPTIONS.map(opt => {
          const selected = modelForm.apiType === opt.value;
          return (
            <Box
              key={opt.value}
              onClick={() => setModelForm(p => ({ ...p, apiType: opt.value as ModelFormState['apiType'] }))}
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                border: `1px solid ${selected ? styles.textPrimary : styles.borderLight}`,
                backgroundColor: selected ? `${styles.textPrimary}10` : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': {
                  backgroundColor: selected ? `${styles.textPrimary}15` : styles.bgHover,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${selected ? styles.textPrimary : styles.borderDarker}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: styles.textPrimary }} />}
                </Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: styles.textPrimary, flex: 1 }}>
                  {opt.label}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted, mt: 0.5, ml: 3.5 }}>
                {opt.desc}
              </Typography>
            </Box>
          );
        })}
      </Box>

      <Divider sx={{ my: 0.5 }} />

      <Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary, mb: 1 }}>
          自动推断规则
        </Typography>
        <Box sx={{ p: 1.5, bgcolor: styles.bgHover, borderRadius: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: styles.textMuted, lineHeight: 1.6 }}>
            • Provider = <code style={{ padding: '1px 4px', backgroundColor: styles.bgPanel, borderRadius: 0.5 }}>anthropic</code> → Anthropic Messages<br/>
            • Provider = <code style={{ padding: '1px 4px', backgroundColor: styles.bgPanel, borderRadius: 0.5 }}>google</code> → Google Generative AI<br/>
            • 端点包含 <code style={{ padding: '1px 4px', backgroundColor: styles.bgPanel, borderRadius: 0.5 }}>/v1/completions</code> → OpenAI Completions<br/>
            • 其他 → OpenAI Chat 格式
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

// ====== 兼容性配置区域 ======
const CompatConfigSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  styles: ReturnType<typeof getModelManagerStyles>;
}> = ({ modelForm, setModelForm, styles }) => {
  const config = modelForm.compatConfig || {};

  const updateConfig = (updates: Partial<typeof config>) => {
    setModelForm(p => ({
      ...p,
      compatConfig: { ...p.compatConfig, ...updates },
    }));
  };

  const toggleFlag = (key: keyof typeof config) => {
    updateConfig({ [key]: !config[key] } as any);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary }}>
        功能支持
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {[
          { key: 'supportsStreaming', label: '流式响应 (Streaming)', desc: '支持 SSE 流式输出' },
          { key: 'supportsToolCalls', label: '工具调用 (Tool Calling)', desc: '支持 Function Calling' },
          { key: 'supportsReasoning', label: '推理/思考 (Reasoning)', desc: '支持 extended thinking' },
          { key: 'supportsSystemMessage', label: 'System 消息', desc: '支持 system 角色消息' },
          { key: 'supportsVision', label: '视觉理解 (Vision)', desc: '支持图片输入' },
        ].map(item => (
          <FormControlLabel
            key={item.key}
            control={
              <Switch
                checked={!!config[item.key as keyof typeof config]}
                onChange={() => toggleFlag(item.key as keyof typeof config)}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: styles.textPrimary },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: styles.textPrimary },
                }}
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: styles.textPrimary }}>
                  {item.label}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: styles.textMuted }}>
                  {item.desc}
                </Typography>
              </Box>
            }
            sx={{ m: 0, gap: 1 }}
          />
        ))}
      </Box>

      <Divider sx={{ my: 0.5 }} />

      <Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary, mb: 1 }}>
          消息配置
        </Typography>
        <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
          <Typography sx={{ ...styles.label, mb: 0.5 }}>System 消息不支持时</Typography>
          <Select
            value={config.systemMessageFallback || 'merge-to-first-user'}
            onChange={e => updateConfig({ systemMessageFallback: e.target.value as any })}
            size="small"
          >
            <MenuItem value="merge-to-first-user">合并到第一条用户消息</MenuItem>
            <MenuItem value="ignore">忽略</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ my: 0.5 }} />

      <Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary, mb: 1 }}>
          高级参数
        </Typography>
        <TextField
          label="API 版本"
          value={config.apiVersion || ''}
          onChange={e => updateConfig({ apiVersion: e.target.value })}
          size="small"
          placeholder="如 2024-02-15"
          fullWidth
          sx={{ ...styles.input, mb: 1.5 }}
        />
        <TextField
          label="推理参数字段名"
          value={config.reasoningField || ''}
          onChange={e => updateConfig({ reasoningField: e.target.value })}
          size="small"
          placeholder="如 reasoning_effort"
          fullWidth
          sx={{ ...styles.input, mb: 1.5 }}
        />
        <TextField
          label="最大图片数量"
          value={config.maxImages?.toString() || ''}
          onChange={e => updateConfig({ maxImages: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          size="small"
          type="number"
          placeholder="如 10"
          fullWidth
          sx={styles.input}
        />
      </Box>
    </Box>
  );
};

// ====== 媒体输入配置区域 ======
const MediaInputSection: React.FC<{
  modelForm: ModelFormState;
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
  styles: ReturnType<typeof getModelManagerStyles>;
}> = ({ modelForm, setModelForm, styles }) => {
  const config = modelForm.mediaInputConfig || {};
  const imageConfig = config.image || {};

  const updateImageConfig = (updates: Partial<typeof imageConfig>) => {
    setModelForm(p => ({
      ...p,
      mediaInputConfig: {
        ...p.mediaInputConfig,
        image: { ...p.mediaInputConfig?.image, ...updates },
      },
    }));
  };

  const toggleInput = (type: 'text' | 'image' | 'video' | 'audio') => {
    const current = config.supportedInputs || ['text'];
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setModelForm(p => ({
      ...p,
      mediaInputConfig: { ...p.mediaInputConfig, supportedInputs: next as any },
    }));
  };

  const supportsImage = (config.supportedInputs || ['text']).includes('image');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary }}>
        支持的输入类型
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {(['text', 'image', 'video', 'audio'] as const).map(type => {
          const selected = (config.supportedInputs || ['text']).includes(type);
          return (
            <Chip
              key={type}
              label={type === 'text' ? '文本' : type === 'image' ? '图片' : type === 'video' ? '视频' : '音频'}
              onClick={() => toggleInput(type)}
              clickable
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              size="small"
            />
          );
        })}
      </Box>

      {supportsImage && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: styles.textSecondary }}>
            图片配置
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="最大文件大小 (MB)"
              value={imageConfig.maxFileSize ? (imageConfig.maxFileSize / 1024 / 1024).toFixed(1) : ''}
              onChange={e => {
                const mb = parseFloat(e.target.value);
                updateImageConfig({ maxFileSize: isNaN(mb) ? undefined : mb * 1024 * 1024 });
              }}
              size="small"
              type="number"
              placeholder="如 10"
              sx={{ ...styles.input, flex: 1 }}
            />
            <TextField
              label="最大像素 (万)"
              value={imageConfig.maxPixels ? (imageConfig.maxPixels / 10000).toFixed(0) : ''}
              onChange={e => {
                const wan = parseFloat(e.target.value);
                updateImageConfig({ maxPixels: isNaN(wan) ? undefined : wan * 10000 });
              }}
              size="small"
              type="number"
              placeholder="如 200"
              sx={{ ...styles.input, flex: 1 }}
            />
          </Box>
          <TextField
            label="支持的格式（逗号分隔）"
            value={imageConfig.formats?.join(', ') || ''}
            onChange={e => {
              const formats = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
              updateImageConfig({ formats: formats.length > 0 ? formats : undefined });
            }}
            size="small"
            placeholder="如 image/jpeg, image/png, image/webp"
            fullWidth
            sx={styles.input}
          />
          <FormControlLabel
            control={
              <Switch
                checked={!!imageConfig.supportsDetail}
                onChange={e => updateImageConfig({ supportsDetail: e.target.checked })}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: styles.textPrimary },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: styles.textPrimary },
                }}
              />
            }
            label={<Typography sx={{ fontSize: '0.8rem' }}>支持 detail 参数（图片质量级别）</Typography>}
          />
        </>
      )}
    </Box>
  );
};

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
              ? testModelValid ? styles.semantic.successBg : styles.semantic.warningBg
              : styles.semantic.errorBg,
            border: `1px solid ${
              testStatus === 'success'
                ? testModelValid ? styles.semantic.successBorder : styles.semantic.warningBorder
                : styles.semantic.errorBorder
            }`,
          }}
        >
          {testStatus === 'success' ? (
            testModelValid ? (
              <CheckCircleOutlineIcon sx={{ fontSize: 18, color: styles.semantic.success, flexShrink: 0, mt: 0.25 }} />
            ) : (
              <ErrorOutlineIcon sx={{ fontSize: 18, color: styles.semantic.warning, flexShrink: 0, mt: 0.25 }} />
            )
          ) : (
            <ErrorOutlineIcon sx={{ fontSize: 18, color: styles.semantic.error, flexShrink: 0, mt: 0.25 }} />
          )}
          <Typography sx={{
            fontSize: '0.75rem',
            color: testStatus === 'success'
              ? testModelValid ? styles.semantic.successText : styles.semantic.warningText
              : styles.semantic.errorText,
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
const ModelEditDialog: React.FC<ModelEditDialogProps> = ({ state, actions }) => {
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

  /** "获取 Key"回调：直接打开系统浏览器 */
  const handleGetApiKey = useCallback(() => {
    const url = PROVIDER_API_KEY_URLS[modelForm.provider];
    if (url) openInSystemBrowser(url);
  }, [modelForm.provider]);

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
                  color: activeStep === step.id ? (isDark ? '#111827' : '#FFFFFF') : styles.textMuted,
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
          {activeStep === 'api' && (
            <ApiAdapterSection
              modelForm={modelForm}
              setModelForm={setModelForm}
              styles={styles}
            />
          )}
          {activeStep === 'compat' && (
            <CompatConfigSection
              modelForm={modelForm}
              setModelForm={setModelForm}
              styles={styles}
            />
          )}
          {activeStep === 'media' && (
            <MediaInputSection
              modelForm={modelForm}
              setModelForm={setModelForm}
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
