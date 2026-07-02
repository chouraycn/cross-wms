/**
 * CDFChat 工具调用卡片（增强版）
 *
 * 功能增强：
 * - 执行进度条（pending → running → complete/failed）
 * - 工具输出结果分页/折叠展示
 * - 错误详情展开面板
 * - 子工具调用链展示
 * - 重试/取消操作按钮
 * - 执行时间统计显示
 *
 * - Skill 卡片：绿色边框 + 绿色背景
 * - MCP 卡片：橙色边框 + 橙色背景
 * - 使用 MUI 组件，支持深色/浅色主题
 */
import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  LinearProgress,
  Button,
  Chip,
  Divider,
  useTheme,
  Tooltip,
  Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import CancelIcon from '@mui/icons-material/Cancel';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import type { ToolBlock } from '../../types/message-envelope.js';
import { getGrayScale, getSemanticColors } from '../../constants/theme.js';

// ===================== Props 类型扩展 =====================

interface Props {
  block: ToolBlock;
  /** 子工具调用链（可选） */
  subTools?: ToolBlock[];
  /** 重试回调（可选） */
  onRetry?: (blockId: string) => void;
  /** 取消回调（可选） */
  onCancel?: (blockId: string) => void;
}

// ===================== 工具函数 =====================

/** 格式化 JSON */
function formatJson(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/** 判断是否为 JSON 字符串 */
function isJsonLike(str: string): boolean {
  const t = str.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/** 格式化执行时间 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/** 计算执行进度百分比 */
function calculateProgress(status: ToolBlock['status'], elapsedMs?: number): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'running':
      // 执行中时显示动态进度（基于预估时间，默认30秒）
      const estimatedMs = 30000;
      const progress = elapsedMs ? Math.min((elapsedMs / estimatedMs) * 100, 95) : 25;
      return progress;
    case 'done':
      return 100;
    case 'error':
      return 100;
    default:
      return 0;
  }
}

/** JSON 语法高亮渲染 */
function highlightJson(jsonStr: string, isDark: boolean): React.ReactNode {
  const lines = jsonStr.split('\n');
  const keyColor = isDark ? '#A78BFA' : '#7C3AED';
  const strColor = isDark ? '#34D399' : '#059669';
  const numColor = isDark ? '#60A5FA' : '#2563EB';
  const boolColor = isDark ? '#F59E0B' : '#D97706';
  const bracketColor = isDark ? '#9CA3AF' : '#6B7280';

  return lines.map((line, lineIdx) => {
    const tokens: React.ReactNode[] = [];
    const tokenRegex = /("(?:\\.|[^"\\])*")\s*:|:\s*("(?:\\.|[^"\\])*")|:\s*(true|false|null)|:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|("[\s\S]*?")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\]])/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(
          <span key={`text-${lineIdx}-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>
        );
      }

      const fullMatch = match[0];

      if (match[1] && fullMatch.endsWith(':')) {
        tokens.push(
          <span key={`key-${lineIdx}-${match.index}`} style={{ color: keyColor }}>
            {match[1]}
          </span>
        );
        tokens.push(
          <span key={`colon-${lineIdx}-${match.index}`} style={{ color: bracketColor }}>:</span>
        );
      } else if (match[2]) {
        tokens.push(
          <span key={`str-${lineIdx}-${match.index}`} style={{ color: strColor }}>
            {match[2]}
          </span>
        );
      } else if (match[3]) {
        tokens.push(
          <span key={`bool-${lineIdx}-${match.index}`} style={{ color: boolColor }}>
            {match[3]}
          </span>
        );
      } else if (match[4]) {
        tokens.push(
          <span key={`num-${lineIdx}-${match.index}`} style={{ color: numColor }}>
            {match[4]}
          </span>
        );
      } else if (match[5]) {
        tokens.push(
          <span key={`str2-${lineIdx}-${match.index}`} style={{ color: strColor }}>
            {match[5]}
          </span>
        );
      } else if (match[6]) {
        tokens.push(
          <span key={`bool2-${lineIdx}-${match.index}`} style={{ color: boolColor }}>
            {match[6]}
          </span>
        );
      } else if (match[7]) {
        tokens.push(
          <span key={`num2-${lineIdx}-${match.index}`} style={{ color: numColor }}>
            {match[7]}
          </span>
        );
      } else if (match[8]) {
        tokens.push(
          <span key={`bracket-${lineIdx}-${match.index}`} style={{ color: bracketColor }}>
            {match[8]}
          </span>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < line.length) {
      tokens.push(
        <span key={`rest-${lineIdx}-${lastIndex}`}>{line.slice(lastIndex)}</span>
      );
    }

    return (
      <React.Fragment key={`line-${lineIdx}`}>
        {tokens}
        {lineIdx < lines.length - 1 ? '\n' : ''}
      </React.Fragment>
    );
  });
}

// ===================== 结果分页组件 =====================

interface ResultPaginatorProps {
  content: string;
  pageSize: number;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
}

const ResultPaginator: React.FC<ResultPaginatorProps> = memo(function ResultPaginator({
  content,
  pageSize,
  isDark,
  gs,
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = useMemo(() => content.split('\n'), [content]);
  const totalPages = useMemo(() => Math.ceil(lines.length / pageSize), [lines.length, pageSize]);

  // 如果内容较少，不需要分页
  if (lines.length <= pageSize * 2 && !isExpanded) {
    return (
      <Box
        sx={{
          bgcolor: isDark ? 'rgba(0,0,0,0.2)' : gs.bgHover,
          borderRadius: '8px',
          px: 1.25,
          py: 1,
          fontFamily: 'monospace',
          fontSize: 12,
          color: gs.textSecondary,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: isExpanded ? 'none' : 240,
          overflowY: isExpanded ? 'visible' : 'auto',
          border: `1px solid ${gs.border}`,
        }}
      >
        {isJsonLike(content) ? highlightJson(content, isDark) : content}
        {!isExpanded && lines.length > pageSize && (
          <Button
            size="small"
            startIcon={<UnfoldMoreIcon />}
            onClick={() => setIsExpanded(true)}
            sx={{
              mt: 1,
              fontSize: 11,
              color: gs.textMuted,
              textTransform: 'none',
            }}
          >
            展开全部 ({lines.length} 行)
          </Button>
        )}
        {isExpanded && (
          <Button
            size="small"
            startIcon={<UnfoldLessIcon />}
            onClick={() => setIsExpanded(false)}
            sx={{
              mt: 1,
              fontSize: 11,
              color: gs.textMuted,
              textTransform: 'none',
            }}
          >
            折叠
          </Button>
        )}
      </Box>
    );
  }

  const currentLines = lines.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const displayContent = currentLines.join('\n');

  return (
    <Box>
      <Box
        sx={{
          bgcolor: isDark ? 'rgba(0,0,0,0.2)' : gs.bgHover,
          borderRadius: '8px',
          px: 1.25,
          py: 1,
          fontFamily: 'monospace',
          fontSize: 12,
          color: gs.textSecondary,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 240,
          overflowY: 'auto',
          border: `1px solid ${gs.border}`,
        }}
      >
        {isJsonLike(displayContent) ? highlightJson(displayContent, isDark) : displayContent}
      </Box>
      {totalPages > 1 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            mt: 1,
          }}
        >
          <IconButton
            size="small"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            sx={{ color: gs.textMuted }}
          >
            <NavigateBeforeIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
            {currentPage + 1} / {totalPages}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            sx={{ color: gs.textMuted }}
          >
            <NavigateNextIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
});

// ===================== 错误详情面板 =====================

interface ErrorDetailPanelProps {
  error: string;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
  semanticColors: ReturnType<typeof getSemanticColors>;
}

const ErrorDetailPanel: React.FC<ErrorDetailPanelProps> = memo(function ErrorDetailPanel({
  error,
  isDark,
  gs,
  semanticColors,
}) {
  const [expanded, setExpanded] = useState(false);

  // 解析错误信息
  const parsedError = useMemo(() => {
    if (isJsonLike(error)) {
      try {
        const parsed = JSON.parse(error);
        return {
          message: parsed.error || parsed.message || error,
          stack: parsed.stack || parsed.trace || null,
          code: parsed.code || null,
          details: parsed.details || null,
        };
      } catch {
        return { message: error, stack: null, code: null, details: null };
      }
    }
    return { message: error, stack: null, code: null, details: null };
  }, [error]);

  return (
    <Box>
      <Box
        sx={{
          bgcolor: semanticColors.errorBg,
          borderRadius: '8px',
          px: 1.25,
          py: 1,
          fontFamily: 'monospace',
          fontSize: 12,
          color: semanticColors.errorText,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: expanded ? 'none' : 120,
          overflowY: expanded ? 'visible' : 'auto',
          border: `1px solid ${semanticColors.errorBorder}`,
        }}
      >
        <Typography sx={{ fontWeight: 600, mb: 0.5, fontSize: 12 }}>
          {parsedError.message}
        </Typography>
        {parsedError.code && (
          <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
            错误码: {parsedError.code}
          </Typography>
        )}
        {expanded && parsedError.stack && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted }}>
              调用栈:
            </Typography>
            <Box
              sx={{
                fontSize: 10,
                color: gs.textMuted,
                whiteSpace: 'pre-wrap',
                mt: 0.5,
                opacity: 0.8,
              }}
            >
              {parsedError.stack}
            </Box>
          </Box>
        )}
        {expanded && parsedError.details && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted }}>
              详细信息:
            </Typography>
            <Box sx={{ fontSize: 11, color: gs.textMuted, mt: 0.5 }}>
              {typeof parsedError.details === 'object'
                ? JSON.stringify(parsedError.details, null, 2)
                : parsedError.details}
            </Box>
          </Box>
        )}
      </Box>
      <Button
        size="small"
        onClick={() => setExpanded((v) => !v)}
        sx={{
          mt: 0.5,
          fontSize: 11,
          color: semanticColors.error,
          textTransform: 'none',
        }}
      >
        {expanded ? '隐藏详情' : '查看详情'}
      </Button>
    </Box>
  );
});

// ===================== 子工具调用链展示 =====================

interface SubToolChainProps {
  subTools: ToolBlock[];
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
}

const SubToolChain: React.FC<SubToolChainProps> = memo(function SubToolChain({
  subTools,
  isDark,
  gs,
}) {
  if (!subTools || subTools.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: gs.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          mb: 0.75,
        }}
      >
        子工具调用 ({subTools.length})
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {subTools.map((sub, idx) => (
          <Box
            key={sub.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              py: 0.5,
              px: 1,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '6px',
              border: `1px solid ${gs.border}`,
            }}
          >
            <Typography sx={{ fontSize: 11, color: gs.textMuted, minWidth: 20 }}>
              {idx + 1}.
            </Typography>
            <Chip
              label={sub.type === 'skill' ? 'Skill' : 'MCP'}
              size="small"
              sx={{
                fontSize: 9,
                height: 18,
                bgcolor: sub.type === 'skill'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(249, 115, 22, 0.15)',
                color: sub.type === 'skill' ? '#16a34a' : '#ea580c',
                fontWeight: 600,
              }}
            />
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: gs.textPrimary, flex: 1 }}>
              {sub.name}
            </Typography>
            {sub.status === 'done' && (
              <CheckCircleIcon sx={{ fontSize: 14, color: '#22C55E' }} />
            )}
            {sub.status === 'error' && (
              <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444' }} />
            )}
            {sub.status === 'running' && (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: gs.textMuted,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            )}
            {sub.completedAt && sub.startedAt && (
              <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
                {formatDuration(sub.completedAt - sub.startedAt)}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
});

// ===================== 主组件 =====================

const ToolCard: React.FC<Props> = memo(function ToolCard({
  block,
  subTools,
  onRetry,
  onCancel,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const semanticColors = getSemanticColors(isDark);

  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // 计算执行状态
  const isRunning = block.status === 'pending' || block.status === 'running';
  const isFailed = block.status === 'error';
  const isDone = block.status === 'done';
  const isSkill = block.type === 'skill';

  // 计算执行时间
  const duration = useMemo(() => {
    if (block.startedAt && block.completedAt) {
      return block.completedAt - block.startedAt;
    }
    return null;
  }, [block.startedAt, block.completedAt]);

  // 动态更新执行进度
  useEffect(() => {
    if (isRunning && block.startedAt) {
      const interval = setInterval(() => {
        setElapsedMs(Date.now() - block.startedAt!);
      }, 100);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isRunning, block.startedAt]);

  // 格式化结果
  const formattedResult = useMemo(() => {
    const rawResult = block.error || block.result || '';
    if (!rawResult) return '';
    if (isJsonLike(rawResult)) {
      try {
        return JSON.stringify(JSON.parse(rawResult), null, 2);
      } catch {
        return rawResult;
      }
    }
    return rawResult;
  }, [block.error, block.result]);

  // 复制处理
  const handleCopy = useCallback(() => {
    const text = block.error || block.result || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* silent */ }
    }
  }, [block.error, block.result]);

  // 重试处理
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry(block.id);
    }
  }, [onRetry, block.id]);

  // 取消处理
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel(block.id);
    }
  }, [onCancel, block.id]);

  // 进度百分比
  const progressPercent = calculateProgress(block.status, elapsedMs);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '10px',
        border: `1px solid ${isSkill ? '#22c55e' : '#f97316'}`,
        bgcolor: isSkill
          ? (isDark ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)')
          : (isDark ? 'rgba(249, 115, 22, 0.08)' : 'rgba(249, 115, 22, 0.06)'),
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: isSkill ? '#16a34a' : '#ea580c',
        },
      }}
    >
      {/* 标题行 */}
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.875,
          cursor: 'pointer',
          transition: 'background-color 0.15s ease',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          },
        }}
      >
        {/* 类型标签 */}
        <Chip
          label={isSkill ? 'Skill' : 'MCP'}
          size="small"
          sx={{
            fontSize: 10,
            height: 20,
            fontWeight: 600,
            bgcolor: isSkill
              ? 'rgba(34, 197, 94, 0.2)'
              : 'rgba(249, 115, 22, 0.2)',
            color: isSkill ? '#16a34a' : '#ea580c',
          }}
        />

        {/* 工具名 */}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: gs.textSecondary,
            flex: 1,
          }}
        >
          {block.name}
        </Typography>

        {/* 执行时间 */}
        {(duration || elapsedMs > 0) && (
          <Tooltip title="执行时间">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                color: gs.textMuted,
              }}
            >
              <ScheduleIcon sx={{ fontSize: 12 }} />
              <Typography sx={{ fontSize: 11, fontFamily: 'monospace' }}>
                {duration ? formatDuration(duration) : formatDuration(elapsedMs)}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* 状态指示 */}
        {isRunning && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: gs.textMuted,
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
                  '50%': { opacity: 1, transform: 'scale(1.2)' },
                },
              }}
            />
            <Typography sx={{ fontSize: 11, color: gs.textMuted }}>执行中</Typography>
          </Box>
        )}
        {isDone && (
          <CheckCircleIcon sx={{ fontSize: 16, color: '#22C55E' }} />
        )}
        {isFailed && (
          <ErrorOutlineIcon sx={{ fontSize: 16, color: '#EF4444' }} />
        )}

        {/* 展开/折叠箭头 */}
        <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* 执行进度条 */}
      {isRunning && (
        <Box sx={{ px: 1.25, pb: 0.5 }}>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 3,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                bgcolor: isSkill ? '#22c55e' : '#f97316',
                borderRadius: 2,
              },
            }}
          />
          <Typography sx={{ fontSize: 10, color: gs.textMuted, mt: 0.25, textAlign: 'right' }}>
            {Math.round(progressPercent)}%
          </Typography>
        </Box>
      )}

      {/* 展开详情 */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, pb: 1.25, pt: 0.25 }}>
          {/* 输入参数 */}
          {Object.keys(block.input).length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: gs.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  mb: 0.5,
                }}
              >
                Input
              </Typography>
              <Box
                sx={{
                  bgcolor: isDark ? 'rgba(0,0,0,0.2)' : gs.bgHover,
                  borderRadius: '8px',
                  px: 1.25,
                  py: 1,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: gs.textSecondary,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 160,
                  overflowY: 'auto',
                  border: `1px solid ${gs.border}`,
                }}
              >
                {highlightJson(formatJson(block.input), isDark)}
              </Box>
            </Box>
          )}

          {/* 结果 / 错误 */}
          {(block.result || block.error) && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: gs.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    flex: 1,
                  }}
                >
                  {isFailed ? 'Error' : 'Result'}
                </Typography>
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  sx={{ p: 0.25, color: gs.textMuted }}
                >
                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>

              {isFailed ? (
                <ErrorDetailPanel
                  error={formattedResult}
                  isDark={isDark}
                  gs={gs}
                  semanticColors={semanticColors}
                />
              ) : (
                <ResultPaginator
                  content={formattedResult}
                  pageSize={50}
                  isDark={isDark}
                  gs={gs}
                />
              )}
            </Box>
          )}

          {/* 子工具调用链 */}
          {subTools && subTools.length > 0 && (
            <SubToolChain subTools={subTools} isDark={isDark} gs={gs} />
          )}

          {/* 操作按钮 */}
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            {isFailed && onRetry && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRetry}
                sx={{
                  fontSize: 11,
                  textTransform: 'none',
                  color: semanticColors.error,
                  borderColor: semanticColors.errorBorder,
                  '&:hover': {
                    borderColor: semanticColors.error,
                    bgcolor: semanticColors.errorBg,
                  },
                }}
              >
                重试
              </Button>
            )}
            {isRunning && onCancel && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CancelIcon />}
                onClick={handleCancel}
                sx={{
                  fontSize: 11,
                  textTransform: 'none',
                  color: gs.textMuted,
                  borderColor: gs.border,
                  '&:hover': {
                    borderColor: gs.borderDarker,
                    bgcolor: gs.bgHover,
                  },
                }}
              >
                取消
              </Button>
            )}
          </Box>

          {/* 加载动画（等待结果） */}
          {isRunning && !block.result && !block.error && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, color: gs.textMuted }}>
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${gs.textMuted}`,
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  '@keyframes spin': {
                    to: { transform: 'rotate(360deg)' },
                  },
                }}
              />
              <Typography sx={{ fontSize: 12 }}>等待结果...</Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
});

export default ToolCard;