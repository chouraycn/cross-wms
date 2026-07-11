/**
 * Wiki Panel - Wiki 知识库面板组件
 *
 * 提供 Wiki 知识库的浏览、搜索、创建、编辑等功能
 * 参考 OpenClaw memory-wiki 架构
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  CircularProgress,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  TablePagination,
  Menu,
  ListItemIcon,
  LinearProgress,
  Fade,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Description as DescriptionIcon,
  Tag as TagIcon,
  Info as InfoIcon,
  UploadFile as UploadFileIcon,
  History as HistoryIcon,
  Label as LabelIcon,
  FilterList as FilterIcon,
  Sort as SortIcon,
  Close as CloseIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import WikiSearchDialog from './WikiSearchDialog';

// ===================== Types =====================

interface WikiEntry {
  id: number;
  title: string;
  content: string;
  summary?: string;
  source?: 'markdown' | 'manual' | 'json' | 'sync';
  sourcePath?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface WikiSearchResult {
  id: number;
  title: string;
  summary?: string;
  similarity: number;
  tags?: string[];
  matchSource?: 'vector' | 'fts' | 'hybrid';
  createdAt?: string;
  updatedAt?: string;
}

interface WikiVersion {
  id: number;
  entryId: number;
  version: number;
  title: string;
  content: string;
  summary?: string;
  createdAt: string;
  changeNote?: string;
}

interface WikiStats {
  totalEntries: number;
  totalVersions: number;
  totalLinks: number;
  totalTags: number;
  avgContentLength: number;
  sourceDistribution: Record<string, number>;
  tagDistribution: Array<{ name: string; count: number }>;
}

// ===================== API Helper =====================

const wikiApi = {
  search: async (query: string, options?: {
    topK?: number;
    tags?: string[];
    source?: 'markdown' | 'manual' | 'json' | 'sync';
    useVectorSearch?: boolean;
    useFtsSearch?: boolean;
  }): Promise<WikiSearchResult[]> => {
    try {
      const response = await fetch('/api/wiki/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          topK: options?.topK || 10,
          tags: options?.tags,
          source: options?.source,
          useVectorSearch: options?.useVectorSearch !== false,
          useFtsSearch: options?.useFtsSearch !== false,
        }),
      });
      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Wiki search failed:', error);
      return [];
    }
  },

  get: async (id: number): Promise<WikiEntry | null> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}`);
      const data = await response.json();
      return data.entry || null;
    } catch (error) {
      console.error('Wiki get failed:', error);
      return null;
    }
  },

  create: async (entry: Partial<WikiEntry>): Promise<WikiEntry | null> => {
    try {
      const response = await fetch('/api/wiki/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const data = await response.json();
      return data.entry || null;
    } catch (error) {
      console.error('Wiki create failed:', error);
      return null;
    }
  },

  update: async (id: number, entry: Partial<WikiEntry>): Promise<WikiEntry | null> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const data = await response.json();
      return data.entry || null;
    } catch (error) {
      console.error('Wiki update failed:', error);
      return null;
    }
  },

  delete: async (id: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('Wiki delete failed:', error);
      return false;
    }
  },

  stats: async (): Promise<WikiStats | null> => {
    try {
      const response = await fetch('/api/wiki/stats');
      const data = await response.json();
      return data.stats || null;
    } catch (error) {
      console.error('Wiki stats failed:', error);
      return null;
    }
  },

  recent: async (limit: number = 10, offset: number = 0): Promise<{ entries: WikiEntry[]; total: number }> => {
    try {
      const response = await fetch(`/api/wiki/recent?limit=${limit}&offset=${offset}`);
      const data = await response.json();
      return { entries: data.entries || [], total: data.total || 0 };
    } catch (error) {
      console.error('Wiki recent failed:', error);
      return { entries: [], total: 0 };
    }
  },

  getVersions: async (id: number): Promise<WikiVersion[]> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}/versions`);
      const data = await response.json();
      return data.versions || [];
    } catch (error) {
      console.error('Wiki get versions failed:', error);
      return [];
    }
  },

  getTags: async (id: number): Promise<string[]> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}/tags`);
      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      console.error('Wiki get tags failed:', error);
      return [];
    }
  },

  addTag: async (id: number, tag: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('Wiki add tag failed:', error);
      return false;
    }
  },

  removeTag: async (id: number, tag: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/wiki/entry/${id}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('Wiki remove tag failed:', error);
      return false;
    }
  },

  getAllTags: async (): Promise<Array<{ name: string; count: number }>> => {
    try {
      const response = await fetch('/api/wiki/tags');
      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      console.error('Wiki get all tags failed:', error);
      return [];
    }
  },

  importMarkdown: async (filePath: string): Promise<{ success: boolean; entry?: WikiEntry; error?: string }> => {
    try {
      const response = await fetch('/api/wiki/import/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Wiki import markdown failed:', error);
      return { success: false, error: String(error) };
    }
  },
};

const SOURCE_LABELS: Record<string, string> = {
  markdown: 'Markdown',
  manual: '手动创建',
  json: 'JSON 导入',
  sync: '同步',
};

const SOURCE_COLORS: Record<string, string> = {
  markdown: '#3b82f6',
  manual: '#10b981',
  json: '#f59e0b',
  sync: '#8b5cf6',
};

// ===================== Main Component =====================

const WikiPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  // State
  const [entries, setEntries] = useState<WikiSearchResult[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<WikiEntry | null>(null);
  const [stats, setStats] = useState<WikiStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Partial<WikiEntry>>({});
  const [allTags, setAllTags] = useState<Array<{ name: string; count: number }>>([]);

  // Filter & Pagination State
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalEntries, setTotalEntries] = useState(0);

  // Version History State
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versions, setVersions] = useState<WikiVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<WikiVersion | null>(null);

  // Tag Management State
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Import State
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importing, setImporting] = useState(false);

  // Tab State
  const [detailTab, setDetailTab] = useState(0);

  // Load all tags
  const loadAllTags = useCallback(async () => {
    const tags = await wikiApi.getAllTags();
    setAllTags(tags);
  }, []);

  // Load recent entries
  const loadRecentEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const { entries: recentEntries, total } = await wikiApi.recent(rowsPerPage, page * rowsPerPage);
      setEntries(recentEntries.map(e => ({
        id: e.id,
        title: e.title,
        summary: e.summary,
        similarity: 1.0,
        tags: e.tags,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })));
      // 后端 /api/wiki/recent 仅返回 { entries } 而不返回 total（且忽略 offset），
      // 因此以本次实际条目数作为分页总数回退，避免分页控件显示 0。
      setTotalEntries(total || recentEntries.length);
    } catch (error) {
      showToast('加载失败', 'error');
    }
    setIsLoading(false);
  }, [showToast, page, rowsPerPage]);

  // Load stats
  const loadStats = useCallback(async () => {
    const statsData = await wikiApi.stats();
    setStats(statsData);
  }, []);

  // Initial load
  useEffect(() => {
    loadRecentEntries();
    loadStats();
    loadAllTags();
  }, [loadRecentEntries, loadStats, loadAllTags]);

  // Filter entries
  const handleFilterChange = useCallback(() => {
    setPage(0);
    loadRecentEntries();
  }, [loadRecentEntries]);

  // Select entry
  const handleSelectEntry = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      const entry = await wikiApi.get(id);
      setSelectedEntry(entry);
      setDetailTab(0);
    } catch (error) {
      showToast('加载条目失败', 'error');
    }
    setIsLoading(false);
  }, [showToast]);

  // Create new entry
  const handleCreate = useCallback(() => {
    setEditingEntry({ title: '', content: '', tags: [], source: 'manual' });
    setEditDialogOpen(true);
  }, []);

  // Edit entry
  const handleEdit = useCallback((entry: WikiEntry) => {
    setEditingEntry(entry);
    setEditDialogOpen(true);
  }, []);

  // Save entry
  const handleSave = useCallback(async () => {
    if (!editingEntry.title?.trim()) {
      showToast('标题不能为空', 'error');
      return;
    }
    if (!editingEntry.content?.trim()) {
      showToast('内容不能为空', 'error');
      return;
    }

    setIsLoading(true);
    try {
      if (editingEntry.id) {
        // Update existing
        const updated = await wikiApi.update(editingEntry.id, editingEntry);
        if (updated) {
          showToast('更新成功', 'success');
          setSelectedEntry(updated);
          loadRecentEntries();
          loadStats();
          loadAllTags();
        }
      } else {
        // Create new
        const created = await wikiApi.create(editingEntry);
        if (created) {
          showToast('创建成功', 'success');
          setSelectedEntry(created);
          loadRecentEntries();
          loadStats();
          loadAllTags();
        }
      }
      setEditDialogOpen(false);
    } catch (error) {
      showToast('保存失败', 'error');
    }
    setIsLoading(false);
  }, [editingEntry, showToast, loadRecentEntries, loadStats, loadAllTags]);

  // Delete entry
  const handleDelete = useCallback(async () => {
    if (!selectedEntry) return;

    setIsLoading(true);
    try {
      const success = await wikiApi.delete(selectedEntry.id);
      if (success) {
        showToast('删除成功', 'success');
        setSelectedEntry(null);
        loadRecentEntries();
        loadStats();
        loadAllTags();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (error) {
      showToast('删除失败', 'error');
    }
    setIsLoading(false);
    setDeleteDialogOpen(false);
  }, [selectedEntry, showToast, loadRecentEntries, loadStats, loadAllTags]);

  // Search from dialog
  const handleSearchSubmit = useCallback(async (query: string, options?: {
    tags?: string[];
    source?: 'markdown' | 'manual' | 'json' | 'sync';
    useVectorSearch?: boolean;
    useFtsSearch?: boolean;
  }) => {
    if (!query.trim()) {
      loadRecentEntries();
      return;
    }

    setIsLoading(true);
    try {
      const results = await wikiApi.search(query, {
        topK: 50,
        ...options,
      });
      setEntries(results);
      setTotalEntries(results.length);
      showToast(`找到 ${results.length} 个结果`, 'success');
    } catch (error) {
      showToast('搜索失败', 'error');
    }
    setIsLoading(false);
  }, [loadRecentEntries, showToast]);

  // Load version history
  const handleViewVersions = useCallback(async () => {
    if (!selectedEntry) return;
    setIsLoading(true);
    try {
      const versionList = await wikiApi.getVersions(selectedEntry.id);
      setVersions(versionList);
      setVersionDialogOpen(true);
    } catch (error) {
      showToast('加载版本历史失败', 'error');
    }
    setIsLoading(false);
  }, [selectedEntry, showToast]);

  // View specific version
  const handleViewVersion = useCallback((version: WikiVersion) => {
    setSelectedVersion(version);
  }, []);

  // Restore from version
  const handleRestoreVersion = useCallback(async (version: WikiVersion) => {
    if (!selectedEntry) return;
    setIsLoading(true);
    try {
      const updated = await wikiApi.update(selectedEntry.id, {
        title: version.title,
        content: version.content,
        summary: version.summary,
      });
      if (updated) {
        showToast('版本已恢复', 'success');
        setSelectedEntry(updated);
        setVersionDialogOpen(false);
        loadRecentEntries();
      }
    } catch (error) {
      showToast('恢复版本失败', 'error');
    }
    setIsLoading(false);
  }, [selectedEntry, showToast, loadRecentEntries]);

  // Add tag
  const handleAddTag = useCallback(async () => {
    if (!selectedEntry || !newTag.trim()) return;
    setIsLoading(true);
    try {
      const success = await wikiApi.addTag(selectedEntry.id, newTag.trim());
      if (success) {
        showToast('标签已添加', 'success');
        setNewTag('');
        // Reload entry
        const entry = await wikiApi.get(selectedEntry.id);
        setSelectedEntry(entry);
        loadAllTags();
      } else {
        showToast('添加标签失败', 'error');
      }
    } catch (error) {
      showToast('添加标签失败', 'error');
    }
    setIsLoading(false);
  }, [selectedEntry, newTag, showToast, loadAllTags]);

  // Remove tag
  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!selectedEntry) return;
    setIsLoading(true);
    try {
      const success = await wikiApi.removeTag(selectedEntry.id, tag);
      if (success) {
        showToast('标签已移除', 'success');
        // Reload entry
        const entry = await wikiApi.get(selectedEntry.id);
        setSelectedEntry(entry);
        loadAllTags();
      } else {
        showToast('移除标签失败', 'error');
      }
    } catch (error) {
      showToast('移除标签失败', 'error');
    }
    setIsLoading(false);
  }, [selectedEntry, showToast, loadAllTags]);

  // Import markdown
  const handleImport = useCallback(async () => {
    if (!importPath.trim()) {
      showToast('请输入文件路径', 'error');
      return;
    }

    setImporting(true);
    try {
      const result = await wikiApi.importMarkdown(importPath.trim());
      if (result.success) {
        showToast('导入成功', 'success');
        setImportDialogOpen(false);
        setImportPath('');
        loadRecentEntries();
        loadStats();
        loadAllTags();
        if (result.entry) {
          setSelectedEntry(result.entry);
        }
      } else {
        showToast(`导入失败: ${result.error || '未知错误'}`, 'error');
      }
    } catch (error) {
      showToast('导入失败', 'error');
    }
    setImporting(false);
  }, [importPath, showToast, loadRecentEntries, loadStats, loadAllTags]);

  // Pagination handlers
  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DescriptionIcon sx={{ fontSize: 24, color: gs.textPrimary }} />
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
            Wiki 知识库
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="刷新">
            <IconButton size="small" onClick={() => { loadRecentEntries(); loadStats(); loadAllTags(); }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="导入 Markdown">
            <IconButton size="small" onClick={() => setImportDialogOpen(true)}>
              <UploadFileIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            新建条目
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      {stats && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: `1px solid ${gs.border}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                总条目
              </Typography>
              <Typography sx={{ fontWeight: 600, color: gs.textPrimary }}>
                {stats.totalEntries}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                版本数
              </Typography>
              <Typography sx={{ fontWeight: 600, color: gs.textPrimary }}>
                {stats.totalVersions}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                标签数
              </Typography>
              <Typography sx={{ fontWeight: 600, color: '#3b82f6' }}>
                {stats.totalTags}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                平均长度
              </Typography>
              <Typography sx={{ fontWeight: 600, color: gs.textPrimary }}>
                {Math.round(stats.avgContentLength)}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Filter & Search */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<SearchIcon />}
          onClick={() => setSearchDialogOpen(true)}
        >
          混合搜索
        </Button>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>来源</InputLabel>
          <Select
            value={filterSource}
            label="来源"
            onChange={(e) => { setFilterSource(e.target.value); handleFilterChange(); }}
          >
            <MenuItem value="all">全部</MenuItem>
            <MenuItem value="manual">手动创建</MenuItem>
            <MenuItem value="markdown">Markdown</MenuItem>
            <MenuItem value="json">JSON 导入</MenuItem>
            <MenuItem value="sync">同步</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>标签</InputLabel>
          <Select
            value={filterTag}
            label="标签"
            onChange={(e) => { setFilterTag(e.target.value); handleFilterChange(); }}
          >
            <MenuItem value="all">全部</MenuItem>
            {allTags.slice(0, 10).map((tag) => (
              <MenuItem key={tag.name} value={tag.name}>
                {tag.name} ({tag.count})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Content */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Entry List */}
        <Box
          sx={{
            flex: 1,
            minWidth: 300,
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isLoading && entries.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress size={24} />
            </Box>
          ) : entries.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, p: 3, gap: 1 }}>
              <DescriptionIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="body2" sx={{ color: gs.textMuted }}>
                暂无知识条目
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleCreate}>
                创建第一个条目
              </Button>
            </Box>
          ) : (
            <>
              <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
                {entries.map((entry, index) => (
                  <React.Fragment key={entry.id}>
                    {index > 0 && <Divider />}
                    <ListItemButton
                      selected={selectedEntry?.id === entry.id}
                      onClick={() => handleSelectEntry(entry.id)}
                      sx={{ py: 1.5 }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: selectedEntry?.id === entry.id ? 600 : 500,
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {entry.title}
                            </Typography>
                            {entry.similarity < 1 && (
                              <Chip
                                size="small"
                                label={`${Math.round(entry.similarity * 100)}%`}
                                sx={{ height: 18, fontSize: '0.65rem' }}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" sx={{ color: gs.textMuted, display: 'block', mb: 0.5 }}>
                              {entry.summary || '无摘要'}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                              {entry.tags && entry.tags.slice(0, 3).map((tag) => (
                                <Chip key={tag} label={tag} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                              ))}
                              {entry.tags && entry.tags.length > 3 && (
                                <Typography variant="caption" sx={{ color: gs.textMuted }}>
                                  +{entry.tags.length - 3}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </React.Fragment>
                ))}
              </List>
              <TablePagination
                component="div"
                count={totalEntries}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[5, 10, 20, 50]}
                labelRowsPerPage="每页"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} 共 ${count} 条`}
              />
            </>
          )}
        </Box>

        {/* Entry Detail */}
        <Box
          sx={{
            flex: 2,
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {selectedEntry ? (
            <>
              {/* Detail Tabs */}
              <Tabs
                value={detailTab}
                onChange={(_, v) => setDetailTab(v)}
                sx={{ borderBottom: `1px solid ${gs.border}`, px: 1 }}
              >
                <Tab label="内容" />
                <Tab label="标签" />
                <Tab label="元数据" />
              </Tabs>

              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {detailTab === 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <DescriptionIcon sx={{ fontSize: 20, color: gs.textMuted }} />
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {selectedEntry.title}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {selectedEntry.source && (
                            <Chip
                              size="small"
                              label={SOURCE_LABELS[selectedEntry.source] || selectedEntry.source}
                              sx={{
                                bgcolor: 'transparent',
                                border: `1px solid ${SOURCE_COLORS[selectedEntry.source] || gs.textMuted}`,
                                color: SOURCE_COLORS[selectedEntry.source] || gs.textMuted,
                              }}
                              variant="outlined"
                            />
                          )}
                          {selectedEntry.tags && selectedEntry.tags.length > 0 && selectedEntry.tags.map((tag) => (
                            <Chip key={tag} label={tag} size="small" icon={<TagIcon />} />
                          ))}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="编辑">
                          <IconButton size="small" onClick={() => handleEdit(selectedEntry)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="版本历史">
                          <IconButton size="small" onClick={handleViewVersions}>
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton size="small" color="error" onClick={() => setDeleteDialogOpen(true)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Divider />

                    {/* Content */}
                    <Box>
                      <Typography variant="body2" sx={{ color: gs.textSecondary, mb: 1 }}>
                        内容 (Markdown)
                      </Typography>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 1,
                          bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 400,
                          overflow: 'auto',
                        }}
                      >
                        {selectedEntry.content || '无内容'}
                      </Box>
                    </Box>

                    <Divider />

                    {/* Footer */}
                    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: gs.textMuted }}>
                          创建时间
                        </Typography>
                        <Typography variant="body2">
                          {new Date(selectedEntry.createdAt).toLocaleString()}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: gs.textMuted }}>
                          更新时间
                        </Typography>
                        <Typography variant="body2">
                          {new Date(selectedEntry.updatedAt).toLocaleString()}
                        </Typography>
                      </Box>
                      {selectedEntry.sourcePath && (
                        <Box>
                          <Typography variant="caption" sx={{ color: gs.textMuted }}>
                            来源路径
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {selectedEntry.sourcePath}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                )}

                {detailTab === 1 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: gs.textSecondary }}>
                      管理条目标签
                    </Typography>

                    {/* Existing Tags */}
                    <Box>
                      <Typography variant="caption" sx={{ color: gs.textMuted, mb: 1, display: 'block' }}>
                        当前标签
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {selectedEntry.tags && selectedEntry.tags.length > 0 ? (
                          selectedEntry.tags.map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              onDelete={() => handleRemoveTag(tag)}
                              icon={<TagIcon />}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" sx={{ color: gs.textMuted }}>
                            暂无标签
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Add Tag */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        size="small"
                        placeholder="输入新标签"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                        sx={{ flex: 1 }}
                      />
                      <Button variant="contained" size="small" onClick={handleAddTag} disabled={!newTag.trim()}>
                        添加
                      </Button>
                    </Box>

                    {/* Popular Tags */}
                    {allTags.length > 0 && (
                      <Box>
                        <Typography variant="caption" sx={{ color: gs.textMuted, mb: 1, display: 'block' }}>
                          热门标签
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {allTags.slice(0, 10).map((tag) => (
                            <Chip
                              key={tag.name}
                              label={`${tag.name} (${tag.count})`}
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setNewTag(tag.name);
                              }}
                              disabled={selectedEntry.tags?.includes(tag.name)}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}

                {detailTab === 2 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: gs.textSecondary }}>
                      条目元数据
                    </Typography>

                    {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 ? (
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 1,
                          bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(selectedEntry.metadata, null, 2)}
                        </pre>
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ color: gs.textMuted }}>
                        暂无元数据
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1 }}>
              <InfoIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="body2" sx={{ color: gs.textMuted }}>
                选择左侧条目查看详情
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Search Dialog */}
      <WikiSearchDialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        onSearch={handleSearchSubmit}
        allTags={allTags.map(t => t.name)}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          {editingEntry.id ? '编辑条目' : '创建条目'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="标题"
              value={editingEntry.title || ''}
              onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
              placeholder="输入条目标题"
              size="small"
            />
            <TextField
              fullWidth
              multiline
              rows={12}
              label="内容 (Markdown)"
              value={editingEntry.content || ''}
              onChange={(e) => setEditingEntry({ ...editingEntry, content: e.target.value })}
              placeholder="支持 Markdown 格式"
              size="small"
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'monospace',
                },
              }}
            />
            <TextField
              fullWidth
              multiline
              rows={2}
              label="摘要 (可选)"
              value={editingEntry.summary || ''}
              onChange={(e) => setEditingEntry({ ...editingEntry, summary: e.target.value })}
              placeholder="简要描述条目内容"
              size="small"
            />
            <TextField
              fullWidth
              label="标签 (逗号分隔)"
              value={(editingEntry.tags || []).join(', ')}
              onChange={(e) => setEditingEntry({ ...editingEntry, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
              placeholder="tag1, tag2, tag3"
              size="small"
            />
            {!editingEntry.id && (
              <FormControl fullWidth size="small">
                <InputLabel>来源</InputLabel>
                <Select
                  value={editingEntry.source || 'manual'}
                  label="来源"
                  onChange={(e) => setEditingEntry({ ...editingEntry, source: e.target.value as any })}
                >
                  <MenuItem value="manual">手动创建</MenuItem>
                  <MenuItem value="markdown">Markdown 导入</MenuItem>
                  <MenuItem value="json">JSON 导入</MenuItem>
                  <MenuItem value="sync">同步</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} size="small">
            取消
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            size="small"
            disabled={isLoading || !editingEntry.title?.trim() || !editingEntry.content?.trim()}
          >
            {isLoading ? <CircularProgress size={18} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm">
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            删除后不可恢复，确定要删除条目 "{selectedEntry?.title}" 吗？
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} size="small">
            取消
          </Button>
          <Button onClick={handleDelete} variant="contained" color="error" size="small" disabled={isLoading}>
            {isLoading ? <CircularProgress size={18} /> : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={versionDialogOpen} onClose={() => setVersionDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>版本历史</DialogTitle>
        <DialogContent>
          {versions.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography sx={{ color: gs.textMuted }}>暂无版本历史</Typography>
            </Box>
          ) : (
            <List>
              {versions.map((version, index) => (
                <React.Fragment key={version.id}>
                  {index > 0 && <Divider />}
                  <ListItemButton onClick={() => handleViewVersion(version)}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            版本 {version.version}
                          </Typography>
                          <Chip size="small" label={new Date(version.createdAt).toLocaleString()} />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" sx={{ color: gs.textMuted }}>
                            {version.title}
                          </Typography>
                          {version.changeNote && (
                            <Typography variant="caption" sx={{ color: gs.textMuted, display: 'block' }}>
                              {version.changeNote}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </React.Fragment>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionDialogOpen(false)} size="small">
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* Version Detail Dialog */}
      <Dialog open={!!selectedVersion} onClose={() => setSelectedVersion(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          版本 {selectedVersion?.version} - {selectedVersion?.title}
        </DialogTitle>
        <DialogContent>
          {selectedVersion && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="caption" sx={{ color: gs.textMuted }}>
                创建时间: {new Date(selectedVersion.createdAt).toLocaleString()}
              </Typography>
              {selectedVersion.changeNote && (
                <Alert severity="info">{selectedVersion.changeNote}</Alert>
              )}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 400,
                  overflow: 'auto',
                }}
              >
                {selectedVersion.content}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedVersion(null)} size="small">
            关闭
          </Button>
          {selectedVersion && selectedEntry && (
            <Button
              onClick={() => handleRestoreVersion(selectedVersion)}
              variant="contained"
              size="small"
              disabled={isLoading}
            >
              {isLoading ? <CircularProgress size={18} /> : '恢复此版本'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>导入 Markdown 文件</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
              输入 Markdown 文件路径，系统将自动解析并创建知识条目。
            </Alert>
            <TextField
              fullWidth
              label="文件路径"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              placeholder="/path/to/document.md"
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)} size="small">
            取消
          </Button>
          <Button
            onClick={handleImport}
            variant="contained"
            size="small"
            disabled={importing || !importPath.trim()}
          >
            {importing ? <CircularProgress size={18} /> : '导入'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WikiPanel;