/**
 * v2.2.1: AI 深度思考展示组件（重新设计）
 *
 * 设计理念：
 * - 折叠态：简洁一行，左侧渐变竖线 + 图标 + 标签 + 耗时，右侧操作按钮
 * - 展开态：优雅的内容区域，柔和背景，可滚动，支持复制
 * - 流式态：呼吸灯效果，显示已等待时间
 */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton, Collapse, useTheme, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getGrayScale } from '../../constants/theme';

interface ThinkingBlockProps {
  thinking: string;
  duration?: number;
  isStreaming?: boolean;
  reasoningEffort?: string;
  thinkingElapsed?: number;
  cacheHit?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  };
}

function formatDuration(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(0);
  return `${min}m${sec}s`;
}

function getEffortStyle(effort?: string) {
  switch (effort) {
    case 'max': return { label: '极致推理', color: '#F59E0B', gradient: 'linear-gradient(135deg, #F59E0B, #EF4444)' };
    case 'high': return { label: '深度思考', color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280, #4B5563)' };
    default: return { label: '思考过程', color: '#3B82F6', gradient: 'linear-gradient(135deg, #3B82F6, #06B6D4)' };
  }
}

export function ThinkingBlock({ thinking, duration, isStreaming, reasoningEffort, thinkingElapsed, cacheHit, usage }: ThinkingBlockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);
  const effort = getEffortStyle(reasoningEffort);
  const contentRef = useRef<HTMLDivElement>(null);

  // 呼吸灯动画（WKWebView 兼容）
  const [glowOpacity, setGlowOpacity] = useState(0.3);
  useEffect(() => {
    if (!isStreaming) { setGlowOpacity(0.5); return; }
    const timer = setInterval(() => {
      setGlowOpacity(prev => prev < 0.5 ? prev + 0.05 : prev - 0.05);
    }, 80);
    return () => clearInterval(timer);
  }, [isStreaming]);

  // 流式开始时自动展开
  const prevRef = useRef(false);
  useEffect(() => {
    if (isStreaming && !prevRef.current) setExpanded(true);
    prevRef.current = !!isStreaming;
  }, [isStreaming]);

  // 构建折叠态右侧信息
  const metaParts: string[] = [];
  if (duration != null) metaParts.push(formatDuration(duration));
  if (usage?.thinkingTokens != null) metaParts.push(`${(usage.thinkingTokens / 1000).toFixed(1)}K tokens`);
  if (cacheHit) metaParts.push('缓存');

  return (
    <Box
      sx={{
        mb: 1.5,
        borderRadius: 2,
        overflow: 'hidden',
        // 柔和的背景
        bgcolor: isDark ? 'rgba(156,163,175,0.06)' : 'rgba(107,114,128,0.04)',
        border: `1px solid ${isDark ? 'rgba(156,163,175,0.15)' : 'rgba(107,114,128,0.1)'}`,
        transition: 'border-color 0.2s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(156,163,175,0.3)' : 'rgba(107,114,128,0.2)',
        },
      }}
    >
      {/* 头部栏 */}
      <Box
        onClick={() => setExpanded(v => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s ease',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          },
        }}
      >
        {/* 左侧渐变竖线 */}
        <Box
          sx={{
            width: 3,
            height: 20,
            borderRadius: 1.5,
            background: effort.gradient,
            opacity: isStreaming ? glowOpacity : 0.8,
            transition: 'opacity 0.3s ease',
            flexShrink: 0,
          }}
        />

        {/* 图标 */}
        <AutoAwesomeIcon
          sx={{
            fontSize: 15,
            color: effort.color,
            opacity: isStreaming ? glowOpacity : 1,
            transition: 'opacity 0.3s ease',
            flexShrink: 0,
          }}
        />

        {/* 标签 */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: effort.color,
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}
        >
          {isStreaming ? '正在思考...' : effort.label}
        </Typography>

        {/* 流式时显示已等待时间 */}
        {isStreaming && thinkingElapsed != null && (
          <Typography sx={{ fontSize: 11, color: gs.textDisabled, flexShrink: 0 }}>
            {formatDuration(thinkingElapsed)}
          </Typography>
        )}

        {/* 折叠态右侧元信息 */}
        {!isStreaming && metaParts.length > 0 && (
          <Typography sx={{
            fontSize: 11,
            color: gs.textDisabled,
            flexShrink: 0,
          }}>
            {metaParts.join(' · ')}
          </Typography>
        )}

        {/* 弹性空间 */}
        <Box sx={{ flex: 1 }} />

        {/* 操作按钮（折叠态显示） */}
        {!isStreaming && thinking && (
          <Tooltip title="复制思考过程">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(thinking).catch(() => {});
              }}
              sx={{
                p: 0.25,
                color: gs.textDisabled,
                opacity: 0,
                transition: 'opacity 0.15s ease, color 0.15s ease',
                '.MuiBox-root:hover > &': { opacity: 1 },
                '&:hover': { color: gs.textSecondary },
              }}
              className="thinking-action-btn"
            >
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* 展开/折叠箭头 */}
        <ExpandMoreIcon
          sx={{
            fontSize: 18,
            color: gs.textDisabled,
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </Box>

      {/* 展开内容 */}
      <Collapse in={expanded} unmountOnExit>
        <Box
          ref={contentRef}
          sx={{
            px: 2,
            pb: 1.5,
            pt: 0.5,
            // 顶部细分割线
            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
            maxHeight: 240,
            overflowY: 'auto',
            // 自定义滚动条
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
              borderRadius: 2,
            },
            // Markdown 样式覆盖
            '& .markdown-body': {
              fontSize: 13,
              lineHeight: 1.75,
              color: gs.textSecondary,
              p: 0,
              m: 0,
            },
            '& .markdown-body p': {
              m: 0,
              '& + p': { mt: 0.75 },
            },
            '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
              fontSize: 'inherit',
              fontWeight: 600,
              color: gs.textPrimary,
              mt: 1.25,
              mb: 0.5,
              '&:first-child': { mt: 0 },
            },
            '& .markdown-body ul, & .markdown-body ol': {
              paddingLeft: 2,
              mt: 0.5,
              mb: 0.5,
            },
            '& .markdown-body code': {
              fontSize: 12,
              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              px: 0.5,
              py: 0.15,
              borderRadius: 0.5,
            },
            '& .markdown-body pre': {
              my: 1,
              borderRadius: 1,
            },
            '& .markdown-body pre code': {
              bgcolor: 'transparent',
              px: 0,
              py: 0,
            },
            '& .markdown-body blockquote': {
              borderLeft: `2px solid ${effort.color}40`,
              pl: 1.5,
              my: 0.75,
              color: gs.textMuted,
            },
          }}
        >
          <MarkdownRenderer content={thinking} />
        </Box>
      </Collapse>
    </Box>
  );
}
