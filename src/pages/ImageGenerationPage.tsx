import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, Tabs, Tab,
  TextField, Select, MenuItem, FormControl, InputLabel, Slider,
  Tooltip, CircularProgress, Alert, Stack, Grid, Card, CardMedia,
  CardContent, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImageIcon from '@mui/icons-material/Image';
import SettingsIcon from '@mui/icons-material/Settings';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { ImageGenerationProvider, ImageGenerationConfig, GeneratedImage } from '../services/api';
import {
  fetchImageProviders, fetchImageConfig, updateImageConfig, generateImage,
} from '../services/api';

const ImageGenerationPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [tab, setTab] = useState(0);
  const [providers, setProviders] = useState<ImageGenerationProvider[]>([]);
  const [config, setConfig] = useState<ImageGenerationConfig>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('standard');
  const [imageCount, setImageCount] = useState(1);
  const [outputFormat, setOutputFormat] = useState('url');
  const [background, setBackground] = useState('');

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [configForm, setConfigForm] = useState<ImageGenerationConfig>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [providersRes, configRes] = await Promise.all([
        fetchImageProviders(),
        fetchImageConfig(),
      ]);
      setProviders(providersRes.providers);
      setConfig(configRes);
      setConfigForm(configRes);

      if (providersRes.providers.length > 0) {
        const firstAvailable = providersRes.providers.find(p => p.available) || providersRes.providers[0];
        setSelectedProvider(firstAvailable.id);
        setSelectedModel(configRes.defaultModel || firstAvailable.default_model);
        setSelectedSize(configRes.defaultSize || (firstAvailable.capabilities.supported_sizes[0] || ''));
        setSelectedQuality(configRes.defaultQuality || 'standard');
        setImageCount(configRes.defaultCount || 1);
        setOutputFormat(configRes.defaultOutputFormat || 'url');
      }
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentProvider = providers.find(p => p.id === selectedProvider);

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    setSelectedProvider(providerId);
    setSelectedModel(provider.default_model);
    const sizes = provider.capabilities.supported_sizes_by_model?.[provider.default_model]
      || provider.capabilities.supported_sizes;
    setSelectedSize(sizes[0] || '');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('请输入图片描述', 'warning');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateImage(prompt, {
        model: selectedModel,
        size: selectedSize,
        quality: selectedQuality,
        count: imageCount,
        outputFormat,
        background: background || undefined,
      });
      setGeneratedImages(res.images);
      showToast(`成功生成 ${res.images.length} 张图片`, 'success');
    } catch (e) {
      showToast(`生成失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await updateImageConfig(configForm);
      setConfig(configForm);
      showToast('配置已保存', 'success');
    } catch (e) {
      showToast(`保存失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDownload = (img: GeneratedImage) => {
    if (img.b64_json) {
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${img.b64_json}`;
      link.download = `generated-${Date.now()}.png`;
      link.click();
    } else if (img.url) {
      const link = document.createElement('a');
      link.href = img.url;
      link.download = `generated-${Date.now()}.png`;
      link.target = '_blank';
      link.click();
    }
  };

  const availableSizes = currentProvider
    ? (currentProvider.capabilities.supported_sizes_by_model?.[selectedModel]
      || currentProvider.capabilities.supported_sizes)
    : [];

  const availableQualities = currentProvider?.capabilities.supported_qualities || [];
  const availableFormats = currentProvider?.capabilities.supported_formats || [];
  const availableBackgrounds = currentProvider?.capabilities.supported_backgrounds || [];
  const maxCount = currentProvider?.capabilities.generate.max_count || 1;

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <ImageIcon sx={{ fontSize: 28, mr: 1.5, color: gs.textPrimary }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            图片生成
          </Typography>
          <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.75rem' }}>
            AI 驱动的智能图片生成
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <Tooltip title="刷新">
            <IconButton onClick={loadData} size="small">
              <RefreshIcon sx={{ fontSize: 18, color: gs.textMuted }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <>
          <Paper
            sx={{
              mb: 2,
              backgroundColor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
              borderRadius: 2,
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                borderBottom: `1px solid ${gs.border}`,
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: gs.textSecondary,
                  minHeight: 40,
                },
                '& .Mui-selected': {
                  color: gs.textPrimary + ' !important',
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: accentColor(gs),
                },
              }}
            >
              <Tab label="生成图片" icon={<AutoFixHighIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
              <Tab label="配置" icon={<SettingsIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
            </Tabs>
          </Paper>

          {tab === 0 && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <Paper
                  sx={{
                    p: 2,
                    backgroundColor: gs.bgPanel,
                    border: `1px solid ${gs.border}`,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: gs.textPrimary }}>
                    生成参数
                  </Typography>

                  <Stack spacing={2}>
                    <TextField
                      label="图片描述"
                      multiline
                      rows={4}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="描述你想要生成的图片..."
                      size="small"
                      fullWidth
                    />

                    <FormControl size="small" fullWidth>
                      <InputLabel>Provider</InputLabel>
                      <Select
                        value={selectedProvider}
                        label="Provider"
                        onChange={(e) => handleProviderChange(e.target.value)}
                      >
                        {providers.map((p) => (
                          <MenuItem key={p.id} value={p.id} disabled={!p.available}>
                            {p.label}
                            {!p.available && ' (不可用)'}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" fullWidth>
                      <InputLabel>模型</InputLabel>
                      <Select
                        value={selectedModel}
                        label="模型"
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={!currentProvider}
                      >
                        {currentProvider?.models.map((m) => (
                          <MenuItem key={m} value={m}>{m}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>尺寸</InputLabel>
                          <Select
                            value={selectedSize}
                            label="尺寸"
                            onChange={(e) => setSelectedSize(e.target.value)}
                          >
                            {availableSizes.map((s) => (
                              <MenuItem key={s} value={s}>{s}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>质量</InputLabel>
                          <Select
                            value={selectedQuality}
                            label="质量"
                            onChange={(e) => setSelectedQuality(e.target.value)}
                            disabled={availableQualities.length === 0}
                          >
                            {availableQualities.length > 0 ? availableQualities.map((q) => (
                              <MenuItem key={q} value={q}>{q}</MenuItem>
                            )) : (
                              <MenuItem value="standard">standard</MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Box>
                      <Typography variant="body2" sx={{ color: gs.textSecondary, mb: 1, fontSize: '0.75rem' }}>
                        数量: {imageCount}
                      </Typography>
                      <Slider
                        value={imageCount}
                        onChange={(_, v) => setImageCount(v as number)}
                        min={1}
                        max={maxCount}
                        step={1}
                        valueLabelDisplay="auto"
                      />
                    </Box>

                    {availableFormats.length > 0 && (
                      <FormControl size="small" fullWidth>
                        <InputLabel>输出格式</InputLabel>
                        <Select
                          value={outputFormat}
                          label="输出格式"
                          onChange={(e) => setOutputFormat(e.target.value)}
                        >
                          {availableFormats.map((f) => (
                            <MenuItem key={f} value={f}>{f}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    {availableBackgrounds.length > 0 && (
                      <FormControl size="small" fullWidth>
                        <InputLabel>背景</InputLabel>
                        <Select
                          value={background}
                          label="背景"
                          onChange={(e) => setBackground(e.target.value)}
                        >
                          <MenuItem value="">默认</MenuItem>
                          {availableBackgrounds.map((b) => (
                            <MenuItem key={b} value={b}>{b}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    <Button
                      variant="contained"
                      onClick={handleGenerate}
                      disabled={generating || !prompt.trim()}
                      startIcon={generating ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        py: 1.25,
                      }}
                    >
                      {generating ? '生成中...' : '生成图片'}
                    </Button>
                  </Stack>
                </Paper>
              </Grid>

              <Grid item xs={12} md={7}>
                <Paper
                  sx={{
                    p: 2,
                    backgroundColor: gs.bgPanel,
                    border: `1px solid ${gs.border}`,
                    borderRadius: 2,
                    minHeight: 400,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: gs.textPrimary }}>
                    生成结果
                    {generatedImages.length > 0 && (
                      <Chip
                        label={generatedImages.length}
                        size="small"
                        sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Typography>

                  {generatedImages.length === 0 ? (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 8,
                        color: gs.textMuted,
                      }}
                    >
                      <ImageIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
                      <Typography variant="body2">输入描述并点击生成</Typography>
                    </Box>
                  ) : (
                    <Grid container spacing={1.5}>
                      {generatedImages.map((img, idx) => (
                        <Grid item xs={6} sm={4} key={idx}>
                          <Card
                            sx={{
                              cursor: 'pointer',
                              border: `1px solid ${gs.border}`,
                              '&:hover': { borderColor: gs.textMuted },
                              transition: 'border-color 0.2s',
                            }}
                            onClick={() => {
                              setSelectedImage(img);
                              setPreviewOpen(true);
                            }}
                          >
                            <CardMedia
                              component="img"
                              height={120}
                              image={img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url}
                              alt={`Generated ${idx + 1}`}
                              sx={{ objectFit: 'cover' }}
                            />
                            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: gs.textMuted }}>
                                  {img.width}x{img.height}
                                </Typography>
                                <Tooltip title="下载">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(img);
                                    }}
                                    sx={{ p: 0.25 }}
                                  >
                                    <DownloadIcon sx={{ fontSize: 14, color: gs.textMuted }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </Paper>
              </Grid>
            </Grid>
          )}

          {tab === 1 && (
            <Paper
              sx={{
                p: 2,
                backgroundColor: gs.bgPanel,
                border: `1px solid ${gs.border}`,
                borderRadius: 2,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: gs.textPrimary }}>
                默认配置
              </Typography>

              <Stack spacing={2}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>默认模型</InputLabel>
                      <Select
                        value={configForm.defaultModel || ''}
                        label="默认模型"
                        onChange={(e) => setConfigForm({ ...configForm, defaultModel: e.target.value })}
                      >
                        {providers.flatMap((p) =>
                          p.models.map((m) => (
                            <MenuItem key={`${p.id}-${m}`} value={m}>{p.label} / {m}</MenuItem>
                          ))
                        )}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>默认尺寸</InputLabel>
                      <Select
                        value={configForm.defaultSize || ''}
                        label="默认尺寸"
                        onChange={(e) => setConfigForm({ ...configForm, defaultSize: e.target.value })}
                      >
                        {currentProvider?.capabilities.supported_sizes.map((s) => (
                          <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>默认质量</InputLabel>
                      <Select
                        value={configForm.defaultQuality || 'standard'}
                        label="默认质量"
                        onChange={(e) => setConfigForm({ ...configForm, defaultQuality: e.target.value })}
                      >
                        {availableQualities.length > 0 ? availableQualities.map((q) => (
                          <MenuItem key={q} value={q}>{q}</MenuItem>
                        )) : (
                          <MenuItem value="standard">standard</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="默认数量"
                      type="number"
                      size="small"
                      value={configForm.defaultCount || 1}
                      onChange={(e) => setConfigForm({ ...configForm, defaultCount: parseInt(e.target.value) || 1 })}
                      InputProps={{ inputProps: { min: 1, max: maxCount } }}
                    />
                  </Grid>
                </Grid>

                <FormControl size="small" fullWidth>
                  <InputLabel>默认输出格式</InputLabel>
                  <Select
                    value={configForm.defaultOutputFormat || 'url'}
                    label="默认输出格式"
                    onChange={(e) => setConfigForm({ ...configForm, defaultOutputFormat: e.target.value })}
                  >
                    {availableFormats.length > 0 ? availableFormats.map((f) => (
                      <MenuItem key={f} value={f}>{f}</MenuItem>
                    )) : (
                      <MenuItem value="url">url</MenuItem>
                    )}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 1 }}>
                  <Button
                    variant="outlined"
                    onClick={() => setConfigForm(config)}
                    size="small"
                    sx={{ textTransform: 'none' }}
                  >
                    重置
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    size="small"
                    sx={{ textTransform: 'none' }}
                  >
                    {savingConfig ? '保存中...' : '保存配置'}
                  </Button>
                </Box>
              </Stack>

              <Box sx={{ mt: 3 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: gs.textPrimary }}>
                  Provider 列表
                </Typography>
                <Stack spacing={1}>
                  {providers.map((p) => (
                    <Paper
                      key={p.id}
                      sx={{
                        p: 1.5,
                        backgroundColor: gs.bgInput,
                        border: `1px solid ${gs.border}`,
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={p.available ? '可用' : '不可用'}
                          size="small"
                          sx={{
                            backgroundColor: p.available ? '#D1FAE5' : '#F3F4F6',
                            color: p.available ? '#059669' : '#6B7280',
                            fontWeight: 500,
                            fontSize: '0.65rem',
                            height: 20,
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                          {p.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: gs.textMuted, ml: 'auto' }}>
                          {p.models.length} 个模型
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: gs.textMuted, display: 'block', mt: 0.5 }}>
                        默认模型: {p.default_model}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            </Paper>
          )}
        </>
      )}

      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          图片预览
          <IconButton
            onClick={() => selectedImage && handleDownload(selectedImage)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
            size="small"
          >
            <DownloadIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedImage && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedImage.b64_json ? `data:image/png;base64,${selectedImage.b64_json}` : selectedImage.url}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }}
              />
            </Box>
          )}
          {selectedImage?.revised_prompt && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>优化后的提示词:</Typography>
              <Typography variant="body2">{selectedImage.revised_prompt}</Typography>
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} sx={{ textTransform: 'none' }}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

function accentColor(gs: ReturnType<typeof getGrayScale>) {
  return gs.textPrimary;
}

export default ImageGenerationPage;
