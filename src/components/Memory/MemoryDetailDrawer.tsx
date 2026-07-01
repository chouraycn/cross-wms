/**
 * MemoryDetailDrawer - 记忆详情抽屉
 *
 * 功能：
 * - 右侧抽屉展示选中记忆的详细信息
 * - 显示完整内容、创建时间、访问次数、向量相似度
 * - 显示关联记忆（相似记忆列表）
 * - 支持编辑内容
 * - 支持调整分类
 * - 支持调整重要性权重
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  IconButton,
  Slider,
  FormControl,
  Select,
  MenuItem,
  Paper,
  Divider,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import CategoryIcon from '@mui/icons-material/Category';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarIcon from '@mui/icons-material/Star';
import LinkIcon from '@mui/icons-material/Link';
import { getGrayScale } from '../../constants/theme';
import {
  MemoryEntry,
  MemoryCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SearchResultItem,
} from '../../types/memory';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MemoryDetailDrawerProps {
  open: boolean;
  memory: MemoryEntry | null;
  onClose: () => void;
  onUpdate: (id: number, updates: Partial<MemoryEntry>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  API Helper                                                         */
/* ------------------------------------------------------------------ */

const API_BASE = '/api/memory';

async function fetchSimilarMemories(id: number, limit: number = 5): Promise<SearchResultItem[]> {
  try {
    const res = await fetch(`${API_BASE}/${id}/similar?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MemoryDetailDrawer: React.FC<MemoryDetailDrawerProps> = memo(({
  open,
  memory,
  onClose,
  onUpdate,
  onDelete,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [editedCategory, setEditedCategory] = useState<MemoryCategory | ''>('');
  const [editedImportance, setEditedImportance] = useState(0.5);
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similarMemories, setSimilarMemories] = useState<SearchResultItem[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // 初始化编辑状态
  useEffect(() => {
    if (memory) {
      setEditedText(memory.text);
      setEditedCategory(memory.category || '');
      setEditedImportance(memory.importance || 0.5);
      setEditedTags(Object.keys(memory.metadata || {}).filter(k => typeof memory.metadata[k] === 'string'));
      setError(null);
    }
  }, [memory]);

  // 加载相似记忆
  useEffect(() => {
    if (open && memory) {
      setLoadingSimilar(true);
      fetchSimilarMemories(memory.id, 5)
        .then(setSimilarMemories)
        .finally(() => setLoadingSimilar(false));
    }
  }, [open, memory]);

  const handleSave = useCallback(async () => {
    if (!memory || !editedText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const metadata: Record<string, unknown> = {};
      editedTags.forEach(tag => {
        metadata[tag] = true;
      });

      await onUpdate(memory.id, {
        text: editedText,
        category: editedCategory || undefined,
        importance: editedImportance,
        metadata,
      });
      setEditing(false);
    } catch (err) {
      setError(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [memory, editedText, editedCategory, editedImportance, editedTags, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (!memory) return;
    if (!window.confirm('确认删除此记忆吗？此操作不可撤销。')) return;
    try {
      await onDelete(memory.id);
      onClose();
    } catch (err) {
      setError(`删除失败: ${(err as Error).message}`);
    }
  }, [memory, onDelete, onClose]);

  const handleCancelEdit = useCallback(() => {
    if (memory) {
      setEditedText(memory.text);
      setEditedCategory(memory.category || '');
      setEditedImportance(memory.importance || 0.5);
      setEditedTags(Object.keys(memory.metadata || {}).filter(k => typeof memory.metadata[k] === 'string'));
    }
    setEditing(false);
    setError(null);
  }, [memory]);

  if (!memory) return null;

  const drawerWidth = 480;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: drawerWidth,
          backgroundColor: gs.bgPanel,
          borderLeft: `1px solid ${gs.border}`,
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 标题栏 */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${gs.border}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: gs.textPrimary }}>
              记忆详情
            </Typography>
            <Chip
              label={`ID: ${memory.id}`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!editing ? (
              <>
                <Tooltip title="编辑">
                  <IconButton
                    size="small"
                    onClick={() => setEditing(true)}
                    sx={{ color: gs.textSecondary, '&:hover': { color: '#6366F1' } }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="删除">
                  <IconButton
                    size="small"
                    onClick={handleDelete}
                    sx={{ color: gs.textSecondary, '&:hover': { color: '#EF4444' } }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip title="保存">
                  <IconButton
                    size="small"
                    onClick={handleSave}
                    disabled={saving}
                    sx={{ color: '#10B981' }}
                  >
                    {saving ? <CircularProgress size={16} /> : <SaveIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="取消">
                  <IconButton
                    size="small"
                    onClick={handleCancelEdit}
                    sx={{ color: gs.textSecondary }}
                  >
                    <CancelIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>

        {/* 内容区域 */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {/* 错误提示 */}
          {error && (
            <Alert severity="error" sx={{ borderRadius: 1.5, mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* 记忆内容 */}
          <Paper sx={{ p: 2, borderRadius: 2, mb: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
              记忆内容
            </Typography>
            {editing ? (
              <TextField
                fullWidth
                multiline
                rows={6}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
              />
            ) : (
              <Typography
                sx={{
                  fontSize: '0.85rem',
                  color: gs.textPrimary,
                  lineHeight: 1.6,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {memory.text}
              </Typography>
            )}
          </Paper>

          {/* 基本信息 */}
          <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary }}>
                基本信息
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* 创建时间 */}
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                  创建时间
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: gs.textPrimary }}>
                  {new Date(memory.createdAt).toLocaleString()}
                </Typography>
              </Box>

              {/* 最后访问时间 */}
              {memory.lastAccessedAt && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    最后访问
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: gs.textPrimary }}>
                    {new Date(memory.lastAccessedAt).toLocaleString()}
                  </Typography>
                </Box>
              )}

              {/* 访问次数 */}
              {memory.accessCount !== undefined && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    访问次数
                  </Typography>
                  <Chip
                    label={`${memory.accessCount} 次`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.75rem',
                      backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)',
                      color: '#10B981',
                    }}
                  />
                </Box>
              )}

              {/* 向量相似度 */}
              {memory.similarity !== undefined && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    向量相似度
                  </Typography>
                  <Chip
                    label={`${(memory.similarity * 100).toFixed(1)}%`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.75rem',
                      backgroundColor: memory.similarity > 0.7
                        ? isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.08)'
                        : isDark ? 'rgba(251,191,36,0.15)' : 'rgba(251,191,36,0.08)',
                      color: memory.similarity > 0.7 ? '#22C55E' : '#F59E0B',
                    }}
                  />
                </Box>
              )}

              {/* 时间衰减权重 */}
              {memory.timeWeight !== undefined && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    时间权重
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, height: 6, backgroundColor: gs.border, borderRadius: 1 }}>
                      <Box
                        sx={{
                          width: `${memory.timeWeight * 100}%`,
                          height: '100%',
                          backgroundColor: '#F59E0B',
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: 600 }}>
                      {(memory.timeWeight * 100).toFixed(0)}%
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Paper>

          {/* 分类 */}
          <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CategoryIcon sx={{ fontSize: 16, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary }}>
                记忆分类
              </Typography>
            </Box>

            {editing ? (
              <FormControl fullWidth size="small">
                <Select
                  value={editedCategory}
                  onChange={(e) => setEditedCategory(e.target.value as MemoryCategory)}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>未分类</em>
                  </MenuItem>
                  {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
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
            ) : (
              memory.category ? (
                <Chip
                  label={CATEGORY_LABELS[memory.category]}
                  size="small"
                  sx={{
                    backgroundColor: CATEGORY_COLORS[memory.category],
                    color: '#fff',
                    fontWeight: 600,
                  }}
                />
              ) : (
                <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
                  未分类
                </Typography>
              )
            )}
          </Paper>

          {/* 重要性权重 */}
          <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <StarIcon sx={{ fontSize: 16, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary }}>
                重要性权重
              </Typography>
            </Box>

            {editing ? (
              <Box>
                <Slider
                  value={editedImportance}
                  onChange={(e, value) => setEditedImportance(value as number)}
                  min={0}
                  max={1}
                  step={0.1}
                  marks={[
                    { value: 0, label: '低' },
                    { value: 0.5, label: '中' },
                    { value: 1, label: '高' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, height: 6, backgroundColor: gs.border, borderRadius: 1 }}>
                  <Box
                    sx={{
                      width: `${(memory.importance || 0.5) * 100}%`,
                      height: '100%',
                      backgroundColor: '#6366F1',
                      borderRadius: 1,
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: 600 }}>
                  {((memory.importance || 0.5) * 100).toFixed(0)}%
                </Typography>
              </Box>
            )}
          </Paper>

          {/* 元数据标签 */}
          {memory.metadata && Object.keys(memory.metadata).length > 0 && (
            <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
                元数据标签
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {Object.keys(memory.metadata).map((key) => (
                  <Chip
                    key={key}
                    label={key}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                    }}
                  />
                ))}
              </Box>
            </Paper>
          )}

          {/* MMR 标记 */}
          {memory.mmrProcessed && (
            <Box sx={{ mb: 2 }}>
              <Chip
                label="已去重 (MMR)"
                size="small"
                sx={{
                  backgroundColor: '#8B5CF6',
                  color: '#fff',
                  fontWeight: 600,
                }}
              />
            </Box>
          )}

          {/* 质量评分 */}
          {memory.qualityScore !== undefined && (
            <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
                质量评分
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, height: 6, backgroundColor: gs.border, borderRadius: 1 }}>
                  <Box
                    sx={{
                      width: `${memory.qualityScore * 100}%`,
                      height: '100%',
                      backgroundColor: '#10B981',
                      borderRadius: 1,
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                  {(memory.qualityScore * 100).toFixed(0)}%
                </Typography>
              </Box>
            </Paper>
          )}

          {/* 相似记忆 */}
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LinkIcon sx={{ fontSize: 16, color: gs.textMuted }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary }}>
                相似记忆
              </Typography>
              {loadingSimilar && <CircularProgress size={16} />}
            </Box>

            {similarMemories.length > 0 ? (
              <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                {similarMemories.map((result) => (
                  <ListItem key={result.id} dense sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Typography sx={{ fontSize: '0.75rem', color: gs.textPrimary }}>
                          {result.text.slice(0, 60)}{result.text.length > 60 ? '...' : ''}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>
                            ID: {result.id}
                          </Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: '#6366F1' }}>
                            相似度: {(result.similarity * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              !loadingSimilar && (
                <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
                  未找到相似记忆
                </Typography>
              )
            )}
          </Paper>
        </Box>

        {/* 底部操作栏 */}
        <Divider />
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={onClose}
            sx={{ color: gs.textSecondary }}
          >
            关闭
          </Button>
          {editing && (
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={saving || !editedText.trim()}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            >
              保存修改
            </Button>
          )}
        </Box>
      </Box>
    </Drawer>
  );
});

MemoryDetailDrawer.displayName = 'MemoryDetailDrawer';

export default MemoryDetailDrawer;