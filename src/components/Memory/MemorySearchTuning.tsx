/**
 * MemorySearchTuning - 记忆搜索调优界面
 *
 * 功能：
 * - 权重滑块调整（向量搜索/全文搜索/时间衰减）
 * - MMR lambda 参数调整
 * - 分类过滤器
 * - 搜索结果对比（启用/禁用算法对比）
 * - 预设配置快捷选择
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Chip,
  Divider,
  Switch,
  TextField,
  Collapse,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Tooltip,
  IconButton,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ResetIcon from '@mui/icons-material/Refresh';
import InfoIcon from '@mui/icons-material/Info';
import CategoryIcon from '@mui/icons-material/Category';
import TimerIcon from '@mui/icons-material/Timer';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { getGrayScale } from '../../constants/theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** 记忆类别 */
type MemoryCategory = 'fact' | 'experience' | 'preference' | 'project';

/** 搜索配置 */
interface SearchConfig {
  vectorWeight: number;
  fullTextWeight: number;
  timeDecayWeight: number;
  mmrLambda: number;
  useMMR: boolean;
  useTimeDecay: boolean;
  useClassify: boolean;
  categories: MemoryCategory[];
  halfLifeDays: number;
  decayFactor: number;
}

/** 搜索结果项 */
interface SearchResultItem {
  id: number;
  text: string;
  similarity: number;
  category?: MemoryCategory;
  timeWeight?: number;
  mmrProcessed?: boolean;
  createdAt?: string;
}

/** 预设配置 */
interface PresetConfig {
  name: string;
  description: string;
  config: Partial<SearchConfig>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: '事实知识',
  experience: '经验记忆',
  preference: '偏好记忆',
  project: '项目记忆',
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  fact: '#6366F1',
  experience: '#10B981',
  preference: '#F59E0B',
  project: '#3B82F6',
};

const PRESETS: PresetConfig[] = [
  {
    name: '语义优先',
    description: '侧重向量语义搜索，适合语义相似匹配',
    config: {
      vectorWeight: 0.8,
      fullTextWeight: 0.2,
      timeDecayWeight: 0.1,
      mmrLambda: 0.7,
    },
  },
  {
    name: '关键词优先',
    description: '侧重全文关键词搜索，适合精确匹配',
    config: {
      vectorWeight: 0.3,
      fullTextWeight: 0.7,
      timeDecayWeight: 0.1,
      mmrLambda: 0.6,
    },
  },
  {
    name: '平衡模式',
    description: '均匀权重分配，综合考量',
    config: {
      vectorWeight: 0.5,
      fullTextWeight: 0.5,
      timeDecayWeight: 0.15,
      mmrLambda: 0.5,
    },
  },
  {
    name: '新鲜度优先',
    description: '重视最近访问的记忆',
    config: {
      vectorWeight: 0.4,
      fullTextWeight: 0.3,
      timeDecayWeight: 0.4,
      mmrLambda: 0.5,
      halfLifeDays: 7,
      decayFactor: 0.5,
    },
  },
  {
    name: '多样性优先',
    description: '强调结果多样性，避免相似结果',
    config: {
      vectorWeight: 0.6,
      fullTextWeight: 0.3,
      timeDecayWeight: 0.1,
      mmrLambda: 0.3,
      useMMR: true,
    },
  },
];

const DEFAULT_CONFIG: SearchConfig = {
  vectorWeight: 0.7,
  fullTextWeight: 0.3,
  timeDecayWeight: 0.2,
  mmrLambda: 0.5,
  useMMR: true,
  useTimeDecay: true,
  useClassify: true,
  categories: [],
  halfLifeDays: 30,
  decayFactor: 0.3,
};

/* ------------------------------------------------------------------ */
/*  API Helper                                                         */
/* ------------------------------------------------------------------ */

const API_BASE = '/api/memory';

async function enhancedSearch(
  query: string,
  config: SearchConfig,
  limit: number = 10
): Promise<{ results: SearchResultItem[]; algorithmUsed: string }> {
  const res = await fetch(`${API_BASE}/enhanced-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit,
      vectorWeight: config.vectorWeight,
      fullTextWeight: config.fullTextWeight,
      timeDecayWeight: config.timeDecayWeight,
      mmrLambda: config.mmrLambda,
      useMMR: config.useMMR,
      useTimeDecay: config.useTimeDecay,
      useClassify: config.useClassify,
      categories: config.categories,
      halfLifeDays: config.halfLifeDays,
      decayFactor: config.decayFactor,
    }),
  });
  if (!res.ok) throw new Error(`搜索失败: ${res.statusText}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MemorySearchTuning: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [query, setQuery] = useState('');
  const [config, setConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [compareMode, setCompareMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [enhancedResults, setEnhancedResults] = useState<SearchResultItem[]>([]);
  const [baselineResults, setBaselineResults] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 权重总和必须为 1
  const totalWeight = useMemo(() => {
    return config.vectorWeight + config.fullTextWeight + config.timeDecayWeight;
  }, [config]);

  const handleConfigChange = useCallback((key: keyof SearchConfig, value: number | boolean | MemoryCategory[]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCategoryToggle = useCallback((category: MemoryCategory) => {
    setConfig((prev) => {
      const categories = prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category];
      return { ...prev, categories };
    });
  }, []);

  const handlePresetSelect = useCallback((preset: PresetConfig) => {
    setConfig((prev) => ({ ...prev, ...preset.config }));
  }, []);

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setEnhancedResults([]);
    setBaselineResults([]);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setSearching(true);
    setError(null);

    try {
      // 执行增强搜索
      const enhancedData = await enhancedSearch(query, config, 10);
      setEnhancedResults(enhancedData.results);

      // 如果是对比模式，执行基准搜索（禁用所有增强）
      if (compareMode) {
        const baselineConfig: SearchConfig = {
          ...DEFAULT_CONFIG,
          useMMR: false,
          useTimeDecay: false,
          useClassify: false,
          categories: [],
          vectorWeight: 1.0,
          fullTextWeight: 0.0,
          timeDecayWeight: 0.0,
        };
        const baselineData = await enhancedSearch(query, baselineConfig, 10);
        setBaselineResults(baselineData.results);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }, [query, config, compareMode]);

  const renderResultCard = (result: SearchResultItem, index: number) => (
    <Card
      key={result.id}
      sx={{
        mb: 1,
        borderRadius: 2,
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
      }}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Chip
            label={index + 1}
            size="small"
            sx={{
              height: 20,
              minWidth: 20,
              fontSize: '0.65rem',
              fontWeight: 700,
              backgroundColor: '#6366F1',
              color: '#fff',
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontSize: '0.85rem',
                lineHeight: 1.5,
                color: gs.textPrimary,
                wordBreak: 'break-word',
              }}
            >
              {result.text.slice(0, 150)}
              {result.text.length > 150 ? '...' : ''}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                相似度: {result.similarity.toFixed(3)}
              </Typography>
              {result.category && (
                <Chip
                  label={CATEGORY_LABELS[result.category]}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.6rem',
                    backgroundColor: CATEGORY_COLORS[result.category],
                    color: '#fff',
                  }}
                />
              )}
              {result.mmrProcessed && (
                <Chip
                  label="MMR"
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.6rem',
                    backgroundColor: '#8B5CF6',
                    color: '#fff',
                  }}
                />
              )}
              {result.timeWeight !== undefined && result.timeWeight < 1 && (
                <Typography sx={{ fontSize: '0.65rem', color: '#F59E0B' }}>
                  时间权重: {result.timeWeight.toFixed(2)}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
          搜索调优
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="重置配置">
            <IconButton
              size="small"
              onClick={handleReset}
              sx={{ color: gs.textSecondary, '&:hover': { color: gs.textPrimary } }}
            >
              <ResetIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 查询输入 */}
      <Paper sx={{ p: 2, borderRadius: 2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <PsychologyIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
            搜索查询
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            placeholder="输入查询文本..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            fullWidth
            sx={{ flex: 1 }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            startIcon={searching ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            sx={{ minWidth: 80 }}
          >
            搜索
          </Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <FormControlLabel
            control={<Switch checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} size="small" />}
            label={
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                对比模式（与基准搜索对比）
              </Typography>
            }
          />
          <Tooltip title="对比模式下会同时执行禁用所有增强算法的基准搜索，便于对比效果">
            <InfoIcon sx={{ fontSize: 14, color: gs.textMuted }} />
          </Tooltip>
        </Box>
      </Paper>

      {/* 权重总和警告 */}
      {totalWeight !== 1 && (
        <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
          权重总和应为 1.0，当前总和: {totalWeight.toFixed(2)}
        </Alert>
      )}

      {/* 预设配置 */}
      <Paper sx={{ p: 2, borderRadius: 2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <TuneIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
            预设配置
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={preset.name}
              onClick={() => handlePresetSelect(preset)}
              size="small"
              sx={{
                cursor: 'pointer',
                backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
                '&:hover': {
                  backgroundColor: isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)',
                },
              }}
            />
          ))}
        </Box>
      </Paper>

      {/* 参数调整区域 */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Accordion defaultExpanded sx={{ borderRadius: 2, mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TuneIcon sx={{ fontSize: 18, color: '#6366F1' }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                权重参数调整
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* 向量搜索权重 */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary }}>
                    向量搜索权重
                  </Typography>
                  <Chip
                    label={config.vectorWeight.toFixed(2)}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#6366F1', color: '#fff' }}
                  />
                </Box>
                <Slider
                  value={config.vectorWeight}
                  onChange={(e, value) => handleConfigChange('vectorWeight', value as number)}
                  min={0}
                  max={1}
                  step={0.05}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 0.5, label: '0.5' },
                    { value: 1, label: '1' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>

              {/* 全文搜索权重 */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary }}>
                    全文搜索权重
                  </Typography>
                  <Chip
                    label={config.fullTextWeight.toFixed(2)}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#10B981', color: '#fff' }}
                  />
                </Box>
                <Slider
                  value={config.fullTextWeight}
                  onChange={(e, value) => handleConfigChange('fullTextWeight', value as number)}
                  min={0}
                  max={1}
                  step={0.05}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 0.5, label: '0.5' },
                    { value: 1, label: '1' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>

              {/* 时间衰减权重 */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <TimerIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary }}>
                    时间衰减权重
                  </Typography>
                  <Chip
                    label={config.timeDecayWeight.toFixed(2)}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#F59E0B', color: '#fff' }}
                  />
                </Box>
                <Slider
                  value={config.timeDecayWeight}
                  onChange={(e, value) => handleConfigChange('timeDecayWeight', value as number)}
                  min={0}
                  max={1}
                  step={0.05}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 0.5, label: '0.5' },
                    { value: 1, label: '1' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>

              {/* MMR Lambda */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary }}>
                    MMR Lambda 参数
                  </Typography>
                  <Chip
                    label={config.mmrLambda.toFixed(2)}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#8B5CF6', color: '#fff' }}
                  />
                  <Tooltip title="Lambda 值越接近 1 更重视相关性，越接近 0 更重视多样性">
                    <InfoIcon sx={{ fontSize: 14, color: gs.textMuted }} />
                  </Tooltip>
                </Box>
                <Slider
                  value={config.mmrLambda}
                  onChange={(e, value) => handleConfigChange('mmrLambda', value as number)}
                  min={0}
                  max={1}
                  step={0.05}
                  marks={[
                    { value: 0, label: '多样' },
                    { value: 0.5, label: '平衡' },
                    { value: 1, label: '相关' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion sx={{ borderRadius: 2, mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimerIcon sx={{ fontSize: 18, color: '#F59E0B' }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                时间衰减配置
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <FormControlLabel
                control={<Checkbox checked={config.useTimeDecay} onChange={(e) => handleConfigChange('useTimeDecay', e.target.checked)} />}
                label={<Typography sx={{ fontSize: '0.75rem' }}>启用时间衰减</Typography>}
              />

              <Collapse in={config.useTimeDecay}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* 半衰期 */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary }}>
                        半衰期（天）
                      </Typography>
                      <Chip
                        label={`${config.halfLifeDays} 天`}
                        size="small"
                        sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#F59E0B', color: '#fff' }}
                      />
                    </Box>
                    <Slider
                      value={config.halfLifeDays}
                      onChange={(e, value) => handleConfigChange('halfLifeDays', value as number)}
                      min={1}
                      max={365}
                      step={1}
                      marks={[
                        { value: 7, label: '7天' },
                        { value: 30, label: '30天' },
                        { value: 90, label: '90天' },
                        { value: 365, label: '365天' },
                      ]}
                      valueLabelDisplay="auto"
                    />
                  </Box>

                  {/* 衰减因子 */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary }}>
                        衰减因子
                      </Typography>
                      <Chip
                        label={config.decayFactor.toFixed(2)}
                        size="small"
                        sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#F59E0B', color: '#fff' }}
                      />
                    </Box>
                    <Slider
                      value={config.decayFactor}
                      onChange={(e, value) => handleConfigChange('decayFactor', value as number)}
                      min={0.05}
                      max={0.5}
                      step={0.05}
                      marks={[
                        { value: 0.1, label: '慢' },
                        { value: 0.3, label: '中' },
                        { value: 0.5, label: '快' },
                      ]}
                      valueLabelDisplay="auto"
                    />
                  </Box>
                </Box>
              </Collapse>
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion sx={{ borderRadius: 2, mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CategoryIcon sx={{ fontSize: 18, color: '#3B82F6' }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                分类过滤
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={<Checkbox checked={config.useClassify} onChange={(e) => handleConfigChange('useClassify', e.target.checked)} />}
                label={<Typography sx={{ fontSize: '0.75rem' }}>启用分类系统</Typography>}
              />

              <Collapse in={config.useClassify}>
                <FormControl component="fieldset">
                  <FormLabel component="legend" sx={{ fontSize: '0.75rem', color: gs.textSecondary, mb: 1 }}>
                    选择要包含的记忆类别
                  </FormLabel>
                  <FormGroup row>
                    {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((category) => (
                      <FormControlLabel
                        key={category}
                        control={
                          <Checkbox
                            checked={config.categories.includes(category)}
                            onChange={() => handleCategoryToggle(category)}
                            size="small"
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip
                              label={CATEGORY_LABELS[category]}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.6rem',
                                backgroundColor: CATEGORY_COLORS[category],
                                color: '#fff',
                              }}
                            />
                          </Box>
                        }
                      />
                    ))}
                  </FormGroup>
                </FormControl>
              </Collapse>
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* MMR 开关 */}
        <Paper sx={{ p: 2, borderRadius: 2, mb: 1 }}>
          <FormControlLabel
            control={<Checkbox checked={config.useMMR} onChange={(e) => handleConfigChange('useMMR', e.target.checked)} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.75rem' }}>启用 MMR 去重</Typography>
                <Tooltip title="MMR 算法平衡相关性和多样性，避免返回相似结果">
                  <InfoIcon sx={{ fontSize: 14, color: gs.textMuted }} />
                </Tooltip>
              </Box>
            }
          />
        </Paper>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 搜索结果 */}
      {enhancedResults.length > 0 && (
        <Paper sx={{ flex: 1, overflow: 'hidden', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CompareArrowsIcon sx={{ fontSize: 18, color: '#6366F1' }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                搜索结果
              </Typography>
              <Chip
                label={`${enhancedResults.length} 条`}
                size="small"
                sx={{ height: 16, fontSize: '0.6rem', backgroundColor: '#6366F1', color: '#fff' }}
              />
            </Box>
          </Box>

          <Divider />

          {compareMode ? (
            <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', gap: 2, p: 2 }}>
              {/* 增强搜索结果 */}
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1, color: '#6366F1' }}>
                  增强搜索（启用算法）
                </Typography>
                {enhancedResults.map((result, index) => renderResultCard(result, index))}
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* 基准搜索结果 */}
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1, color: '#94A3B8' }}>
                  基准搜索（禁用算法）
                </Typography>
                {baselineResults.map((result, index) => renderResultCard(result, index))}
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {enhancedResults.map((result, index) => renderResultCard(result, index))}
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default MemorySearchTuning;