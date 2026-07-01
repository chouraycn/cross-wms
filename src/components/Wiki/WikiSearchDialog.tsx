/**
 * Wiki Search Dialog - Wiki 搜索对话框组件
 *
 * 提供混合搜索（向量搜索 + 全文搜索）功能
 * 支持标签过滤、来源过滤、搜索模式选择
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Divider,
  CircularProgress,
  IconButton,
  Tooltip,
  useTheme,
  Slider,
  Paper,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Tag as TagIcon,
  FilterList as FilterIcon,
  Memory as MemoryIcon,
  TextFields as TextFieldsIcon,
  Tune as TuneIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { getGrayScale } from '../../constants/theme';

// ===================== Types =====================

interface WikiSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string, options?: {
    tags?: string[];
    source?: 'markdown' | 'manual' | 'json' | 'sync';
    useVectorSearch?: boolean;
    useFtsSearch?: boolean;
  }) => void;
  allTags: string[];
}

interface SearchOptions {
  query: string;
  selectedTags: string[];
  source: 'all' | 'markdown' | 'manual' | 'json' | 'sync';
  useVectorSearch: boolean;
  useFtsSearch: boolean;
  vectorWeight: number;
  ftsWeight: number;
  topK: number;
}

const SOURCE_LABELS: Record<string, string> = {
  all: '全部来源',
  markdown: 'Markdown 导入',
  manual: '手动创建',
  json: 'JSON 导入',
  sync: '同步',
};

const SEARCH_MODE_LABELS = {
  hybrid: '混合搜索',
  vector: '向量搜索',
  fts: '全文搜索',
};

// ===================== Component =====================

const WikiSearchDialog: React.FC<WikiSearchDialogProps> = ({
  open,
  onClose,
  onSearch,
  allTags,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // State
  const [options, setOptions] = useState<SearchOptions>({
    query: '',
    selectedTags: [],
    source: 'all',
    useVectorSearch: true,
    useFtsSearch: true,
    vectorWeight: 0.5,
    ftsWeight: 0.5,
    topK: 10,
  });

  const [isSearching, setIsSearching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setOptions({
        query: '',
        selectedTags: [],
        source: 'all',
        useVectorSearch: true,
        useFtsSearch: true,
        vectorWeight: 0.5,
        ftsWeight: 0.5,
        topK: 10,
      });
      setShowAdvanced(false);
      setTagInput('');
    }
  }, [open]);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!options.query.trim()) {
      return;
    }

    setIsSearching(true);

    try {
      await onSearch(options.query, {
        tags: options.selectedTags.length > 0 ? options.selectedTags : undefined,
        source: options.source !== 'all' ? options.source as any : undefined,
        useVectorSearch: options.useVectorSearch,
        useFtsSearch: options.useFtsSearch,
      });
      onClose();
    } catch (error) {
      console.error('Search failed:', error);
    }

    setIsSearching(false);
  }, [options, onSearch, onClose]);

  // Handle tag selection
  const handleTagSelect = useCallback((tag: string) => {
    if (!options.selectedTags.includes(tag)) {
      setOptions(prev => ({
        ...prev,
        selectedTags: [...prev.selectedTags, tag],
      }));
    }
  }, [options.selectedTags]);

  // Handle tag removal
  const handleTagRemove = useCallback((tag: string) => {
    setOptions(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.filter(t => t !== tag),
    }));
  }, []);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setOptions(prev => ({
      ...prev,
      selectedTags: [],
      source: 'all',
    }));
  }, []);

  // Get search mode label
  const getSearchModeLabel = useCallback(() => {
    if (options.useVectorSearch && options.useFtsSearch) {
      return SEARCH_MODE_LABELS.hybrid;
    }
    if (options.useVectorSearch) {
      return SEARCH_MODE_LABELS.vector;
    }
    if (options.useFtsSearch) {
      return SEARCH_MODE_LABELS.fts;
    }
    return '未选择';
  }, [options.useVectorSearch, options.useFtsSearch]);

  // Calculate search mode icon
  const getSearchModeIcon = useCallback(() => {
    if (options.useVectorSearch && options.useFtsSearch) {
      return <TuneIcon fontSize="small" />;
    }
    if (options.useVectorSearch) {
      return <MemoryIcon fontSize="small" />;
    }
    if (options.useFtsSearch) {
      return <TextFieldsIcon fontSize="small" />;
    }
    return null;
  }, [options.useVectorSearch, options.useFtsSearch]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontWeight: 600 }}>
            Wiki 混合搜索
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Search Query */}
          <TextField
            fullWidth
            label="搜索关键词"
            value={options.query}
            onChange={(e) => setOptions(prev => ({ ...prev, query: e.target.value }))}
            placeholder="输入要搜索的内容..."
            size="small"
            autoFocus
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />

          {/* Search Mode */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              icon={getSearchModeIcon() || undefined}
              label={getSearchModeLabel()}
              size="small"
              color="primary"
              variant="outlined"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={options.useVectorSearch}
                  onChange={(e) => setOptions(prev => ({ ...prev, useVectorSearch: e.target.checked }))}
                  size="small"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MemoryIcon fontSize="small" sx={{ fontSize: 14 }} />
                  <Typography variant="body2">向量搜索</Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={options.useFtsSearch}
                  onChange={(e) => setOptions(prev => ({ ...prev, useFtsSearch: e.target.checked }))}
                  size="small"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TextFieldsIcon fontSize="small" sx={{ fontSize: 14 }} />
                  <Typography variant="body2">全文搜索</Typography>
                </Box>
              }
            />
          </Box>

          <Divider />

          {/* Filters */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterIcon fontSize="small" sx={{ color: gs.textMuted }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                过滤条件
              </Typography>
              {(options.selectedTags.length > 0 || options.source !== 'all') && (
                <Button
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={handleClearFilters}
                  sx={{ ml: 'auto' }}
                >
                  清除
                </Button>
              )}
            </Box>

            {/* Source Filter */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>来源</InputLabel>
              <Select
                value={options.source}
                label="来源"
                onChange={(e) => setOptions(prev => ({ ...prev, source: e.target.value as any }))}
              >
                <MenuItem value="all">{SOURCE_LABELS.all}</MenuItem>
                <MenuItem value="manual">{SOURCE_LABELS.manual}</MenuItem>
                <MenuItem value="markdown">{SOURCE_LABELS.markdown}</MenuItem>
                <MenuItem value="json">{SOURCE_LABELS.json}</MenuItem>
                <MenuItem value="sync">{SOURCE_LABELS.sync}</MenuItem>
              </Select>
            </FormControl>

            {/* Tag Filter */}
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted, mb: 0.5, display: 'block' }}>
                标签过滤
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                {options.selectedTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => handleTagRemove(tag)}
                    icon={<TagIcon />}
                  />
                ))}
                {options.selectedTags.length === 0 && (
                  <Typography variant="body2" sx={{ color: gs.textMuted }}>
                    未选择标签
                  </Typography>
                )}
              </Box>

              {/* Available Tags */}
              {allTags.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {allTags.filter(t => !options.selectedTags.includes(t)).slice(0, 20).map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      variant="outlined"
                      onClick={() => handleTagSelect(tag)}
                    />
                  ))}
                </Box>
              )}

              {/* Tag Input */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  size="small"
                  placeholder="输入自定义标签"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  sx={{ flex: 1, maxWidth: 200 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (tagInput.trim() && !options.selectedTags.includes(tagInput.trim())) {
                      handleTagSelect(tagInput.trim());
                      setTagInput('');
                    }
                  }}
                  disabled={!tagInput.trim()}
                >
                  添加
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Advanced Options */}
          <Box>
            <Button
              size="small"
              startIcon={<TuneIcon />}
              onClick={() => setShowAdvanced(!showAdvanced)}
              sx={{ mb: 1 }}
            >
              {showAdvanced ? '隐藏高级选项' : '显示高级选项'}
            </Button>

            {showAdvanced && (
              <Paper
                variant="outlined"
                sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                  高级选项用于调整搜索参数，通常默认值即可满足需求。
                </Alert>

                {/* Result Count */}
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    返回结果数量: {options.topK}
                  </Typography>
                  <Slider
                    value={options.topK}
                    onChange={(e, value) => setOptions(prev => ({ ...prev, topK: value as number }))}
                    min={5}
                    max={50}
                    step={5}
                    marks={[
                      { value: 5, label: '5' },
                      { value: 20, label: '20' },
                      { value: 50, label: '50' },
                    ]}
                    size="small"
                  />
                </Box>

                {/* Weight Settings */}
                {options.useVectorSearch && options.useFtsSearch && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      搜索权重配置
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ color: gs.textMuted }}>
                          向量搜索权重: {Math.round(options.vectorWeight * 100)}%
                        </Typography>
                        <Slider
                          value={options.vectorWeight}
                          onChange={(e, value) => setOptions(prev => ({ ...prev, vectorWeight: value as number }))}
                          min={0}
                          max={1}
                          step={0.1}
                          size="small"
                        />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ color: gs.textMuted }}>
                          全文搜索权重: {Math.round(options.ftsWeight * 100)}%
                        </Typography>
                        <Slider
                          value={options.ftsWeight}
                          onChange={(e, value) => setOptions(prev => ({ ...prev, ftsWeight: value as number }))}
                          min={0}
                          max={1}
                          step={0.1}
                          size="small"
                        />
                      </Box>
                    </Box>
                  </Box>
                )}
              </Paper>
            )}
          </Box>

          {/* Search Tips */}
          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
            <Typography variant="caption" sx={{ color: gs.textMuted }}>
              💡 搜索提示：
            </Typography>
            <Typography variant="caption" sx={{ color: gs.textMuted, display: 'block', mt: 0.5 }}>
              • 向量搜索：语义相似度匹配，适合概念性查询
            </Typography>
            <Typography variant="caption" sx={{ color: gs.textMuted, display: 'block' }}>
              • 全文搜索：关键词精确匹配，适合特定术语查找
            </Typography>
            <Typography variant="caption" sx={{ color: gs.textMuted, display: 'block' }}>
              • 混合搜索：结合两者优势，推荐默认使用
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">
          取消
        </Button>
        <Button
          onClick={handleSearch}
          variant="contained"
          size="small"
          startIcon={isSearching ? <CircularProgress size={16} /> : <SearchIcon />}
          disabled={isSearching || !options.query.trim() || (!options.useVectorSearch && !options.useFtsSearch)}
        >
          {isSearching ? '搜索中...' : '搜索'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WikiSearchDialog;