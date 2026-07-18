import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import {
  listProviders,
  listVoices,
  synthesize,
  listHistory,
  deleteHistory,
  type TTSProviderInfo,
  type TTSVoice,
  type TTSHistoryEntry,
} from '../services/ttsApi';
import { API_BASE_URL } from '../constants/api';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

/** 采样率选项。 */
const SAMPLE_RATES = [8000, 16000, 24000, 44100];

/** 音色性别选项。 */
const GENDERS: { value: 'male' | 'female' | 'neutral'; label: string }[] = [
  { value: 'female', label: '女声' },
  { value: 'male', label: '男声' },
  { value: 'neutral', label: '中性' },
];

export default function TtsSettingsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // ============ 元数据 ============
  const [providers, setProviders] = useState<TTSProviderInfo[]>([]);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');

  // ============ 合成参数 ============
  const [text, setText] = useState('你好，这是一段 TTS 语音合成测试。');
  const [provider, setProvider] = useState<string>('auto');
  const [voice, setVoice] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female' | 'neutral' | ''>('');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(0);
  const [volume, setVolume] = useState<number>(50);
  const [sampleRate, setSampleRate] = useState<number>(16000);

  // 文本预处理选项
  const [normalizeNumbers, setNormalizeNumbers] = useState(true);
  const [normalizePunctuation, setNormalizePunctuation] = useState(true);
  const [fullWidthToHalf, setFullWidthToHalf] = useState(true);

  // ============ 合成状态 ============
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState('');
  const [currentEntry, setCurrentEntry] = useState<TTSHistoryEntry | null>(null);

  // ============ 历史记录 ============
  const [history, setHistory] = useState<TTSHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /** 加载 Provider 列表。 */
  const fetchProviders = useCallback(async () => {
    try {
      setMetaLoading(true);
      setMetaError('');
      const list = await listProviders();
      setProviders(list);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : '获取 Provider 列表失败');
    } finally {
      setMetaLoading(false);
    }
  }, []);

  /** 加载音色列表。 */
  const fetchVoices = useCallback(async (providerId?: string) => {
    try {
      const list = await listVoices(providerId && providerId !== 'auto' ? providerId : undefined);
      setVoices(list);
      // 默认选第一个音色
      if (list.length > 0 && !list.some((v) => v.id === voice)) {
        setVoice(list[0].id);
      }
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : '获取音色列表失败');
    }
  }, [voice]);

  /** 加载历史记录。 */
  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const list = await listHistory();
      setHistory(list);
    } catch {
      // 历史加载失败不阻塞页面
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    fetchVoices();
    fetchHistory();
  }, [fetchProviders, fetchVoices, fetchHistory]);

  // Provider 切换时重新加载音色
  useEffect(() => {
    fetchVoices(provider);
  }, [provider, fetchVoices]);

  /** 按性别过滤的音色列表。 */
  const filteredVoices = useMemo(() => {
    if (!gender) return voices;
    return voices.filter((v) => v.gender === gender);
  }, [voices, gender]);

  /** 选择性别时自动挑选该性别下的第一个音色。 */
  const handleGenderChange = (
    _e: React.MouseEvent<HTMLElement>,
    value: 'male' | 'female' | 'neutral' | null,
  ) => {
    setGender(value ?? '');
    if (value) {
      const matched = voices.filter((v) => v.gender === value);
      if (matched.length > 0) setVoice(matched[0].id);
    }
  };

  /** 触发合成。 */
  const handleSynthesize = async () => {
    if (!text.trim()) {
      setSynthError('请输入要合成的文本');
      return;
    }
    try {
      setSynthesizing(true);
      setSynthError('');
      const entry = await synthesize({
        text,
        provider: provider === 'auto' ? undefined : provider,
        voice: voice || undefined,
        speed,
        pitch,
        volume,
        sampleRate,
        normalizeNumbers,
        normalizePunctuation,
        fullWidthToHalf,
      });
      setCurrentEntry(entry);
      // 同步到历史列表头部
      setHistory((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 50));
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : '合成失败');
    } finally {
      setSynthesizing(false);
    }
  };

  /** 删除历史记录。 */
  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteHistory(id);
      setHistory((prev) => prev.filter((e) => e.id !== id));
      if (currentEntry?.id === id) setCurrentEntry(null);
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : '删除失败');
    }
  };

  /** 当前音频的完整 URL（用于 <audio> src）。 */
  const audioSrc = useMemo(() => {
    if (!currentEntry) return '';
    const url = currentEntry.audioUrl;
    if (url.startsWith('http') || url.startsWith('//')) return url;
    return `${API_BASE_URL}${url}`;
  }, [currentEntry]);

  /** 格式化时长。 */
  const formatDuration = (ms?: number) => {
    if (ms == null) return '-';
    const s = ms / 1000;
    return `${s.toFixed(1)}s`;
  };

  /** 格式化时间。 */
  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 顶部标题与刷新按钮 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GraphicEqIcon color="primary" />
          <Typography variant="h5">TTS 语音合成</Typography>
        </Box>
        <Button
          onClick={() => {
            fetchProviders();
            fetchVoices(provider);
            fetchHistory();
          }}
          startIcon={<RefreshIcon />}
          variant="outlined"
          size="small"
        >
          刷新
        </Button>
      </Box>

      {metaError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setMetaError('')}>
          {metaError}
        </Alert>
      )}
      {synthError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSynthError('')}>
          {synthError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* 左侧：文本输入与参数 */}
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>合成配置</Typography>

              {/* 文本输入 */}
              <TextField
                label="待合成文本"
                multiline
                minRows={4}
                maxRows={10}
                fullWidth
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="请输入要转换为语音的文本…"
                helperText={`${text.length} 字符`}
                sx={{ mb: 2 }}
              />

              {/* Provider 与音色 */}
              <Grid container spacing={2} sx={{ mb: 1 }}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Provider</InputLabel>
                    <Select
                      label="Provider"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as string)}
                      disabled={metaLoading}
                    >
                      <MenuItem value="auto">
                        <em>自动选择</em>
                      </MenuItem>
                      {providers.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.label}（{p.id}）
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>音色</InputLabel>
                    <Select
                      label="音色"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value as string)}
                      disabled={metaLoading || filteredVoices.length === 0}
                    >
                      {filteredVoices.map((v) => (
                        <MenuItem key={v.id} value={v.id}>
                          {v.name || v.id}
                          {v.language ? `（${v.language}）` : ''}
                          {v.gender ? ` · ${v.gender}` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {/* 性别快捷筛选 */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  按性别筛选音色
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={gender}
                  onChange={handleGenderChange}
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  <ToggleButton value="">不限</ToggleButton>
                  {GENDERS.map((g) => (
                    <ToggleButton key={g.value} value={g.value}>
                      {g.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 语音参数 */}
              <Typography variant="subtitle2" mb={1}>语音参数</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="caption" color="text.secondary">
                    语速（speed）：{speed.toFixed(2)}
                  </Typography>
                  <Slider
                    value={speed}
                    onChange={(_e, v) => setSpeed(v as number)}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="caption" color="text.secondary">
                    音调（pitch）：{pitch}
                  </Typography>
                  <Slider
                    value={pitch}
                    onChange={(_e, v) => setPitch(v as number)}
                    min={-10}
                    max={10}
                    step={1}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="caption" color="text.secondary">
                    音量（volume）：{volume}
                  </Typography>
                  <Slider
                    value={volume}
                    onChange={(_e, v) => setVolume(v as number)}
                    min={0}
                    max={100}
                    step={1}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>采样率</InputLabel>
                    <Select
                      label="采样率"
                      value={sampleRate}
                      onChange={(e) => setSampleRate(e.target.value as number)}
                    >
                      {SAMPLE_RATES.map((sr) => (
                        <MenuItem key={sr} value={sr}>
                          {sr.toLocaleString()} Hz
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* 文本预处理选项 */}
              <Typography variant="subtitle2" mb={1}>文本预处理</Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <FormControlLabel
                  control={
                    <Switch
                      checked={normalizeNumbers}
                      onChange={(e) => setNormalizeNumbers(e.target.checked)}
                      size="small"
                    />
                  }
                  label="数字归一化"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={normalizePunctuation}
                      onChange={(e) => setNormalizePunctuation(e.target.checked)}
                      size="small"
                    />
                  }
                  label="标点处理"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={fullWidthToHalf}
                      onChange={(e) => setFullWidthToHalf(e.target.checked)}
                      size="small"
                    />
                  }
                  label="全角转半角"
                />
              </Stack>

              {/* 合成按钮 */}
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleSynthesize}
                  disabled={synthesizing || !text.trim()}
                  startIcon={synthesizing ? <CircularProgress size={18} /> : <PlayArrowIcon />}
                >
                  {synthesizing ? '合成中…' : '合成语音'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 右侧：音频播放器 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: gs.bgPanel, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>音频预览</Typography>
              {currentEntry ? (
                <Stack spacing={1.5}>
                  <audio
                    key={audioSrc}
                    src={audioSrc}
                    controls
                    style={{ width: '100%' }}
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`Provider: ${currentEntry.provider}`} />
                    <Chip size="small" label={`音色: ${currentEntry.voice}`} />
                    <Chip size="small" label={`格式: ${currentEntry.format}`} />
                    {currentEntry.sampleRate != null && (
                      <Chip size="small" label={`${currentEntry.sampleRate}Hz`} />
                    )}
                    <Chip size="small" label={`时长: ${formatDuration(currentEntry.durationMs)}`} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {currentEntry.textPreview}
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  点击「合成语音」生成音频后，将在此处播放。
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* 历史记录 */}
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">历史记录</Typography>
                <Button size="small" onClick={fetchHistory} disabled={historyLoading}>
                  刷新
                </Button>
              </Box>
              {historyLoading && history.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : history.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  暂无历史记录
                </Typography>
              ) : (
                <List dense sx={{ maxHeight: 360, overflowY: 'auto' }}>
                  {history.map((entry) => (
                    <ListItem
                      key={entry.id}
                      button
                      onClick={() => setCurrentEntry(entry)}
                      sx={{
                        borderRadius: 1,
                        '&:hover': { bgcolor: gs.bgHover },
                        bgcolor: currentEntry?.id === entry.id ? gs.bgActive : 'transparent',
                      }}
                    >
                      <ListItemText
                        primary={entry.textPreview}
                        secondary={
                          <React.Fragment>
                            <Typography component="span" variant="caption" color="text.secondary">
                              {entry.provider} · {entry.voice}
                            </Typography>
                            <br />
                            <Typography component="span" variant="caption" color="text.secondary">
                              {formatTime(entry.createdAt)} · {formatDuration(entry.durationMs)}
                            </Typography>
                          </React.Fragment>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title="删除">
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHistory(entry.id);
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
