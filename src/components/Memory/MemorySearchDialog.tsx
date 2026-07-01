/**
 * MemorySearchDialog - 记忆语义搜索对话框
 *
 * 功能：
 * - 输入查询词进行语义搜索
 * - 显示搜索结果（包含相似度分数）
 * - 支持纯向量搜索和混合搜索（向量 + FTS）
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Switch,
  Slider,
  Paper,
  Divider,
  Tooltip,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { getGrayScale } from '../../constants/theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SearchResult {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface MemorySearchDialogProps {
  open: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  API Helper                                                         */
/* ------------------------------------------------------------------ */

const API_BASE = '/api/memory';

async function searchMemoryApi(
  query: string,
  topK: number,
  useHybrid: boolean
): Promise<{ results: SearchResult[] }> {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK, useHybrid }),
  });
  if (!res.ok) throw new Error(`搜索失败: ${res.statusText}`);
  return res.json();
}

async function deleteMemoryEntry(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除失败: ${res.statusText}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MemorySearchDialog: React.FC<MemorySearchDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const [useHybrid, setUseHybrid] = useState(true);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await searchMemoryApi(query, topK, useHybrid);
      setResults(data.results || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMemoryEntry(id);
      setResults(results.filter((r) => r.id !== id));
    } catch (err) {
      setError(`删除失败: ${(err as Error).message}`);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PsychologyIcon sx={{ fontSize: 20, color: '#6366F1' }} />
          <Typography sx={{ fontWeight: 600 }}>记忆语义搜索</Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* 搜索输入 */}
        <TextField
          autoFocus
          fullWidth
          multiline
          rows={2}
          placeholder="输入查询词，系统将进行语义搜索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ mb: 2 }}
        />

        {/* 搜索配置 */}
        <Paper
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            backgroundColor: isDark ? 'rgba(99,102,241,0.03)' : 'rgba(99,102,241,0.02)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControl>
              <FormControlLabel
                control={
                  <Switch
                    checked={useHybrid}
                    onChange={(e) => setUseHybrid(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Typography sx={{ fontSize: '0.85rem', color: gs.textSecondary }}>
                    混合搜索 (向量 + FTS)
                  </Typography>
                }
              />
            </FormControl>

            <Box sx={{ flex: 1, ml: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1 }}>
                返回数量: {topK}
              </Typography>
              <Slider
                value={topK}
                onChange={(e, val) => setTopK(val as number)}
                min={1}
                max={20}
                step={1}
                marks={[
                  { value: 5, label: '5' },
                  { value: 10, label: '10' },
                  { value: 15, label: '15' },
                  { value: 20, label: '20' },
                ]}
                sx={{ width: 200 }}
              />
            </Box>
          </Box>

          <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 1 }}>
            {useHybrid
              ? '混合搜索：结合向量语义搜索和全文关键词搜索，提供更全面的召回'
              : '纯向量搜索：仅基于语义相似度，适合查找含义相近的内容'}
          </Typography>
        </Paper>

        {/* 错误提示 */}
        {error && (
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.04)',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)'}`,
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', color: '#EF4444' }}>{error}</Typography>
          </Paper>
        )}

        {/* 搜索结果 */}
        {results.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
              搜索结果 ({results.length} 条)
            </Typography>
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {results.map((result, index) => (
                <React.Fragment key={result.id}>
                  <ListItem sx={{ py: 1.5 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          <Chip
                            label={`#${index + 1}`}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: '0.85rem',
                              color: gs.textPrimary,
                              lineHeight: 1.5,
                              flex: 1,
                              wordBreak: 'break-word',
                            }}
                          >
                            {result.text}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Chip
                            label={`相似度: ${(result.similarity * 100).toFixed(1)}%`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              backgroundColor:
                                result.similarity > 0.7
                                  ? isDark
                                    ? 'rgba(34,197,94,0.15)'
                                    : 'rgba(34,197,94,0.08)'
                                  : isDark
                                    ? 'rgba(251,191,36,0.15)'
                                    : 'rgba(251,191,36,0.08)',
                              color: result.similarity > 0.7 ? '#22C55E' : '#F59E0B',
                            }}
                          />
                          <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                            ID: {result.id}
                          </Typography>
                          {result.metadata && Object.keys(result.metadata).length > 0 && (
                            <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                              | {Object.keys(result.metadata).length} 个标签
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="复制内容">
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(result.text)}
                          sx={{ color: gs.textMuted, mr: 0.5 }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(result.id)}
                          sx={{ color: gs.textMuted, '&:hover': { color: '#EF4444' } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          </Box>
        )}

        {/* 无结果提示 */}
        {!searching && query.trim() && results.length === 0 && !error && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
              未找到相关记忆，请尝试其他查询词
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ color: gs.textSecondary }}>
          关闭
        </Button>
        <Button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          variant="contained"
          startIcon={searching ? <CircularProgress size={16} /> : <PsychologyIcon />}
        >
          {searching ? '搜索中...' : '搜索'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MemorySearchDialog;