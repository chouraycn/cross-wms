import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip, useTheme, CircularProgress, keyframes } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Message, Session } from '../../types/chat';
import { getGrayScale } from '../../constants/theme';
import { API_BASE_URL } from '../../constants/api';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { QueryResultRenderer } from './QueryResultRenderer';
import ToolCallBlock from './ToolCallBlock';

// ===================== 入场动画 =====================

const slideInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const slideInLeft = keyframes`
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;
export interface ChatMessageListProps {
  session: Session;
  copiedId: string | null;
  onCopy: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onConfirmReplenishment?: (suggestionId: number) => Promise<void>;
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
  showRegenerate = false,
  maxHeight,
  sx = {},
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
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
      sx={{
        flex: 1,
        overflow: 'auto',
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 0,
        ...(maxHeight ? { maxHeight } : {}),
        ...sx,
      }}
    >
      {session.messages.map((msg: Message, index: number) => {
        const isLatest = index === session.messages.length - 1;
        const isNew = isLatest && msg.timestamp > new Date(Date.now() - 3000);
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
            ...(isNew ? {
              animation: `${msg.role === 'user' ? slideInRight : slideInLeft} 0.3s ease-out`,
            } : {}),
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
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isDark ? '#E5E7EB' : '#111827',
                }}
              >
                CDF Bot
              </Typography>
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
              {msg.attachments.map((att) => (
                att.type === 'image' ? (
                  <Box
                    key={att.id}
                    component="img"
                    src={`${API_BASE_URL}${att.url}`}
                    alt={att.fileName}
                    sx={{
                      maxHeight: 200,
                      maxWidth: '100%',
                      borderRadius: '12px',
                      border: `1px solid ${gs.border}`,
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <Chip
                    key={att.id}
                    icon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                    label={`${att.fileName} (${(att.size / 1024).toFixed(1)}KB)`}
                    size="small"
                    sx={{
                      height: 26,
                      fontSize: 12,
                      bgcolor: isDark ? '#1E293B' : '#F8FAFC',
                      border: `1px solid ${gs.border}`,
                      '& .MuiChip-label': { px: 1 },
                    }}
                  />
                )
              ))}
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
              }}
            >
              <Typography sx={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
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
}) => {
  return (
    <Box
      sx={{
        maxWidth: '75%',
        color: gs.textPrimary,
        fontSize: 14,
        lineHeight: 1.7,
        wordBreak: 'break-word',
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
        />
      )}
      {/* AI 工具调用展示（Tool Calling） */}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <ToolCallBlock toolCalls={msg.toolCalls} />
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

      {/* Auto 选型原因 */}
      {msg.autoReason && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AutoAwesomeIcon sx={{ fontSize: 12, color: gs.textDisabled }} />
          <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
            {msg.autoReason}
          </Typography>
          {msg.activePreset && (
            <Chip
              label={msg.activePreset.label}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                backgroundColor: isDark ? '#374151' : '#F3F4F6',
                color: gs.textMuted,
                '& .MuiChip-label': { px: 1 },
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default ChatMessageList;
