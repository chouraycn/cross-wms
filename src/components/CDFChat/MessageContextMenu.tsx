/**
 * CDFChat 消息右键菜单组件
 *
 * 特性：
 * - 整合所有消息操作到右键菜单
 * - 添加快捷键提示
 * - 支持"更多操作"子菜单
 * - 使用 MUI Menu/MenuItem 组件
 */
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import {
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
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
import CheckboxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckboxIcon from '@mui/icons-material/CheckBox';
import { getGrayScale } from '../../constants/theme.js';
import type { Message } from '../../types/chat.js';

/** 右键菜单位置 */
interface ContextMenuPosition {
  mouseX: number;
  mouseY: number;
}

/** 组件属性 */
export interface MessageContextMenuProps {
  /** 消息对象 */
  message: Message;
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 菜单打开状态 */
  open: boolean;
  /** 菜单位置 */
  position: ContextMenuPosition | null;
  /** 是否已复制 */
  isCopied?: boolean;
  /** 是否已收藏 */
  isBookmarked?: boolean;
  /** 是否已选中（批量操作） */
  isSelected?: boolean;
  /** 是否正在编辑 */
  isEditing?: boolean;
  /** 是否禁用某些操作 */
  disabledActions?: string[];
  /** 关闭菜单回调 */
  onClose: () => void;
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
  /** 选择回调（批量操作） */
  onSelect?: (message: Message) => void;
}

/**
 * 消息右键菜单组件
 */
export const MessageContextMenu: React.FC<MessageContextMenuProps> = memo(({
  message,
  role,
  open,
  position,
  isCopied = false,
  isBookmarked = false,
  isSelected = false,
  isEditing = false,
  disabledActions = [],
  onClose,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onQuote,
  onShare,
  onTranslate,
  onBookmark,
  onExport,
  onSelect,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [exportSubMenuOpen, setExportSubMenuOpen] = useState(false);
  const exportSubMenuRef = useRef<HTMLElement | null>(null);

  /** 检查操作是否禁用 */
  const isActionDisabled = useCallback((action: string) => {
    return disabledActions.includes(action) || message.isStreaming;
  }, [disabledActions, message.isStreaming]);

  /** 获取操作项 */
  const getActionItems = useCallback(() => {
    const isAssistant = role === 'assistant';
    const items: Array<{
      type: string;
      label: string;
      icon: React.ReactNode;
      shortcut?: string;
      divider?: boolean;
      dangerous?: boolean;
      disabled?: boolean;
      onClick?: () => void;
    }> = [];

    // 批量操作 - 选择
    items.push({
      type: 'select',
      label: isSelected ? '取消选择' : '选择',
      icon: isSelected ? <CheckboxIcon sx={{ fontSize: 16 }} /> : <CheckboxOutlineBlankIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Ctrl+S',
      disabled: false,
      onClick: () => {
        onSelect?.(message);
        onClose();
      },
    });

    // 分割线
    items.push({ type: 'divider', label: '', icon: null, divider: true });

    // 基础操作
    items.push({
      type: 'copy',
      label: isCopied ? '已复制' : '复制',
      icon: isCopied ? <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Ctrl+C',
      disabled: isActionDisabled('copy'),
      onClick: () => {
        onCopy?.(message);
        onClose();
      },
    });

    // AI 消息专属操作
    if (isAssistant) {
      items.push({
        type: 'regenerate',
        label: '重新生成',
        icon: <AutorenewIcon sx={{ fontSize: 16 }} />,
        shortcut: 'Ctrl+R',
        disabled: isActionDisabled('regenerate'),
        onClick: () => {
          onRegenerate?.(message);
          onClose();
        },
      });
    }

    // 编辑
    items.push({
      type: 'edit',
      label: isEditing ? '编辑中...' : '编辑',
      icon: <EditIcon sx={{ fontSize: 16, color: isEditing ? '#3b82f6' : 'inherit' }} />,
      shortcut: 'Ctrl+E',
      disabled: isActionDisabled('edit'),
      onClick: () => {
        onEdit?.(message);
        onClose();
      },
    });

    // 引用
    items.push({
      type: 'quote',
      label: '引用',
      icon: <FormatQuoteIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Ctrl+Q',
      disabled: isActionDisabled('quote'),
      onClick: () => {
        onQuote?.(message);
        onClose();
      },
    });

    // 分割线
    items.push({ type: 'divider', label: '', icon: null, divider: true });

    // 新增操作
    items.push({
      type: 'share',
      label: '分享',
      icon: <ShareIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('share'),
      onClick: () => {
        onShare?.(message);
        onClose();
      },
    });

    items.push({
      type: 'translate',
      label: '翻译',
      icon: <TranslateIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('translate'),
      onClick: () => {
        onTranslate?.(message);
        onClose();
      },
    });

    items.push({
      type: 'bookmark',
      label: isBookmarked ? '取消收藏' : '收藏',
      icon: isBookmarked ? <BookmarkIcon sx={{ fontSize: 16, color: '#f59e0b' }} /> : <BookmarkBorderIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('bookmark'),
      onClick: () => {
        onBookmark?.(message);
        onClose();
      },
    });

    // 导出（子菜单）
    items.push({
      type: 'export',
      label: '导出',
      icon: <DownloadIcon sx={{ fontSize: 16 }} />,
      disabled: isActionDisabled('export'),
      onClick: undefined, // 子菜单不直接触发
    });

    // 分割线
    items.push({ type: 'divider', label: '', icon: null, divider: true });

    // 删除（危险操作）
    items.push({
      type: 'delete',
      label: '删除',
      icon: <DeleteIcon sx={{ fontSize: 16 }} />,
      shortcut: 'Delete',
      dangerous: true,
      disabled: isActionDisabled('delete'),
      onClick: () => {
        onDelete?.(message.id);
        onClose();
      },
    });

    return items;
  }, [
    role,
    isCopied,
    isBookmarked,
    isSelected,
    isEditing,
    isActionDisabled,
    message,
    onClose,
    onCopy,
    onRegenerate,
    onEdit,
    onQuote,
    onShare,
    onTranslate,
    onBookmark,
    onDelete,
    onSelect,
  ]);

  if (!open || !position) return null;

  const actionItems = getActionItems();

  return (
    <>
      <Menu
        open={open}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={position ? { top: position.mouseY, left: position.mouseX } : undefined}
        PaperProps={{
          sx: {
            minWidth: 200,
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
          },
        }}
      >
        {actionItems.map((item, idx) => {
          if (item.divider) {
            return <Divider key={`divider-${idx}`} sx={{ my: 0.5, borderColor: gs.border }} />;
          }

          // 导出子菜单
          if (item.type === 'export') {
            return (
              <MenuItem
                key={item.type}
                disabled={item.disabled}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  fontSize: 13,
                  color: gs.textPrimary,
                  '&:hover': { bgcolor: gs.bgHover },
                  '&.Mui-disabled': { color: gs.textDisabled, opacity: 0.5 },
                }}
                onMouseEnter={(e) => {
                  setExportSubMenuOpen(true);
                  exportSubMenuRef.current = e.currentTarget;
                }}
                onMouseLeave={() => setExportSubMenuOpen(false)}
              >
                <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
                <MoreHorizIcon sx={{ fontSize: 14, color: gs.textDisabled, ml: 1 }} />
              </MenuItem>
            );
          }

          return (
            <MenuItem
              key={item.type}
              onClick={item.onClick}
              disabled={item.disabled}
              sx={{
                px: 1.5,
                py: 0.75,
                fontSize: 13,
                color: item.dangerous ? '#ef4444' : gs.textPrimary,
                '&:hover': {
                  bgcolor: item.dangerous
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
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                secondary={item.shortcut}
                secondaryTypographyProps={{ sx: { fontSize: 11, color: gs.textDisabled } }}
              />
            </MenuItem>
          );
        })}
      </Menu>

      {/* 导出子菜单 */}
      <Menu
        open={exportSubMenuOpen}
        onClose={() => setExportSubMenuOpen(false)}
        anchorEl={exportSubMenuRef.current}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            minWidth: 140,
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
          },
        }}
      >
        <MenuItem
          onClick={() => {
            onExport?.(message, 'markdown');
            setExportSubMenuOpen(false);
            onClose();
          }}
          sx={{
            px: 1.5,
            py: 0.75,
            fontSize: 13,
            color: gs.textPrimary,
            '&:hover': { bgcolor: gs.bgHover },
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <DownloadIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primary="Markdown" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            onExport?.(message, 'pdf');
            setExportSubMenuOpen(false);
            onClose();
          }}
          sx={{
            px: 1.5,
            py: 0.75,
            fontSize: 13,
            color: gs.textPrimary,
            '&:hover': { bgcolor: gs.bgHover },
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <DownloadIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primary="PDF" />
        </MenuItem>
      </Menu>
    </>
  );
});

MessageContextMenu.displayName = 'MessageContextMenu';

export default MessageContextMenu;