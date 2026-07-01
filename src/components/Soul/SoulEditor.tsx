/**
 * SoulEditor — 规则编辑器
 *
 * 功能：
 * 1. Markdown 编辑器（简单的 textarea，未来可升级为 Monaco）
 * 2. YAML front matter 编辑（通过分段标签选择）
 * 3. 分段标签选择（identity/personality/tone/values/forbiddenZones/strategy）
 * 4. 语法验证（基本检查）
 * 5. 保存按钮（保存到 SOUL.md 或 USER.md）
 *
 * 使用 MUI 组件 + getGrayScale 主题
 */

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Snackbar,
  useTheme,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { getGrayScale } from '../../constants/theme';

// ===================== Types =====================

export type SoulFileType = 'soul' | 'user';

interface SoulEditorProps {
  fileType: SoulFileType;
  initialContent?: string;
  onSave?: (content: string) => Promise<void>;
  onClose?: () => void;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ===================== Helper Functions =====================

/**
 * 验证 Soul 文件内容
 */
function validateSoulContent(content: string, fileType: SoulFileType): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content.trim()) {
    errors.push('内容不能为空');
    return { valid: false, errors, warnings };
  }

  // SOUL.md 必须包含的关键字段
  if (fileType === 'soul') {
    if (!content.includes('## 身份') && !content.includes('##身份')) {
      warnings.push('建议添加 "## 身份" 分段');
    }

    if (!content.includes('personality')) {
      warnings.push('建议添加 personality 字段（cautious/efficient/balanced）');
    }

    // 检查 personality 值是否有效
    const personalityMatch = content.match(/-?\s*\*{0,2}personality\*{0,2}\s*[:：]\s*`?(cautious|efficient|balanced)`?/i);
    if (personalityMatch) {
      const value = personalityMatch[1].toLowerCase();
      if (!['cautious', 'efficient', 'balanced'].includes(value)) {
        errors.push(`personality 值无效：${value}（必须为 cautious/efficient/balanced）`);
      }
    }
  }

  // USER.md 基本验证
  if (fileType === 'user') {
    if (!content.includes('## 基本信息') && !content.includes('##基本信息')) {
      warnings.push('建议添加 "## 基本信息" 分段');
    }
  }

  // 文件大小限制
  if (content.length > 100000) {
    errors.push('文件内容过大（最大 100KB）');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 获取分段标签列表
 */
function getSectionTabs(fileType: SoulFileType): { key: string; label: string }[] {
  if (fileType === 'soul') {
    return [
      { key: 'identity', label: '身份' },
      { key: 'personality', label: '人格模式' },
      { key: 'tone', label: '语气' },
      { key: 'values', label: '价值观' },
      { key: 'forbiddenZones', label: '禁区' },
      { key: 'strategy', label: '策略偏好' },
      { key: 'raw', label: '全部内容' },
    ];
  } else {
    return [
      { key: 'basicInfo', label: '基本信息' },
      { key: 'preferences', label: '操作偏好' },
      { key: 'commonOps', label: '常用操作' },
      { key: 'notifications', label: '通知偏好' },
      { key: 'permissions', label: '权限偏好' },
      { key: 'raw', label: '全部内容' },
    ];
  }
}

// ===================== Component =====================

const SoulEditor: React.FC<SoulEditorProps> = ({
  fileType,
  initialContent = '',
  onSave,
  onClose,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState('raw');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([initialContent]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [undoIndex, setUndoIndex] = useState(0);

  const sectionTabs = useMemo(() => getSectionTabs(fileType), [fileType]);

  // 验证结果
  const validation = useMemo(() => validateSoulContent(content, fileType), [content, fileType]);

  // 内容变化时更新撤销栈
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    // 更新撤销栈（限制大小为 20）
    setUndoStack(prev => {
      const newStack = [...prev.slice(undoIndex), newContent];
      return newStack.slice(-20);
    });
    setUndoIndex(undoStack.length);
    setRedoStack([]); // 清空重做栈
  }, [undoIndex, undoStack]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (undoIndex > 0) {
      const newIndex = undoIndex - 1;
      setContent(undoStack[newIndex]);
      setUndoIndex(newIndex);
      setRedoStack(prev => [undoStack[undoIndex], ...prev]);
    }
  }, [undoIndex, undoStack]);

  // 重做
  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const newContent = redoStack[0];
      setContent(newContent);
      setRedoStack(prev => prev.slice(1));
      setUndoStack(prev => [...prev, newContent]);
      setUndoIndex(undoStack.length);
    }
  }, [redoStack, undoStack]);

  // 保存
  const handleSave = useCallback(async () => {
    if (!validation.valid) {
      setSnackbarMessage('存在验证错误，无法保存');
      return;
    }

    if (!onSave) {
      setSnackbarMessage('未配置保存回调');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(content);
      setLastSaved(new Date());
      setSnackbarMessage('保存成功');
    } catch (error) {
      setSnackbarMessage(`保存失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [content, validation.valid, onSave]);

  // 加载初始内容
  useEffect(() => {
    if (!initialContent) {
      // 从 API 加载
      fetch('/api/soul/files')
        .then(res => res.json())
        .then(data => {
          const file = data.files?.find((f: { type: string }) => f.type === fileType);
          if (file) {
            setContent(file.content);
            setUndoStack([file.content]);
          }
        })
        .catch(err => {
          console.error('[SoulEditor] Failed to load initial content:', err);
        });
    }
  }, [fileType, initialContent]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {fileType === 'soul' ? (
          <DescriptionIcon sx={{ fontSize: 20, color: '#6366f1' }} />
        ) : (
          <PersonIcon sx={{ fontSize: 20, color: '#10b981' }} />
        )}
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: gs.textPrimary }}>
          {fileType === 'soul' ? '编辑 SOUL.md' : '编辑 USER.md'}
        </Typography>

        {/* Validation Status */}
        {validation.valid ? (
          <Chip
            icon={<CheckIcon sx={{ fontSize: 14 }} />}
            label="验证通过"
            size="small"
            sx={{
              backgroundColor: 'rgba(16,185,129,0.15)',
              color: '#10b981',
              fontSize: '0.7rem',
            }}
          />
        ) : (
          <Chip
            icon={<ErrorIcon sx={{ fontSize: 14 }} />}
            label="验证错误"
            size="small"
            color="error"
            sx={{ fontSize: '0.7rem' }}
          />
        )}

        {/* Last Saved */}
        {lastSaved && (
          <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, ml: 'auto' }}>
            最后保存: {lastSaved.toLocaleTimeString()}
          </Typography>
        )}
      </Box>

      {/* Validation Errors */}
      {validation.errors.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }}>
          {validation.errors.map(err => (
            <Typography key={err} sx={{ fontSize: '0.8rem' }}>
              {err}
            </Typography>
          ))}
        </Alert>
      )}

      {/* Validation Warnings */}
      {validation.warnings.length > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
          {validation.warnings.map(warn => (
            <Typography key={warn} sx={{ fontSize: '0.8rem' }}>
              {warn}
            </Typography>
          ))}
        </Alert>
      )}

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Undo/Redo */}
        <Tooltip title="撤销">
          <IconButton size="small" onClick={handleUndo} disabled={undoIndex === 0}>
            <UndoIcon sx={{ fontSize: 18, color: undoIndex === 0 ? gs.textDisabled : gs.textSecondary }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="重做">
          <IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0}>
            <RedoIcon sx={{ fontSize: 18, color: redoStack.length === 0 ? gs.textDisabled : gs.textSecondary }} />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: gs.border }} />

        {/* Character Count */}
        <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
          {content.length} 字符
        </Typography>

        {/* Save Button */}
        <Button
          size="small"
          variant="contained"
          startIcon={isSaving ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 16 }} />}
          onClick={handleSave}
          disabled={isSaving || !validation.valid}
          sx={{
            ml: 'auto',
            fontSize: '0.75rem',
            backgroundColor: '#6366f1',
            '&:hover': { backgroundColor: '#4f46e5' },
            '&:disabled': { backgroundColor: gs.bgHover },
          }}
        >
          {isSaving ? '保存中...' : '保存'}
        </Button>

        {/* Close Button */}
        {onClose && (
          <Button size="small" onClick={onClose} sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
            关闭
          </Button>
        )}
      </Box>

      {/* Section Tabs */}
      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        sx={{
          minHeight: 32,
          '& .MuiTab-root': {
            minHeight: 32,
            py: 0.5,
            px: 1.5,
            fontSize: '0.75rem',
            fontWeight: 600,
          },
        }}
      >
        {sectionTabs.map(tab => (
          <Tab key={tab.key} value={tab.key} label={tab.label} />
        ))}
      </Tabs>

      {/* Editor */}
      <Paper
        sx={{
          flex: 1,
          p: 2,
          backgroundColor: gs.bgInput,
          border: `1px solid ${gs.border}`,
          borderRadius: 1.5,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TextField
          multiline
          fullWidth
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="在此编辑规则内容..."
          sx={{
            flex: 1,
            '& .MuiInputBase-root': {
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              backgroundColor: 'transparent',
              padding: 0,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              border: 'none',
            },
          }}
          InputProps={{
            disableUnderline: true,
          }}
        />
      </Paper>

      {/* Help Info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoIcon sx={{ fontSize: 16, color: gs.textMuted }} />
        <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
          {fileType === 'soul'
            ? 'SOUL.md 定义 AI 的身份、语气、价值观和禁区。personality 字段影响策略选择。'
            : 'USER.md 记录用户角色、偏好和常用操作，用于个性化对话。'}
        </Typography>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default memo(SoulEditor);