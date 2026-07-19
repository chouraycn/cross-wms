import React, { useRef, useEffect, useCallback, useMemo, useState, useImperativeHandle } from 'react';
import { Box, Typography, Chip, useTheme, TextField, ClickAwayListener, InputAdornment, IconButton } from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import TableChartIcon from '@mui/icons-material/TableChart';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import XIcon from '@mui/icons-material/Close';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message, Session } from '../../types/chat.js';
import { ChatItem, isMessageItem, isDividerItem, isReadingIndicatorItem, isPendingSendItem } from '../../types/chat-items.js';
import { getGrayScale, CHAT_MAX_WIDTH } from '../../constants/theme.js';
import { useAppearanceSettings } from '../../contexts/AppSettingsContext.js';
import { ImageAttachment } from './ImageAttachment.js';
import { BotMessageContent } from './BotMessageContent.js';
import { CompactionDivider } from '../CDFChat/CompactionDivider.js';
import { ReadingIndicator } from '../CDFChat/ReadingIndicator.js';

// ===================== v1.9.3: 文件类型图标工具 =====================

/** 获取文件扩展名 */
function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1) : '';
}

/** 根据文件 MIME 类型或扩展名返回对应的图标组件 */
function getFileTypeIcon(mimeType: string, fileName: string): React.ElementType {
  const ext = getFileExtension(fileName).toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return ImageIcon;
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return PictureAsPdfIcon;
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return AudioFileIcon;
  }
  if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'].includes(ext)) {
    return VideoFileIcon;
  }
  if (mime.startsWith('text/csv') || ['csv', 'xls', 'xlsx'].includes(ext)) {
    return TableChartIcon;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return FolderZipIcon;
  }
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log', 'conf', 'cfg', 'ini'].includes(ext)) {
    return DescriptionIcon;
  }
  return InsertDriveFileIcon;
}

export interface ChatMessageListProps {
  session: Session;
  copiedId: string | null;
  onCopy: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  onDelete?: (msgId: string) => void;
  onQuote?: (msg: Message) => void;
  onUndo?: (msgId: string) => void;
  onConfirmReplenishment?: (suggestionId: number) => Promise<void>;
  /** v1.9.3: 权限请求响应回调 */
  onPermissionRespond?: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
  /** 是否显示重新生成按钮 */
  showRegenerate?: boolean;
  /** 容器最大高度 */
  maxHeight?: string;
  /** 额外的 sx 样式 */
  sx?: Record<string, unknown>;
  /** v3.0: ChatItem 列表（可选，优先使用） */
  items?: ChatItem[];
  /** 上滚到顶部时加载更早消息 */
  onLoadOlder?: () => Promise<boolean>;
  /** 是否正在加载更早消息 */
  isLoadingOlder?: boolean;
  /** 是否还有更早的消息 */
  hasMoreMessages?: boolean;
  /** 外部搜索查询（由顶部搜索按钮控制） */
  externalSearchQuery?: string;
}

export interface ChatMessageListRef {
  navigateToNextSearchResult: () => void;
  navigateToPrevSearchResult: () => void;
}

/**
 * v1.5.86: 虚拟滚动消息列表（react-virtuoso）
 * 长对话（数百条消息）仅渲染可视区域 + 缓冲区，避免 DOM 节点膨胀导致滚动卡顿
 */
export const ChatMessageList = React.forwardRef<ChatMessageListRef, ChatMessageListProps>(({
  session,
  copiedId,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onQuote,
  onUndo,
  onConfirmReplenishment,
  onPermissionRespond,
  showRegenerate = false,
  maxHeight,
  sx = {},
  items: chatItems,
  onLoadOlder,
  isLoadingOlder = false,
  hasMoreMessages = false,
  externalSearchQuery,
}, ref) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const { settings, updateSettings } = useAppearanceSettings();
  const botName = settings.botName || 'CDF Bot';
  const [isEditingBotName, setIsEditingBotName] = useState(false);
  const [editingBotName, setEditingBotName] = useState('');
  const botNameInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isUserScrolledUp = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const hasMessages = (chatItems?.length ?? 0) > 0 || session.messages.length > 0;
  const data = chatItems || session.messages;
  const useChatItemMode = !!chatItems;

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }
    const query = searchQuery.toLowerCase();
    if (useChatItemMode) {
      return (data as ChatItem[]).filter(item => {
        if (isMessageItem(item)) {
          return item.message.content.toLowerCase().includes(query) ||
                 (item.message.thinking && item.message.thinking.toLowerCase().includes(query));
        }
        return false;
      });
    }
    return (data as Message[]).filter(msg =>
      msg.content.toLowerCase().includes(query) ||
      (msg.thinking && msg.thinking.toLowerCase().includes(query))
    );
  }, [data, searchQuery, useChatItemMode]);

  // 同步外部搜索查询
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
      setHighlightedMessageId(null);
      setCurrentSearchIndex(-1);
    }
  }, [externalSearchQuery]);

  const navigateToNextSearchResult = useCallback(() => {
    if (!searchQuery.trim() || filteredData.length === 0) return;
    const nextIndex = currentSearchIndex < filteredData.length - 1 ? currentSearchIndex + 1 : 0;
    setCurrentSearchIndex(nextIndex);
    const item = filteredData[nextIndex];
    const messageId = useChatItemMode ? (item as ChatItem).key : (item as Message).id;
    setHighlightedMessageId(messageId);
    virtuosoRef.current?.scrollToIndex({
      index: nextIndex,
      align: 'center',
    });
  }, [searchQuery, filteredData, currentSearchIndex, useChatItemMode]);

  const navigateToPrevSearchResult = useCallback(() => {
    if (!searchQuery.trim() || filteredData.length === 0) return;
    const prevIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : filteredData.length - 1;
    setCurrentSearchIndex(prevIndex);
    const item = filteredData[prevIndex];
    const messageId = useChatItemMode ? (item as ChatItem).key : (item as Message).id;
    setHighlightedMessageId(messageId);
    virtuosoRef.current?.scrollToIndex({
      index: prevIndex,
      align: 'center',
    });
  }, [searchQuery, filteredData, currentSearchIndex, useChatItemMode]);

  useImperativeHandle(ref, () => ({
    navigateToNextSearchResult,
    navigateToPrevSearchResult,
  }), [navigateToNextSearchResult, navigateToPrevSearchResult]);

  const toggleSelectMessage = useCallback((msgId: string) => {
    if (!isSelectionMode) return;
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, [isSelectionMode]);

  const handleSelectAll = useCallback(() => {
    const allMsgIds = session.messages.map(m => m.id);
    setSelectedMessages(new Set(allMsgIds));
  }, [session.messages]);

  const handleClearSelection = useCallback(() => {
    setSelectedMessages(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    selectedMessages.forEach(id => onDelete?.(id));
    setSelectedMessages(new Set());
    setIsSelectionMode(false);
  }, [selectedMessages, onDelete]);

  const toggleBookmark = useCallback((msgId: string) => {
    setBookmarkedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  const hasSearchResults = searchQuery.trim() && filteredData.length > 0;
  const searchCount = filteredData.length;

  // v2.4.1: 拦截 copy 事件，只复制纯文本（去除 HTML 样式）
  const handleContainerCopy = useCallback((e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  }, []);

  // 自定义 List 组件，注入 copy handler
  const ListComponent = useMemo(() => {
    return React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      (props, ref) => <div {...props} ref={ref} onCopy={handleContainerCopy} />
    );
  }, [handleContainerCopy]);

  // v2.8.9: 用户发送新消息时，强制滚动到底部（无论用户是否上翻过）
  const prevMsgCountRef = useRef(session.messages.length);
  const prevSessionIdRef = useRef(session.id);

  // v10.0: 切换会话时滚动到底部（替代 key={session.id} 的完全重挂载，性能更好）
  useEffect(() => {
    if (prevSessionIdRef.current !== session.id) {
      prevSessionIdRef.current = session.id;
      prevMsgCountRef.current = session.messages.length;
      isUserScrolledUp.current = false;
      // 延迟一帧确保 Virtuoso 已更新数据（setTimeout 16ms 替代 rAF，WKWebView 兼容）
      window.setTimeout(() => {
        if (session.messages.length > 0) {
          virtuosoRef.current?.scrollToIndex({
            index: session.messages.length - 1,
            align: 'end',
            behavior: 'auto',
          });
        }
      }, 16);
    }
  }, [session.id, session.messages.length]);

  useEffect(() => {
    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return;
    // 检测到新增消息
    if (session.messages.length > prevMsgCountRef.current) {
      if (lastMsg.role === 'user') {
        // 用户发送新消息：重置上翻标志，强制滚动到底部
        isUserScrolledUp.current = false;
        // 延迟一帧确保 Virtuoso 已渲染新消息（setTimeout 16ms 替代 rAF，WKWebView 兼容）
        window.setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index: session.messages.length - 1,
            align: 'end',
            behavior: 'smooth',
          });
        }, 16);
      } else if (!isUserScrolledUp.current) {
        virtuosoRef.current?.autoscrollToBottom();
      }
    }
    prevMsgCountRef.current = session.messages.length;
  }, [session.messages.length, session.id]);

  // v3.1: useCallback 稳定引用 — 流式渲染期间 messages 每 16ms 变化，但 renderMessageItem 的依赖项
  // (gs/isDark/botName/回调等) 在流式期间不变，useCallback 可保持引用稳定，
  // 避免 Virtuoso 接收到新 itemContent 引用后重渲染所有可见项（这是对话后按钮卡顿的根因之一）
  const renderMessageItem = useCallback((msg: Message, index: number) => (
    <Box
      key={msg.id}
      data-testid="message-bubble"
      data-role={msg.role}
      onClick={() => toggleSelectMessage(msg.id)}
      sx={{
        pt: msg.role === 'user' ? (index === 0 ? 2 : 3) : (index === 0 ? 0 : 1.5),
        pb: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
        gap: 0.5,
        px: 3,
        maxWidth: CHAT_MAX_WIDTH,
        width: '100%',
        mx: 'auto',
        cursor: isSelectionMode ? 'pointer' : 'default',
        bgcolor: selectedMessages.has(msg.id) ? (isDark ? '#374151' : '#E5E7EB') : 'transparent',
        borderRadius: selectedMessages.has(msg.id) ? '8px' : '0',
        transition: 'background-color 0.15s',
      }}
    >
      {isSelectionMode && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: '4px',
              border: `2px solid ${selectedMessages.has(msg.id) ? '#6366F1' : gs.border}`,
              bgcolor: selectedMessages.has(msg.id) ? '#6366F1' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              '&:hover': { borderColor: '#6366F1' },
            }}
          >
            {selectedMessages.has(msg.id) && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </Box>
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {msg.role === 'assistant' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isEditingBotName ? (
              <ClickAwayListener onClickAway={() => {
                const trimmed = editingBotName.trim();
                if (trimmed) {
                  updateSettings({ appearance: { ...settings, botName: trimmed } });
                }
                setIsEditingBotName(false);
              }}>
                <TextField
                  inputRef={botNameInputRef}
                  size="small"
                  value={editingBotName}
                  onChange={e => setEditingBotName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const trimmed = editingBotName.trim();
                      if (trimmed) {
                        updateSettings({ appearance: { ...settings, botName: trimmed } });
                      }
                      setIsEditingBotName(false);
                    }
                    if (e.key === 'Escape') {
                      setIsEditingBotName(false);
                    }
                  }}
                  autoFocus
                  sx={{
                    '& .MuiInputBase-root': {
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDark ? '#E5E7EB' : '#111827',
                      bgcolor: isDark ? '#2A2A2A' : '#F5F5F5',
                      borderRadius: '6px',
                      px: 0.5,
                      py: 0,
                      height: 22,
                    },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#555' : '#CCC' },
                    width: 120,
                  }}
                />
              </ClickAwayListener>
            ) : (
              <Box
                onClick={() => {
                  setEditingBotName(botName);
                  setIsEditingBotName(true);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  cursor: 'pointer',
                  borderRadius: '4px',
                  px: 0.5,
                  py: 0.15,
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                  transition: 'background-color 0.15s',
                }}
              >
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isDark ? '#E5E7EB' : '#111827',
                  }}
                >
                  {botName}
                </Typography>
                <EditIcon sx={{ fontSize: 11, color: gs.textDisabled, opacity: 0.5 }} />
              </Box>
            )}
            {msg.model && (
              <Typography
                sx={{
                  fontSize: 11,
                  color: gs.textMuted,
                  fontWeight: 400,
                }}
              >
                · {msg.model}
              </Typography>
            )}
            {msg.fallbackModel && (
              <Chip
                size="small"
                label={`⚠️ 已降级到 ${msg.fallbackModel}`}
                sx={{ height: 20, fontSize: 10, color: '#b45309', bgcolor: '#fef3c7', border: '1px solid #fcd34d' }}
              />
            )}
          </Box>
        )}
        <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
          {(() => {
            const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
            const now = new Date();
            const isToday = ts.toDateString() === now.toDateString();
            const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === ts.toDateString();
            if (isToday) {
              return ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            }
            if (isYesterday) {
              return `昨天 ${ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
            }
            return ts.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          })()}
        </Typography>
        {msg.role === 'user' && (
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: gs.textPrimary,
            }}
          >
            你
          </Typography>
        )}
      </Box>

      {msg.role === 'user' && msg.referencedSessions && msg.referencedSessions.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            mb: 0.5,
            justifyContent: 'flex-end',
          }}
        >
          {msg.referencedSessions.map((ref) => (
            <Box
              key={ref.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 0.8,
                py: 0.2,
                borderRadius: '6px',
                bgcolor: isDark ? '#1E3A5F' : '#EFF6FF',
                color: isDark ? '#60A5FA' : '#2563EB',
                border: `1px solid ${isDark ? '#1E40AF' : '#BFDBFE'}`,
                fontSize: 11,
                lineHeight: 1.4,
                gap: 0.4,
              }}
            >
              <span style={{ fontSize: 13 }}>@</span>
              <span style={{
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {ref.title || '未命名对话'}
              </span>
            </Box>
          ))}
        </Box>
      )}

      {msg.replyToMessageId && (() => {
        const replyToMsg = session.messages.find(m => m.id === msg.replyToMessageId);
        if (!replyToMsg) return null;
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 1,
              mb: 0.5,
              borderRadius: '12px',
              bgcolor: isDark ? '#2D2D2D' : '#F0F0F0',
              border: `1px solid ${gs.border}`,
              maxWidth: '75%',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gs.textDisabled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <Typography sx={{ fontSize: 11, color: gs.textMuted, fontWeight: 500 }}>
                {replyToMsg.role === 'user' ? '你' : botName}
              </Typography>
              <Typography sx={{ fontSize: 12, color: gs.textSecondary, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {replyToMsg.content.substring(0, 100)}
                {replyToMsg.content.length > 100 && '...'}
              </Typography>
            </Box>
          </Box>
        );
      })()}

      {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            mb: 0.5,
            justifyContent: 'flex-end',
            maxWidth: '75%',
          }}
        >
          {msg.attachments.map((att) => {
            const FileIcon = getFileTypeIcon(att.mimeType, att.fileName);

            const formatSize = (bytes: number): string => {
              if (bytes < 1024) return `${bytes}B`;
              if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
              return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
            };

            const handleDownload = () => {
              const link = document.createElement('a');
              link.href = att.url;
              link.download = att.fileName;
              link.click();
            };

            return att.type === 'image' ? (
              <ImageAttachment
                key={att.id}
                att={att}
                isDark={isDark}
                gs={gs}
              />
            ) : (
              <Box
                key={att.id}
                onClick={handleDownload}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: '8px',
                  bgcolor: isDark ? '#1E293B' : '#F8FAFC',
                  border: `1px solid ${gs.border}`,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: isDark ? '#263348' : '#EFF6FF' },
                  maxWidth: 280,
                }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '6px',
                    flexShrink: 0,
                    bgcolor: isDark ? '#0F172A' : '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FileIcon sx={{ fontSize: 22, color: gs.textSecondary }} />
                </Box>
                <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: gs.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}
                  >
                    {att.fileName}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
                    {formatSize(att.size)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {msg.role === 'user' ? (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: '16px',
            maxWidth: '85%',
            bgcolor: isDark ? '#262626' : '#F0F0F0',
            color: gs.textPrimary,
            wordBreak: 'break-word',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          <Typography sx={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
            {msg.content}
          </Typography>
        </Box>
      ) : (
        <BotMessageContent
          msg={msg}
          gs={gs}
          isDark={isDark}
          copiedId={copiedId}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onDelete={onDelete}
          onQuote={onQuote}
          onUndo={onUndo}
          onBookmark={toggleBookmark}
          isBookmarked={bookmarkedMessages.has(msg.id)}
          showRegenerate={showRegenerate}
          onConfirmReplenishment={onConfirmReplenishment}
          onPermissionRespond={onPermissionRespond}
        />
      )}
    </Box>
  ), [gs, isDark, botName, isEditingBotName, editingBotName, settings, updateSettings, copiedId, onCopy, onRegenerate, onEdit, onDelete, onQuote, onUndo, toggleBookmark, bookmarkedMessages, toggleSelectMessage, isSelectionMode, selectedMessages, onConfirmReplenishment, onPermissionRespond, showRegenerate]);

  const renderChatItem = useCallback((index: number, item: ChatItem) => {
    if (isMessageItem(item)) {
      return renderMessageItem(item.message, index);
    }

    if (isDividerItem(item)) {
      return (
        <Box key={item.key} sx={{ maxWidth: CHAT_MAX_WIDTH, mx: 'auto', px: 3, py: 0.5 }}>
          <CompactionDivider
            label={item.label}
            summary={item.summary}
            originalCount={item.originalCount}
            compressionRatio={item.compressionRatio}
          />
        </Box>
      );
    }

    if (isReadingIndicatorItem(item)) {
      return null;
    }

    if (isPendingSendItem(item)) {
      return (
        <Box
          key={item.key}
          sx={{
            pt: index === 0 ? 0 : 3,
            pb: 1.5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 0.5,
            px: 3,
            maxWidth: CHAT_MAX_WIDTH,
            width: '100%',
            mx: 'auto',
          }}
        >
          <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
            {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary }}>
            你
          </Typography>
        </Box>
      );
    }

    return null;
  }, [renderMessageItem]);

  const displayData = searchQuery.trim() ? filteredData : data;

  // v3.1: itemContent 用 useCallback 稳定引用 — 流式渲染期间保持引用不变，
  // 避免 Virtuoso 接收新函数引用后重渲染所有可见消息项
  const itemContent = useCallback((index: number, item: Message | ChatItem) => {
    if (useChatItemMode) {
      return renderChatItem(index, item as ChatItem);
    }
    return renderMessageItem(item as Message, index);
  }, [useChatItemMode, renderChatItem, renderMessageItem]);

  // v10.0: 切换会话时的淡入效果，提升感知流畅度
  const [fadeKey, setFadeKey] = useState(session.id);
  const [fadeIn, setFadeIn] = useState(true);
  useEffect(() => {
    if (fadeKey !== session.id) {
      setFadeKey(session.id);
      setFadeIn(false);
      window.setTimeout(() => setFadeIn(true), 16);
    }
  }, [session.id, fadeKey]);

  return (
    <Box
      data-testid="message-list"
      sx={{
        flex: 1,
        pt: hasMessages ? 0 : 1,
        pb: 1,
        minHeight: 0,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        transition: 'opacity 0.15s ease-out',
        opacity: fadeIn ? 1 : 0.3,
        ...(maxHeight ? { maxHeight } : {}),
        ...sx,
      }}
    >
      {hasMessages && isSelectionMode && (
        <Box sx={{ maxWidth: CHAT_MAX_WIDTH, mx: 'auto', px: 3, py: 1, borderBottom: `1px solid ${gs.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: gs.textMuted }}>
            已选择 {selectedMessages.size} 条
          </Typography>
          <IconButton
            size="small"
            onClick={handleSelectAll}
            sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary }, borderRadius: '4px' }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 500 }}>全选</Typography>
          </IconButton>
          <IconButton
            size="small"
            onClick={handleDeleteSelected}
            sx={{ color: '#EF4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' }, borderRadius: '4px' }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 500 }}>删除</Typography>
          </IconButton>
          <IconButton
            size="small"
            onClick={handleClearSelection}
            sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary }, borderRadius: '4px' }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 500 }}>取消</Typography>
          </IconButton>
        </Box>
      )}
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        data={displayData}
        startReached={() => {
          if (hasMoreMessages && !isLoadingOlder && !searchQuery.trim() && onLoadOlder) {
            onLoadOlder();
          }
        }}
        followOutput={(isAtBottom) => {
          if (!searchQuery.trim()) {
            if (useChatItemMode) {
              const lastItem = (displayData as ChatItem[])[(displayData as ChatItem[]).length - 1];
              if (isMessageItem(lastItem) && lastItem.message.role === 'user') return 'smooth';
            } else {
              const lastMsg = (displayData as Message[])[(displayData as Message[]).length - 1];
              if (lastMsg?.role === 'user') return 'smooth';
            }
            return isAtBottom ? 'smooth' : false;
          }
          return false;
        }}
        atBottomStateChange={(atBottom) => {
          if (!searchQuery.trim()) {
            isUserScrolledUp.current = !atBottom;
          }
        }}
        initialTopMostItemIndex={searchQuery.trim() ? undefined : (displayData.length > 0 ? { index: displayData.length - 1, align: 'end' } : undefined)}
        increaseViewportBy={{ top: 200, bottom: 400 }}
        components={{ List: ListComponent }}
        computeItemKey={(_index: number, item: Message | ChatItem) => {
          if (useChatItemMode) {
            return (item as ChatItem).key;
          }
          return (item as Message).id;
        }}
        itemContent={itemContent}
      />
    </Box>
  );
});

export default ChatMessageList;
