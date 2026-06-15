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
import { Message, Session } from '../../types/chat';
import { getGrayScale, GrayScale } from '../../constants/theme';

import { useAppSettings } from '../../contexts/AppSettingsContext';
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
    // 图片加载失败：显示文件卡片样式
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
 * 统一的消息列表渲染组件
 * 被 ChatPage 和 CrossWmsChat 共享使用
 */
export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  session,
  copiedId,
  onCopy,
  onRegenerate,
  onConfirmReplenishment,
  onPermissionRespond,
  showRegenerate = false,
  maxHeight,
  sx = {},
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings, updateSettings } = useAppSettings();
  const botName = settings.appearance.botName || 'CDF Bot';
  const [isEditingBotName, setIsEditingBotName] = useState(false);
  const [editingBotName, setEditingBotName] = useState('');
  const botNameInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
  }, []);

  // v2.4.1: 拦截 copy 事件，只复制纯文本（去除 HTML 样式）
  const handleContainerCopy = useCallback((e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  }, []);

  // 新消息时自动滚动（仅在用户没有主动上翻时）
  useEffect(() => {
    if (!isUserScrolledUp.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session.messages.length, session.messages[session.messages.length - 1]?.content]);

  // 切换会话时重置滚动状态并滚到底部
  useEffect(() => {
    isUserScrolledUp.current = false;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }
  }, [session.id]);

  return (
    <Box
      ref={messagesContainerRef}
      onScroll={handleScroll}
      onCopy={handleContainerCopy}
      sx={{
        flex: 1,
        overflow: 'auto',
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 0,
        // v1.9.3: 确保消息文本可以被选中
        userSelect: 'text',
        WebkitUserSelect: 'text',
        ...(maxHeight ? { maxHeight } : {}),
        ...sx,
      }}
    >
      {session.messages.map((msg: Message, index: number) => {
        return (
        <Box
          key={msg.id}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: 0.5,
            px: 3,
            maxWidth: 960,
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
                      updateSettings({ appearance: { ...settings.appearance, botName: trimmed } });
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
                            updateSettings({ appearance: { ...settings.appearance, botName: trimmed } });
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
              </Box>
            )}
            <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
              {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
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
                // v1.9.3: 根据文件类型选择图标
                const FileIcon = getFileTypeIcon(att.mimeType, att.fileName);
                const fileExt = getFileExtension(att.fileName).toUpperCase();

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
            /* 用户消息：右侧灰色对话框 */
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderRadius: '16px',
                maxWidth: '75%',
                bgcolor: isDark ? '#374151' : '#F3F4F6',
                color: gs.textPrimary,
                wordBreak: 'break-word',
                // v1.9.3: 确保用户消息文本可以被选中
                userSelect: 'text',
                WebkitUserSelect: 'text',
              }}
            >
              <Typography sx={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
                {msg.content}
              </Typography>
            </Box>
          ) : (
            /* Bot 消息：左侧平铺 */
            <BotMessageContent
              msg={msg}
              gs={gs}
              isDark={isDark}
              copiedId={copiedId}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              showRegenerate={showRegenerate}
              onConfirmReplenishment={onConfirmReplenishment}
              onPermissionRespond={onPermissionRespond}
            />
          )}
        </Box>
        );
      })}
      {/* 滚动锚点 */}
      <div ref={messagesEndRef} />
    </Box>
  );
};

/**
 * v1.9.3: 内联权限请求组件 — 在消息中显示敏感工具确认
 * v2.2.1: 更新 — 风险等级颜色编码、结构化参数展示、始终允许选项
 */
interface InlinePermissionRequestProps {
  permissionRequest: NonNullable<Message['permissionRequest']>;
  onRespond: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
}

/** v2.2.1: 风险等级样式映射（内联版本） */
const INLINE_RISK_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  'confirm': {
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    label: '需要确认',
  },
  'high-risk': {
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    label: '高风险操作',
  },
};

const InlinePermissionRequest: React.FC<InlinePermissionRequestProps> = ({
  permissionRequest,
  onRespond,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [alwaysAllow, setAlwaysAllow] = React.useState(false);

  // 根据风险等级获取样式
  const riskLevel = permissionRequest.riskLevel || 'confirm';
  const riskStyle = INLINE_RISK_STYLES[riskLevel] || INLINE_RISK_STYLES['confirm'];
  const isHighRisk = riskLevel === 'high-risk';

  // 已响应状态
  if (permissionRequest.approved !== undefined) {
    return (
      <Box
        sx={{
          mt: 1,
          p: 1.5,
          borderRadius: 2,
          bgcolor: permissionRequest.approved
            ? isDark ? 'rgba(34, 197, 94, 0.1)' : '#F0FDF4'
            : isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
          border: `1px solid ${permissionRequest.approved ? '#22C55E' : '#EF4444'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: 13, color: permissionRequest.approved ? '#22C55E' : '#EF4444' }}>
          {permissionRequest.approved ? '✓ 已允许执行' : '✗ 已拒绝执行'}
        </Typography>
        <Typography sx={{ fontSize: 12, color: gs.textMuted, fontFamily: 'monospace' }}>
          {permissionRequest.toolName}
        </Typography>
      </Box>
    );
  }

  // 解析参数
  let argsObj: Record<string, unknown> = {};
  try {
    argsObj = JSON.parse(permissionRequest.toolArgs);
  } catch {
    argsObj = { raw: permissionRequest.toolArgs };
  }

  // 结构化参数
  const formattedArgs = formatToolArgs(permissionRequest.toolName, argsObj);

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: isHighRisk
          ? (isDark ? 'rgba(239,68,68,0.06)' : '#FEF2F2')
          : (isDark ? '#2A1A0A' : '#FFFBEB'),
        border: `1px solid ${riskStyle.border}`,
      }}
    >
      {/* 标题行 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        {isHighRisk ? (
          <ErrorOutlineIcon sx={{ color: riskStyle.color, fontSize: 20 }} />
        ) : (
          <WarningAmberIcon sx={{ color: riskStyle.color, fontSize: 20 }} />
        )}
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: gs.textPrimary }}>
          {riskStyle.label}
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: gs.textMuted,
            ml: 'auto',
          }}
        >
          {permissionRequest.toolName}
        </Typography>
      </Box>

      {/* 高风险提示 */}
      {isHighRisk && (
        <Typography sx={{ fontSize: 12, color: riskStyle.color, mb: 1 }}>
          此操作可能对系统产生不可逆的影响，请仔细确认。
        </Typography>
      )}

      {/* 结构化参数列表 */}
      <Box
        sx={{
          borderRadius: 1.5,
          bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
          mb: 1.5,
          overflow: 'hidden',
        }}
      >
        {formattedArgs.map((item, idx) => (
          <Box
            key={item.label}
            sx={{
              display: 'flex',
              px: 1.5,
              py: 0.75,
              ...(idx > 0 ? { borderTop: `1px solid ${gs.border}` } : {}),
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                color: gs.textMuted,
                minWidth: 70,
                flexShrink: 0,
                lineHeight: '18px',
              }}
            >
              {item.label}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
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

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          onClick={() => onRespond(permissionRequest.reqId, false)}
          variant="outlined"
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            color: gs.textMuted,
            borderColor: gs.border,
            '&:hover': { borderColor: gs.textSecondary },
          }}
        >
          拒绝
        </Button>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              sx={{ '& .MuiSvgIcon-root': { fontSize: 16 } }}
            />
          }
          label="始终允许"
          sx={{
            mr: 0,
            ml: 1,
            '& .MuiTypography-root': { fontSize: 12, color: gs.textMuted },
          }}
        />
        <Button
          onClick={() => onRespond(permissionRequest.reqId, true, alwaysAllow)}
          variant="contained"
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            bgcolor: isHighRisk ? '#EF4444' : '#F59E0B',
            color: '#fff',
            '&:hover': { bgcolor: isHighRisk ? '#DC2626' : '#D97706' },
            ml: 'auto',
          }}
        >
          允许执行
        </Button>
      </Box>
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
  showRegenerate?: boolean;
  onConfirmReplenishment?: (suggestionId: number) => Promise<void>;
  onPermissionRespond?: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
}

const BotMessageContent: React.FC<BotMessageContentProps> = ({
  msg,
  gs,
  isDark,
  copiedId,
  onCopy,
  onRegenerate,
  showRegenerate,
  onConfirmReplenishment,
  onPermissionRespond,
}) => {
  return (
    <Box
      sx={{
        maxWidth: '75%',
        color: gs.textPrimary,
        fontSize: 14,
        lineHeight: 1.7,
        wordBreak: 'break-word',
        // v1.9.3: 确保 Bot 消息文本可以被选中
        userSelect: 'text',
        WebkitUserSelect: 'text',
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
      {/* 如果仅有 loading 状态 */}
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
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <ToolCallBlock toolCalls={msg.toolCalls} />
      )}
      {/* v3.0: 插件自动调用结果展示（reasoning 流触发） */}
      {msg.pluginResults && msg.pluginResults.length > 0 && (
        <PluginResultBlock results={msg.pluginResults} />
      )}
      {/* v1.9.3: 内联权限请求 */}
      {msg.permissionRequest && onPermissionRespond && (
        <InlinePermissionRequest
          permissionRequest={msg.permissionRequest}
          onRespond={onPermissionRespond}
        />
      )}
      {/* 消息内容渲染 */}
      {msg.content && msg.content.trim() ? (
        <MarkdownRenderer content={msg.content} />
      ) : msg.isStreaming ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <CircularProgress size={14} thickness={5} sx={{ color: gs.textDisabled }} />
          <Typography sx={{ fontSize: 13, color: gs.textDisabled, fontStyle: 'italic' }}>
            {msg.thinking ? '深度思考中...' : '思考中...'}
          </Typography>
        </Box>
      ) : msg.role === 'assistant' ? (
        // v1.9.3: assistant 消息无内容且非 streaming 时显示错误提示
        // v1.9.5: 当有 thinking 内容时，提取最后一段作为摘要展示（兜底 toolExecutor finalContent 丢失的情况）
        (() => {
          const serverError = (msg.metadata as any)?.error as string | undefined;
          const thinkingSummary = (() => {
            if (!msg.thinking || msg.thinking.trim() === '') return null;
            const paragraphs = msg.thinking.split(/\n\n+/).filter(p => p.trim());
            if (paragraphs.length === 0) return msg.thinking.trim().substring(0, 200);
            return paragraphs[paragraphs.length - 1].trim();
          })();

          // 有 thinking 摘要时，展示摘要代替错误提示
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
      {/* 操作按钮：复制 + 重新生成（非流式输出时显示） */}
      {!msg.isStreaming && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
          <Tooltip title={copiedId === msg.id ? '已复制' : '复制'}>
            <IconButton
              size="small"
              onClick={() => onCopy(msg)}
              sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
            >
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
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

      {/* Auto 选型原因 — 仅在非默认选型时显示（避免每次显示"使用默认模型"造成干扰） */}
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
};

export default ChatMessageList;
