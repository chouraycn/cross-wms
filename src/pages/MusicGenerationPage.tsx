import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Paper, TextField, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Stack, Chip, Tooltip, Alert,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import {
  generateMusic,
  listMusicHistory,
  MUSIC_STYLE_CATEGORIES,
  MUSIC_PROVIDERS,
  MUSIC_DURATIONS,
  type MusicGenerationResult,
  type MusicTrack,
} from '../services/mediaGenerationApi';

const MusicGenerationPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string>(MUSIC_STYLE_CATEGORIES[0].id);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [selectedProvider, setSelectedProvider] = useState<string>(MUSIC_PROVIDERS[0].id);
  const [instrumental, setInstrumental] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [result, setResult] = useState<MusicGenerationResult | null>(null);
  const [history, setHistory] = useState<MusicGenerationResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const items = await listMusicHistory();
      setHistory(items);
    } catch (e) {
      // 历史加载失败不弹 toast，仅记录到错误状态
      const msg = e instanceof Error ? e.message : String(e);
      setError(`历史加载失败: ${msg}`);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('请输入音乐描述', 'warning');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const styleCategory = MUSIC_STYLE_CATEGORIES.find((c) => c.id === selectedStyle);
      const res = await generateMusic({
        prompt: prompt.trim(),
        stylePreset: styleCategory?.presetId,
        style: selectedStyle,
        durationSeconds: selectedDuration,
        format: 'mp3',
        instrumental,
        provider: selectedProvider,
      });
      setResult(res);
      showToast(`成功生成 ${res.tracks.length} 条音频`, 'success');
      // 刷新历史
      loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`生成失败: ${msg}`);
      showToast(`生成失败: ${msg}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (track: MusicTrack) => {
    if (!track.url) return;
    const link = document.createElement('a');
    link.href = track.url;
    link.download = track.fileName || `music-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (ms?: number) => {
    if (!ms) return '-';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('zh-CN');
  };

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <MusicNoteIcon sx={{ fontSize: 28, mr: 1.5, color: gs.textPrimary }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            音乐生成
          </Typography>
          <Typography variant="body2" sx={{ color: gs.textMuted, fontSize: '0.75rem' }}>
            AI 驱动的智能音乐生成
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <Tooltip title="刷新历史">
            <IconButton onClick={loadHistory} size="small">
              <RefreshIcon sx={{ fontSize: 18, color: gs.textMuted }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' }, gap: 2 }}>
        {/* 左侧：参数表单 */}
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
              label="音乐描述"
              multiline
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要生成的音乐，例如：温暖的钢琴曲，适合冬夜阅读..."
              size="small"
              fullWidth
            />

            <FormControl size="small" fullWidth>
              <InputLabel>风格</InputLabel>
              <Select
                value={selectedStyle}
                label="风格"
                onChange={(e) => setSelectedStyle(e.target.value)}
              >
                {MUSIC_STYLE_CATEGORIES.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.label}
                    <Typography variant="caption" sx={{ color: gs.textMuted, ml: 1 }}>
                      — {c.description}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>时长</InputLabel>
              <Select
                value={selectedDuration}
                label="时长"
                onChange={(e) => setSelectedDuration(Number(e.target.value))}
              >
                {MUSIC_DURATIONS.map((d) => (
                  <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                value={selectedProvider}
                label="Provider"
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {MUSIC_PROVIDERS.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                    {p.defaultModel && (
                      <Typography variant="caption" sx={{ color: gs.textMuted, ml: 1 }}>
                        ({p.defaultModel})
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setInstrumental((v) => !v)}
            >
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: '3px',
                  border: `1.5px solid ${gs.borderDarker}`,
                  backgroundColor: instrumental ? gs.textPrimary : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isDark ? '#fff' : '#fff',
                  fontSize: '11px',
                  lineHeight: 1,
                }}
              >
                {instrumental ? '✓' : ''}
              </Box>
              <Typography variant="body2" sx={{ color: gs.textSecondary }}>
                纯器乐（无人声）
              </Typography>
            </Box>

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
              {generating ? '生成中...' : '生成音乐'}
            </Button>
          </Stack>
        </Paper>

        {/* 右侧：生成结果 + 播放器 */}
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
            {result && result.tracks.length > 0 && (
              <Chip
                label={result.tracks.length}
                size="small"
                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
              />
            )}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {!result && !error && (
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
              <MusicNoteIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
              <Typography variant="body2">输入描述并点击生成</Typography>
            </Box>
          )}

          {result && result.tracks.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 6,
                color: gs.textMuted,
              }}
            >
              <MusicNoteIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
              <Typography variant="body2">未返回音频资产</Typography>
              <Typography variant="caption" sx={{ mt: 0.5 }}>
                Provider: {result.provider} / Model: {result.model}
              </Typography>
            </Box>
          )}

          {result && result.tracks.map((track, idx) => (
            <Box
              key={idx}
              sx={{
                mb: 2,
                p: 1.5,
                backgroundColor: gs.bgInput,
                border: `1px solid ${gs.border}`,
                borderRadius: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                  音轨 {idx + 1}
                  {track.durationSeconds && (
                    <Typography component="span" variant="caption" sx={{ color: gs.textMuted, ml: 1 }}>
                      · {track.durationSeconds.toFixed(1)}s
                    </Typography>
                  )}
                </Typography>
                <Tooltip title="下载">
                  <IconButton
                    size="small"
                    onClick={() => handleDownload(track)}
                    sx={{ p: 0.25 }}
                    disabled={!track.url}
                  >
                    <DownloadIcon sx={{ fontSize: 16, color: gs.textMuted }} />
                  </IconButton>
                </Tooltip>
              </Box>
              {track.url ? (
                <audio controls src={track.url} style={{ width: '100%' }} />
              ) : (
                <Typography variant="caption" sx={{ color: gs.textMuted }}>
                  无可播放的音频源
                </Typography>
              )}
            </Box>
          ))}

          {result && (
            <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                Provider: {result.provider} · Model: {result.model}
              </Typography>
              {result.enhancedPrompt && result.enhancedPrompt !== result.originalPrompt && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: gs.textSecondary, fontWeight: 600 }}>
                    优化后的提示词:
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: gs.textMuted, mt: 0.5 }}>
                    {result.enhancedPrompt}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Box>

      {/* 历史记录 */}
      <Paper
        sx={{
          mt: 2,
          p: 2,
          backgroundColor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <HistoryIcon sx={{ fontSize: 18, mr: 1, color: gs.textMuted }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            历史记录
          </Typography>
          <Chip
            label={history.length}
            size="small"
            sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
          />
        </Box>

        {loadingHistory ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={20} />
          </Box>
        ) : history.length === 0 ? (
          <Typography variant="body2" sx={{ color: gs.textMuted, py: 2, textAlign: 'center' }}>
            暂无历史记录
          </Typography>
        ) : (
          <Stack spacing={1}>
            {history.map((item) => (
              <Box
                key={item.historyId || `${item.createdAt}-${item.provider}`}
                sx={{
                  p: 1.5,
                  backgroundColor: gs.bgInput,
                  border: `1px solid ${gs.border}`,
                  borderRadius: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: gs.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.originalPrompt}
                  </Typography>
                  <Typography variant="caption" sx={{ color: gs.textMuted, ml: 1, flexShrink: 0 }}>
                    {formatDate(item.createdAt)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={item.provider}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                  {item.model && (
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      {item.model}
                    </Typography>
                  )}
                  {item.metadata?.trackCount !== undefined && (
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      · {String(item.metadata.trackCount)} 条音轨
                    </Typography>
                  )}
                  {item.metadata?.durationMs !== undefined && (
                    <Typography variant="caption" sx={{ color: gs.textMuted }}>
                      · 耗时 {formatTime(item.metadata.durationMs as number)}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
};

export default MusicGenerationPage;
