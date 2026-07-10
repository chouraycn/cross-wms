/**
 * WikiPage — Wiki 知识库管理页面
 *
 * 提供知识库条目的查看、搜索、创建、编辑、删除等功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
  useTheme,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Autocomplete,
  Tab,
  Tabs,
  MenuItem,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ArticleIcon from '@mui/icons-material/Article';
import CloseIcon from '@mui/icons-material/Close';
import StorageIcon from '@mui/icons-material/Storage';
import TagIcon from '@mui/icons-material/Tag';

import {
  getWikiStats,
  getRecentEntries,
  searchWiki,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntryTags,
  addTagToEntry,
  removeTagFromEntry,
  getEntryVersions,
  getAllTags,
} from '../services/wikiApi';
import type {
  WikiStats,
  WikiEntry,
  WikiSearchResult,
  WikiVersion,
  WikiEntryCreateParams,
} from '../services/wikiApi';

const WikiPage: React.FC = () => {
  const theme = useTheme();

  // 数据状态
  const [stats, setStats] = useState<WikiStats | null>(null);
  const [recentEntries, setRecentEntries] = useState<WikiEntry[]>([]);
  const [searchResults, setSearchResults] = useState<WikiSearchResult[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<WikiEntry | null>(null);
  const [entryVersions, setEntryVersions] = useState<WikiVersion[]>([]);
  const [allTags, setAllTags] = useState<Record<string, number>>({});

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [searchSource, setSearchSource] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);

  // Dialog 状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Dialog 表单数据
  const [formData, setFormData] = useState<WikiEntryCreateParams>({
    title: '',
    content: '',
    summary: '',
    source: 'manual',
    tags: [],
  });
  const [newTag, setNewTag] = useState('');

  // Tab 状态
  const [detailTab, setDetailTab] = useState(0);

  // 加载基础数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, entriesData, tagsData] = await Promise.all([
        getWikiStats(),
        getRecentEntries(10),
        getAllTags(),
      ]);
      setStats(statsData);
      setRecentEntries(entriesData);
      setAllTags(tagsData);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // 每 60 秒刷新
    return () => clearInterval(interval);
  }, [loadData]);

  // 搜索功能
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const results = await searchWiki({
        query: searchQuery,
        topK: 20,
        tags: searchTags.length > 0 ? searchTags : undefined,
        source: searchSource || undefined,
        useVectorSearch: true,
        useFtsSearch: true,
      });
      setSearchResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchTags, searchSource]);

  // 查看条目详情
  const handleViewEntry = useCallback(async (entryId: number) => {
    setLoading(true);
    setError(null);
    try {
      const [entry, versions] = await Promise.all([
        getEntry(entryId),
        getEntryVersions(entryId),
      ]);
      setSelectedEntry(entry);
      setEntryVersions(versions);
      setDetailDialogOpen(true);
      setDetailTab(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 创建条目
  const handleCreate = useCallback(async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      setError('标题和内容不能为空');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createEntry(formData);
      setCreateDialogOpen(false);
      setFormData({
        title: '',
        content: '',
        summary: '',
        source: 'manual',
        tags: [],
      });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [formData, loadData]);

  // 更新条目
  const handleUpdate = useCallback(async () => {
    if (!selectedEntry || !formData.title.trim() || !formData.content.trim()) {
      setError('标题和内容不能为空');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const updated = await updateEntry(selectedEntry.id, {
        title: formData.title,
        content: formData.content,
        summary: formData.summary,
        tags: formData.tags,
      });
      setSelectedEntry(updated);
      setEditDialogOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedEntry, formData, loadData]);

  // 删除条目
  const handleDelete = useCallback(async () => {
    if (!selectedEntry) return;
    setLoading(true);
    setError(null);
    try {
      await deleteEntry(selectedEntry.id);
      setDeleteDialogOpen(false);
      setSelectedEntry(null);
      setDetailDialogOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedEntry, loadData]);

  // 添加标签
  const handleAddTag = useCallback(async () => {
    if (!selectedEntry || !newTag.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await addTagToEntry(selectedEntry.id, newTag.trim());
      const tags = await getEntryTags(selectedEntry.id);
      setSelectedEntry({ ...selectedEntry, tags });
      setNewTag('');
      setTagDialogOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedEntry, newTag, loadData]);

  // 移除标签
  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!selectedEntry) return;
    setLoading(true);
    setError(null);
    try {
      await removeTagFromEntry(selectedEntry.id, tag);
      const tags = await getEntryTags(selectedEntry.id);
      setSelectedEntry({ ...selectedEntry, tags });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedEntry, loadData]);

  // 打开编辑对话框
  const openEditDialog = useCallback(() => {
    if (!selectedEntry) return;
    setFormData({
      title: selectedEntry.title,
      content: selectedEntry.content,
      summary: selectedEntry.summary || '',
      source: selectedEntry.source,
      tags: selectedEntry.tags,
    });
    setEditDialogOpen(true);
  }, [selectedEntry]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // 获取来源颜色
  const getSourceColor = (source: string) => {
    const colors: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'> = {
      manual: 'primary',
      markdown: 'secondary',
      web: 'info',
      api: 'success',
    };
    return colors[source] || 'default';
  };

  if (!stats && !loading && error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={loadData} startIcon={<RefreshIcon />}>
          重试
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Wiki 知识库
          </Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {loading && <LinearProgress sx={{ width: 100 }} />}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setFormData({
                title: '',
                content: '',
                summary: '',
                source: 'manual',
                tags: [],
              });
              setCreateDialogOpen(true);
            }}
          >
            创建条目
          </Button>
          <IconButton onClick={loadData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 统计卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* 总条目数 */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ArticleIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  总条目数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.totalEntries ?? '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 标签数 */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <LocalOfferIcon color="secondary" />
                <Typography variant="body2" color="text.secondary">
                  标签数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.totalTags ?? '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 来源分布 */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <StorageIcon color="info" />
                <Typography variant="body2" color="text.secondary">
                  来源分布
                </Typography>
              </Box>
              {stats && Object.keys(stats.sourceDistribution).length > 0 ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {Object.entries(stats.sourceDistribution).map(([source, count]) => (
                    <Chip
                      key={source}
                      label={`${source}: ${count}`}
                      size="small"
                      color={getSourceColor(source)}
                      variant="outlined"
                    />
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">暂无数据</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 搜索区域 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            搜索知识库
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="搜索关键词"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="输入关键词搜索..."
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Autocomplete
                multiple
                options={Object.keys(allTags)}
                value={searchTags}
                onChange={(e, newValue) => setSearchTags(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label="标签过滤" placeholder="选择标签" size="small" />
                )}
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                fullWidth
                label="来源"
                value={searchSource}
                onChange={(e) => setSearchSource(e.target.value)}
                size="small"
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="manual">手动</MenuItem>
                <MenuItem value="markdown">Markdown</MenuItem>
                <MenuItem value="web">Web</MenuItem>
                <MenuItem value="api">API</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={1}>
              <Button
                fullWidth
                variant="contained"
                startIcon={isSearching ? <CircularProgress size={20} /> : <SearchIcon />}
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                sx={{ height: '100%' }}
              >
                搜索
              </Button>
            </Grid>
          </Grid>

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                搜索结果 ({searchResults.length} 条)
              </Typography>
              <List>
                {searchResults.map((result) => (
                  <ListItem
                    key={result.id}
                    divider
                    secondaryAction={
                      <IconButton onClick={() => handleViewEntry(result.id)}>
                        <ArticleIcon />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight={600}>{result.title}</Typography>
                          <Chip
                            label={`得分: ${result.score.toFixed(2)}`}
                            size="small"
                            color="success"
                          />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {result.summary || result.content.slice(0, 100) + '...'}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {result.tags.map((tag) => (
                              <Chip key={tag} label={tag} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 最近条目列表 */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            最近条目
          </Typography>
          {recentEntries.length > 0 ? (
            <List>
              {recentEntries.map((entry) => (
                <ListItem
                  key={entry.id}
                  divider
                  secondaryAction={
                    <IconButton onClick={() => handleViewEntry(entry.id)}>
                      <ArticleIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={600}>{entry.title}</Typography>
                        <Chip
                          label={entry.source}
                          size="small"
                          color={getSourceColor(entry.source)}
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          {entry.summary || entry.content.slice(0, 100) + '...'}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {entry.tags.slice(0, 5).map((tag) => (
                            <Chip key={tag} label={tag} size="small" variant="outlined" />
                          ))}
                          {entry.tags.length > 5 && (
                            <Typography variant="caption" color="text.secondary">
                              +{entry.tags.length - 5}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            {formatTime(entry.updatedAt)}
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              暂无条目数据
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* 标签分布表格 */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TagIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>
              标签分布
            </Typography>
          </Box>
          {Object.keys(allTags).length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>标签</TableCell>
                    <TableCell align="right">条目数</TableCell>
                    <TableCell>占比</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(allTags)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 20)
                    .map(([tag, count]) => {
                      const total = stats?.totalEntries || 1;
                      const percent = (count / total) * 100;
                      return (
                        <TableRow key={tag}>
                          <TableCell>
                            <Chip label={tag} size="small" />
                          </TableCell>
                          <TableCell align="right">{count}</TableCell>
                          <TableCell sx={{ width: '50%' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={percent}
                                sx={{ flex: 1, height: 8, borderRadius: 4 }}
                              />
                              <Typography variant="caption" sx={{ minWidth: 40 }}>
                                {percent.toFixed(1)}%
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              暂无标签数据
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ========== Dialogs ========== */}

      {/* 创建条目 Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>创建条目</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="标题"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="内容"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                multiline
                rows={6}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="摘要"
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                fullWidth
                label="来源"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              >
                <MenuItem value="manual">手动</MenuItem>
                <MenuItem value="markdown">Markdown</MenuItem>
                <MenuItem value="web">Web</MenuItem>
                <MenuItem value="api">API</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <Autocomplete
                multiple
                freeSolo
                options={Object.keys(allTags)}
                value={formData.tags}
                onChange={(e, newValue) => setFormData({ ...formData, tags: newValue })}
                renderInput={(params) => (
                  <TextField {...params} label="标签" placeholder="添加标签" />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={loading || !formData.title.trim() || !formData.content.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : <AddIcon />}
          >
            创建
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑条目 Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>编辑条目</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="标题"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="内容"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                multiline
                rows={6}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="摘要"
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                freeSolo
                options={Object.keys(allTags)}
                value={formData.tags}
                onChange={(e, newValue) => setFormData({ ...formData, tags: newValue })}
                renderInput={(params) => (
                  <TextField {...params} label="标签" placeholder="添加标签" />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={loading || !formData.title.trim() || !formData.content.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : <EditIcon />}
          >
            更新
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除条目 "{selectedEntry?.title}" 吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加标签 Dialog */}
      <Dialog open={tagDialogOpen} onClose={() => setTagDialogOpen(false)}>
        <DialogTitle>添加标签</DialogTitle>
        <DialogContent>
          <Autocomplete
            freeSolo
            options={Object.keys(allTags).filter(
              (tag) => !selectedEntry?.tags.includes(tag)
            )}
            value={newTag}
            onChange={(e, newValue) => setNewTag(newValue || '')}
            inputValue={newTag}
            onInputChange={(e, newInputValue) => setNewTag(newInputValue)}
            renderInput={(params) => (
              <TextField {...params} label="标签名称" placeholder="输入或选择标签" autoFocus />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleAddTag}
            disabled={loading || !newTag.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : <AddIcon />}
          >
            添加
          </Button>
        </DialogActions>
      </Dialog>

      {/* 条目详情 Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">{selectedEntry?.title}</Typography>
            <IconButton onClick={() => setDetailDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedEntry && (
            <Box>
              {/* Tabs */}
              <Tabs value={detailTab} onChange={(e, newValue) => setDetailTab(newValue)}>
                <Tab label="内容" />
                <Tab label="标签管理" />
                <Tab label="版本历史" />
              </Tabs>

              {/* 内容 Tab */}
              {detailTab === 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    来源: {selectedEntry.source} | 创建时间: {formatTime(selectedEntry.createdAt)} | 更新时间: {formatTime(selectedEntry.updatedAt)}
                  </Typography>
                  {selectedEntry.summary && (
                    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        摘要
                      </Typography>
                      <Typography variant="body2">{selectedEntry.summary}</Typography>
                    </Paper>
                  )}
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selectedEntry.content}
                    </Typography>
                  </Paper>
                </Box>
              )}

              {/* 标签管理 Tab */}
              {detailTab === 1 && (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      当前标签 ({selectedEntry.tags.length})
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setTagDialogOpen(true)}
                    >
                      添加标签
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {selectedEntry.tags.map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        onDelete={() => handleRemoveTag(tag)}
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                    {selectedEntry.tags.length === 0 && (
                      <Typography color="text.secondary">暂无标签</Typography>
                    )}
                  </Box>
                </Box>
              )}

              {/* 版本历史 Tab */}
              {detailTab === 2 && (
                <Box sx={{ mt: 2 }}>
                  {entryVersions.length > 0 ? (
                    <List>
                      {entryVersions.map((version) => (
                        <ListItem key={version.version} divider>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={`版本 ${version.version}`}
                                  size="small"
                                  color="primary"
                                />
                                <Typography variant="body2" fontWeight={600}>
                                  {version.title}
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {formatTime(version.updatedAt)}
                                </Typography>
                                {version.summary && (
                                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                                    {version.summary}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      暂无版本历史
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<EditIcon />}
            onClick={openEditDialog}
            disabled={!selectedEntry}
          >
            编辑
          </Button>
          <Button
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!selectedEntry}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WikiPage;