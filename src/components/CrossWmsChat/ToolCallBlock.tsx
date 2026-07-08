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
import GeneratedFileCard, { GeneratedFileInfo } from './GeneratedFileCard';

// ===================== 工具名称映射 =====================

const TOOL_LABELS: Record<string, string> = {
  'system:info': '系统信息',
  'file:listDir': '列出目录',
  'file:readFile': '读取文件',
  'file:writeFile': '写入文件',
  'file_generateFile': '生成文件',
  'file_listGeneratedFiles': '列出生成文件',
  'file_readGeneratedFile': '读取生成文件',
  'file_deleteGeneratedFile': '删除生成文件',
  'shell:exec': '执行命令',
  'db:query': '数据库查询',
  'wms:inventory': '库存查询',
  'web_search': '网页搜索',
  'web_search_legacy': '网页搜索',
  'web_fetch': '网页抓取',
  'web_api_call': 'API 调用',
  'browser_navigate': '浏览器导航',
  'browser_click': '浏览器点击',
  'browser_type': '浏览器输入',
  'browser_screenshot': '浏览器截图',
  'browser_evaluate': '浏览器执行脚本',
  '__summary__': '已折叠调用',
};

const TOOL_ICONS: Record<string, string> = {
  'system:info': '💻',
  'file:listDir': '📁',
  'file:readFile': '📄',
  'file:writeFile': '✏️',
  'file_generateFile': '📄',
  'file_listGeneratedFiles': '📂',
  'file_readGeneratedFile': '📄',
  'file_deleteGeneratedFile': '🗑️',
  'shell:exec': '⌨️',
  'db:query': '🗄️',
  'wms:inventory': '📦',
  'web_search': '🔍',
  'web_search_legacy': '🔍',
  'web_fetch': '🌐',
  'web_api_call': '🔌',
  'browser_navigate': '🧭',
  'browser_click': '👆',
  'browser_type': '⌨️',
  'browser_screenshot': '📸',
  'browser_evaluate': '⚙️',
  '__summary__': '📋',
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || '🔧';
}

// ===================== 工具摘要提取 =====================

function extractToolSummary(name: string, args: Record<string, unknown> | null): string {
  if (!args) return '';
  
  switch (name) {
    case 'web_search':
    case 'web_search_legacy':
      const query = args.q || args.query || args.keyword;
      return query ? `搜索: ${String(query)}` : '';
    case 'web_fetch':
      const url = args.url || args.link;
      return url ? `抓取: ${String(url).slice(0, 60)}${String(url).length > 60 ? '...' : ''}` : '';
    case 'web_api_call':
      const apiUrl = args.url || args.endpoint;
      const method = args.method || 'GET';
      return apiUrl ? `${method}: ${String(apiUrl).slice(0, 60)}${String(apiUrl).length > 60 ? '...' : ''}` : '';
    case 'db:query':
      const sql = args.sql || args.query;
      if (sql) {
        const sqlStr = String(sql).replace(/\s+/g, ' ').trim();
        return sqlStr.length > 80 ? sqlStr.slice(0, 80) + '...' : sqlStr;
      }
      return '';
    case 'file:readFile':
    case 'file:writeFile':
      const filePath = args.path || args.file || args.filePath;
      return filePath ? String(filePath) : '';
    case 'shell:exec':
      const cmd = args.command || args.cmd;
      if (cmd) {
        const cmdStr = String(cmd).replace(/\s+/g, ' ').trim();
        return cmdStr.length > 80 ? cmdStr.slice(0, 80) + '...' : cmdStr;
      }
      return '';
    default:
      return '';
  }
}

function extractResultPreview(result: string, toolName: string): string {
  if (!result || !result.trim()) return '';
  
  const trimmed = result.trim();
  
  if (isJsonString(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if ((toolName === 'web_search' || toolName === 'web_search_legacy') && Array.isArray(parsed.results)) {
        const count = parsed.results.length;
        const firstTitle = parsed.results[0]?.title || '';
        return `找到 ${count} 条结果${firstTitle ? `: ${firstTitle}` : ''}`;
      }
      if (parsed.title) return String(parsed.title);
      if (parsed.summary) return String(parsed.summary);
      if (parsed.message) return String(parsed.message);
      if (parsed.items && Array.isArray(parsed.items)) return `共 ${parsed.items.length} 条记录`;
      if (parsed.data && Array.isArray(parsed.data)) return `共 ${parsed.data.length} 条记录`;
    } catch {
      // fall through
    }
  }
  
  const preview = trimmed.replace(/\s+/g, ' ').slice(0, 120);
  return preview.length < trimmed.length ? preview + '...' : preview;
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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
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
          bgcolor: isDark ? '#9CA3AF' : '#6B7280',
          transform: `scale(${scale})`,
          opacity: opacity,
          transition: 'transform 0.75s ease-in-out, opacity 0.75s ease-in-out',
          boxShadow: opacity > 0.6 ? `0 0 6px rgba(156,163,175,${opacity - 0.3})` : 'none',
        }}
      />
      <Typography sx={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: 500 }}>
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
      <Typography sx={{ fontSize: 11, color: gs.textMuted, mr: 0.5, fontWeight: 600 }}>
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
                    ? (isDark ? '#9CA3AF' : '#6B7280')
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
                  ? (isDark ? '#9CA3AF' : '#6B7280')
                  : isCurrent
                    ? (isDark ? '#9CA3AF' : '#6B7280')
                    : 'transparent',
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

  // 解析生成的文件信息（file_generateFile 工具）
  const generatedFile = useMemo<GeneratedFileInfo | null>(() => {
    if (toolCall.name !== 'file_generateFile' || !toolCall.result) return null;
    try {
      const parsed = JSON.parse(toolCall.result);
      if (parsed.success && parsed.fileName) {
        return {
          fileName: parsed.fileName,
          fileSize: parsed.fileSize || 0,
          description: parsed.description,
          downloadUrl: parsed.downloadUrl,
          previewUrl: parsed.previewUrl,
          sessionId: parsed.sessionId,
        };
      }
    } catch {
      // 解析失败，返回 null
    }
    return null;
  }, [toolCall.name, toolCall.result]);

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
        borderRadius: '10px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
        },
        '& + &': { mt: 0.75 },
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
        <Box
          sx={{
            fontSize: 16,
            lineHeight: '20px',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {getToolIcon(toolCall.name)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: isFailed ? '#EF4444' : gs.textPrimary,
                lineHeight: 1.3,
              }}
            >
              {getToolLabel(toolCall.name)}
            </Typography>
          </Box>
          {!expanded && (
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
              {isRunning
                ? '执行中...'
                : isFailed
                ? '执行失败'
                : extractToolSummary(toolCall.name, parsedArgs) || extractResultPreview(formattedResult, toolCall.name)}
            </Typography>
          )}
        </Box>

        {/* 状态指示 */}
        {isRunning && <PulseIndicator />}
        {isCompleted && (
          <CheckCircleIcon sx={{ fontSize: 16, color: '#22C55E', flexShrink: 0 }} />
        )}
        {isFailed && (
          <ErrorCircleIcon sx={{ fontSize: 16, color: '#EF4444', flexShrink: 0 }} />
        )}

        <IconButton size="small" sx={{ p: 0.25, color: gs.textMuted, flexShrink: 0 }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* 展开详情 */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, pb: 1.25, pt: 0.25 }}>
          {/* 生成文件卡片（file_generateFile 专用） */}
          {generatedFile && (
            <Box sx={{ mb: 1.25 }}>
              <GeneratedFileCard file={generatedFile} isDark={isDark} />
            </Box>
          )}

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
                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                </IconButton>
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
  // 防御性检查：toolCalls 可能不是数组（如后端返回 JSON string 未被解析）
  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
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
