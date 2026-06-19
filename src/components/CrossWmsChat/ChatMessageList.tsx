import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip, useTheme, CircularProgress, TextField, ClickAwayListener, Button, Checkbox, FormControlLabel } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import TableChartIcon from '@mui/icons-material/TableChart';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message, Session, ObserverReflectionInfo, ExecutionPlanInfo, PlanStepInfo, ReactPhaseInfo } from '../../types/chat';
import { getGrayScale, GrayScale, CHAT_MAX_WIDTH } from '../../constants/theme';

import { useAppearanceSettings } from '../../contexts/AppSettingsContext';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { QueryResultRenderer } from './QueryResultRenderer';
import ToolCallBlock from './ToolCallBlock';
import PluginResultBlock from './PluginResultBlock';
import { formatToolArgs } from './ToolPermissionDialog';

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

/** 图片附件组件：支持加载失败回退 */
function ImageAttachment({ att, isDark, gs }: { att: { id: string; url: string; fileName: string; mimeType: string; size: number }; isDark: boolean; gs: GrayScale }) {
  const [loadError, setLoadError] = React.useState(false);

  if (loadError) {
    return (
      <Chip
        icon={<ImageIcon sx={{ fontSize: 16, color: '#F59E0B' }} />}
        label={`${att.fileName} (${(att.size / 1024).toFixed(1)}KB)`}
        size="small"
        clickable
        onClick={() => window.open(att.url, '_blank')}
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
  }

  return (
    <Box
      component="img"
      src={att.url}
      alt={att.fileName}
      onError={() => setLoadError(true)}
      onClick={() => window.open(att.url, '_blank')}
      sx={{
        maxHeight: 200,
        maxWidth: '100%',
        borderRadius: '12px',
        border: `1px solid ${gs.border}`,
        objectFit: 'cover',
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        '&:hover': { opacity: 0.85 },
      }}
    />
  );
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
  // followOutput 处理新增消息的滚动，此 effect 处理已有消息内容变化的滚动（如 AI 流式输出）
  useEffect(() => {
    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return;
    // 用户发送新消息 → 强制重置滚动状态
    if (lastMsg.role === 'user') {
      isUserScrolledUp.current = false;
    }
    // 仅在用户没有主动上翻时，跟随内容滚动
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
        // 用户发送消息 → 强制平滑滚动；AI 流式 → 仅当用户在底部才跟随
        followOutput={(isAtBottom) => {
          const lastMsg = session.messages[session.messages.length - 1];
          if (lastMsg?.role === 'user') return 'smooth';
          return isAtBottom ? 'smooth' : false;
        }}
        atBottomStateChange={(atBottom) => {
          isUserScrolledUp.current = !atBottom;
        }}
        // 切换会话时定位到末尾
        initialTopMostItemIndex={session.messages.length > 0 ? { index: session.messages.length - 1, align: 'end' } : undefined}
        // 上下缓冲区，确保滚动时消息不闪烁
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

/**
 * v7.0: 内联权限请求组件 — 输入框上方可折叠面板，对齐截图设计
 * 灰色卡片头部风格：上面两个圆角、拖拽图标+标题、右侧三按钮（收起/编辑/删除）
 */
interface InlinePermissionRequestProps {
  permissionRequest: NonNullable<Message['permissionRequest']>;
  onRespond: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
}

/** 拖拽手柄图标（6点网格）— 对齐截图左侧图标 */
const DragHandleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="4" cy="3" r="1.5" fill="#9CA3AF"/><circle cx="12" cy="3" r="1.5" fill="#9CA3AF"/>
    <circle cx="4" cy="8" r="1.5" fill="#9CA3AF"/><circle cx="12" cy="8" r="1.5" fill="#9CA3AF"/>
    <circle cx="4" cy="13" r="1.5" fill="#9CA3AF"/><circle cx="12" cy="13" r="1.5" fill="#9CA3AF"/>
  </svg>
);

const InlinePermissionRequest: React.FC<InlinePermissionRequestProps> = ({
  permissionRequest,
  onRespond,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const [alwaysAllow, setAlwaysAllow] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);

  const riskLevel = permissionRequest.riskLevel || 'confirm';

  if (permissionRequest.approved !== undefined) {
    return (
      <Box
        sx={{
          mt: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: '12px 12px 0 0',
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F5F5',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        <Box sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: gs.textDisabled,
          flexShrink: 0,
        }} />
        <Typography sx={{ fontSize: 12.5, color: gs.textMuted, fontWeight: 500 }}>
          {permissionRequest.approved ? '已允许' : '已拒绝'}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: gs.textDisabled, fontFamily: 'monospace', ml: 0.25 }}>
          {permissionRequest.toolName}
        </Typography>
      </Box>
    );
  }

  let argsObj: Record<string, unknown> = {};
  try {
    argsObj = JSON.parse(permissionRequest.toolArgs);
  } catch {
    argsObj = { raw: permissionRequest.toolArgs };
  }

  const formattedArgs = formatToolArgs(permissionRequest.toolName, argsObj);

  /** 下滑消失动画 — 自动拒绝（避免 AI 对话永久等待权限响应） */
  const handleCollapse = () => {
    setIsExiting(true);
    onRespond(permissionRequest.reqId, false);
    setTimeout(() => setCollapsed(true), 280);
  };

  if (collapsed) return null;

  return (
    <Box
      sx={{
        mt: 1,
        borderRadius: '12px 12px 0 0',
        bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F5F5',
        overflow: 'hidden',
        transition: isExiting ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease' : 'none',
        transform: isExiting ? 'translateY(100%)' : 'translateY(0)',
        opacity: isExiting ? 0 : 1,
      }}
    >
      {/* 头部栏 — 严格复刻截图：拖拽图标+标题 | 右侧三按钮 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.75,
          py: 1,
          minHeight: 44,
          gap: 0.75,
          cursor: 'default',
        }}
      >
        {/* 左侧：拖拽手柄 + 标题 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, flex: 1, minWidth: 0 }}>
          <DragHandleIcon />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: gs.textPrimary,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {riskLevel === 'high-risk'
              ? `⚠ 高风险 · ${permissionRequest.toolName}`
              : permissionRequest.toolName}
          </Typography>
        </Box>

        {/* 右侧：收起 ↓ / 编辑 ✏️ / 删除 🗑️ */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.15, flexShrink: 0 }}>
          {/* 收起/下滑 */}
          <IconButton
            size="small"
            onClick={handleCollapse}
            title="收起"
            sx={{
              color: gs.textMuted,
              padding: '5px',
              '&:hover': { color: gs.textSecondary, bgcolor: 'transparent' },
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </IconButton>
          {/* 编辑 — 暂无功能，仅视觉 */}
          <IconButton
            size="small"
            title="编辑"
            disabled
            sx={{
              color: gs.textDisabled,
              padding: '5px',
              '&:hover': { bgcolor: 'transparent' },
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </IconButton>
          {/* 删除（拒绝） */}
          <IconButton
            size="small"
            onClick={() => onRespond(permissionRequest.reqId, false)}
            title="拒绝并移除"
            sx={{
              color: gs.textMuted,
              padding: '5px',
              '&:hover': { color: '#EF4444', bgcolor: 'transparent' },
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </IconButton>
        </Box>
      </Box>

      {/* 展开内容区：参数 + 操作 — 随容器一起下滑，由 overflow:hidden 裁剪 */}
      {(
        <>
          {/* 结构化参数 */}
          {formattedArgs.length > 0 && (
            <Box
              sx={{
                mx: 1.5,
                mb: 0.25,
                borderRadius: 1.5,
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF',
                border: `1px solid ${gs.border}`,
                overflow: 'hidden',
              }}
            >
              {formattedArgs.map((item, idx) => (
                <Box
                  key={item.label}
                  sx={{
                    display: 'flex',
                    px: 1.25,
                    py: 0.55,
                    ...(idx > 0 ? { borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}` } : {}),
                    alignItems: 'flex-start',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: gs.textMuted,
                      minWidth: 56,
                      flexShrink: 0,
                      lineHeight: '18px',
                      pt: 0.1,
                    }}
                  >
                    {item.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11.5,
                      fontFamily: 'monospace',
                      color: gs.textPrimary,
                      wordBreak: 'break-all',
                      lineHeight: '18px',
                      flex: 1,
                    }}
                  >
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* 底部操作栏 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
              py: 0.65,
              gap: 0.5,
            }}
          >
            {/* 左侧：始终允许 */}
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={alwaysAllow}
                  onChange={(e) => setAlwaysAllow(e.target.checked)}
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 14 } }}
                />
              }
              label="始终允许"
              sx={{
                mr: 0,
                '& .MuiTypography-root': { fontSize: 11.5, color: gs.textDisabled },
              }}
            />

            {/* 右侧：允许执行 */}
            <Box
              onClick={() => onRespond(permissionRequest.reqId, true, alwaysAllow)}
              sx={{
                px: 1.5,
                py: 0.45,
                borderRadius: 1.5,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                bgcolor: riskLevel === 'high-risk' ? '#EF4444' : '#F59E0B',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                '&:hover': { bgcolor: riskLevel === 'high-risk' ? '#DC2626' : '#D97706' },
                userSelect: 'none',
              }}
            >
              允许执行
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};

/**
 * Bot 消息内容渲染（含查询结果、思考过程、操作按钮等）
 */
interface BotMessageContentProps {
  msg: Message;
  gs: ReturnType<typeof getGrayScale>;
  isDark: boolean;
  copiedId: string | null;
  onCopy: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  onDelete?: (msgId: string) => void;
  onQuote?: (msg: Message) => void;
  showRegenerate?: boolean;
  onConfirmReplenishment?: (suggestionId: number) => Promise<void>;
  onPermissionRespond?: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
}

const BotMessageContent = React.memo<BotMessageContentProps>(({
  msg,
  gs,
  isDark,
  copiedId,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onQuote,
  showRegenerate,
  onConfirmReplenishment,
  onPermissionRespond,
}) => {
  return (
    <Box
      className="msg-hover-zone"
      sx={{
        width: '100%',
        color: gs.textPrimary,
        fontSize: 14,
        lineHeight: 1.7,
        wordBreak: 'break-word',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        position: 'relative',
        '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
          fontSize: 'inherit',
          fontWeight: 600,
          mt: 1,
          mb: 0.5,
        },
        '& .markdown-body ul, & .markdown-body ol': {
          paddingLeft: 2.5,
          mt: 0.5,
          mb: 0.5,
        },
        '& .markdown-body p': {
          m: 0,
          '& + p': { mt: 0.75 },
        },
        '& .markdown-body code': {
          fontSize: 13,
        },
        '& .markdown-body pre': {
          my: 1,
        },
      }}
    >
      {/* 查询结果渲染 */}
      {msg.metadata?.queryResult && (
        <QueryResultRenderer
          queryResult={msg.metadata.queryResult}
          loading={msg.metadata.loading}
          dataSource={msg.metadata.queryResult.dataSource}
          onConfirmReplenishment={onConfirmReplenishment}
        />
      )}
      {msg.metadata?.loading && !msg.metadata.queryResult && (
        <QueryResultRenderer
          queryResult={{
            columns: [],
            rows: [],
            rowCount: 0,
            truncated: false,
            chartType: 'table',
            sql: '',
          }}
          loading={true}
          onConfirmReplenishment={onConfirmReplenishment}
        />
      )}
      {/* AI 思考过程展示 */}
      {msg.thinking && (
        <ThinkingBlock
          thinking={msg.thinking}
          isStreaming={msg.isStreaming}
          duration={msg.thinkingDuration}
          reasoningEffort={msg.reasoningEffort}
          thinkingElapsed={msg.thinkingElapsed}
          cacheHit={msg.cacheHit}
          usage={msg.usage}
        />
      )}
      {/* AI 工具调用展示（Tool Calling） */}
      {msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0 && (
        <ToolCallBlock toolCalls={msg.toolCalls} />
      )}
      {/* v3.0: 插件自动调用结果展示（reasoning 流触发） */}
      {msg.pluginResults && msg.pluginResults.length > 0 && (
        <PluginResultBlock results={msg.pluginResults} />
      )}
      {/* v4.0: ReAct 阶段指示器 */}
      {msg.reactPhase && (
        <ReactPhaseIndicator phaseInfo={msg.reactPhase} gs={gs} isDark={isDark} />
      )}
      {/* v4.0: 执行计划卡片 */}
      {msg.executionPlan && (
        <ExecutionPlanCard plan={msg.executionPlan} gs={gs} isDark={isDark} />
      )}
      {/* v4.0: Observer 反思标签 */}
      {msg.observerReflections && msg.observerReflections.length > 0 && (
        <ObserverReflectionChips reflections={msg.observerReflections} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 反思置信度条 */}
      {msg.reflectionConfidence && (
        <ReflectionConfidenceBar data={msg.reflectionConfidence} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 预算超出指示器 */}
      {msg.budgetExceeded && (
        <BudgetExceededIndicator data={msg.budgetExceeded} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 复杂度评估徽章 */}
      {msg.complexityAssessment && (
        <ComplexityAssessmentBadge data={msg.complexityAssessment} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 上下文压缩通知 */}
      {msg.contextCompressed && (
        <ContextCompressedNotice data={msg.contextCompressed} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 计划步骤完成指示器 */}
      {msg.planStepCompleted && (
        <PlanStepCompletedIndicator data={msg.planStepCompleted} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 熔断器触发告警 */}
      {msg.circuitBreakerTriggered && (
        <CircuitBreakerAlert data={msg.circuitBreakerTriggered} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 复杂度升级通知 */}
      {msg.complexityUpgraded && (
        <ComplexityUpgradedNotice data={msg.complexityUpgraded} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: LLM 反思标签 */}
      {msg.llmReflection && (
        <LLMReflectionTag data={msg.llmReflection} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 长期记忆检索通知 */}
      {msg.memoryRetrieved && (
        <MemoryRetrievedNotice data={msg.memoryRetrieved} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 输出修复通知 */}
      {msg.outputRepaired && (
        <OutputRepairedNotice data={msg.outputRepaired} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 预算调整通知 */}
      {msg.budgetAdjusted && (
        <BudgetAdjustedNotice data={msg.budgetAdjusted} gs={gs} isDark={isDark} />
      )}
      {/* v7.0: 队列状态指示器 — Collect/Steer/Followup 模式反馈 */}
      {msg.queueState && msg.isStreaming && (() => {
        const qs = msg.queueState;
        const stateLabel: Record<string, { text: string; color: string; icon: string }> = {
          collecting: { text: `合并输入中 (${qs.queueLength ?? 0} 条)`, color: '#7C3AED', icon: '⊕' },
          steering: { text: '转向指令中...', color: '#EA580C', icon: '↗' },
          executing_with_queue: { text: `执行中 (${qs.queueLength ?? 0} 条排队)`, color: '#2563EB', icon: '◉' },
          executing: { text: '执行中...', color: '#2563EB', icon: '◉' },
        };
        const info = stateLabel[qs.state ?? ''];
        if (!info) return null;
        return (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.25, borderRadius: 1, mb: 0.5,
            bgcolor: info.color + '0A', border: `1px solid ${info.color}20`,
          }}>
            <Typography sx={{ fontSize: 12, color: info.color, fontWeight: 600, lineHeight: 1 }}>
              {info.icon}
            </Typography>
            <Typography sx={{ fontSize: 11, color: info.color, fontWeight: 500, lineHeight: 1 }}>
              {info.text}
            </Typography>
            {qs.mode && (
              <Typography sx={{ fontSize: 10, color: info.color + '99', ml: 0.5, lineHeight: 1 }}>
                [{qs.mode}]
              </Typography>
            )}
          </Box>
        );
      })()}
      {/* v1.9.3: 内联权限请求 */}
      {msg.permissionRequest && onPermissionRespond && (
        <InlinePermissionRequest
          permissionRequest={msg.permissionRequest}
          onRespond={onPermissionRespond}
        />
      )}
      {/* 消息内容渲染 */}
      {msg.content && msg.content.trim() ? (
        <MarkdownRenderer content={msg.content} isStreaming={msg.isStreaming} />
      ) : msg.isStreaming ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <CircularProgress size={14} thickness={5} sx={{ color: gs.textDisabled }} />
          <Typography sx={{ fontSize: 13, color: gs.textDisabled, fontStyle: 'italic' }}>
            {msg.thinking ? '深度思考中...' : '思考中...'}
          </Typography>
        </Box>
      ) : msg.role === 'assistant' ? (
        (() => {
          const serverError = (msg.metadata as any)?.error as string | undefined;
          const thinkingSummary = (() => {
            if (!msg.thinking || msg.thinking.trim() === '') return null;
            const paragraphs = msg.thinking.split(/\n\n+/).filter(p => p.trim());
            if (paragraphs.length === 0) return msg.thinking.trim().substring(0, 200);
            return paragraphs[paragraphs.length - 1].trim();
          })();

          if (thinkingSummary && !serverError) {
            return (
              <MarkdownRenderer content={thinkingSummary} />
            );
          }

          const errorMessage = serverError || '内容生成失败，请重试';
          return (
            <Box sx={{
              display: 'flex', alignItems: 'flex-start', gap: 0.75,
              p: 1, borderRadius: 1.5,
              bgcolor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#FECACA'}`,
            }}>
              <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444', mt: 0.15 }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 12, color: '#EF4444', lineHeight: 1.6 }}>
                  {errorMessage}
                </Typography>
                {serverError && (
                  <Typography sx={{ fontSize: 11, color: gs.textDisabled, mt: 0.5, fontFamily: 'monospace' }}>
                    错误码: {(msg.metadata as any)?.errorCode || 'N/A'}
                  </Typography>
                )}
              </Box>
              {onRegenerate && (
                <Tooltip title="重新生成">
                  <IconButton
                    size="small"
                    onClick={() => onRegenerate(msg)}
                    sx={{ ml: 'auto', color: '#EF4444', '&:hover': { bgcolor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' } }}
                  >
                    <AutorenewIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })()
      ) : null}
      {/* 操作按钮：复制 + 编辑 + 删除 + 引用 + 重新生成（hover 显示，非流式输出时） */}
      {!msg.isStreaming && (
        <Box sx={{
          display: 'flex',
          gap: 0.5,
          mt: 0.5,
          opacity: 0,
          transition: 'opacity 0.15s',
          '.msg-hover-zone:hover &': { opacity: 1 },
        }}>
          <Tooltip title={copiedId === msg.id ? '已复制' : '复制'}>
            <IconButton
              size="small"
              onClick={() => onCopy(msg)}
              sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
            >
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {onEdit && (
            <Tooltip title="编辑">
              <IconButton
                size="small"
                onClick={() => onEdit(msg)}
                sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="删除">
              <IconButton
                size="small"
                onClick={() => onDelete(msg.id)}
                sx={{ color: gs.textDisabled, '&:hover': { color: '#EF4444' } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </IconButton>
            </Tooltip>
          )}
          {onQuote && (
            <Tooltip title="引用">
              <IconButton
                size="small"
                onClick={() => onQuote(msg)}
                sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </IconButton>
            </Tooltip>
          )}
          {showRegenerate && onRegenerate && (
            <Tooltip title="重新生成">
              <IconButton
                size="small"
                onClick={() => onRegenerate(msg)}
                sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
              >
                <AutorenewIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Auto 选型原因 — 仅在非默认选型时显示 */}
      {msg.autoReason && msg.autoReasonType !== 'default' && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AutoAwesomeIcon sx={{ fontSize: 12, color: gs.textDisabled }} />
          <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
            {msg.autoReason}
          </Typography>
        </Box>
      )}
    </Box>
  );
}, (prev, next) => {
  // v2.8.1: 字段级比较替代引用比较
  // 旧方案 prev.msg !== next.msg 对流式消息完全无效 — 每帧创建新对象引用 → memo 失效
  // 新方案：先检查引用相等（快速路径），不等时逐字段比较
  const pm = prev.msg, nm = next.msg;

  // 快速路径：引用相等 — 非流式消息走此路径
  if (pm === nm) {
    if ((prev.copiedId === pm.id || next.copiedId === nm.id) && prev.copiedId !== next.copiedId) return false;
    return prev.gs === next.gs
      && prev.isDark === next.isDark
      && prev.onCopy === next.onCopy
      && prev.onRegenerate === next.onRegenerate
      && prev.showRegenerate === next.showRegenerate
      && prev.onConfirmReplenishment === next.onConfirmReplenishment
      && prev.onPermissionRespond === next.onPermissionRespond;
  }

  // 慢路径：引用不等 — 逐字段比较（流式消息每帧走此路径）
  // 值类型字段（string/number/boolean）— 值比较
  if (pm.content !== nm.content) return false;
  if (pm.thinking !== nm.thinking) return false;
  if (pm.isStreaming !== nm.isStreaming) return false;
  if (pm.model !== nm.model) return false;
  if (pm.fallbackModel !== nm.fallbackModel) return false;
  if (pm.thinkingDuration !== nm.thinkingDuration) return false;
  if (pm.thinkingElapsed !== nm.thinkingElapsed) return false;
  if (pm.thinkingType !== nm.thinkingType) return false;
  if (pm.cacheHit !== nm.cacheHit) return false;
  if (pm.reasoningEffort !== nm.reasoningEffort) return false;
  if (pm.autoReason !== nm.autoReason) return false;
  if (pm.autoReasonType !== nm.autoReasonType) return false;
  if (pm.fallbackReason !== nm.fallbackReason) return false;

  // 引用类型字段（object/array）— 引用比较
  // SSE handler 更新时创建新引用，未更新的字段保持原引用
  if (pm.toolCalls !== nm.toolCalls) return false;
  if (pm.pluginResults !== nm.pluginResults) return false;
  if (pm.reactPhase !== nm.reactPhase) return false;
  if (pm.executionPlan !== nm.executionPlan) return false;
  if (pm.observerReflections !== nm.observerReflections) return false;
  if (pm.reflectionConfidence !== nm.reflectionConfidence) return false;
  if (pm.budgetExceeded !== nm.budgetExceeded) return false;
  if (pm.complexityAssessment !== nm.complexityAssessment) return false;
  if (pm.contextCompressed !== nm.contextCompressed) return false;
  if (pm.planStepCompleted !== nm.planStepCompleted) return false;
  if (pm.circuitBreakerTriggered !== nm.circuitBreakerTriggered) return false;
  if (pm.complexityUpgraded !== nm.complexityUpgraded) return false;
  if (pm.llmReflection !== nm.llmReflection) return false;
  if (pm.memoryRetrieved !== nm.memoryRetrieved) return false;
  if (pm.outputRepaired !== nm.outputRepaired) return false;
  if (pm.budgetAdjusted !== nm.budgetAdjusted) return false;
  if (pm.permissionRequest !== nm.permissionRequest) return false;
  if (pm.queueState !== nm.queueState) return false;
  if (pm.metadata !== nm.metadata) return false;
  if (pm.usage !== nm.usage) return false;
  if (pm.replanTriggered !== nm.replanTriggered) return false;

  // copiedId — 仅在涉及本消息时才比较
  if ((prev.copiedId === pm.id || next.copiedId === nm.id) && prev.copiedId !== next.copiedId) return false;

  // 稳定 props（gs/isDark/callbacks 应为稳定引用）
  return prev.gs === next.gs
    && prev.isDark === next.isDark
    && prev.onCopy === next.onCopy
    && prev.onRegenerate === next.onRegenerate
    && prev.showRegenerate === next.showRegenerate
    && prev.onConfirmReplenishment === next.onConfirmReplenishment
    && prev.onPermissionRespond === next.onPermissionRespond;
});
BotMessageContent.displayName = 'BotMessageContent';

// ===================== v4.0: ReAct / Planner 展示组件 =====================

/** Observer 反思标签颜色映射 */
const REFLECTION_LEVEL_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  error: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  retry_suggested: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
  success: { color: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
};

/** 步骤状态图标 */
const STEP_STATUS_ICONS: Record<string, string> = {
  completed: '✅',
  in_progress: '🔄',
  failed: '❌',
  skipped: '⏭️',
  pending: '⏳',
};

/** ReAct 阶段定义 */
const REACT_PHASES: Array<{ key: ReactPhaseInfo['phase']; label: string }> = [
  { key: 'reasoning', label: '推理' },
  { key: 'acting', label: '执行' },
  { key: 'observing', label: '观察' },
  { key: 'reflecting', label: '反思' },
  { key: 'done', label: '完成' },
];

/**
 * v4.0: Observer 反思标签
 * 每条反思用 MUI Chip 展示，颜色按 level 区分。
 */
const ObserverReflectionChips: React.FC<{
  reflections: ObserverReflectionInfo[];
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ reflections, gs, isDark }) => {
  const memoizedReflections = useMemo(() => reflections, [reflections]);

  if (!memoizedReflections || memoizedReflections.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
      {memoizedReflections.map((r, idx) => {
        const style = REFLECTION_LEVEL_COLORS[r.level] || REFLECTION_LEVEL_COLORS.error;
        const retryLabel = r.willRetry ? ` (重试 ${r.retryIndex}/${r.maxRetries})` : '';
        const label = `🔍 ${r.toolName}: ${r.hint}${retryLabel}`;

        return (
          <Chip
            key={`${r.toolName}-${idx}`}
            label={label}
            size="small"
            sx={{
              height: 26,
              fontSize: 11,
              maxWidth: '100%',
              '& .MuiChip-label': {
                px: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
              color: style.color,
              bgcolor: style.bg,
              border: `1px solid ${style.border}`,
            }}
          />
        );
      })}
    </Box>
  );
});
ObserverReflectionChips.displayName = 'ObserverReflectionChips';

/**
 * v4.0: 执行计划卡片
 * 用 MUI Card 展示计划意图和步骤列表。
 */
const ExecutionPlanCard: React.FC<{
  plan: ExecutionPlanInfo;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ plan, gs, isDark }) => {
  if (!plan) return null;

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: isDark ? '#1A1A2E' : '#F8FAFC',
        border: `1px solid ${gs.border}`,
        maxWidth: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: gs.textPrimary }}>
          📋 执行计划
        </Typography>
        <Typography sx={{ fontSize: 11, color: gs.textMuted, flex: 1 }}>
          {plan.intent}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {plan.steps.map((step) => {
          const icon = STEP_STATUS_ICONS[step.status] || '⏳';
          const indent = step.dependsOn.length > 0 ? 2 : 0;

          return (
            <Box
              key={step.step}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                pl: indent,
                py: 0.15,
              }}
            >
              <Typography sx={{ fontSize: 12, lineHeight: 1.4, flexShrink: 0 }}>
                {icon}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: step.status === 'failed' ? '#EF4444'
                    : step.status === 'in_progress' ? '#3B82F6'
                    : step.status === 'completed' ? '#22C55E'
                    : gs.textMuted,
                  lineHeight: 1.4,
                }}
              >
                {step.step}. {step.description}
              </Typography>
              {step.toolName && (
                <Typography
                  sx={{
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: gs.textDisabled,
                    ml: 'auto',
                    flexShrink: 0,
                  }}
                >
                  {step.toolName}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
ExecutionPlanCard.displayName = 'ExecutionPlanCard';

/**
 * v4.0: ReAct 阶段指示器
 * 状态条展示当前阶段：Reasoning → Acting → Observing → Reflecting → Done
 */
const ReactPhaseIndicator: React.FC<{
  phaseInfo: ReactPhaseInfo;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ phaseInfo, gs, isDark }) => {
  if (!phaseInfo) return null;

  const currentIdx = REACT_PHASES.findIndex(p => p.key === phaseInfo.phase);

  return (
    <Box
      sx={{
        mt: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: isDark ? '#1A1A2E' : '#F1F5F9',
        border: `1px solid ${gs.border}`,
        maxWidth: 'fit-content',
      }}
    >
      {REACT_PHASES.map((phase, idx) => {
        const isCurrent = idx === currentIdx;
        const isCompleted = idx < currentIdx;
        const isPending = idx > currentIdx;

        let bgColor: string;
        let textColor: string;
        if (isCurrent) {
          bgColor = '#3B82F6';
          textColor = '#FFFFFF';
        } else if (isCompleted) {
          bgColor = isDark ? '#374151' : '#D1D5DB';
          textColor = isDark ? '#9CA3AF' : '#6B7280';
        } else {
          bgColor = isDark ? '#1F2937' : '#E5E7EB';
          textColor = isDark ? '#4B5563' : '#9CA3AF';
        }

        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && (
              <Typography sx={{ fontSize: 10, color: gs.textDisabled, mx: 0.25 }}>
                →
              </Typography>
            )}
            <Box
              sx={{
                px: 1,
                py: 0.15,
                borderRadius: 0.75,
                bgcolor: bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 36,
                transition: 'background-color 0.2s',
              }}
            >
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: isCurrent ? 600 : 400,
                  color: textColor,
                  whiteSpace: 'nowrap',
                }}
              >
                {phase.label}
              </Typography>
            </Box>
          </React.Fragment>
        );
      })}
      {phaseInfo.step != null && phaseInfo.totalSteps != null && (
        <Typography sx={{ fontSize: 10, color: gs.textMuted, ml: 0.5 }}>
          {phaseInfo.step}/{phaseInfo.totalSteps}
        </Typography>
      )}
    </Box>
  );
});
ReactPhaseIndicator.displayName = 'ReactPhaseIndicator';

// ===================== v5.0: ReAct 优化展示组件 =====================

/** 置信度颜色映射 */
const CONFIDENCE_COLORS = {
  low: { bar: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  medium: { bar: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  high: { bar: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
} as const;

/** 决策标签样式映射 */
const DECISION_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  continue: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: '继续' },
  early_stop: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: '提前终止' },
  replan: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: '重新规划' },
};

/** 复杂度等级样式映射 */
const COMPLEXITY_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  simple: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', label: '简单' },
  moderate: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: '中等' },
  complex: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: '复杂' },
};

/**
 * v5.0: 反思置信度进度条
 * 显示 confidenceScore (1-10) 进度条、决策标签、可折叠推理文本
 */
const ReflectionConfidenceBar: React.FC<{
  data: NonNullable<Message['reflectionConfidence']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const [reasonOpen, setReasonOpen] = React.useState(false);

  const score = Math.max(1, Math.min(10, data.confidenceScore));
  const selfScore = Math.max(0, Math.min(10, data.selfScore));
  const pct = (score / 10) * 100;
  const tier = score < 4 ? 'low' : score < 7 ? 'medium' : 'high';
  const colors = CONFIDENCE_COLORS[tier];

  // Derive decision from shouldEarlyStop flag
  const decision: string = data.shouldEarlyStop ? 'early_stop' : 'continue';
  const decisionStyle = DECISION_STYLES[decision] || DECISION_STYLES.continue;

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 1.5,
        bgcolor: colors.bg,
        border: `1px solid ${colors.border}`,
        maxWidth: '100%',
      }}
    >
      {/* Row 1: bar + score + decision badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 24 }}>
        {/* Progress bar track */}
        <Box
          sx={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            bgcolor: isDark ? '#374151' : '#E5E7EB',
            overflow: 'hidden',
            minWidth: 60,
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 3,
              bgcolor: colors.bar,
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
        {/* Score number */}
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.bar, fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>
          {score}/10
        </Typography>
        {/* Self score (subtle) */}
        {selfScore > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, fontFamily: 'monospace' }}>
            (自评:{selfScore})
          </Typography>
        )}
        {/* Decision badge */}
        <Box
          sx={{
            px: 0.75,
            py: 0.1,
            borderRadius: 0.75,
            bgcolor: decisionStyle.bg,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: decisionStyle.color, whiteSpace: 'nowrap' }}>
            {decisionStyle.label}
          </Typography>
        </Box>
        {/* Expand reason toggle */}
        {data.reason && (
          <IconButton
            size="small"
            onClick={() => setReasonOpen(!reasonOpen)}
            sx={{
              p: 0.25,
              color: gs.textDisabled,
              '&:hover': { color: gs.textMuted },
              transition: 'transform 0.2s',
              transform: reasonOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </IconButton>
        )}
      </Box>
      {/* Collapsible reasoning text */}
      {reasonOpen && data.reason && (
        <Typography
          sx={{
            mt: 0.5,
            fontSize: 11,
            color: gs.textMuted,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {data.reason}
        </Typography>
      )}
    </Box>
  );
});
ReflectionConfidenceBar.displayName = 'ReflectionConfidenceBar';

/**
 * v5.0: 预算超出指示器
 * 一行紧凑展示：警告图标 + 类型 + 当前/限制值
 */
const BudgetExceededIndicator: React.FC<{
  data: NonNullable<Message['budgetExceeded']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const isTurns = data.consumedTurns > data.maxTurns && data.maxTurns > 0;
  const isTokens = data.consumedTokens > data.maxTokens && data.maxTokens > 0;

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2',
        border: '1px solid rgba(239,68,68,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        maxWidth: 'fit-content',
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#EF4444', whiteSpace: 'nowrap' }}>
        预算超出
      </Typography>
      {isTurns && (
        <Typography sx={{ fontSize: 11, color: gs.textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          轮次 {data.consumedTurns}/{data.maxTurns}
        </Typography>
      )}
      {isTokens && (
        <Typography sx={{ fontSize: 11, color: gs.textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          Token {data.consumedTokens}/{data.maxTokens}
        </Typography>
      )}
      {!isTurns && !isTokens && (
        <Typography sx={{ fontSize: 11, color: gs.textMuted, whiteSpace: 'nowrap' }}>
          {data.reason}
        </Typography>
      )}
    </Box>
  );
});
BudgetExceededIndicator.displayName = 'BudgetExceededIndicator';

/**
 * v5.0: 复杂度评估徽章
 * 彩色徽章 + 分数 + hover tooltip 显示推理
 */
const ComplexityAssessmentBadge: React.FC<{
  data: NonNullable<Message['complexityAssessment']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const level = data.level || 'simple';
  const style = COMPLEXITY_STYLES[level] || COMPLEXITY_STYLES.simple;

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {data.reason || '无推理信息'}
          </Typography>
          {data.recommendedMode && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              推荐模式: {data.recommendedMode}
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: style.bg,
          border: `1px solid ${style.border}`,
          cursor: 'default',
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: style.color, whiteSpace: 'nowrap' }}>
          {style.label}
        </Typography>
        {data.estimatedSteps > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, fontFamily: 'monospace' }}>
            ≈{data.estimatedSteps}步
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});
ComplexityAssessmentBadge.displayName = 'ComplexityAssessmentBadge';

/**
 * v6.0: 上下文语义压缩通知
 * 灰蓝色调：显示压缩策略图标 + 压缩比例 + 保留关键信息数
 */
const ContextCompressedNotice: React.FC<{
  data: NonNullable<Message['contextCompressed']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const strategyLabel: Record<string, string> = {
    semantic: '语义压缩',
    extractive: '摘要提取',
    truncation: '截断压缩',
  };
  const ratioPct = data.ratio != null ? Math.round(data.ratio * 100) : 0;
  const preservedCount = data.keyInfoPreserved?.length ?? 0;

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {strategyLabel[data.strategy] || data.strategy}：{data.originalTokens} → {data.compressedTokens} tokens
          </Typography>
          {preservedCount > 0 && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              保留关键信息: {data.keyInfoPreserved!.slice(0, 5).join('、')}{preservedCount > 5 ? ` 等${preservedCount}项` : ''}
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(99,130,185,0.1)' : 'rgba(99,130,185,0.08)',
          maxWidth: 'fit-content',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 4h12M2 8h12M2 12h8" stroke="#6382b9" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 10l2 2-2 2" stroke="#6382b9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: '#6382b9', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {strategyLabel[data.strategy] || '上下文压缩'}
        </Typography>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {ratioPct}%
        </Typography>
        {preservedCount > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
            {preservedCount}项关键信息
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});
ContextCompressedNotice.displayName = 'ContextCompressedNotice';

/**
 * v6.0: 计划步骤完成指示器
 * 绿色低调样式：显示步骤完成信息
 */
const PlanStepCompletedIndicator: React.FC<{
  data: NonNullable<Message['planStepCompleted']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  return (
    <Box
      sx={{
        mt: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        bgcolor: isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)',
        maxWidth: 'fit-content',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 8.5l3.5 3.5 6.5-7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Typography sx={{ fontSize: 10, color: '#22c55e', whiteSpace: 'nowrap' }}>
        步骤 {data.step} 完成{data.toolName ? ` · ${data.toolName}` : ''}
      </Typography>
      {data.description && (
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
          {data.description}
        </Typography>
      )}
    </Box>
  );
});
PlanStepCompletedIndicator.displayName = 'PlanStepCompletedIndicator';

/**
 * v6.0: 熔断器触发告警
 * 橙色警告样式：显示熔断工具和备选建议
 */
const CircuitBreakerAlert: React.FC<{
  data: NonNullable<Message['circuitBreakerTriggered']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const isOpen = data.state === 'open';
  const bgColor = isOpen
    ? (isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)')
    : (isDark ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.06)');
  const textColor = isOpen ? '#ef4444' : '#f97316';

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            工具 {data.toolName} 连续失败 {data.failureCount} 次
          </Typography>
          {data.alternativeTool && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              建议替代: {data.alternativeTool}
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: bgColor,
          maxWidth: 'fit-content',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M8 2L2 14h12L8 2z" stroke={textColor} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          <path d="M8 6v3M8 11.5v0.5" stroke={textColor} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: textColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {isOpen ? '熔断' : '降级'}: {data.toolName}
        </Typography>
        {data.alternativeTool && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
            → {data.alternativeTool}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});
CircuitBreakerAlert.displayName = 'CircuitBreakerAlert';

/**
 * v6.0: 复杂度升级通知
 * 紫色徽章样式：显示从低到高的升级
 */
const ComplexityUpgradedNotice: React.FC<{
  data: NonNullable<Message['complexityUpgraded']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const levelMap: Record<string, string> = { simple: '简单', moderate: '中等', complex: '复杂' };
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {data.reason || '无升级原因'}
          </Typography>
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.3)',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M8 2l2 5h5l-4 3 1.5 5L8 12 3.5 15 5 10 1 7h5z" stroke="#a855f7" strokeWidth="1.2" fill="none" />
        </svg>
        <Typography sx={{ fontSize: 10, color: '#a855f7', fontWeight: 600, whiteSpace: 'nowrap' }}>
          复杂度升级
        </Typography>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
          {levelMap[data.oldLevel] || data.oldLevel} → {levelMap[data.newLevel] || data.newLevel}
        </Typography>
      </Box>
    </Tooltip>
  );
});
ComplexityUpgradedNotice.displayName = 'ComplexityUpgradedNotice';

/**
 * v6.0: LLM 反思标签
 * 蓝色低调样式：显示 LLM 反思洞察
 */
const LLMReflectionTag: React.FC<{
  data: NonNullable<Message['llmReflection']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  return (
    <Box
      sx={{
        mt: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        bgcolor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
        maxWidth: 'fit-content',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
        <path d="M8 5v3l2 2" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <Typography sx={{ fontSize: 10, color: '#3b82f6', fontWeight: 500, whiteSpace: 'nowrap' }}>
        LLM 反思
      </Typography>
      {data.insight && (
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
          {data.insight.length > 50 ? data.insight.substring(0, 50) + '...' : data.insight}
        </Typography>
      )}
      <Typography sx={{ fontSize: 9, color: gs.textDisabled, fontFamily: 'monospace' }}>
        ({data.confidenceScore})
      </Typography>
    </Box>
  );
});
LLMReflectionTag.displayName = 'LLMReflectionTag';

/**
 * v6.0: 长期记忆检索通知
 * 灰色低调样式：显示检索到的记忆数量
 */
const MemoryRetrievedNotice: React.FC<{
  data: NonNullable<Message['memoryRetrieved']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        data.summaries && data.summaries.length > 0 ? (
          <Box sx={{ p: 0.5 }}>
            {data.summaries.map((s, i) => (
              <Typography key={i} sx={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                {i + 1}. {s.length > 80 ? s.substring(0, 80) + '...' : s}
              </Typography>
            ))}
          </Box>
        ) : undefined
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(156,163,175,0.06)' : 'rgba(156,163,175,0.08)',
          maxWidth: 'fit-content',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 4a6 6 0 0112 0" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M2 8a6 6 0 0112 0" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 12a4 4 0 018 0" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
          历史记忆注入: {data.count} 条
        </Typography>
      </Box>
    </Tooltip>
  );
});
MemoryRetrievedNotice.displayName = 'MemoryRetrievedNotice';

/**
 * v6.0: 输出修复通知
 * 黄色低调样式：显示工具输出被自动修复
 */
const OutputRepairedNotice: React.FC<{
  data: NonNullable<Message['outputRepaired']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        data.repairDetails ? (
          <Box sx={{ p: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
              {data.repairDetails}
            </Typography>
          </Box>
        ) : undefined
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(234,179,8,0.08)' : 'rgba(234,179,8,0.06)',
          maxWidth: 'fit-content',
          cursor: 'default',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 8l4 4 8-8" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 4l4-0L14 8" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: '#eab308', whiteSpace: 'nowrap' }}>
          输出已修复: {data.toolName}
        </Typography>
      </Box>
    </Tooltip>
  );
});
OutputRepairedNotice.displayName = 'OutputRepairedNotice';

/**
 * v6.0: 预算调整通知
 * 灰色低调样式：显示预算动态调整
 */
const BudgetAdjustedNotice: React.FC<{
  data: NonNullable<Message['budgetAdjusted']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
            {data.reason || '复杂度变更'}
          </Typography>
          {data.oldMaxTokens !== undefined && data.newMaxTokens !== undefined && (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              Token 预算: {data.oldMaxTokens} → {data.newMaxTokens}
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDark ? 'rgba(156,163,175,0.06)' : 'rgba(156,163,175,0.08)',
          maxWidth: 'fit-content',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="2" y="6" width="12" height="8" rx="1" stroke={gs.textDisabled} strokeWidth="1.5" fill="none" />
          <path d="M5 6V4a3 3 0 016 0v2" stroke={gs.textDisabled} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Typography sx={{ fontSize: 10, color: gs.textDisabled, whiteSpace: 'nowrap' }}>
          预算调整: {data.oldMaxTurns} → {data.newMaxTurns} 轮
        </Typography>
      </Box>
    </Tooltip>
  );
});
BudgetAdjustedNotice.displayName = 'BudgetAdjustedNotice';

export default ChatMessageList;
