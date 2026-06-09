/**
 * ModelEditDialog — 统一编辑弹窗
 *
 * 包含：
 * - 基础字段：ID、名称、提供商（联动自动填充端点）、API 端点、API Key（含可见性切换）、描述
 * - 能力标签选择
 * - 高级字段：上下文窗口、最大输出、temperature 滑块、topP 滑块
 * - 启用开关
 * - 测试连接按钮（含可用模型列表展示）
 * - 保存/取消按钮
 */

import React, { useEffect } from 'react';
import {
  Box, Typography, Button, TextField, FormControl, InputLabel,
  Select, MenuItem, Switch, FormControlLabel, IconButton, Dialog,
  Slider, InputAdornment, Chip, Collapse, List, ListItemButton, ListItemText,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { providerLabel, providerIcon, ALL_PROVIDERS } from '../../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../../types/models';
import { textFieldSx, COLORS, sliderLabelSx, sliderValueSx, primaryButtonSx, PROVIDER_ENDPOINTS } from './styles';
import type { ModelEditDialogProps } from './types';
import type { ModelProvider } from '../../../types/models';

/** 提供商说明文案 — 覆盖 24+ 主流平台 */
const PROVIDER_HINTS: Record<string, string> = {
  openai: 'OpenAI 官方 API，支持 GPT-4o、GPT-4 Turbo、o1 等模型',
  anthropic: 'Anthropic 官方 API，支持 Claude Sonnet 4、Claude 3.5 Haiku 等模型',
  tencent: '腾讯混元大模型 API，支持 hunyuan-turbo、hunyuan-pro',
  deepseek: 'DeepSeek API，支持 deepseek-chat、deepseek-coder，性价比优秀',
  google: 'Google Gemini API，支持 gemini-pro 等多模态模型',
  qwen: '阿里通义千问 API，支持 qwen-turbo、qwen-plus，超长上下文',
  xai: 'xAI (Grok) API，支持 grok-2、grok-1.5 等模型',
  zai: 'Z.ai 开放平台，支持多种开源和商业模型',
  minimax: 'MiniMax 国际版 API，支持 abab 系列模型',
  kimi: 'Moonshot Kimi 国际版 API，支持长文本对话',
  byteplus: '字节跳动 BytePlus API，支持豆包系列模型',
  openrouter: 'OpenRouter 统一路由 API，支持 200+ 模型',
  novita: 'Novita AI API，支持多种开源模型部署',
  wwqglobal: '无问芯穹国际版 API，支持多种国产模型',
  wwqcn: '无问芯穹国内版 API，支持多种国产模型',
  aws: 'AWS Bedrock API，支持 Claude、Llama、Titan 等',
  azure: 'Azure OpenAI Service，支持 GPT-4、GPT-3.5 等',
  vercel: 'Vercel AI Gateway，统一代理多种模型',
  ollama: 'Ollama 本地部署，支持 Llama、Mistral 等开源模型',
  bigmodel: '智谱 AI Bigmodel，支持 GLM-4、ChatGLM 系列',
  minimaxcn: 'MiniMax 国内版 API，支持 abab 系列模型',
  kimicn: 'Moonshot Kimi 国内版 API，支持超长上下文',
  volcengine: '字节火山引擎 API，支持豆包系列模型',
  aliyun: '阿里云百炼 API，支持通义千问系列模型',
  siliconflow: '硅基流动 API，支持多种开源模型推理',
  modelark: '模力方舟 API，支持多种国产大模型',
  ppio: 'PPIO 派欧云 API，支持多种开源模型',
  custom: '自定义 OpenAI 兼容 API 端点，支持各种第三方服务',
};

/** 推荐的模型 ID 列表 — 覆盖 24+ 主流平台 */
const PROVIDER_MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  tencent: ['hunyuan-turbo', 'hunyuan-pro', 'hunyuan-lite'],
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
  xai: ['grok-2', 'grok-2-mini', 'grok-1.5'],
  zai: ['zai-gpt-4', 'zai-claude', 'zai-llama'],
  minimax: ['abab6.5s-chat', 'abab6-chat', 'abab5.5-chat'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  byteplus: ['doubao-pro-4k', 'doubao-lite-4k', 'doubao-vision'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-pro'],
  novita: ['meta-llama/llama-3-70b', 'mistralai/mixtral-8x22b', 'qwen/qwen-72b'],
  wwqglobal: ['wwq-qwen-72b', 'wwq-llama-70b', 'wwq-baichuan-13b'],
  wwqcn: ['wwq-qwen-72b', 'wwq-llama-70b', 'wwq-baichuan-13b'],
  aws: ['anthropic.claude-3-5-sonnet', 'meta.llama3-70b', 'amazon.titan-text'],
  azure: ['gpt-4', 'gpt-4-turbo', 'gpt-35-turbo'],
  vercel: ['gpt-4o', 'claude-3-5-sonnet', 'llama-3-70b'],
  ollama: ['llama3.1', 'mistral', 'qwen2', 'deepseek-coder-v2'],
  bigmodel: ['glm-4', 'glm-4v', 'chatglm3-6b', 'glm-4-flash'],
  minimaxcn: ['abab6.5s-chat', 'abab6-chat', 'abab5.5-chat'],
  kimicn: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  volcengine: ['doubao-pro-4k', 'doubao-lite-4k', 'doubao-vision'],
  aliyun: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
  siliconflow: ['deepseek-ai/DeepSeek-V2', 'Qwen/Qwen2-72B', 'meta-llama/Meta-Llama-3-70B'],
  modelark: ['modelark-qwen-72b', 'modelark-llama-70b', 'modelark-glm-4'],
  ppio: ['deepseek-ai/DeepSeek-V2', 'Qwen/Qwen2-72B', 'meta-llama/Meta-Llama-3-70B'],
  custom: [],
};

/** 各提供商 API Key 获取链接 — 覆盖 24+ 主流平台 */
const PROVIDER_API_KEY_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  tencent: 'https://console.cloud.tencent.com/cam/capi',
  deepseek: 'https://platform.deepseek.com/api_keys',
  google: 'https://aistudio.google.com/app/apikey',
  qwen: 'https://dashscope.console.aliyun.com/apiKey',
  xai: 'https://console.x.ai/team/default/api-keys',
  zai: 'https://z.ai/settings/api-keys',
  minimax: 'https://www.minimaxi.com/user-center/basic-information/interface-key',
  kimi: 'https://platform.moonshot.cn/console/api-keys',
  byteplus: 'https://console.byteplus.com/ark/region:ark+cn-beijing/apiKey',
  openrouter: 'https://openrouter.ai/settings/keys',
  novita: 'https://novita.ai/settings/key-management',
  wwqglobal: 'https://www.wwq.com/console/api-keys',
  wwqcn: 'https://www.wwq.cn/console/api-keys',
  aws: 'https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/overview',
  azure: 'https://portal.azure.com/#home',
  vercel: 'https://vercel.com/dashboard/stores/ai',
  ollama: 'https://ollama.com/download',
  bigmodel: 'https://open.bigmodel.cn/usercenter/apikeys',
  minimaxcn: 'https://www.minimaxi.com/platform/login',
  kimicn: 'https://platform.moonshot.cn/console/api-keys',
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  aliyun: 'https://dashscope.console.aliyun.com/apiKey',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  modelark: 'https://www.modelark.cn/console/api-keys',
  ppio: 'https://ppinfra.com/settings/key-management',
  custom: '',
};

const ModelEditDialog: React.FC<ModelEditDialogProps> = ({ state, actions }) => {
  const {
    modelForm, modelFormErrors, modelDialogMode,
    testStatus, testMessage, showApiKey,
    testAvailableModels, testModelValid,
  } = state;
  const { closeModelDialog, setModelForm, handleSaveModel, handleTestApi, toggleApiKeyVisibility } = actions;

  // 高级参数折叠状态
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  if (!modelDialogMode) return null;

  // 提供商切换时自动填充 API 端点
  const handleProviderChange = (provider: ModelProvider) => {
    const endpoint = PROVIDER_ENDPOINTS[provider] || '';
    setModelForm(p => ({
      ...p,
      provider,
      apiEndpoint: endpoint,
    }));
  };

  // 从测试结果中选择模型 ID
  const handleSelectTestModel = (modelId: string) => {
    setModelForm(p => ({
      ...p,
      id: modelId,
      name: p.name || modelId,
    }));
  };

  return (
    <Dialog
      open
      onClose={closeModelDialog}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '85vh', overflow: 'auto' }}>
        {/* 标题 */}
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: COLORS.textPrimary }}>
          {modelDialogMode === 'add' ? '添加模型' : '编辑模型'}
        </Typography>

        {/* ====== 基础信息区 ====== */}

        {/* 提供商下拉（带说明） */}
        <FormControl fullWidth size="small">
          <InputLabel sx={{ fontSize: '0.8125rem' }}>提供商</InputLabel>
          <Select
            value={modelForm.provider}
            label="提供商"
            onChange={e => handleProviderChange(e.target.value as ModelProvider)}
            renderValue={(value) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {providerIcon(value as string, 18)}
                <Typography sx={{ fontSize: '0.8125rem' }}>{providerLabel(value as string)}</Typography>
              </Box>
            )}
          >
            {ALL_PROVIDERS.map(p => (
              <MenuItem key={p} value={p}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {providerIcon(p, 18)}
                  <Box>
                    <Typography sx={{ fontSize: '0.8125rem' }}>{providerLabel(p)}</Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                      {PROVIDER_HINTS[p] || ''}
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 模型 ID（带推荐列表） */}
        <TextField
          label="模型 ID"
          value={modelForm.id}
          onChange={e => setModelForm(p => ({ ...p, id: e.target.value }))}
          error={!!modelFormErrors['model.id']}
          helperText={modelFormErrors['model.id'] || (modelDialogMode === 'add' ? '输入模型标识符，如 gpt-4o、claude-sonnet-4-20250514' : '')}
          disabled={modelDialogMode === 'edit'}
          fullWidth
          size="small"
          sx={textFieldSx}
        />
        {/* 推荐模型 ID 快捷选择（仅添加模式且当前 ID 为空或为默认值时显示） */}
        {modelDialogMode === 'add' && PROVIDER_MODEL_SUGGESTIONS[modelForm.provider]?.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted, lineHeight: '28px', mr: 0.5 }}>
              常用：
            </Typography>
            {PROVIDER_MODEL_SUGGESTIONS[modelForm.provider].map(suggestion => (
              <Chip
                key={suggestion}
                label={suggestion}
                size="small"
                onClick={() => setModelForm(p => ({ ...p, id: suggestion, name: p.name || suggestion }))}
                sx={{
                  fontSize: '0.7rem',
                  height: 24,
                  cursor: 'pointer',
                  backgroundColor: modelForm.id === suggestion ? '#DBEAFE' : '#F3F4F6',
                  color: modelForm.id === suggestion ? '#2563EB' : COLORS.textSecondary,
                  border: modelForm.id === suggestion ? '1px solid #93C5FD' : '1px solid transparent',
                  '&:hover': { backgroundColor: '#E5E7EB' },
                }}
              />
            ))}
          </Box>
        )}

        {/* 模型名称 */}
        <TextField
          label="模型名称（显示用）"
          value={modelForm.name}
          onChange={e => setModelForm(p => ({ ...p, name: e.target.value }))}
          error={!!modelFormErrors['model.name']}
          helperText={modelFormErrors['model.name'] || '留空则使用模型 ID'}
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* API 端点（始终可见，非 custom 时预填） */}
        <TextField
          label="API 端点"
          value={modelForm.apiEndpoint}
          onChange={e => setModelForm(p => ({ ...p, apiEndpoint: e.target.value }))}
          fullWidth
          size="small"
          placeholder="https://api.example.com/v1"
          helperText={modelForm.provider !== 'custom' ? '已根据提供商自动填充，可按需修改' : '请输入自定义 API 端点地址'}
          sx={textFieldSx}
        />

        {/* API Key（含可见性切换 + 获取链接） */}
        <Box>
          <TextField
            label="API Key（可选，留空则使用环境变量）"
            value={modelForm.apiKey}
            onChange={e => setModelForm(p => ({ ...p, apiKey: e.target.value }))}
            fullWidth
            size="small"
            type={showApiKey ? 'text' : 'password'}
            sx={textFieldSx}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={toggleApiKeyVisibility}
                    edge="end"
                    sx={{ color: COLORS.textMuted }}
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showApiKey ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {/* 获取 API Key 链接 */}
          {PROVIDER_API_KEY_URLS[modelForm.provider] && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  const url = PROVIDER_API_KEY_URLS[modelForm.provider];
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                }}
                sx={{
                  fontSize: '0.7rem',
                  textTransform: 'none',
                  color: '#2563EB',
                  p: 0,
                  minWidth: 'auto',
                  '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' },
                }}
              >
                获取 {providerLabel(modelForm.provider)} API Key →
              </Button>
            </Box>
          )}
        </Box>

        {/* 描述 */}
        <TextField
          label="描述"
          value={modelForm.description}
          onChange={e => setModelForm(p => ({ ...p, description: e.target.value }))}
          fullWidth
          size="small"
          multiline
          rows={2}
          placeholder="简要描述模型的特点和适用场景"
          sx={textFieldSx}
        />

        {/* 能力标签 */}
        <Box>
          <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textSecondary, mb: 0.75 }}>
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
                    backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}20` : '#F3F4F6',
                    color: selected ? CAPABILITY_COLORS[cap] : COLORS.textMuted,
                    border: selected ? `1px solid ${CAPABILITY_COLORS[cap]}50` : '1px solid transparent',
                    fontWeight: selected ? 600 : 400,
                    '&:hover': {
                      backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}30` : '#E5E7EB',
                    },
                  }}
                />
              );
            })}
          </Box>
        </Box>

        {/* ====== 高级参数区（可折叠） ====== */}
        <Box
          onClick={() => setShowAdvanced(!showAdvanced)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
            py: 0.5, userSelect: 'none',
          }}
        >
          {showAdvanced ? <ExpandLessIcon sx={{ fontSize: 18, color: COLORS.textMuted }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: COLORS.textMuted }} />}
          <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textSecondary, fontWeight: 500 }}>
            高级参数
          </Typography>
        </Box>

        <Collapse in={showAdvanced}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 0.5 }}>
            {/* 上下文窗口 & 最大输出 */}
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="上下文窗口 (tokens)"
                value={modelForm.contextWindow}
                onChange={e => setModelForm(p => ({ ...p, contextWindow: e.target.value }))}
                error={!!modelFormErrors['model.contextWindow']}
                helperText={modelFormErrors['model.contextWindow']}
                size="small"
                type="number"
                placeholder="如 128000"
                sx={{ ...textFieldSx, flex: 1 }}
              />
              <TextField
                label="最大输出 (tokens)"
                value={modelForm.maxTokens}
                onChange={e => setModelForm(p => ({ ...p, maxTokens: e.target.value }))}
                error={!!modelFormErrors['model.maxTokens']}
                helperText={modelFormErrors['model.maxTokens']}
                size="small"
                type="number"
                placeholder="如 4096"
                sx={{ ...textFieldSx, flex: 1 }}
              />
            </Box>

            {/* Temperature 滑块 */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={sliderLabelSx}>Temperature</Typography>
                <Typography sx={sliderValueSx}>{modelForm.temperature || '1'}</Typography>
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
                  color: COLORS.textPrimary,
                  '& .MuiSlider-thumb': { width: 14, height: 14 },
                  '& .MuiSlider-valueLabel': { fontSize: '0.7rem' },
                }}
              />
              {modelFormErrors['model.temperature'] && (
                <Typography sx={{ fontSize: '0.7rem', color: COLORS.error, mt: -0.5 }}>
                  {modelFormErrors['model.temperature']}
                </Typography>
              )}
            </Box>

            {/* Top P 滑块 */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={sliderLabelSx}>Top P</Typography>
                <Typography sx={sliderValueSx}>{modelForm.topP || '1'}</Typography>
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
                  color: COLORS.textPrimary,
                  '& .MuiSlider-thumb': { width: 14, height: 14 },
                  '& .MuiSlider-valueLabel': { fontSize: '0.7rem' },
                }}
              />
              {modelFormErrors['model.topP'] && (
                <Typography sx={{ fontSize: '0.7rem', color: COLORS.error, mt: -0.5 }}>
                  {modelFormErrors['model.topP']}
                </Typography>
              )}
            </Box>
          </Box>
        </Collapse>

        {/* 启用开关 */}
        <FormControlLabel
          control={
            <Switch
              checked={modelForm.enabled}
              onChange={e => setModelForm(p => ({ ...p, enabled: e.target.checked }))}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.textPrimary },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.textPrimary },
              }}
            />
          }
          label={<Typography sx={{ fontSize: '0.8rem' }}>启用此模型</Typography>}
        />

        {/* ====== 测试连接区 ====== */}
        <Box sx={{ borderTop: `1px solid ${COLORS.borderLight}`, pt: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: COLORS.textSecondary }}>
              连接测试
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={testStatus === 'testing' ? <AutorenewIcon sx={{ fontSize: 14, animation: 'spin 1s linear infinite' }} /> : null}
              onClick={handleTestApi}
              disabled={testStatus === 'testing'}
              sx={{
                fontSize: '0.75rem',
                borderColor: '#D1D5DB',
                color: COLORS.textMuted,
                '&:hover': { borderColor: '#9CA3AF' },
              }}
            >
              {testStatus === 'testing' ? '测试中...' : '测试连接'}
            </Button>
          </Box>

          {/* 测试结果消息 */}
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
              }}>
                {testMessage}
              </Typography>
            </Box>
          )}

          {/* 测试返回的可用模型列表 */}
          {testAvailableModels.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted, mb: 0.5 }}>
                可用模型列表（点击选择作为模型 ID）：
              </Typography>
              <Box
                sx={{
                  maxHeight: 160,
                  overflow: 'auto',
                  border: `1px solid ${COLORS.borderLight}`,
                  borderRadius: 1.5,
                  backgroundColor: '#FAFAFA',
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
                          backgroundColor: '#EFF6FF',
                          '&:hover': { backgroundColor: '#DBEAFE' },
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
                        <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#2563EB' }} />
                      )}
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            </Box>
          )}
        </Box>

        {/* ====== 操作按钮 ====== */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
          <Button variant="outlined" onClick={closeModelDialog} size="small" sx={{ fontSize: '0.8rem' }}>
            取消
          </Button>
          <Button variant="contained" onClick={handleSaveModel} size="small" sx={primaryButtonSx}>
            保存
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default ModelEditDialog;
