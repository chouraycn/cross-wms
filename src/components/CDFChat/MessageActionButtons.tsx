/**
 * CDFChat 消息操作按钮组件
 *
 * 特性：
 * - 统一管理所有消息操作按钮
 * - 支持 hover 显示/隐藏切换
 * - 支持紧凑模式和展开模式
 * - 使用 MUI Menu/MenuItem 组件
 * - 支持键盘操作
 * - 中文 UI
 */
import React, { useState, useRef, useCallback, memo } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  useTheme,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import ShareIcon from '@mui/icons-material/Share';
import TranslateIcon from '@mui/icons-material/Translate';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DownloadIcon from '@mui/icons-material/Download';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../constants/theme.js';
import type { Message } from '../../types/chat.js';

/** 操作类型枚举 */
export type MessageActionType =
  | 'copy'
  | 'regenerate'
  | 'edit'
  | 'delete'
  | 'quote'
  | 'share'
  | 'translate'
  | 'bookmark'
  | 'export'
  | 'divider';

/** 操作配置 */
interface ActionConfig {
  type: MessageActionType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  divider?: boolean;
  dangerous?: boolean;
  disabled?: boolean;
}

/** 组件属性 */
export interface MessageActionButtonsProps {
  /** 消息对象 */
  message: Message;
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 是否已复制 */
  isCopied?: boolean;
  /** 是否已收藏 */
  isBookmarked?: boolean;
  /** 是否正在编辑 */
  isEditing?: boolean;
  /** 是否显示紧凑模式 */
  compact?: boolean;
  /** 是否显示操作按钮 */
  visible?: boolean;
  /** 是否禁用某些操作 */
  disabledActions?: MessageActionType[];
  /** 复制回调 */
  onCopy?: (message: Message) => void;
  /** 重新生成回调 */
  onRegenerate?: (message: Message) => void;
  /** 编辑回调 */
  onEdit?: (message: Message) => void;
  /** 删除回调 */
  onDelete?: (messageId: string) => void;
  /** 引用回调 */
  onQuote?: (message: Message) => void;
  /** 分享回调 */
  onShare?: (message: Message) => void;
  /** 翻译回调 */
  onTranslate?: (message: Message) => void;
  /** 收藏回调 */
  onBookmark?: (message: Message) => void;
  /** 导出回调 */
  onExport?: (message: Message, format: 'markdown' | 'pdf') => void;
  /** 右键菜单回调 */
  onContextMenu?: (event: React.MouseEvent, message: Message) => void;
}

/**
 * 消息操作按钮组件
 */
export const MessageActionButtons: React.FC<MessageActionButtonsProps> = memo(({
  message,
  role,
  isCopied = false,
  isBookmarked = false,
  isEditing = false,
  compact = true,
  visible = true,
  disabledActions = [],
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onQuote,
  onShare,
  onTranslate,
  onBookmark,
  onExport,
  onContextMenu,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  const moreButtonRef = useRef<HTMLButtonElement>(null);

  /** 显示 Toast 提示 */
  const showToast = useCallback((message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
  }, []);

  /** 关闭 Toast */
  const handleCloseToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  /** 检查操作是否禁用 */
  const isActionDisabled = useCallback((action: MessageActionType) => {
    return disabledActions.includes(action) || message.isStreaming;
  }, [disabledActions, message.isStreaming]);

  /** 获取可用操作列表 */
  const getAvailableActions = useCallback((): ActionConfig[] => {
    const isAssistant = role === 'assistant';
    const actions: ActionConfig[] = [];

    // 基础操作
    actions.push({
      type: 'copy',
      label: isCopied ? '已复制' : '复制',
      icon: isCopied ? <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Ctrl+C',
      disabled: isActionDisabled('copy'),
    });

    // AI 消息专属操作
    if (isAssistant) {
      actions.push({
        type: 'regenerate',
        label: '重新生成',
        icon: <AutorenewIcon sx={{ fontSize: 16 }} />,
        shortcut: 'Ctrl+R',
        disabled: isActionDisabled('regenerate'),
      });
    }

    // 编辑
    actions.push({
      type: 'edit',
      label: isEditing ? '编辑中...' : '编辑',
      icon: <EditIcon sx={{ fontSize: 16, color: isEditing ? '#3b82f6' : 'inherit' }} />,
      shortcut: 'Ctrl+E',
      disabled: isActionDisabled('edit'),
    });

    // 引用
    actions.push({
      type: 'quote',
      label: '引用',
      icon: <FormatQuoteIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Ctrl+Q',
      disabled: isActionDisabled('quote'),
    });

    // 分割线
    actions.push({ type: 'divider', label: '', icon: null, divider: true });

    // 新增操作
    actions.push({
      type: 'share',
      label: '分享',
      icon: <ShareIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('share'),
    });

    actions.push({
      type: 'translate',
      label: '翻译',
      icon: <TranslateIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('translate'),
    });

    actions.push({
      type: 'bookmark',
      label: isBookmarked ? '取消收藏' : '收藏',
      icon: isBookmarked ? <BookmarkIcon sx={{ fontSize: 16, color: '#f59e0b' }} /> : <BookmarkBorderIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('bookmark'),
    });

    actions.push({
      type: 'export',
      label: '导出',
      icon: <DownloadIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('export'),
    });

    // 分割线
    actions.push({ type: 'divider', label: '', icon: null, divider: true });

    // 删除（危险操作）
    actions.push({
      type: 'delete',
      label: '删除',
      icon: <DeleteIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Delete',
      dangerous: true,
      disabled: isActionDisabled('delete'),
    });

    return actions;
  }, [role, isCopied, isBookmarked, isEditing, isActionDisabled]);

  /** 处理操作点击 */
  const handleActionClick = useCallback((action: MessageActionType) => {
    switch (action) {
      case 'copy':
        onCopy?.(message);
        showToast('已复制到剪贴板', 'success');
        break;
      case 'regenerate':
        onRegenerate?.(message);
        showToast('正在重新生成...', 'info');
        break;
      case 'edit':
        onEdit?.(message);
        break;
      case 'delete':
        setDeleteDialogOpen(true);
        break;
      case 'quote':
        onQuote?.(message);
        showToast('引用已复制到剪贴板', 'success');
        break;
      case 'share':
        onShare?.(message);
        showToast('分享链接已生成', 'success');
        break;
      case 'translate':
        onTranslate?.(message);
        showToast('正在翻译...', 'info');
        break;
      case 'bookmark':
        onBookmark?.(message);
        showToast(isBookmarked ? '已取消收藏' : '已收藏', 'success');
        break;
      case 'export':
        setExportDialogOpen(true);
        break;
    }
    setMoreMenuOpen(false);
  }, [message, onCopy, onRegenerate, onEdit, onQuote, onShare, onTranslate, onBookmark, showToast, isBookmarked]);

  /** 确认删除 */
  const handleConfirmDelete = useCallback(() => {
    onDelete?.(message.id);
    setDeleteDialogOpen(false);
    showToast('消息已删除', 'success');
  }, [message.id, onDelete, showToast]);

  /** 导出为指定格式 */
  const handleExportFormat = useCallback((format: 'markdown' | 'pdf') => {
    onExport?.(message, format);
    setExportDialogOpen(false);
    showToast(`已导出为 ${format === 'markdown' ? 'Markdown' : 'PDF'}`, 'success');
  }, [message, onExport, showToast]);

  /** 处理右键菜单 */
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu?.(event, message);
  }, [message, onContextMenu]);

  const availableActions = getAvailableActions();

  if (!visible) return null;

  // 紧凑模式：只显示主要按钮，更多操作在菜单中
  if (compact) {
    return (
      <>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
          onContextMenu={handleContextMenu}
        >
          {/* 复制按钮 */}
          <Tooltip title={isCopied ? '已复制' : '复制 (Ctrl+C)'}>
            <IconButton
              size="small"
              onClick={() => handleActionClick('copy')}
              disabled={isActionDisabled('copy')}
              sx={{
                color: isCopied ? '#22c55e' : gs.textDisabled,
                '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
                '&.Mui-disabled': { color: gs.textDisabled, opacity: 0.5 },
              }}
            >
              {isCopied ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>

          {/* 更多操作按钮 */}
          <Tooltip title="更多操作">
            <IconButton
              ref={moreButtonRef}
              size="small"
              onClick={() => setMoreMenuOpen(true)}
              sx={{
                color: gs.textDisabled,
                '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
              }}
            >
              <MoreHorizIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* 更多操作菜单 */}
        <Menu
          anchorEl={moreButtonRef.current}
          open={moreMenuOpen}
          onClose={() => setMoreMenuOpen(false)}
          PaperProps={{
            sx: {
              minWidth: 180,
              bgcolor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
              boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
            },
          }}
        >
          {availableActions.map((action, idx) => {
            if (action.divider) {
              return <Divider key={`divider-${idx}`} sx={{ my: 0.5, borderColor: gs.border }} />;
            }

            return (
              <MenuItem
                key={action.type}
                onClick={() => handleActionClick(action.type)}
                disabled={action.disabled}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  fontSize: 13,
                  color: action.dangerous ? '#ef4444' : gs.textPrimary,
                  '&:hover': {
                    bgcolor: action.dangerous
                      ? (isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2')
                      : gs.bgHover,
                  },
                  '&.Mui-disabled': {
                    color: gs.textDisabled,
                    opacity: 0.5,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                  {action.icon}
                </ListItemIcon>
                <ListItemText
                  primary={action.label}
                  secondary={action.shortcut}
                  secondaryTypographyProps={{ sx: { fontSize: 11, color: gs.textDisabled } }}
                />
              </MenuItem>
            );
          })}
        </Menu>

        {/* 删除确认对话框 */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          PaperProps={{
            sx: {
              bgcolor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
            },
          }}
        >
          <DialogTitle sx={{ fontSize: 16, fontWeight: 600, color: gs.textPrimary }}>
            确认删除消息
          </DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ fontSize: 14, color: gs.textMuted }}>
              删除后无法恢复，确定要删除这条消息吗？
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1.5 }}>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              sx={{
                fontSize: 13,
                color: gs.textMuted,
                '&:hover': { bgcolor: gs.bgHover },
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmDelete}
              variant="contained"
              sx={{
                fontSize: 13,
                bgcolor: '#ef4444',
                color: '#fff',
                '&:hover': { bgcolor: '#dc2626' },
              }}
            >
              删除
            </Button>
          </DialogActions>
        </Dialog>

        {/* 导出格式选择对话框 */}
        <Dialog
          open={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          PaperProps={{
            sx: {
              bgcolor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
            },
          }}
        >
          <DialogTitle sx={{ fontSize: 16, fontWeight: 600, color: gs.textPrimary }}>
            选择导出格式
          </DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ fontSize: 14, color: gs.textMuted, mb: 2 }}>
              请选择要导出的文件格式：
            </DialogContentText>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => handleExportFormat('markdown')}
                sx={{
                  fontSize: 13,
                  borderColor: gs.border,
                  color: gs.textPrimary,
                  '&:hover': { borderColor: '#3b82f6', bgcolor: isDark ? 'rgba(59,130,246,0.08)' : '#EFF6FF' },
                }}
              >
                Markdown
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => handleExportFormat('pdf')}
                sx={{
                  fontSize: 13,
                  borderColor: gs.border,
                  color: gs.textPrimary,
                  '&:hover': { borderColor: '#3b82f6', bgcolor: isDark ? 'rgba(59,130,246,0.08)' : '#EFF6FF' },
                }}
              >
                PDF
              </Button>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1.5 }}>
            <Button
              onClick={() => setExportDialogOpen(false)}
              sx={{
                fontSize: 13,
                color: gs.textMuted,
                '&:hover': { bgcolor: gs.bgHover },
              }}
            >
              取消
            </Button>
          </DialogActions>
        </Dialog>

        {/* Toast 提示 */}
        <Snackbar
          open={toastOpen}
          autoHideDuration={2000}
          onClose={handleCloseToast}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseToast}
            severity={toastSeverity}
            sx={{
              fontSize: 13,
              bgcolor: gs.bgPanel,
              color: gs.textPrimary,
              border: `1px solid ${gs.border}`,
            }}
          >
            {toastMessage}
          </Alert>
        </Snackbar>
      </>
    );
  }

  // 展开模式：显示所有按钮
  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
        onContextMenu={handleContextMenu}
      >
        {availableActions.filter(a => !a.divider).slice(0, 5).map((action) => (
          <Tooltip key={action.type} title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`}>
            <IconButton
              size="small"
              onClick={() => handleActionClick(action.type)}
              disabled={action.disabled}
              sx={{
                color: action.dangerous ? '#ef4444' : gs.textDisabled,
                '&:hover': {
                  color: action.dangerous ? '#ef4444' : gs.textPrimary,
                  bgcolor: action.dangerous
                    ? (isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2')
                    : gs.bgHover,
                },
                '&.Mui-disabled': { color: gs.textDisabled, opacity: 0.5 },
              }}
            >
              {action.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Box>

      {/* Toast 提示 */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={2000}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseToast}
          severity={toastSeverity}
          sx={{
            fontSize: 13,
            bgcolor: gs.bgPanel,
            color: gs.textPrimary,
            border: `1px solid ${gs.border}`,
          }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </>
  );
});

MessageActionButtons.displayName = 'MessageActionButtons';

export default MessageActionButtons;