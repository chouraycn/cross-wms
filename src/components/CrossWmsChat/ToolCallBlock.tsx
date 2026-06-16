import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, IconButton, Collapse, useTheme } from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorCircleIcon from '@mui/icons-material/ErrorOutline';
import type { ToolCallInfo } from '../../types/chat';
import { getGrayScale } from '../../constants/theme';

// ===================== 工具名称映射 =====================

const TOOL_LABELS: Record<string, string> = {
  'system:info': '系统信息',
  'file:listDir': '列出目录',
  'file:readFile': '读取文件',
  'file:writeFile': '写入文件',
  'shell:exec': '执行命令',
  'db:query': '数据库查询',
  'wms:inventory': '库存查询',
};

const TOOL_ICONS: Record<string, string> = {
  'system:info': '💻',
  'file:listDir': '📁',
  'file:readFile': '📄',
  'file:writeFile': '✏️',
  'shell:exec': '⌨️',
  'db:query': '🗄️',
  'wms:inventory': '📦',
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || '🔧';
}

// ===================== JSON 语法高亮 =====================

/**
 * 对 JSON 字符串进行语法高亮渲染
 * 用不同颜色区分 key / string / number / boolean / null
 */
function highlightJson(jsonStr: string): React.ReactNode {
  // JSON 语法高亮的正则
  const jsonRegex = /("(?:\\.|[^"\\])*")\s*:/g; // key: "xxx":
  const valueRegex = /:\s*("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  // 简单方案：逐行渲染，对每行进行 token 级别的着色
  const lines = jsonStr.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens: React.ReactNode[] = [];
    // 用一个统一的正则匹配 JSON token
    const tokenRegex = /("(?:\\.|[^"\\])*")\s*:|:\s*("(?:\\.|[^"\\])*")|:\s*(true|false|null)|:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|("[\s\S]*?")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\]])/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      // 添加匹配之前的普通文本（缩进、逗号等）
      if (match.index > lastIndex) {
        tokens.push(
          <span key={`text-${lineIdx}-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>
        );
      }

      const fullMatch = match[0];

      if (match[1] && fullMatch.endsWith(':')) {
        // JSON key
        tokens.push(
          <span key={`key-${lineIdx}-${match.index}`} style={{ color: '#A78BFA' }}>
            {match[1]}
          </span>
        );
        tokens.push(
          <span key={`colon-${lineIdx}-${match.index}`} style={{ color: '#9CA3AF' }}>:</span>
        );
      } else if (match[2]) {
        // String value
        tokens.push(
          <span key={`str-${lineIdx}-${match.index}`} style={{ color: '#34D399' }}>
            {match[2]}
          </span>
        );
      } else if (match[3]) {
        // Boolean / null value
        tokens.push(
          <span key={`bool-${lineIdx}-${match.index}`} style={{ color: '#F59E0B' }}>
            {match[3]}
          </span>
        );
      } else if (match[4]) {
        // Number value
        tokens.push(
          <span key={`num-${lineIdx}-${match.index}`} style={{ color: '#60A5FA' }}>
            {match[4]}
          </span>
        );
      } else if (match[5]) {
        // String (standalone, e.g. in array)
        tokens.push(
          <span key={`str2-${lineIdx}-${match.index}`} style={{ color: '#34D399' }}>
            {match[5]}
          </span>
        );
      } else if (match[6]) {
        // Boolean / null (standalone)
        tokens.push(
          <span key={`bool2-${lineIdx}-${match.index}`} style={{ color: '#F59E0B' }}>
            {match[6]}
          </span>
        );
      } else if (match[7]) {
        // Number (standalone)
        tokens.push(
          <span key={`num2-${lineIdx}-${match.index}`} style={{ color: '#60A5FA' }}>
            {match[7]}
          </span>
        );
      } else if (match[8]) {
        // Brackets / braces
        tokens.push(
          <span key={`bracket-${lineIdx}-${match.index}`} style={{ color: '#9CA3AF' }}>
            {match[8]}
          </span>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    // 剩余文本
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

/** 判断字符串是否为有效 JSON */
function isJsonString(str: string): boolean {
  if (!str || str.trim().length === 0) return false;
  const trimmed = str.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

/** 判断工具调用是否失败 */
function isToolCallFailed(toolCall: ToolCallInfo): boolean {
  if (!toolCall.result) return false;
  const lower = toolCall.result.toLowerCase();
  return lower.startsWith('error:') || lower.startsWith('错误:') ||
         lower.includes('error') && lower.includes('failed');
}

// ===================== 脉冲指示器组件 =====================

/** v1.9.5-fix: 用 JS 定时器模拟脉冲动画，避免 WKWebView 不兼容 CSS @keyframes */
const PulseIndicator: React.FC = () => {
  const [scale, setScale] = useState(0.8);
  const [opacity, setOpacity] = useState(0.3);

  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame = (frame + 1) % 60; // 60 frames ≈ 1.4s at 750ms interval
      const progress = frame / 30; // 0→1→0 over 60 frames
      const s = 0.8 + 0.4 * Math.abs(1 - progress * 2);
      const o = 0.3 + 0.7 * Math.abs(1 - progress * 2);
      setScale(s);
      setOpacity(o);
    }, 750);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: '#6366F1',
          transform: `scale(${scale})`,
          opacity: opacity,
          transition: 'transform 0.75s ease-in-out, opacity 0.75s ease-in-out',
          boxShadow: opacity > 0.6 ? `0 0 6px rgba(99, 102, 241, ${opacity - 0.3})` : 'none',
        }}
      />
      <Typography sx={{ fontSize: 11, color: '#6366F1', fontWeight: 500 }}>
        执行中
      </Typography>
    </Box>
  );
};

// ===================== 步骤进度指示器 =====================

interface StepIndicatorProps {
  total: number;
  currentIndex: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ total, currentIndex }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  if (total <= 1) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mb: 1,
        px: 0.25,
      }}
    >
      <Typography sx={{ fontSize: 11, color: gs.textMuted, mr: 0.5, fontWeight: 500 }}>
        步骤 {currentIndex + 1}/{total}
      </Typography>
      {Array.from({ length: total }, (_, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isPending = i > currentIndex;

        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <Box
                sx={{
                  width: 12,
                  height: 2,
                  borderRadius: 1,
                  bgcolor: isCompleted
                    ? '#6366F1'
                    : isDark
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(0,0,0,0.1)',
                  transition: 'background-color 0.3s ease',
                }}
              />
            )}
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: isPending
                  ? `2px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`
                  : 'none',
                bgcolor: isCompleted
                  ? '#6366F1'
                  : isCurrent
                    ? '#6366F1'
                    : 'transparent',
                // v1.9.5-fix: 移除 CSS animation，改用 JS 定时器（见下方 useEffect）
                transition: 'all 0.3s ease',
              }}
              {...(isCurrent ? { 'data-pulse': 'true' } : {})}
            />
          </React.Fragment>
        );
      })}
    </Box>
  );
};

// ===================== 单个工具调用卡片 =====================

interface ToolCallItemProps {
  toolCall: ToolCallInfo;
  index: number;
  total: number;
  defaultExpanded: boolean;
}

const ToolCallItem = React.memo<ToolCallItemProps>(function ToolCallItem({ toolCall, index, total, defaultExpanded }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isRunning = !toolCall.result;
  const isFailed = !isRunning && isToolCallFailed(toolCall);
  const isCompleted = !isRunning && !isFailed;

  // 尝试格式化参数
  let formattedArgs = toolCall.arguments;
  let parsedArgs: Record<string, unknown> | null = null;
  try {
    parsedArgs = JSON.parse(toolCall.arguments);
    formattedArgs = JSON.stringify(parsedArgs, null, 2);
  } catch {
    // 保持原始字符串
  }

  // 格式化结果
  const formattedResult = useMemo(() => {
    if (!toolCall.result) return '';
    if (isJsonString(toolCall.result)) {
      try {
        const parsed = JSON.parse(toolCall.result);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return toolCall.result;
      }
    }
    return toolCall.result;
  }, [toolCall.result]);

  const isResultJson = toolCall.result ? isJsonString(toolCall.result) : false;

  // 截断结果显示
  const maxResultLen = 500;
  const displayResult = formattedResult.length > maxResultLen
    ? formattedResult.slice(0, maxResultLen) + '\n... (结果已截断)'
    : formattedResult;

  const handleCopy = () => {
    // WKWebView file:// 协议下 Clipboard API 可能不可用，需容错降级
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(toolCall.result).catch(() => {});
    } else {
      try {
        const el = document.createElement('textarea');
        el.value = toolCall.result;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        // 静默失败
      }
    }
  };

  return (
    <Box
      sx={{
        bgcolor: 'transparent',
        border: 'none',
        borderLeft: `2px solid ${isDark ? '#555555' : '#e0e0e0'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        '& + &': { mt: 0.5 },
      }}
    >
      {/* 标题行 */}
      <Box
        onClick={() => setExpanded((prev) => !prev)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.625,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#f5f5f5',
          },
          transition: 'background-color 0.15s ease',
        }}
      >
        <BuildIcon sx={{ fontSize: 14, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: gs.textSecondary, flex: 1 }}>
          {getToolLabel(toolCall.name)}
        </Typography>

        {/* 状态指示 */}
        {isRunning && <PulseIndicator />}
        {isCompleted && (
          <CheckCircleIcon sx={{ fontSize: 16, color: '#22C55E' }} />
        )}
        {isFailed && (
          <ErrorCircleIcon sx={{ fontSize: 16, color: '#EF4444' }} />
        )}

        <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* 展开详情 */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, pb: 1, pt: 0 }}>
          {/* 参数 */}
          {parsedArgs && Object.keys(parsedArgs).length > 0 && (
            <Box sx={{ mb: 0.75 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                参数
              </Typography>
              <Box
                sx={{
                  bgcolor: isDark ? '#1A1A1A' : '#F9FAFB',
                  borderRadius: '6px',
                  px: 1,
                  py: 0.75,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: gs.textSecondary,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 120,
                  overflowY: 'auto',
                }}
              >
                {formattedArgs}
              </Box>
            </Box>
          )}

          {/* 结果 */}
          {toolCall.result && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1 }}>
                  结果
                </Typography>
                <IconButton size="small" onClick={handleCopy} sx={{ p: 0.25, color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}>
                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>
              <Box
                sx={{
                  bgcolor: isDark ? '#1A1A1A' : '#F9FAFB',
                  borderRadius: '6px',
                  px: 1,
                  py: 0.75,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: gs.textSecondary,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {isResultJson ? highlightJson(displayResult) : displayResult}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
});

// ===================== 工具调用列表 =====================

interface ToolCallBlockProps {
  toolCalls: ToolCallInfo[];
}

const ToolCallBlock = React.memo<ToolCallBlockProps>(function ToolCallBlock({ toolCalls }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  // 找到当前正在执行的工具索引（第一个没有 result 的）
  const runningIndex = toolCalls.findIndex((tc) => !tc.result);
  // 如果全部完成，则当前步骤指向最后一个
  const currentStepIndex = runningIndex >= 0 ? runningIndex : toolCalls.length - 1;

  return (
    <Box sx={{ mb: 1.5 }}>
      {/* 步骤进度指示器 */}
      <StepIndicator total={toolCalls.length} currentIndex={currentStepIndex} />

      {toolCalls.map((tc, i) => (
        <ToolCallItem
          key={`${tc.name}-${i}`}
          toolCall={tc}
          index={i}
          total={toolCalls.length}
          defaultExpanded={false}
        />
      ))}
    </Box>
  );
});

export default ToolCallBlock;
