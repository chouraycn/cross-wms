/**
 * 单个工具调用的卡片组件（T04）
 *
 * 显示工具名称、参数、耗时、状态。
 * 支持展开查看详细结果。
 * 状态图标：running ✓ ✗
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Chip,
  Tooltip,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReplayIcon from '@mui/icons-material/Replay';
import type { ToolCallState } from '../../types/react-events';
import { getGrayScale } from '../../constants/theme';

// ===================== 工具名称映射 =====================

const TOOL_LABELS: Record<string, string> = {
  'system:info': '系统信息',
  'file:listDir': '列出目录',
  'file:readFile': '读取文件',
  'file:writeFile': '写入文件',
  'file_generateFile': '生成文件',
  'shell:exec': '执行命令',
  'db:query': '数据库查询',
  'wms:inventory': '库存查询',
  'web_search': '网页搜索',
  'web_search_legacy': '网页搜索',
  'web_fetch': '网页抓取',
  'browser_navigate': '浏览器导航',
  'browser_click': '浏览器点击',
  'browser_type': '浏览器输入',
  'browser_screenshot': '浏览器截图',
  'code_search': '代码搜索',
  'grep_search': 'Grep 搜索',
  'read_file': '读取文件',
  'write_file': '写入文件',
  'run_command': '执行命令',
};

/** 工具图标映射 */
const TOOL_ICONS: Record<string, string> = {
  'system:info': '💻',
  'file:listDir': '📁',
  'file:readFile': '📄',
  'file:writeFile': '✏️',
  'file_generateFile': '📄',
  'shell:exec': '⌨️',
  'db:query': '🗄️',
  'wms:inventory': '📦',
  'web_search': '🔍',
  'web_search_legacy': '🔍',
  'web_fetch': '🌐',
  'browser_navigate': '🧭',
  'browser_click': '👆',
  'browser_type': '⌨️',
  'browser_screenshot': '📸',
  'code_search': '🔎',
  'grep_search': '🔎',
  'read_file': '📄',
  'write_file': '✏️',
  'run_command': '⌨️',
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || '🔧';
}

/** 判断字符串是否为有效 JSON */
function isJsonString(str: string): boolean {
  if (!str || str.trim().length === 0) return false;
  const trimmed = str.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

// ===================== 属性接口 =====================

export interface ToolCallCardProps {
  /** 工具调用状态 */
  toolCall: ToolCallState;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
  /** 重试回调（可选） */
  onRetry?: (toolCallId: string) => void;
}

// ===================== 脉冲动画指示器 =====================

/** 运行中脉冲指示 */
const RunningPulse: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: isDark ? '#60A5FA' : '#3B82F6',
          animation: 'pulse 1.4s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 0.4, transform: 'scale(0.8)' },
            '50%': { opacity: 1, transform: 'scale(1.2)' },
          },
        }}
      />
      <Typography sx={{ fontSize: 11, color: isDark ? '#60A5FA' : '#3B82F6', fontWeight: 500 }}>
        运行中
      </Typography>
    </Box>
  );
};

// ===================== 组件实现 =====================

export const ToolCallCard: React.FC<ToolCallCardProps> = React.memo(({
  toolCall,
  defaultExpanded = false,
  onRetry,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isRunning = toolCall.status === 'running';
  const isFailed = toolCall.status === 'failed';
  const isCompleted = toolCall.status === 'completed';

  // 格式化参数
  const { formattedArgs, parsedArgs } = useMemo(() => {
    try {
      const parsed = JSON.parse(toolCall.arguments);
      return { formattedArgs: JSON.stringify(parsed, null, 2), parsedArgs: parsed };
    } catch {
      return { formattedArgs: toolCall.arguments, parsedArgs: null };
    }
  }, [toolCall.arguments]);

  // 格式化结果
  const formattedResult = useMemo(() => {
    if (!toolCall.result) return '';
    if (isJsonString(toolCall.result)) {
      try {
        return JSON.stringify(JSON.parse(toolCall.result), null, 2);
      } catch {
        return toolCall.result;
      }
    }
    return toolCall.result;
  }, [toolCall.result]);

  // 截断显示
  const maxResultLen = 2000;
  const displayResult = formattedResult.length > maxResultLen
    ? formattedResult.slice(0, maxResultLen) + '\n... (结果已截断)'
    : formattedResult;

  // 耗时显示
  const durationText = useMemo(() => {
    if (!toolCall.durationMs) return null;
    if (toolCall.durationMs < 1000) return `${toolCall.durationMs}ms`;
    return `${(toolCall.durationMs / 1000).toFixed(1)}s`;
  }, [toolCall.durationMs]);

  // 复制结果
  const handleCopy = () => {
    if (!toolCall.result) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(toolCall.result).catch(() => {});
    }
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
        },
      }}
    >
      {/* 标题行 */}
      <Box
        onClick={() => setExpanded((prev) => !prev)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.875,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          },
          transition: 'background-color 0.15s ease',
        }}
      >
        {/* 工具图标 */}
        <Box sx={{ fontSize: 16, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {getToolIcon(toolCall.name)}
        </Box>

        {/* 工具名称 + 摘要 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: isFailed ? '#EF4444' : gs.textPrimary, lineHeight: 1.3 }}>
              {getToolLabel(toolCall.name)}
            </Typography>
            {/* 耗时标签 */}
            {durationText && (
              <Chip
                label={durationText}
                size="small"
                sx={{
                  fontSize: 10,
                  height: 18,
                  bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  color: gs.textMuted,
                }}
              />
            )}
            {/* 重试次数标签 */}
            {toolCall.retryCount != null && toolCall.retryCount > 0 && (
              <Chip
                label={`重试${toolCall.retryCount}次`}
                size="small"
                sx={{
                  fontSize: 10,
                  height: 18,
                  bgcolor: '#FEF3C7',
                  color: '#92400E',
                }}
              />
            )}
          </Box>
          {/* 折叠时的摘要 */}
          {!expanded && !isRunning && toolCall.result && (
            <Typography
              sx={{
                fontSize: 12,
                color: gs.textMuted,
                lineHeight: 1.3,
                mt: 0.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {toolCall.result.slice(0, 80)}
            </Typography>
          )}
        </Box>

        {/* 状态指示 */}
        {isRunning && <RunningPulse />}
        {isCompleted && <CheckCircleIcon sx={{ fontSize: 16, color: '#22C55E', flexShrink: 0 }} />}
        {isFailed && <ErrorOutlineIcon sx={{ fontSize: 16, color: '#EF4444', flexShrink: 0 }} />}

        {/* 展开/折叠按钮 */}
        <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted, flexShrink: 0 }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* 展开详情 */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, pb: 1.25, pt: 0.25 }}>
          {/* 参数 */}
          {parsedArgs && Object.keys(parsedArgs).length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                参数
              </Typography>
              <Box
                sx={{
                  bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#F9FAFB',
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
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                {formattedArgs}
              </Box>
            </Box>
          )}

          {/* 结果 */}
          {toolCall.result && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1 }}>
                  {isFailed ? '错误' : '结果'}
                </Typography>
                <IconButton size="small" onClick={handleCopy} sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}>
                  <Tooltip title="复制结果">
                    <ContentCopyIcon sx={{ fontSize: 12 }} />
                  </Tooltip>
                </IconButton>
                {isFailed && onRetry && (
                  <IconButton size="small" onClick={() => onRetry(toolCall.id)} sx={{ p: 0.25, color: '#F59E0B', '&:hover': { color: '#D97706' } }}>
                    <Tooltip title="重试">
                      <ReplayIcon sx={{ fontSize: 12 }} />
                    </Tooltip>
                  </IconButton>
                )}
              </Box>
              <Box
                sx={{
                  bgcolor: isFailed
                    ? (isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.04)')
                    : (isDark ? 'rgba(0,0,0,0.2)' : '#F9FAFB'),
                  borderRadius: '8px',
                  px: 1.25,
                  py: 1,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: isFailed ? '#EF4444' : gs.textSecondary,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 240,
                  overflowY: 'auto',
                  border: `1px solid ${isFailed
                    ? (isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.2)')
                    : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}`,
                }}
              >
                {displayResult}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
});

ToolCallCard.displayName = 'ToolCallCard';

export default ToolCallCard;
