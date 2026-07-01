/**
 * MemoryBatchOperations - 记忆批量操作组件
 *
 * 功能：
 * - 批量删除（带确认对话框）
 * - 批量分类调整
 * - 批量导入/导出（JSON/Markdown）
 * - 批量合并相似记忆
 */

import React, { useState, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  useTheme,
  Paper,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CategoryIcon from '@mui/icons-material/Category';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import MergeIcon from '@mui/icons-material/MergeType';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import CancelIcon from '@mui/icons-material/Cancel';
import { getGrayScale } from '../../constants/theme';
import {
  MemoryEntry,
  MemoryCategory,
  BatchOperationType,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  MemoryExportData,
} from '../../types/memory';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MemoryBatchOperationsProps {
  selectedMemories: MemoryEntry[];
  onBatchOperation: (operation: BatchOperationType, params?: Record<string, unknown>) => Promise<void>;
  onClearSelection: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                   */
/* ------------------------------------------------------------------ */

const exportToJSON = (memories: MemoryEntry[]): string => {
  const exportData: MemoryExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    memories,
    stats: {
      totalMemories: memories.length,
      avgTextLength: memories.reduce((sum, m) => sum + m.text.length, 0) / memories.length || 0,
    },
  };
  return JSON.stringify(exportData, null, 2);
};

const exportToMarkdown = (memories: MemoryEntry[]): string => {
  const lines: string[] = [
    '# 记忆导出',
    '',
    `导出时间: ${new Date().toLocaleString()}`,
    `总计: ${memories.length} 条记忆`,
    '',
    '---',
    '',
  ];

  memories.forEach((memory, index) => {
    lines.push(`## 记忆 ${index + 1} (ID: ${memory.id})`);
    lines.push('');
    lines.push(`**内容:** ${memory.text}`);
    lines.push('');
    lines.push(`**创建时间:** ${new Date(memory.createdAt).toLocaleString()}`);
    if (memory.category) {
      lines.push(`**分类:** ${CATEGORY_LABELS[memory.category]}`);
    }
    if (memory.importance) {
      lines.push(`**重要性:** ${(memory.importance * 100).toFixed(0)}%`);
    }
    if (memory.accessCount) {
      lines.push(`**访问次数:** ${memory.accessCount}`);
    }
    if (memory.metadata && Object.keys(memory.metadata).length > 0) {
      lines.push(`**标签:** ${Object.keys(memory.metadata).join(', ')}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MemoryBatchOperations: React.FC<MemoryBatchOperationsProps> = memo(({
  selectedMemories,
  onBatchOperation,
  onClearSelection,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [operationType, setOperationType] = useState<BatchOperationType | ''>('');
  const [targetCategory, setTargetCategory] = useState<MemoryCategory | ''>('');
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown'>('json');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenDialog = useCallback((type: BatchOperationType) => {
    setOperationType(type);
    setDialogOpen(true);
    setError(null);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setOperationType('');
    setTargetCategory('');
    setExportFormat('json');
    setError(null);
  }, []);

  const handleExecuteOperation = useCallback(async () => {
    if (!operationType) return;
    setProcessing(true);
    setError(null);

    try {
      const params: Record<string, unknown> = {};
      if (operationType === 'changeCategory' && targetCategory) {
        params.category = targetCategory;
      }
      if (operationType === 'export') {
        params.exportFormat = exportFormat;
      }

      await onBatchOperation(operationType, params);
      handleCloseDialog();
      onClearSelection();
    } catch (err) {
      setError(`操作失败: ${(err as Error).message}`);
    } finally {
      setProcessing(false);
    }
  }, [operationType, targetCategory, exportFormat, onBatchOperation, handleCloseDialog, onClearSelection]);

  const handleExport = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[0];
    if (exportFormat === 'json') {
      const content = exportToJSON(selectedMemories);
      downloadFile(content, `memories_${timestamp}.json`, 'application/json');
    } else {
      const content = exportToMarkdown(selectedMemories);
      downloadFile(content, `memories_${timestamp}.md`, 'text/markdown');
    }
    handleCloseDialog();
  }, [selectedMemories, exportFormat, handleCloseDialog]);

  if (selectedMemories.length === 0) return null;

  const getOperationTitle = () => {
    switch (operationType) {
      case 'delete':
        return '批量删除';
      case 'changeCategory':
        return '批量调整分类';
      case 'adjustImportance':
        return '批量调整重要性';
      case 'merge':
        return '批量合并';
      case 'export':
        return '批量导出';
      default:
        return '批量操作';
    }
  };

  return (
    <>
      {/* 工具栏 */}
      <Paper
        sx={{
          p: 1.5,
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.04)',
          border: `1px solid ${isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Chip
          label={`已选择 ${selectedMemories.length} 条`}
          size="small"
          sx={{
            backgroundColor: '#6366F1',
            color: '#fff',
            fontWeight: 600,
          }}
        />

        <Divider orientation="vertical" flexItem sx={{ height: 24, mx: 0.5 }} />

        <Tooltip title="批量删除">
          <IconButton
            size="small"
            onClick={() => handleOpenDialog('delete')}
            sx={{ color: '#EF4444', '&:hover': { backgroundColor: 'rgba(239,68,68,0.1)' } }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="批量调整分类">
          <IconButton
            size="small"
            onClick={() => handleOpenDialog('changeCategory')}
            sx={{ color: gs.textSecondary, '&:hover': { color: '#6366F1' } }}
          >
            <CategoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="批量导出">
          <IconButton
            size="small"
            onClick={() => handleOpenDialog('export')}
            sx={{ color: gs.textSecondary, '&:hover': { color: '#10B981' } }}
          >
            <ImportExportIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="批量合并相似记忆">
          <IconButton
            size="small"
            onClick={() => handleOpenDialog('merge')}
            sx={{ color: gs.textSecondary, '&:hover': { color: '#8B5CF6' } }}
          >
            <MergeIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          onClick={onClearSelection}
          startIcon={<CancelIcon />}
          sx={{ color: gs.textSecondary }}
        >
          取消选择
        </Button>
      </Paper>

      {/* 操作对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getOperationTitle()}
            <Chip
              label={`${selectedMemories.length} 条`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                backgroundColor: '#6366F1',
                color: '#fff',
              }}
            />
          </Box>
        </DialogTitle>

        <DialogContent>
          {/* 错误提示 */}
          {error && (
            <Alert severity="error" sx={{ borderRadius: 1.5, mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* 删除确认 */}
          {operationType === 'delete' && (
            <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                确认删除 {selectedMemories.length} 条记忆吗？
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 1 }}>
                此操作不可撤销，请谨慎操作。
              </Typography>
            </Alert>
          )}

          {/* 分类调整 */}
          {operationType === 'changeCategory' && (
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
                选择目标分类
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value as MemoryCategory)}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>选择分类</em>
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
            </Box>
          )}

          {/* 导出选项 */}
          {operationType === 'export' && (
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
                选择导出格式
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'json' | 'markdown')}
                >
                  <MenuItem value="json">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DownloadIcon sx={{ fontSize: 16 }} />
                      JSON 格式
                    </Box>
                  </MenuItem>
                  <MenuItem value="markdown">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DownloadIcon sx={{ fontSize: 16 }} />
                      Markdown 格式
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 1 }}>
                {exportFormat === 'json' ? '导出为 JSON 格式，包含完整的记忆数据' : '导出为 Markdown 格式，便于阅读和分享'}
              </Typography>
            </Box>
          )}

          {/* 合并说明 */}
          {operationType === 'merge' && (
            <Alert severity="info" sx={{ borderRadius: 1.5 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                合理相似记忆功能
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 1 }}>
                系统将自动识别选中的记忆中相似度超过 80% 的条目，并将它们合并为一条记忆。
                此功能有助于清理重复内容，减少存储空间。
              </Typography>
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} sx={{ color: gs.textSecondary }}>
            取消
          </Button>
          {operationType === 'export' ? (
            <Button
              variant="contained"
              onClick={handleExport}
              startIcon={<DownloadIcon />}
              sx={{ backgroundColor: '#10B981' }}
            >
              导出文件
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleExecuteOperation}
              disabled={
                processing ||
                (operationType === 'changeCategory' && !targetCategory)
              }
              startIcon={processing ? <CircularProgress size={16} /> : null}
              sx={{
                backgroundColor: operationType === 'delete' ? '#EF4444' : '#6366F1',
              }}
            >
              {processing ? '处理中...' : '执行操作'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
});

MemoryBatchOperations.displayName = 'MemoryBatchOperations';

export default MemoryBatchOperations;