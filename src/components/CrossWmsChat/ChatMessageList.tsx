import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Box, Typography, Chip, useTheme, TextField, ClickAwayListener } from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import TableChartIcon from '@mui/icons-material/TableChart';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import EditIcon from '@mui/icons-material/Edit';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message, Session } from '../../types/chat.js';
import { getGrayScale, CHAT_MAX_WIDTH } from '../../constants/theme.js';
import { useAppearanceSettings } from '../../contexts/AppSettingsContext.js';
import { ImageAttachment } from './ImageAttachment.js';
import { BotMessageContent } from './BotMessageContent.js';

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
  onConfirmReplenishment?: (suggestionId: number) => Promise<void>;
  /** v1.9.3: 权限请求响应回调 */
  onPermissionRespond?: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
  /** 是否显示重新生成按钮 */
  showRegenerate?: boolean;
  /** 容器最大高度 */
  maxHeight?: string;
  /** 额外的 sx 样式 */
  sx?: Record<string, unknown>;
}

/**
 * v1.5.86: 虚拟滚动消息列表（react-virtuoso）
 * 长对话（数百条消息）仅渲染可视区域 + 缓冲区，避免 DOM 节点膨胀导致滚动卡顿
 */
export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  session,
  copiedId,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onQuote,
  onConfirmReplenishment,
  onPermissionRespond,
  showRegenerate = false,
  maxHeight,
  sx = {},
}) => {
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

  // v1.5.86: 流式内容变化时自动滚动（仅当用户未主动上翻）
  useEffect(() => {
    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return;
    if (lastMsg.role === 'user') {
      isUserScrolledUp.current = false;
    }
    if (!isUserScrolledUp.current && virtuosoRef.current) {
      virtuosoRef.current.autoscrollToBottom();
    }
  }, [session.messages.length, session.messages[session.messages.length - 1]?.content]);

  return (
    <Box
      sx={{
        flex: 1,
        py: 1,
        minHeight: 0,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        ...(maxHeight ? { maxHeight } : {}),
        ...sx,
      }}
    >
      <Virtuoso
        ref={virtuosoRef}
        key={session.id}
        style={{ height: '100%' }}
        data={session.messages}
        followOutput={(isAtBottom) => {
          const lastMsg = session.messages[session.messages.length - 1];
          if (lastMsg?.role === 'user') return 'smooth';
          return isAtBottom ? 'smooth' : false;
        }}
        atBottomStateChange={(atBottom) => {
          isUserScrolledUp.current = !atBottom;
        }}
        initialTopMostItemIndex={session.messages.length > 0 ? { index: session.messages.length - 1, align: 'end' } : undefined}
        increaseViewportBy={{ top: 200, bottom: 400 }}
        components={{ List: ListComponent }}
        computeItemKey={(_index: number, msg: Message) => msg.id}
        itemContent={(_index: number, msg: Message) => (
          <Box
            key={msg.id}
            sx={{
              py: 1.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 0.5,
              px: 3,
              maxWidth: CHAT_MAX_WIDTH,
              width: '100%',
              mx: 'auto',
            }}
          >
            {/* 角色标签 + 时间 */}
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
                {(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
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

            {/* 引用会话 chip — 仅在用户消息上展示 */}
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

            {/* 附件展示 — 仅在用户消息上展示 */}
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

                  return att.type === 'image' ? (
                    <ImageAttachment
                      key={att.id}
                      att={att}
                      isDark={isDark}
                      gs={gs}
                    />
                  ) : (
                    <Chip
                      key={att.id}
                      icon={<FileIcon sx={{ fontSize: 16 }} />}
                      label={`${att.fileName} (${(att.size / 1024).toFixed(1)}KB)`}
                      size="small"
                      clickable
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = att.url;
                        link.download = att.fileName;
                        link.click();
                      }}
                      sx={{
                        height: 30,
                        fontSize: 12,
                        bgcolor: isDark ? '#1E293B' : '#F8FAFC',
                        border: `1px solid ${gs.border}`,
                        '& .MuiChip-label': { px: 1 },
                        '&:hover': { bgcolor: isDark ? '#263348' : '#EFF6FF' },
                      }}
                    />
                  );
                })}
              </Box>
            )}

            {/* 消息内容 */}
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
                showRegenerate={showRegenerate}
                onConfirmReplenishment={onConfirmReplenishment}
                onPermissionRespond={onPermissionRespond}
              />
            )}
          </Box>
        )}
      />
    </Box>
  );
};

export default ChatMessageList;
