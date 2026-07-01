/**
 * CompletionDialog — LSP 补全测试对话框
 *
 * 提供 LSP 补全功能的测试界面：
 * - 输入文件路径、位置、触发字符
 * - 显示补全列表（带图标和类型）
 * - 点击补全项可查看详情
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import FunctionIcon from '@mui/icons-material/Functions';
import ClassIcon from '@mui/icons-material/Category';
import VariableIcon from '@mui/icons-material/DataObject';
import ConstantIcon from '@mui/icons-material/Star';
import KeywordIcon from '@mui/icons-material/Key';
import FileIcon from '@mui/icons-material/FilePresent';
import ModuleIcon from '@mui/icons-material/Folder';
import InterfaceIcon from '@mui/icons-material/AccountTree';
import PropertyIcon from '@mui/icons-material/Settings';
import MethodIcon from '@mui/icons-material/Code';
import {
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';

// ===================== 补全项类型图标映射 =====================

const KIND_ICON_MAP: Record<number, React.ReactNode> = {
  1: <CodeIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />, // Text
  2: <MethodIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />, // Method
  3: <FunctionIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />, // Function
  4: <FunctionIcon sx={{ fontSize: 16, color: '#F59E0B' }} />, // Constructor
  5: <PropertyIcon sx={{ fontSize: 16, color: '#10B981' }} />, // Field
  6: <VariableIcon sx={{ fontSize: 16, color: '#3B82F6' }} />, // Variable
  7: <ClassIcon sx={{ fontSize: 16, color: '#22C55E' }} />, // Class
  8: <InterfaceIcon sx={{ fontSize: 16, color: '#06B6D4' }} />, // Interface
  9: <ModuleIcon sx={{ fontSize: 16, color: '#F59E0B' }} />, // Module
  10: <PropertyIcon sx={{ fontSize: 16, color: '#10B981' }} />, // Property
  13: <ClassIcon sx={{ fontSize: 16, color: '#22C55E' }} />, // Enum
  14: <KeywordIcon sx={{ fontSize: 16, color: '#EF4444' }} />, // Keyword
  17: <FileIcon sx={{ fontSize: 16, color: '#6366F1' }} />, // File
  21: <ConstantIcon sx={{ fontSize: 16, color: '#F59E0B' }} />, // Constant
  22: <ClassIcon sx={{ fontSize: 16, color: '#22C55E' }} />, // Struct
};

const KIND_LABEL_MAP: Record<number, string> = {
  1: '文本',
  2: '方法',
  3: '函数',
  4: '构造函数',
  5: '字段',
  6: '变量',
  7: '类',
  8: '接口',
  9: '模块',
  10: '属性',
  11: '单位',
  12: '值',
  13: '枚举',
  14: '关键字',
  15: '片段',
  16: '颜色',
  17: '文件',
  18: '引用',
  19: '文件夹',
  20: '枚举成员',
  21: '常量',
  22: '结构体',
  23: '事件',
  24: '操作符',
  25: '类型参数',
};

// ===================== 补全项类型 =====================

interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
}

interface CompletionResult {
  success: boolean;
  data?: {
    isIncomplete: boolean;
    items: CompletionItem[];
  };
  error?: string;
  serverId?: string;
  serverName?: string;
  language?: string;
  duration?: number;
  itemCount?: number;
}

// ===================== 补全对话框组件 =====================

interface CompletionDialogProps {
  open: boolean;
  onClose: () => void;
}

const CompletionDialog: React.FC<CompletionDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态
  const [filePath, setFilePath] = useState('');
  const [line, setLine] = useState('0');
  const [character, setCharacter] = useState('0');
  const [triggerCharacter, setTriggerCharacter] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const [selectedItem, setSelectedItem] = useState<CompletionItem | null>(null);

  // 执行补全请求
  const handleComplete = useCallback(async () => {
    if (!filePath) {
      setResult({
        success: false,
        error: '请输入文件路径',
      });
      return;
    }

    setLoading(true);
    setResult(null);
    setSelectedItem(null);

    try {
      const response = await fetch('/api/lsp/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: filePath,
          line: parseInt(line, 10) || 0,
          character: parseInt(character, 10) || 0,
          triggerCharacter: triggerCharacter || undefined,
        }),
      });

      const data: CompletionResult = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : '请求失败',
      });
    } finally {
      setLoading(false);
    }
  }, [filePath, line, character, triggerCharacter]);

  // 选择补全项
  const handleSelectItem = useCallback((item: CompletionItem) => {
    setSelectedItem(item);
  }, []);

  // 清空结果
  const handleClear = useCallback(() => {
    setResult(null);
    setSelectedItem(null);
  }, []);

  // 获取图标
  const getIcon = (kind?: number) => {
    if (kind && KIND_ICON_MAP[kind]) {
      return KIND_ICON_MAP[kind];
    }
    return <CodeIcon sx={{ fontSize: 16, color: gs.textMuted }} />;
  };

  // 获取类型标签
  const getTypeLabel = (kind?: number) => {
    if (kind && KIND_LABEL_MAP[kind]) {
      return KIND_LABEL_MAP[kind];
    }
    return '未知';
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: gs.bgPanel,
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: gs.textPrimary }}>
        <CodeIcon sx={{ fontSize: 20 }} />
        LSP 补全测试
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8, color: gs.textMuted }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* 输入区域 */}
        <Paper sx={{ p: 2, mb: 2, backgroundColor: gs.bgHover, borderRadius: 2 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
            输入参数
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="文件路径"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="/path/to/file.ts"
              fullWidth
              size="small"
              sx={{
                '& .MuiInputBase-input': { color: gs.textPrimary },
                '& .MuiInputLabel-root': { color: gs.textSecondary },
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="行号 (0-based)"
              value={line}
              onChange={(e) => setLine(e.target.value)}
              type="number"
              size="small"
              sx={{
                width: 120,
                '& .MuiInputBase-input': { color: gs.textPrimary },
                '& .MuiInputLabel-root': { color: gs.textSecondary },
              }}
            />
            <TextField
              label="列号 (0-based)"
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              type="number"
              size="small"
              sx={{
                width: 120,
                '& .MuiInputBase-input': { color: gs.textPrimary },
                '& .MuiInputLabel-root': { color: gs.textSecondary },
              }}
            />
            <TextField
              label="触发字符"
              value={triggerCharacter}
              onChange={(e) => setTriggerCharacter(e.target.value)}
              placeholder="., :, ( 等"
              size="small"
              sx={{
                width: 120,
                '& .MuiInputBase-input': { color: gs.textPrimary },
                '& .MuiInputLabel-root': { color: gs.textSecondary },
              }}
            />
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
              onClick={handleComplete}
              disabled={loading || !filePath}
              sx={{
                backgroundColor: '#6366F1',
                '&:hover': { backgroundColor: '#4F46E5' },
                minWidth: 100,
              }}
            >
              {loading ? '请求中' : '获取补全'}
            </Button>
          </Box>
        </Paper>

        {/* 结果区域 */}
        {result && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* 补全列表 */}
            <Paper sx={{ flex: 1, p: 2, backgroundColor: gs.bgHover, borderRadius: 2, maxHeight: 400, overflow: 'auto' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                  补全列表
                </Typography>
                {result.success && result.itemCount !== undefined && (
                  <Chip
                    label={`${result.itemCount} 项`}
                    size="small"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                  />
                )}
                {result.serverName && (
                  <Chip
                    label={result.serverName}
                    size="small"
                    sx={{ fontSize: '0.7rem', height: 20, backgroundColor: '#6366F120', color: '#6366F1' }}
                  />
                )}
                {result.duration !== undefined && (
                  <Chip
                    label={`${result.duration}ms`}
                    size="small"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                  />
                )}
              </Box>

              {result.success && result.data?.items ? (
                result.data.items.length > 0 ? (
                  <List dense>
                    {result.data.items.map((item, idx) => (
                      <ListItem
                        key={idx}
                        onClick={() => handleSelectItem(item)}
                        sx={{
                          borderRadius: 1,
                          mb: 0.5,
                          cursor: 'pointer',
                          backgroundColor: selectedItem === item ? (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)') : 'transparent',
                          '&:hover': {
                            backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {getIcon(item.kind)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: gs.textPrimary }}>
                                {item.label}
                              </Typography>
                              <Chip
                                label={getTypeLabel(item.kind)}
                                size="small"
                                sx={{ fontSize: '0.65rem', height: 18 }}
                              />
                              {item.preselect && (
                                <Chip
                                  label="预选"
                                  size="small"
                                  sx={{ fontSize: '0.65rem', height: 18, backgroundColor: '#22C55E20', color: '#22C55E' }}
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            item.detail && (
                              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontFamily: 'monospace' }}>
                                {item.detail}
                              </Typography>
                            )
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, textAlign: 'center', py: 2 }}>
                    暂无补全项
                  </Typography>
                )
              ) : (
                <Alert severity="error" sx={{ fontSize: '0.85rem' }}>
                  {result.error || '请求失败'}
                </Alert>
              )}
            </Paper>

            {/* 选中项详情 */}
            {selectedItem && (
              <Paper sx={{ width: 300, p: 2, backgroundColor: gs.bgHover, borderRadius: 2 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
                  补全项详情
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>标签:</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: gs.textPrimary, fontWeight: 500 }}>
                    {selectedItem.label}
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>类型:</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: gs.textPrimary }}>
                    {getTypeLabel(selectedItem.kind)} ({selectedItem.kind})
                  </Typography>
                </Box>
                {selectedItem.detail && (
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>详情:</Typography>
                    <Typography sx={{ fontSize: '0.85rem', color: gs.textPrimary, fontFamily: 'monospace' }}>
                      {selectedItem.detail}
                    </Typography>
                  </Box>
                )}
                {selectedItem.insertText && (
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>插入文本:</Typography>
                    <Typography sx={{ fontSize: '0.85rem', color: gs.textPrimary, fontFamily: 'monospace', backgroundColor: gs.bgPanel, p: 1, borderRadius: 1 }}>
                      {selectedItem.insertText}
                    </Typography>
                  </Box>
                )}
                {selectedItem.documentation && (
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>文档:</Typography>
                    <Typography sx={{ fontSize: '0.85rem', color: gs.textSecondary }}>
                      {typeof selectedItem.documentation === 'string'
                        ? selectedItem.documentation
                        : selectedItem.documentation.value}
                    </Typography>
                  </Box>
                )}
                {selectedItem.sortText && (
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>排序文本:</Typography>
                    <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>
                      {selectedItem.sortText}
                    </Typography>
                  </Box>
                )}
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClear} sx={{ color: gs.textSecondary }}>
          清空结果
        </Button>
        <Button onClick={onClose} sx={{ color: gs.textPrimary }}>
          关闭
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CompletionDialog;