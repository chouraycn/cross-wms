/**
 * Image Generation Settings Tab — 图片生成设置 Tab
 *
 * 提供图片生成相关的配置界面：
 * - 默认模型选择
 * - Provider API Key 配置
 * - 默认参数设置（尺寸、质量、数量等）
 * - 可用 Provider 和模型列表
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Grid,
  Chip,
  Card,
  CardContent,
  Tooltip,
} from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getGrayScale } from '../../../constants/theme';
import { useTheme } from '@mui/material/styles';

// ==================== 类型定义 ====================

type ImageGenerationProviderInfo = {
  id: string;
  label: string;
  aliases: string[];
  available: boolean;
  default_model: string;
  models: string[];
  default_timeout_ms: number;
  capabilities: {
    generate: {
      max_count: number;
      supports_size: boolean;
      supports_aspect_ratio: boolean;
      supports_resolution: boolean;
    };
    edit: {
      enabled: boolean;
      max_input_images: number;
    };
    supported_sizes: string[];
    supported_sizes_by_model: Record<string, string[]>;
    supported_aspect_ratios: string[];
    supported_resolutions: string[];
    supported_qualities: string[];
    supported_formats: string[];
    supported_backgrounds: string[];
  };
};

type ImageGenerationConfig = {
  defaultModel?: string;
  defaultSize?: string;
  defaultQuality?: string;
  defaultCount?: number;
  defaultOutputFormat?: string;
  providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
};

// ==================== 组件 ====================

const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'auto';
const DEFAULT_COUNT = 1;
const DEFAULT_FORMAT = 'png';

const SUPPORTED_SIZES = [
  '256x256',
  '512x512',
  '768x768',
  '1024x1024',
  '1792x1024',
  '1024x1792',
  '1280x720',
  '720x1280',
];

const SUPPORTED_QUALITIES = ['auto', 'low', 'medium', 'high'];
const SUPPORTED_FORMATS = ['png', 'jpeg', 'webp'];

const ImageGenerationSettingsTab: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [providers, setProviders] = useState<ImageGenerationProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [config, setConfig] = useState<ImageGenerationConfig>({
    defaultModel: '',
    defaultSize: DEFAULT_SIZE,
    defaultQuality: DEFAULT_QUALITY,
    defaultCount: DEFAULT_COUNT,
    defaultOutputFormat: DEFAULT_FORMAT,
    providers: {},
  });

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/image-generation/providers');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.providers) {
        setProviders(data.providers);
      } else {
        throw new Error(data.error || 'Failed to load providers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/image-generation/config');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setConfig((prev) => ({
            ...prev,
            ...data.data,
            defaultSize: data.data.defaultSize || DEFAULT_SIZE,
            defaultQuality: data.data.defaultQuality || DEFAULT_QUALITY,
            defaultCount: data.data.defaultCount || DEFAULT_COUNT,
            defaultOutputFormat:
              data.data.defaultOutputFormat || DEFAULT_FORMAT,
          }));
        }
      }
    } catch {
      // 配置不存在时使用默认值
    }
  }, []);

  useEffect(() => {
    loadProviders();
    loadConfig();
  }, [loadProviders, loadConfig]);

  const saveConfig = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      setError(null);

      const response = await fetch('/api/image-generation/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    loadProviders();
    loadConfig();
  };

  const handleDefaultModelChange = (e: SelectChangeEvent<string>) => {
    setConfig((prev) => ({ ...prev, defaultModel: e.target.value }));
  };

  const handleDefaultSizeChange = (e: SelectChangeEvent<string>) => {
    setConfig((prev) => ({ ...prev, defaultSize: e.target.value }));
  };

  const handleDefaultQualityChange = (e: SelectChangeEvent<string>) => {
    setConfig((prev) => ({ ...prev, defaultQuality: e.target.value }));
  };

  const handleDefaultFormatChange = (e: SelectChangeEvent<string>) => {
    setConfig((prev) => ({ ...prev, defaultOutputFormat: e.target.value }));
  };

  const handleDefaultCountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 4) {
      setConfig((prev) => ({ ...prev, defaultCount: val }));
    }
  };

  const handleProviderApiKeyChange = (providerId: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...prev.providers?.[providerId],
          apiKey: value,
        },
      },
    }));
  };

  const handleProviderBaseUrlChange = (providerId: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...prev.providers?.[providerId],
          baseUrl: value,
        },
      },
    }));
  };

  const availableCount = providers.filter((p) => p.available).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 标题 */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: gs.textPrimary,
              mb: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <ImageOutlinedIcon sx={{ fontSize: 24 }} />
            图片生成设置
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary }}>
            配置图片生成模型和参数，AI 可通过 image_generate 工具调用
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          刷新
        </Button>
      </Box>

      {/* 状态提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}
      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 1.5 }}>
          设置已保存
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
          {/* 默认参数设置 */}
          <Typography
            sx={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: gs.textPrimary,
              mb: 2,
            }}
          >
            默认参数
          </Typography>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>默认模型</InputLabel>
                <Select
                  value={config.defaultModel || ''}
                  label="默认模型"
                  onChange={handleDefaultModelChange}
                >
                  {providers.length === 0 && (
                    <MenuItem value="" disabled>
                      暂无可用 Provider
                    </MenuItem>
                  )}
                  {providers.map((p) =>
                    p.models.map((model) => (
                      <MenuItem
                        key={`${p.id}/${model}`}
                        value={`${p.id}/${model}`}
                      >
                        {p.label} — {model}
                        {p.available && (
                          <Chip
                            size="small"
                            color="success"
                            label="可用"
                            sx={{ ml: 1, height: 16, fontSize: '0.65rem' }}
                          />
                        )}
                      </MenuItem>
                    )),
                  )}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>默认尺寸</InputLabel>
                <Select
                  value={config.defaultSize || DEFAULT_SIZE}
                  label="默认尺寸"
                  onChange={handleDefaultSizeChange}
                >
                  {SUPPORTED_SIZES.map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>默认质量</InputLabel>
                <Select
                  value={config.defaultQuality || DEFAULT_QUALITY}
                  label="默认质量"
                  onChange={handleDefaultQualityChange}
                >
                  {SUPPORTED_QUALITIES.map((q) => (
                    <MenuItem key={q} value={q}>
                      {q === 'auto'
                        ? '自动'
                        : q === 'low'
                          ? '低'
                          : q === 'medium'
                            ? '中'
                            : '高'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>输出格式</InputLabel>
                <Select
                  value={config.defaultOutputFormat || DEFAULT_FORMAT}
                  label="输出格式"
                  onChange={handleDefaultFormatChange}
                >
                  {SUPPORTED_FORMATS.map((f) => (
                    <MenuItem key={f} value={f}>
                      {f.toUpperCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6} sm={3}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="默认数量"
                value={config.defaultCount || DEFAULT_COUNT}
                onChange={handleDefaultCountChange}
                InputProps={{ inputProps: { min: 1, max: 4 } }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Provider 配置 */}
          <Typography
            sx={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: gs.textPrimary,
              mb: 2,
            }}
          >
            Provider 配置
            <Chip
              size="small"
              label={`${availableCount}/${providers.length} 可用`}
              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
            />
          </Typography>

          {providers.length === 0 ? (
            <Box
              sx={{
                p: 4,
                textAlign: 'center',
                color: gs.textSecondary,
                fontSize: '0.8rem',
              }}
            >
              暂无已注册的图片生成 Provider
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {providers.map((provider) => (
                <Card
                  key={provider.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: provider.available
                      ? 'success.light'
                      : gs.border,
                    bgcolor: 'transparent',
                  }}
                >
                  <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 2,
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        {provider.available ? (
                          <CheckCircleOutlinedIcon
                            color="success"
                            sx={{ fontSize: 20 }}
                          />
                        ) : (
                          <ErrorOutlineIcon
                            color="warning"
                            sx={{ fontSize: 20 }}
                          />
                        )}
                        <Typography
                          sx={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: gs.textPrimary,
                          }}
                        >
                          {provider.label}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={provider.available ? 'success' : 'default'}
                        label={provider.available ? '已配置' : '未配置'}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </Box>

                    <Box
                      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
                    >
                      <TextField
                        fullWidth
                        size="small"
                        type="password"
                        label="API Key"
                        placeholder={`输入 ${provider.label} API Key`}
                        value={
                          config.providers?.[provider.id]?.apiKey || ''
                        }
                        onChange={(e) =>
                          handleProviderApiKeyChange(
                            provider.id,
                            e.target.value,
                          )
                        }
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Base URL（可选）"
                        placeholder="自定义 API 端点，留空使用默认"
                        value={
                          config.providers?.[provider.id]?.baseUrl || ''
                        }
                        onChange={(e) =>
                          handleProviderBaseUrlChange(
                            provider.id,
                            e.target.value,
                          )
                        }
                      />
                    </Box>

                    {/* 支持的模型 */}
                    <Box sx={{ mt: 2 }}>
                      <Typography
                        sx={{
                          fontSize: '0.75rem',
                          color: gs.textSecondary,
                          mb: 0.5,
                        }}
                      >
                        支持的模型：
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {provider.models.map((model) => (
                          <Tooltip
                            key={model}
                            title={
                              model === provider.default_model
                                ? '默认模型'
                                : ''
                            }
                          >
                            <Chip
                              size="small"
                              label={model}
                              variant={
                                model === provider.default_model
                                  ? 'filled'
                                  : 'outlined'
                              }
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                    </Box>

                    {/* 能力标签 */}
                    {provider.capabilities.supported_sizes.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            color: gs.textSecondary,
                            mb: 0.5,
                          }}
                        >
                          支持的尺寸：
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 0.5,
                          }}
                        >
                          {provider.capabilities.supported_sizes
                            .slice(0, 4)
                            .map((size) => (
                              <Chip
                                key={size}
                                size="small"
                                label={size}
                                variant="outlined"
                                sx={{
                                  height: 18,
                                  fontSize: '0.65rem',
                                  color: gs.textSecondary,
                                }}
                              />
                            ))}
                          {provider.capabilities.supported_sizes.length >
                            4 && (
                            <Chip
                              size="small"
                              label={`+${provider.capabilities.supported_sizes.length - 4}`}
                              variant="outlined"
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                color: gs.textSecondary,
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* 使用说明 */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              borderRadius: 2,
              bgcolor: gs.bgPanel,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: gs.textPrimary,
                mb: 1,
              }}
            >
              💡 使用说明
            </Typography>
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: gs.textSecondary,
                lineHeight: 1.6,
              }}
            >
              配置 API Key 后，AI 可以通过 <code>image_generate</code>{' '}
              工具生成图片。 支持的 action：
              <br />
              • <b>generate</b> — 根据文字描述生成图片
              <br />
              • <b>list</b> — 列出可用的 Provider 和模型
              <br />
              • <b>status</b> — 查看生成任务状态
              <br />
              <br />
              生成的图片会自动保存到 Downloads 目录或指定路径。
            </Typography>
          </Box>
        </Box>
      )}

      {/* 保存按钮 */}
      <Box
        sx={{
          mt: 3,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
        }}
      >
        <Button variant="text" onClick={loadConfig} disabled={saving}>
          重置
        </Button>
        <Button
          variant="contained"
          onClick={saveConfig}
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {saving ? '保存中...' : '保存设置'}
        </Button>
      </Box>
    </Box>
  );
};

export default ImageGenerationSettingsTab;
