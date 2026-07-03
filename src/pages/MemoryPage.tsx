import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Paper, Tabs, Tab, Tooltip, CircularProgress, Alert,
  List, ListItem, ListItemText, Divider, useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import MemoryIcon from '@mui/icons-material/Memory';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { MemoryItem, MemoryStats, MemorySearchResult } from '../services/api';
import {
  fetchMemories, searchMemories, fetchMemoryStats, addMemory, deleteMemoryApi,
} from '../services/api';

const MemoryPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'list' | 'search'>('list');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [useHybrid, setUseHybrid] = useState(false);

  // 添加记忆对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [createText, setCreateText] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [memoriesRes, statsRes] = await Promise.all([
        fetchMemories(limit, offset),
        fetchMemoryStats(),
      ]);
      setMemories(memoriesRes.memories);
      setHasMore(memoriesRes.hasMore);
      setStats(statsRes);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [offset, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchMemories(searchQuery, 10, useHybrid);
      setSearchResults(res.results);
    } catch (e) {
      showToast(`搜索失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!createText.trim()) {
      showToast('请输入记忆内容', 'warning');
      return;
    }
    setCreateLoading(true);
    try {
      await addMemory(createText);
      showToast('记忆已添加', 'success');
      setCreateOpen(false);
      setCreateText('');
      loadData();
    } catch (e) {
      showToast(`添加失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这条记忆吗？')) return;
    try {
      await deleteMemoryApi(id);
      showToast('记忆已删除', 'success');
      loadData();
    } catch (e) {
      showToast(`删除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          记忆管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            添加记忆
          </Button>
          <IconButton size="small" onClick={loadData} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>记忆总数</Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{stats.vectorized}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>已向量化</Typography>
          </Paper>
          <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 100, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#D97706' }}>{stats.unvectorized}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>未向量化</Typography>
          </Paper>
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }} textColor="primary" indicatorColor="primary">
        <Tab value="list" label="记忆列表" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="search" label="语义搜索" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
      </Tabs>

      {tab === 'list' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {memories.map((m) => (
            <Paper
              key={m.id}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                '&:hover': { backgroundColor: gs.bgHover },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={`#${m.id}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20, fontFamily: 'monospace' }} />
                  {m.embedding ? (
                    <Chip label="已向量化" size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: '#D1FAE5', color: '#059669' }} />
                  ) : (
                    <Chip label="未向量化" size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: '#FEF3C7', color: '#D97706' }} />
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>
                    {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
                  </Typography>
                  <Tooltip title="删除">
                    <IconButton size="small" onClick={() => handleDelete(m.id)} sx={{ color: '#EF4444' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.primary', mt: 0.5, lineHeight: 1.5 }}>
                {m.text}
              </Typography>
              {m.metadata && Object.keys(m.metadata).length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {Object.entries(m.metadata).map(([k, v]) => (
                    <Chip key={k} label={`${k}: ${String(v)}`} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                  ))}
                </Box>
              )}
            </Paper>
          ))}
          {memories.length === 0 && !loading && (
            <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>暂无记忆</Typography>
          )}
          {hasMore && (
            <Button size="small" onClick={() => setOffset((o) => o + limit)} sx={{ textTransform: 'none', alignSelf: 'center' }}>
              加载更多
            </Button>
          )}
        </Box>
      )}

      {tab === 'search' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="输入查询内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              fullWidth
            />
            <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={handleSearch} disabled={searching}>
              {searching ? <CircularProgress size={16} /> : '搜索'}
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant={useHybrid ? 'contained' : 'outlined'} size="small" onClick={() => setUseHybrid(true)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
              混合搜索
            </Button>
            <Button variant={!useHybrid ? 'contained' : 'outlined'} size="small" onClick={() => setUseHybrid(false)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
              向量搜索
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {searchResults.map((r) => (
              <Paper key={r.id} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Chip label={`#${r.id}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20, fontFamily: 'monospace' }} />
                  <Chip label={`相似度: ${(r.score * 100).toFixed(1)}%`} size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: '#E0F2FE', color: '#0284C7' }} />
                </Box>
                <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>{r.text}</Typography>
              </Paper>
            ))}
            {searchResults.length === 0 && !searching && searchQuery && (
              <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>未找到相关记忆</Typography>
            )}
          </Box>
        </Box>
      )}

      {/* 添加记忆对话框 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>添加记忆</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            label="记忆内容"
            size="small"
            value={createText}
            onChange={(e) => setCreateText(e.target.value)}
            fullWidth
            multiline
            rows={6}
            placeholder="输入需要 AI 记住的内容..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} size="small" sx={{ textTransform: 'none' }}>取消</Button>
          <Button onClick={handleAdd} variant="contained" size="small" disabled={createLoading} sx={{ textTransform: 'none' }}>
            {createLoading ? <CircularProgress size={16} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MemoryPage;
