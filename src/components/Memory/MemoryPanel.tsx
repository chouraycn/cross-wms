/**
 * MemoryPanel - 记忆管理面板（优化版）
 *
 * 功能：
 * - 记忆条目列表（支持分页、搜索、筛选、排序）
 * - 分类标签显示和时间衰减权重进度条
 * - MMR 标记和质量评分显示
 * - 访问次数统计和最后访问时间
 * - 批量操作（删除、分类调整、导出、合并）
 * - 右侧详情抽屉（编辑、查看相似记忆）
 * - 高级搜索面板
 * - 自动分类建议和标签输入增强
 * - 深色/浅色主题适配
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tooltip,
  useTheme,
  Pagination,
  FormControl,
  Select,
  MenuItem,
  Collapse,
  LinearProgress,
  Fade,
  Slide,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import PsychologyIcon from '@mui/icons-material/Psychology';
import FilterListIcon from '@mui/icons-material/FilterList';
import SortIcon from '@mui/icons-material/Sort';
import CategoryIcon from '@mui/icons-material/Category';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarIcon from '@mui/icons-material/Star';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import HistoryIcon from '@mui/icons-material/History';
import { getGrayScale } from '../../constants/theme';
import MemorySearchDialog from './MemorySearchDialog';
import MemoryDetailDrawer from './MemoryDetailDrawer';
import MemoryBatchOperations from './MemoryBatchOperations';
import TagInput from './TagInput';
import {
  MemoryEntry,
  MemoryStats,
  MemoryListResponse,
  MemoryCategory,
  BatchOperationType,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  FilterConfig,
  SortOption,
} from '../../types/memory';
import {
  filterMemories,
  calculateCategoryCounts,
  calculateAvgAccessCount,
  suggestCategory,
  suggestImportance,
  formatTimeWeight,
  getCategoryColor,
  getCategoryLabel,
  getSearchHistory,
  addSearchHistory,
} from './memoryUtils';

/* ------------------------------------------------------------------ */
/*  API Helper                                                         */
/* ------------------------------------------------------------------ */

const API_BASE = '/api/memory';

async function fetchMemoryList(limit: number = 20, offset: number = 0): Promise<MemoryListResponse> {
  const res = await fetch(`${API_BASE}/list?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`获取记忆列表失败: ${res.statusText}`);
  return res.json();
}

async function fetchMemoryStats(): Promise<MemoryStats> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`获取统计信息失败: ${res.statusText}`);
  return res.json();
}

async function addMemory(
  text: string,
  metadata?: Record<string, unknown>,
  category?: MemoryCategory,
  importance?: number
): Promise<{ id: number; success: boolean }> {
  const res = await fetch(`${API_BASE}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, metadata, category, importance }),
  });
  if (!res.ok) throw new Error(`添加记忆失败: ${res.statusText}`);
  return res.json();
}

async function deleteMemoryEntry(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除记忆失败: ${res.statusText}`);
  return res.json();
}

async function updateMemory(id: number, updates: Partial<MemoryEntry>): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`更新记忆失败: ${res.statusText}`);
  return res.json();
}

async function batchDeleteMemories(ids: number[]): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`批量删除失败: ${res.statusText}`);
  return res.json();
}

async function batchUpdateCategory(ids: number[], category: MemoryCategory): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/batch-category`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, category }),
  });
  if (!res.ok) throw new Error(`批量调整分类失败: ${res.statusText}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Memory Item Component                                              */
/* ------------------------------------------------------------------ */

interface MemoryItemProps {
  memory: MemoryEntry;
  selected: boolean;
  onSelect: (id: number) => void;
  onOpenDetail: (memory: MemoryEntry) => void;
}

const MemoryItem = memo(({ memory, selected, onSelect, onOpenDetail }: MemoryItemProps) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Fade in timeout={200}>
      <ListItem
        sx={{
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          transition: 'all 0.2s',
          '&:hover': {
            backgroundColor: gs.bgHover,
            transform: 'translateX(4px)',
          },
        }}
        onClick={() => onOpenDetail(memory)}
      >
        <ListItemIcon>
          <Checkbox
            checked={selected}
            onChange={() => onSelect(memory.id)}
            size="small"
            onClick={(e) => e.stopPropagation()}
          />
        </ListItemIcon>

        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Typography
                sx={{
                  fontSize: '0.85rem',
                  color: gs.textPrimary,
                  lineHeight: 1.5,
                  flex: 1,
                  wordBreak: 'break-word',
                }}
              >
                {memory.text}
              </Typography>
            </Box>
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {/* ID */}
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                ID: {memory.id}
              </Typography>

              {/* 分类标签 */}
              {memory.category && (
                <Chip
                  label={CATEGORY_LABELS[memory.category]}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    backgroundColor: CATEGORY_COLORS[memory.category],
                    color: '#fff',
                    fontWeight: 600,
                  }}
                />
              )}

              {/* 时间衰减权重 */}
              {memory.timeWeight !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 60 }}>
                  <AccessTimeIcon sx={{ fontSize: 12, color: '#F59E0B' }} />
                  <LinearProgress
                    variant="determinate"
                    value={memory.timeWeight * 100}
                    sx={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: gs.border,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: '#F59E0B',
                        borderRadius: 2,
                      },
                    }}
                  />
                  <Typography sx={{ fontSize: '0.65rem', color: '#F59E0B', fontWeight: 600 }}>
                    {formatTimeWeight(memory.timeWeight)}
                  </Typography>
                </Box>
              )}

              {/* MMR 标记 */}
              {memory.mmrProcessed && (
                <Chip
                  label="MMR"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    backgroundColor: '#8B5CF6',
                    color: '#fff',
                  }}
                />
              )}

              {/* 质量评分 */}
              {memory.qualityScore !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <StarIcon sx={{ fontSize: 12, color: '#10B981' }} />
                  <Typography sx={{ fontSize: '0.65rem', color: '#10B981', fontWeight: 600 }}>
                    {(memory.qualityScore * 100).toFixed(0)}%
                  </Typography>
                </Box>
              )}

              {/* 访问次数 */}
              {memory.accessCount !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingUpIcon sx={{ fontSize: 12, color: gs.textMuted }} />
                  <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                    {memory.accessCount}次
                  </Typography>
                </Box>
              )}

              {/* 创建时间 */}
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                {new Date(memory.createdAt).toLocaleDateString()}
              </Typography>

              {/* 最后访问时间 */}
              {memory.lastAccessedAt && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HistoryIcon sx={{ fontSize: 12, color: gs.textMuted }} />
                  <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                    {new Date(memory.lastAccessedAt).toLocaleDateString()}
                  </Typography>
                </Box>
              )}

              {/* 元数据标签数量 */}
              {memory.metadata && Object.keys(memory.metadata).length > 0 && (
                <Chip
                  label={`${Object.keys(memory.metadata).length} 个标签`}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                  }}
                />
              )}
            </Box>
          }
        />
      </ListItem>
    </Fade>
  );
});

MemoryItem.displayName = 'MemoryItem';

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const MemoryPanel: React.FC = memo(() => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats>({ totalMemories: 0, avgTextLength: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryTags, setNewMemoryTags] = useState<string[]>([]);
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory | ''>('');
  const [newMemoryImportance, setNewMemoryImportance] = useState(0.5);
  const [adding, setAdding] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState<MemoryCategory | null>(null);

  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    category: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    searchQuery: '',
  });

  // 加载记忆列表
  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;
      const data = await fetchMemoryList(pageSize, offset);
      setMemories(data.memories);
      const statsData = await fetchMemoryStats();
      setStats(statsData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadMemories();
    setSearchHistory(getSearchHistory());
  }, [loadMemories]);

  // 筛选后的记忆列表
  const filteredMemories = useMemo(() => {
    return filterMemories(memories, filterConfig);
  }, [memories, filterConfig]);

  // 分类统计
  const categoryCounts = useMemo(() => calculateCategoryCounts(memories), [memories]);

  // 选择操作
  const handleSelect = useCallback((id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.length === filteredMemories.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMemories.map(m => m.id));
    }
  }, [selectedIds, filteredMemories]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // 详情抽屉
  const handleOpenDetail = useCallback((memory: MemoryEntry) => {
    setSelectedMemory(memory);
    setDetailDrawerOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailDrawerOpen(false);
    setSelectedMemory(null);
  }, []);

  const handleUpdateMemory = useCallback(async (id: number, updates: Partial<MemoryEntry>) => {
    await updateMemory(id, updates);
    await loadMemories();
  }, [loadMemories]);

  const handleDeleteMemory = useCallback(async (id: number) => {
    await deleteMemoryEntry(id);
    await loadMemories();
  }, [loadMemories]);

  // 批量操作
  const handleBatchOperation = useCallback(async (operation: BatchOperationType, params?: Record<string, unknown>) => {
    if (selectedIds.length === 0) return;

    try {
      if (operation === 'delete') {
        await batchDeleteMemories(selectedIds);
      } else if (operation === 'changeCategory' && params?.category) {
        await batchUpdateCategory(selectedIds, params.category as MemoryCategory);
      }
      await loadMemories();
    } catch (err) {
      setError(`批量操作失败: ${(err as Error).message}`);
    }
  }, [selectedIds, loadMemories]);

  // 添加记忆
  const handleTextChange = useCallback((text: string) => {
    setNewMemoryText(text);
    // 自动分类建议
    const suggested = suggestCategory(text);
    setSuggestedCategory(suggested);
    // 自动重要性建议
    const importance = suggestImportance(text);
    setNewMemoryImportance(importance);
  }, []);

  const handleAddMemory = useCallback(async () => {
    if (!newMemoryText.trim()) return;
    setAdding(true);
    try {
      const metadata: Record<string, unknown> = {};
      newMemoryTags.forEach(tag => {
        metadata[tag] = true;
      });

      await addMemory(
        newMemoryText,
        metadata,
        newMemoryCategory || suggestedCategory || undefined,
        newMemoryImportance
      );

      setAddDialogOpen(false);
      setNewMemoryText('');
      setNewMemoryTags([]);
      setNewMemoryCategory('');
      setNewMemoryImportance(0.5);
      setSuggestedCategory(null);
      await loadMemories();
    } catch (err) {
      setError(`添加失败: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  }, [newMemoryText, newMemoryTags, newMemoryCategory, suggestedCategory, newMemoryImportance, loadMemories]);

  // 搜索
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    addSearchHistory(searchQuery);
    setSearchHistory(getSearchHistory());
    setFilterConfig(prev => ({ ...prev, searchQuery }));
  }, [searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setFilterConfig(prev => ({ ...prev, searchQuery: '' }));
  }, []);

  const totalPages = Math.ceil(stats.totalMemories / pageSize);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
          记忆管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="添加记忆">
            <IconButton
              size="small"
              onClick={() => setAddDialogOpen(true)}
              sx={{ color: gs.textSecondary, '&:hover': { color: gs.textPrimary } }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="语义搜索">
            <IconButton
              size="small"
              onClick={() => setSearchDialogOpen(true)}
              sx={{ color: gs.textSecondary, '&:hover': { color: gs.textPrimary } }}
            >
              <SearchIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="刷新">
            <IconButton
              size="small"
              onClick={loadMemories}
              disabled={loading}
              sx={{ color: gs.textSecondary, '&:hover': { color: gs.textPrimary } }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 统计信息卡片 */}
      <Paper
        sx={{
          p: 2,
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.03)',
          border: `1px solid ${isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)'}`,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StorageIcon sx={{ fontSize: 24, color: '#6366F1' }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
              向量索引状态
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`总数: ${stats.totalMemories}`}
                size="small"
                sx={{ backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)' }}
              />
              <Chip
                label={`平均长度: ${stats.avgTextLength.toFixed(1)} 字`}
                size="small"
                sx={{ backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)' }}
              />
              {/* 分类统计 */}
              {(Object.keys(categoryCounts) as MemoryCategory[]).map(cat => (
                categoryCounts[cat] > 0 && (
                  <Chip
                    key={cat}
                    label={`${CATEGORY_LABELS[cat]}: ${categoryCounts[cat]}`}
                    size="small"
                    sx={{
                      backgroundColor: CATEGORY_COLORS[cat],
                      color: '#fff',
                      fontSize: '0.7rem',
                    }}
                  />
                )
              ))}
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* 搜索和筛选工具栏 */}
      <Paper sx={{ p: 1.5, borderRadius: 2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* 搜索框 */}
          <TextField
            size="small"
            placeholder="搜索记忆..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ flex: 1 }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={handleSearch}
            disabled={!searchQuery.trim()}
            startIcon={<SearchIcon />}
          >
            搜索
          </Button>
          {searchQuery && (
            <Button size="small" onClick={handleClearSearch}>
              清除
            </Button>
          )}

          <Divider orientation="vertical" flexItem sx={{ height: 24, mx: 0.5 }} />

          {/* 高级筛选按钮 */}
          <Tooltip title="高级筛选">
            <IconButton
              size="small"
              onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
              sx={{ color: gs.textSecondary }}
            >
              {advancedFilterOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* 高级筛选面板 */}
        <Collapse in={advancedFilterOpen}>
          <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
            {/* 分类筛选 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={filterConfig.category || 'all'}
                onChange={(e) => setFilterConfig(prev => ({ ...prev, category: e.target.value as MemoryCategory | 'all' }))}
                displayEmpty
              >
                <MenuItem value="all">全部分类</MenuItem>
                {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(cat => (
                  <MenuItem key={cat} value={cat}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: CATEGORY_COLORS[cat],
                        }}
                      />
                      {CATEGORY_LABELS[cat]}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 排序选项 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={filterConfig.sortBy || 'createdAt'}
                onChange={(e) => setFilterConfig(prev => ({ ...prev, sortBy: e.target.value as SortOption }))}
              >
                <MenuItem value="createdAt">创建时间</MenuItem>
                <MenuItem value="updatedAt">更新时间</MenuItem>
                <MenuItem value="accessCount">访问次数</MenuItem>
                <MenuItem value="lastAccessedAt">最后访问</MenuItem>
                <MenuItem value="importance">重要性</MenuItem>
                <MenuItem value="qualityScore">质量评分</MenuItem>
              </Select>
            </FormControl>

            {/* 排序方向 */}
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <Select
                value={filterConfig.sortOrder || 'desc'}
                onChange={(e) => setFilterConfig(prev => ({ ...prev, sortOrder: e.target.value as 'asc' | 'desc' }))}
              >
                <MenuItem value="desc">降序</MenuItem>
                <MenuItem value="asc">升序</MenuItem>
              </Select>
            </FormControl>

            {/* 搜索历史 */}
            {searchHistory.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryIcon sx={{ fontSize: 16, color: gs.textMuted }} />
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {searchHistory.slice(0, 3).map((query, index) => (
                    <Chip
                      key={index}
                      label={query}
                      size="small"
                      onClick={() => {
                        setSearchQuery(query);
                        setFilterConfig(prev => ({ ...prev, searchQuery: query }));
                      }}
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        cursor: 'pointer',
                        backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* 批量操作工具栏 */}
      {selectedIds.length > 0 && (
        <MemoryBatchOperations
          selectedMemories={memories.filter(m => selectedIds.includes(m.id))}
          onBatchOperation={handleBatchOperation}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 记忆列表 */}
      <Paper sx={{ flex: 1, overflow: 'hidden', borderRadius: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress size={24} />
            <Typography sx={{ ml: 1, fontSize: '0.85rem', color: gs.textMuted }}>
              加载中...
            </Typography>
          </Box>
        )}
        {!loading && filteredMemories.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
              {memories.length === 0 ? '暂无记忆数据' : '没有符合条件的记忆'}
            </Typography>
          </Box>
        )}
        {!loading && filteredMemories.length > 0 && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 选择全部 */}
            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${gs.border}` }}>
              <Checkbox
                checked={selectedIds.length === filteredMemories.length}
                onChange={handleSelectAll}
                size="small"
              />
              <Typography sx={{ fontSize: '0.85rem', color: gs.textSecondary }}>
                {selectedIds.length > 0 ? `已选择 ${selectedIds.length} 条` : `共 ${filteredMemories.length} 条`}
              </Typography>
            </Box>

            {/* 记忆列表 */}
            <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
              {filteredMemories.map((memory) => (
                <React.Fragment key={memory.id}>
                  <MemoryItem
                    memory={memory}
                    selected={selectedIds.includes(memory.id)}
                    onSelect={handleSelect}
                    onOpenDetail={handleOpenDetail}
                  />
                  <Divider />
                </React.Fragment>
              ))}
            </List>

            {/* 分页 */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5, flexShrink: 0 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(e, newPage) => setPage(newPage)}
                  size="small"
                  color="primary"
                />
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* 添加记忆对话框 */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加记忆</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="记忆内容"
            fullWidth
            multiline
            rows={4}
            value={newMemoryText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="输入要存储的文本内容..."
          />

          {/* 自动分类建议 */}
          {suggestedCategory && (
            <Alert severity="info" sx={{ mt: 1, borderRadius: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CategoryIcon sx={{ fontSize: 16 }} />
                <Typography sx={{ fontSize: '0.85rem' }}>
                  建议分类: {CATEGORY_LABELS[suggestedCategory]}
                </Typography>
                <Button
                  size="small"
                  onClick={() => setNewMemoryCategory(suggestedCategory)}
                  sx={{ ml: 1 }}
                >
                  应用
                </Button>
              </Box>
            </Alert>
          )}

          {/* 手动分类选择 */}
          <FormControl fullWidth size="small" sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
              记忆分类
            </Typography>
            <Select
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory | '')}
              displayEmpty
            >
              <MenuItem value="">
                <em>未分类</em>
              </MenuItem>
              {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(cat => (
                <MenuItem key={cat} value={cat}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: CATEGORY_COLORS[cat],
                      }}
                    />
                    {CATEGORY_LABELS[cat]}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 重要性权重 */}
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
              重要性权重
            </Typography>
            <LinearProgress
              variant="determinate"
              value={newMemoryImportance * 100}
              sx={{
                height: 8,
                borderRadius: 2,
                backgroundColor: gs.border,
                '& .MuiLinearProgress-bar': {
                  backgroundColor: '#6366F1',
                  borderRadius: 2,
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>低</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: 600 }}>
                {(newMemoryImportance * 100).toFixed(0)}%
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>高</Typography>
            </Box>
          </Box>

          {/* 标签输入 */}
          <Box sx={{ mt: 2 }}>
            <TagInput
              tags={newMemoryTags}
              onChange={setNewMemoryTags}
              suggestions={['重要', '紧急', '临时', '长期', '项目', '个人']}
              label="元数据标签"
              placeholder="输入标签后按 Enter"
              maxTags={5}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleAddMemory}
            disabled={adding || !newMemoryText.trim()}
            variant="contained"
            startIcon={adding ? <CircularProgress size={16} /> : <AddIcon />}
          >
            添加
          </Button>
        </DialogActions>
      </Dialog>

      {/* 搜索对话框 */}
      <MemorySearchDialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
      />

      {/* 详情抽屉 */}
      <MemoryDetailDrawer
        open={detailDrawerOpen}
        memory={selectedMemory}
        onClose={handleCloseDetail}
        onUpdate={handleUpdateMemory}
        onDelete={handleDeleteMemory}
      />
    </Box>
  );
});

MemoryPanel.displayName = 'MemoryPanel';

export default MemoryPanel;