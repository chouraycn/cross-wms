/**
 * v3: AI 深度思考展示组件（极简黑白灰风格）
 *
 * 设计理念：
 * - 折叠态：一行，左侧竖线 + 标签 + 耗时 + 箭头
 * - 展开态：内容区域，可滚动，支持复制
 * - 流式态：CSS 呼吸灯动画（无 JS 定时器，WKWebView 友好）
 */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton, Collapse, useTheme, Tooltip, CircularProgress } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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

function getLabel(effort?: string): string {
  switch (effort) {
    case 'max': return '极致推理';
    case 'high': return '深度思考';
    default: return '思考过程';
  }
}

export function ThinkingBlock({ thinking, duration, isStreaming, reasoningEffort, thinkingElapsed, cacheHit, usage }: ThinkingBlockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);
  const label = getLabel(reasoningEffort);
  const contentRef = useRef<HTMLDivElement>(null);

  // v7: 注入全局呼吸灯 keyframes（仅一次）
  useEffect(() => {
    const id = 'thinking-breathe-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes thinking-breathe {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // 流式开始时自动展开
  const prevRef = useRef(false);
  useEffect(() => {
    if (isStreaming && !prevRef.current) setExpanded(true);
    prevRef.current = !!isStreaming;
  }, [isStreaming]);

  // 右侧元信息
  const metaParts: string[] = [];
  if (duration != null) metaParts.push(formatDuration(duration));
  if (usage?.thinkingTokens != null) metaParts.push(`${(usage.thinkingTokens / 1000).toFixed(1)}K`);
  if (cacheHit) metaParts.push('缓存');

  return (
    <Box
      sx={{
        mb: 1,
        borderRadius: '8px',
        overflow: 'hidden',
        bgcolor: isDark ? 'rgba(128,128,128,0.06)' : 'rgba(0,0,0,0.02)',
        border: `1px solid ${isDark ? 'rgba(128,128,128,0.12)' : 'rgba(0,0,0,0.07)'}`,
        transition: 'border-color 0.15s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(128,128,128,0.25)' : 'rgba(0,0,0,0.14)',
        },
      }}
    >
      {/* 头部栏 */}
      <Box
        onClick={() => setExpanded(v => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.6,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* v7: 呼吸灯 — CSS 动画替代 JS 定时器，WKWebView 更流畅 */}
        <Box
          sx={{
            width: 2,
            height: 13,
            borderRadius: 1,
            bgcolor: isStreaming ? 'rgba(128,128,128,0.7)' : gs.textMuted,
            opacity: 0.7,
            ...(isStreaming ? { animation: 'thinking-breathe 2s ease-in-out infinite' } : {}),
            flexShrink: 0,
          }}
        />

        {/* v7: 旋转圈 — 流式时显示，作为思考中的视觉提示 */}
        {isStreaming && (
          <CircularProgress
            size={12}
            thickness={5}
            sx={{ color: gs.textMuted, flexShrink: 0 }}
          />
        )}

        {/* 标签 */}
        <Typography
          sx={{
            fontSize: '11px',
            fontWeight: 500,
            color: isDark ? '#9CA3AF' : '#6B7280',
            flexShrink: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {isStreaming ? '正在思考...' : label}
        </Typography>

        {/* 弹性空间 */}
        <Box sx={{ flex: 1 }} />

        {/* 元信息 */}
        {(metaParts.length > 0 || (isStreaming && thinkingElapsed != null)) && (
          <Typography
            sx={{
              fontSize: '11px',
              color: isDark ? '#555' : '#bbb',
              flexShrink: 0,
              fontFamily: '"SF Mono","Menlo","Monaco",monospace',
            }}
          >
            {isStreaming && thinkingElapsed != null ? formatDuration(thinkingElapsed) : metaParts.join(' · ')}
          </Typography>
        )}

        {/* 复制按钮 */}
        {!isStreaming && thinking && (
          <Tooltip title="复制">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(thinking).catch(() => {});
              }}
              sx={{
                p: 0.3,
                color: gs.textDisabled,
                opacity: 0,
                transition: 'opacity 0.15s ease, color 0.15s ease',
                '.MuiBox-root:hover > &': { opacity: 1 },
                '&:hover': { color: gs.textSecondary },
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* 展开/折叠箭头 */}
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            color: isDark ? '#555' : '#ccc',
            transition: 'transform 0.2s ease',
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
            px: 1.25,
            pb: 1,
            pt: 0.4,
            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
            maxHeight: 280,
            overflowY: 'auto',
            // 自定义滚动条
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              borderRadius: 2,
            },
            // Markdown 样式覆盖 — 极简黑白灰
            '& .markdown-body': {
              fontSize: '12.5px',
              lineHeight: 1.85,
              color: isDark ? '#9CA3AF' : '#555',
              p: 0,
              m: 0,
            },
            '& .markdown-body p': {
              m: 0,
              '& + p': { mt: 0.65 },
            },
            '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
              fontSize: '12.5px',
              fontWeight: 600,
              color: isDark ? '#D1D5DB' : '#333',
              mt: 1,
              mb: 0.35,
              '&:first-child': { mt: 0 },
            },
            '& .markdown-body ul, & .markdown-body ol': {
              paddingLeft: 1.75,
              mt: 0.45,
              mb: 0.45,
              li: { mt: 0.15 },
            },
            '& .markdown-body code': {
              fontSize: '11.5px',
              bgcolor: isDark ? 'rgba(80,80,80,0.3)' : 'rgba(0,0,0,0.05)',
              px: 0.4,
              py: 0.08,
              borderRadius: 3,
              fontFamily: '"SF Mono","Menlo",monospace',
            },
            '& .markdown-body pre': {
              my: 0.75,
              borderRadius: 6,
              bgcolor: isDark ? 'rgba(40,40,40,0.6)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${isDark ? 'rgba(80,80,80,0.25)' : 'rgba(0,0,0,0.06)'}`,
            },
            '& .markdown-body pre code': {
              bgcolor: 'transparent',
              px: 0,
              py: 0,
              fontSize: '11.5px',
            },
            '& .markdown-body blockquote': {
              borderLeft: `2px solid ${isDark ? 'rgba(100,100,100,0.35)' : 'rgba(0,0,0,0.09)'}`,
              pl: 1.2,
              my: 0.65,
              color: isDark ? '#777' : '#999',
              fontStyle: 'italic',
            },
            '& .markdown-body strong, & .markdown-body b': {
              fontWeight: 600,
              color: isDark ? '#E5E7EB' : '#222',
            },
            '& .markdown-body em, & .markdown-body i': {
              color: isDark ? '#B0B3B8' : '#666',
            },
            '& .markdown-body table': {
              fontSize: '11.5px',
              width: '100%',
              borderCollapse: 'collapse',
              th: {
                bgcolor: isDark ? 'rgba(60,60,60,0.4)' : 'rgba(0,0,0,0.03)',
                px: 0.6, py: 0.35,
                textAlign: 'left', fontWeight: 500,
                borderBottom: `1px solid ${isDark ? 'rgba(70,70,70,0.3)' : 'rgba(0,0,0,0.07)'}`,
              },
              td: {
                px: 0.6, py: 0.35,
                borderBottom: `1px solid ${isDark ? 'rgba(50,50,50,0.25)' : 'rgba(0,0,0,0.04)'}`,
              },
            },
          }}
        >
          <MarkdownRenderer content={thinking} />
        </Box>
      </Collapse>
    </Box>
  );
}
