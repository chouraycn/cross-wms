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
 * - 进度条颜色随风险等级变化
 * - 输出搜索、导出、智能摘要
 * - 表格/图片/链接格式化
 * - 错误分类与修复建议
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
  TextField,
  Switch,
  FormControlLabel,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SummarizeIcon from '@mui/icons-material/Summarize';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ImageIcon from '@mui/icons-material/Image';
import LinkIcon from '@mui/icons-material/Link';
import TableChartIcon from '@mui/icons-material/TableChart';
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
  /** 跳过等待回调（可选） */
  onSkip?: (blockId: string) => void;
  /** 尝试修复回调（可选） */
  onFix?: (blockId: string, error: string) => void;
  /** 跳转到子工具回调（可选） */
  onJumpToSubTool?: (subToolId: string) => void;
  /** 智能摘要回调（可选） */
  onSummarize?: (content: string) => void;
  /** 风险等级（可选） */
  riskLevel?: 'safe' | 'low' | 'medium' | 'high';
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

/** 获取工具预估执行时间（毫秒） */
function getEstimatedTime(toolName: string): number {
  const estimates: Record<string, number> = {
    'search': 15000,
    'read': 5000,
    'write': 3000,
    'edit': 2000,
    'bash': 30000,
    'grep': 10000,
    'glob': 5000,
    'webSearch': 20000,
    'webFetch': 15000,
    'runCommand': 60000,
  };
  for (const [key, value] of Object.entries(estimates)) {
    if (toolName.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return 30000; // 默认30秒
}

/** 根据工具名获取风险等级 */
function getRiskLevelFromToolName(toolName: string): 'safe' | 'low' | 'medium' | 'high' {
  const highRiskKeywords = ['delete', 'remove', 'drop', 'truncate', 'exec', 'eval', 'bash', 'shell', 'sudo', 'chmod', 'chown'];
  const mediumRiskKeywords = ['write', 'edit', 'update', 'modify', 'create', 'insert', 'push', 'force'];
  const lowRiskKeywords = ['read', 'search', 'grep', 'glob', 'list', 'fetch', 'get', 'query'];

  const nameLower = toolName.toLowerCase();

  for (const keyword of highRiskKeywords) {
    if (nameLower.includes(keyword)) return 'high';
  }
  for (const keyword of mediumRiskKeywords) {
    if (nameLower.includes(keyword)) return 'medium';
  }
  for (const keyword of lowRiskKeywords) {
    if (nameLower.includes(keyword)) return 'low';
  }
  return 'safe';
}

/** 获取风险等级颜色 */
function getRiskColor(level: 'safe' | 'low' | 'medium' | 'high'): string {
  const colors = {
    safe: '#22C55E',
    low: '#3B82F6',
    medium: '#F59E0B',
    high: '#EF4444',
  };
  return colors[level];
}

/** 计算执行进度百分比 */
function calculateProgress(
  status: ToolBlock['status'],
  elapsedMs?: number,
  estimatedMs?: number
): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'running':
      const estimate = estimatedMs || 30000;
      const progress = elapsedMs ? Math.min((elapsedMs / estimate) * 100, 95) : 25;
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

/** 提取文本中的链接 */
function extractLinks(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : [];
}

/** 检测是否为图片URL */
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
}

/** 尝试解析为表格数据 */
function tryParseTableData(content: string): Array<Record<string, unknown>> | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      return parsed;
    }
  } catch {
    // Not a valid JSON array
  }
  return null;
}

/** 分类错误类型 */
function classifyError(error: string): {
  type: 'network' | 'permission' | 'parameter' | 'timeout' | 'unknown';
  label: string;
  docUrl?: string;
} {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('network') || errorLower.includes('fetch') ||
      errorLower.includes('connect') || errorLower.includes('enotfound') ||
      errorLower.includes('econnrefused')) {
    return { type: 'network', label: '网络错误', docUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status' };
  }
  if (errorLower.includes('permission') || errorLower.includes('unauthorized') ||
      errorLower.includes('forbidden') || errorLower.includes('access denied') ||
      errorLower.includes('eacces')) {
    return { type: 'permission', label: '权限错误', docUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/403' };
  }
  if (errorLower.includes('parameter') || errorLower.includes('argument') ||
      errorLower.includes('invalid') || errorLower.includes('typeerror')) {
    return { type: 'parameter', label: '参数错误' };
  }
  if (errorLower.includes('timeout') || errorLower.includes('etimedout')) {
    return { type: 'timeout', label: '超时错误' };
  }
  return { type: 'unknown', label: '未知错误' };
}

// ===================== 结果分页组件（增强版） =====================

interface ResultPaginatorProps {
  content: string;
  pageSize: number;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
  onSummarize?: (content: string) => void;
  showLineNumbers?: boolean;
  searchKeyword?: string;
}

const ResultPaginator: React.FC<ResultPaginatorProps> = memo(function ResultPaginator({
  content,
  pageSize,
  isDark,
  gs,
  onSummarize,
  showLineNumbers = false,
  searchKeyword = '',
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = useMemo(() => content.split('\n'), [content]);
  const totalPages = useMemo(() => Math.ceil(lines.length / pageSize), [lines.length, pageSize]);

  // 过滤搜索结果
  const filteredLines = useMemo(() => {
    if (!searchKeyword.trim()) return lines;
    return lines.filter(line =>
      line.toLowerCase().includes(searchKeyword.toLowerCase())
    );
  }, [lines, searchKeyword]);

  // 高亮搜索关键词
  const highlightKeyword = useCallback((text: string, keyword: string): React.ReactNode => {
    if (!keyword.trim()) return text;
    const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === keyword.toLowerCase()
        ? <span key={idx} style={{ backgroundColor: '#FEF08A', color: '#000' }}>{part}</span>
        : part
    );
  }, []);

  // 导出文件
  const handleExport = useCallback(() => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tool-output-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content]);

  // 新窗口查看
  const handleOpenInNewWindow = useCallback(() => {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<html><head><title>Tool Output</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;}</style></head><body>${content}</body></html>`);
      win.document.close();
    }
  }, [content]);

  const displayLines = searchKeyword ? filteredLines : lines;
  const currentLines = displayLines.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const displayContent = currentLines.join('\n');

  // 如果内容较少，不需要分页
  if (lines.length <= pageSize * 2 && !isExpanded) {
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
            maxHeight: isExpanded ? 'none' : 240,
            overflowY: isExpanded ? 'visible' : 'auto',
            border: `1px solid ${gs.border}`,
          }}
        >
          {lines.map((line, idx) => (
            <div key={idx}>
              {showLineNumbers && (
                <span style={{ color: gs.textMuted, marginRight: '12px', userSelect: 'none' }}>
                  {String(idx + 1).padStart(String(lines.length).length, ' ')} |
                </span>
              )}
              {searchKeyword ? highlightKeyword(line, searchKeyword) : (isJsonLike(line) ? highlightJson(line, isDark) : line)}
            </div>
          ))}
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

        {/* 操作按钮 */}
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
          {onSummarize && lines.length > 50 && (
            <Button
              size="small"
              startIcon={<SummarizeIcon />}
              onClick={() => onSummarize(content)}
              sx={{ fontSize: 10, textTransform: 'none', color: gs.textMuted }}
            >
              智能摘要
            </Button>
          )}
          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{ fontSize: 10, textTransform: 'none', color: gs.textMuted }}
          >
            导出
          </Button>
          <Button
            size="small"
            startIcon={<OpenInNewIcon />}
            onClick={handleOpenInNewWindow}
            sx={{ fontSize: 10, textTransform: 'none', color: gs.textMuted }}
          >
            新窗口
          </Button>
        </Box>
      </Box>
    );
  }

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
        {currentLines.map((line, idx) => {
          const globalIdx = currentPage * pageSize + idx;
          return (
            <div key={idx}>
              {showLineNumbers && (
                <span style={{ color: gs.textMuted, marginRight: '12px', userSelect: 'none' }}>
                  {String(globalIdx + 1).padStart(String(lines.length).length, ' ')} |
                </span>
              )}
              {searchKeyword ? highlightKeyword(line, searchKeyword) : (isJsonLike(line) ? highlightJson(line, isDark) : line)}
            </div>
          );
        })}
      </Box>

      {/* 分页控制 */}
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

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {onSummarize && lines.length > 50 && (
          <Button
            size="small"
            startIcon={<SummarizeIcon />}
            onClick={() => onSummarize(content)}
            sx={{ fontSize: 10, textTransform: 'none', color: gs.textMuted }}
          >
            智能摘要
          </Button>
        )}
        <Button
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          sx={{ fontSize: 10, textTransform: 'none', color: gs.textMuted }}
        >
          导出
        </Button>
        <Button
          size="small"
          startIcon={<OpenInNewIcon />}
          onClick={handleOpenInNewWindow}
          sx={{ fontSize: 10, textTransform: 'none', color: gs.textMuted }}
        >
          新窗口
        </Button>
      </Box>
    </Box>
  );
});

// ===================== 表格输出组件 =====================

interface TableOutputProps {
  data: Array<Record<string, unknown>>;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
}

const TableOutput: React.FC<TableOutputProps> = memo(function TableOutput({
  data,
  isDark,
  gs,
}) {
  if (!data || data.length === 0) return null;

  const headers = Object.keys(data[0]);

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        maxHeight: 300,
        border: `1px solid ${gs.border}`,
        borderRadius: '8px',
        mt: 1,
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableCell
                key={header}
                sx={{
                  fontWeight: 600,
                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  fontSize: 11,
                }}
              >
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.slice(0, 100).map((row, idx) => (
            <TableRow key={idx} hover>
              {headers.map((header) => (
                <TableCell key={header} sx={{ fontSize: 11 }}>
                  {typeof row[header] === 'object'
                    ? JSON.stringify(row[header])
                    : String(row[header] ?? '')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.length > 100 && (
        <Typography sx={{ p: 1, fontSize: 11, color: gs.textMuted, textAlign: 'center' }}>
          显示前 100 行，共 {data.length} 行
        </Typography>
      )}
    </TableContainer>
  );
});

// ===================== 图片输出组件 =====================

interface ImageOutputProps {
  urls: string[];
  gs: ReturnType<typeof getGrayScale>;
}

const ImageOutput: React.FC<ImageOutputProps> = memo(function ImageOutput({
  urls,
  gs,
}) {
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  if (!urls || urls.length === 0) return null;

  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {urls.map((url) => (
        <Box
          key={url}
          sx={{
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            border: `1px solid ${gs.border}`,
          }}
        >
          {!loaded[url] && (
            <Box
              sx={{
                height: 120,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: gs.bgHover,
              }}
            >
              <Typography sx={{ fontSize: 12, color: gs.textMuted }}>加载中...</Typography>
            </Box>
          )}
          <img
            src={url}
            alt={url}
            onLoad={() => setLoaded((prev) => ({ ...prev, [url]: true }))}
            style={{
              maxWidth: '100%',
              maxHeight: 300,
              display: loaded[url] ? 'block' : 'none',
            }}
          />
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              p: 0.5,
              fontSize: 10,
              color: gs.textMuted,
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 10 }} />
            {url}
          </Link>
        </Box>
      ))}
    </Box>
  );
});

// ===================== 链接列表组件 =====================

interface LinkListProps {
  urls: string[];
  gs: ReturnType<typeof getGrayScale>;
}

const LinkList: React.FC<LinkListProps> = memo(function LinkList({
  urls,
  gs,
}) {
  if (!urls || urls.length === 0) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, mb: 0.5 }}>
        发现链接 ({urls.length})
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {urls.slice(0, 10).map((url) => (
          <Link
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              p: 0.5,
              px: 1,
              borderRadius: '4px',
              fontSize: 11,
              color: gs.textSecondary,
              bgcolor: gs.bgHover,
              textDecoration: 'none',
              '&:hover': {
                bgcolor: isDark => isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
              },
            }}
          >
            <LinkIcon sx={{ fontSize: 12 }} />
            <Box
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {url}
            </Box>
          </Link>
        ))}
      </Box>
      {urls.length > 10 && (
        <Typography sx={{ fontSize: 10, color: gs.textMuted, mt: 0.5 }}>
          显示前 10 个，共 {urls.length} 个链接
        </Typography>
      )}
    </Box>
  );
});

// ===================== 错误详情面板（增强版） =====================

interface ErrorDetailPanelProps {
  error: string;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
  semanticColors: ReturnType<typeof getSemanticColors>;
  onFix?: (error: string) => void;
  onRetry?: () => void;
}

const ErrorDetailPanel: React.FC<ErrorDetailPanelProps> = memo(function ErrorDetailPanel({
  error,
  isDark,
  gs,
  semanticColors,
  onFix,
  onRetry,
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // 错误分类
  const errorClassification = useMemo(() => classifyError(error), [error]);

  // 复制错误详情
  const handleCopyError = useCallback(() => {
    const errorDetails = JSON.stringify({
      message: parsedError.message,
      code: parsedError.code,
      stack: parsedError.stack,
      details: parsedError.details,
    }, null, 2);
    navigator.clipboard?.writeText(errorDetails).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [parsedError]);

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
        {/* 错误分类标签 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <Chip
            label={errorClassification.label}
            size="small"
            sx={{
              fontSize: 9,
              height: 18,
              bgcolor: semanticColors.errorBg,
              color: semanticColors.error,
              border: `1px solid ${semanticColors.errorBorder}`,
            }}
          />
          {errorClassification.docUrl && (
            <Link
              href={errorClassification.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                fontSize: 10,
                color: semanticColors.error,
              }}
            >
              <MenuBookIcon sx={{ fontSize: 12 }} />
              查看文档
            </Link>
          )}
        </Box>

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

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          sx={{
            fontSize: 11,
            color: semanticColors.error,
            textTransform: 'none',
          }}
        >
          {expanded ? '隐藏详情' : '查看详情'}
        </Button>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopyError}
          sx={{
            fontSize: 11,
            color: gs.textMuted,
            textTransform: 'none',
          }}
        >
          {copied ? '已复制' : '复制错误'}
        </Button>
        {onFix && (
          <Button
            size="small"
            startIcon={<BuildIcon />}
            onClick={() => onFix(error)}
            sx={{
              fontSize: 11,
              color: semanticColors.error,
              textTransform: 'none',
            }}
          >
            尝试修复
          </Button>
        )}
        {onRetry && (
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRetry}
            sx={{
              fontSize: 11,
              color: semanticColors.error,
              textTransform: 'none',
            }}
          >
            重试
          </Button>
        )}
      </Box>
    </Box>
  );
});

// ===================== 子工具调用链展示（增强版） =====================

interface SubToolChainProps {
  subTools: ToolBlock[];
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
  onJumpToSubTool?: (subToolId: string) => void;
}

const SubToolChain: React.FC<SubToolChainProps> = memo(function SubToolChain({
  subTools,
  isDark,
  gs,
  onJumpToSubTool,
}) {
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');

  if (!subTools || subTools.length === 0) return null;

  // 计算总时间
  const totalTime = useMemo(() => {
    return subTools.reduce((acc, tool) => {
      if (tool.startedAt && tool.completedAt) {
        return acc + (tool.completedAt - tool.startedAt);
      }
      return acc;
    }, 0);
  }, [subTools]);

  // 渲染树形节点
  const renderTreeNode = useCallback((tool: ToolBlock, depth: number = 0) => {
    const duration = tool.startedAt && tool.completedAt
      ? tool.completedAt - tool.startedAt
      : null;
    const percentage = duration && totalTime > 0
      ? ((duration / totalTime) * 100).toFixed(1)
      : null;

    return (
      <Box
        key={tool.id}
        sx={{
          ml: depth * 2,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          py: 0.5,
          px: 1,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderRadius: '6px',
          border: `1px solid ${gs.border}`,
          mb: 0.5,
        }}
      >
        {/* 连接线 */}
        {depth > 0 && (
          <Box
            sx={{
              width: 12,
              height: 2,
              bgcolor: gs.border,
              mr: 0.5,
            }}
          />
        )}

        <Chip
          label={tool.type === 'skill' ? 'Skill' : 'MCP'}
          size="small"
          sx={{
            fontSize: 9,
            height: 18,
            bgcolor: tool.type === 'skill'
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(249, 115, 22, 0.15)',
            color: tool.type === 'skill' ? '#16a34a' : '#ea580c',
            fontWeight: 600,
          }}
        />

        <Typography sx={{ fontSize: 12, fontWeight: 500, color: gs.textPrimary, flex: 1 }}>
          {tool.name}
        </Typography>

        {tool.status === 'done' && (
          <CheckCircleIcon sx={{ fontSize: 14, color: '#22C55E' }} />
        )}
        {tool.status === 'error' && (
          <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444' }} />
        )}
        {tool.status === 'running' && (
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

        {/* 执行时间和占比 */}
        {duration && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
              {formatDuration(duration)}
            </Typography>
            {percentage && (
              <Chip
                label={`${percentage}%`}
                size="small"
                sx={{
                  fontSize: 9,
                  height: 16,
                  bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  color: gs.textMuted,
                }}
              />
            )}
          </Box>
        )}

        {/* 跳转按钮 */}
        {onJumpToSubTool && (
          <IconButton
            size="small"
            onClick={() => onJumpToSubTool(tool.id)}
            sx={{ p: 0.25, color: gs.textMuted }}
          >
            <NavigateNextIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
    );
  }, [gs, isDark, onJumpToSubTool, totalTime]);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: gs.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          子工具调用 ({subTools.length})
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            startIcon={<UnfoldMoreIcon />}
            onClick={() => setViewMode('list')}
            sx={{
              fontSize: 10,
              textTransform: 'none',
              color: viewMode === 'list' ? gs.textPrimary : gs.textMuted,
              minWidth: 'auto',
              px: 1,
            }}
          >
            列表
          </Button>
          <Button
            size="small"
            startIcon={<AccountTreeIcon />}
            onClick={() => setViewMode('tree')}
            sx={{
              fontSize: 10,
              textTransform: 'none',
              color: viewMode === 'tree' ? gs.textPrimary : gs.textMuted,
              minWidth: 'auto',
              px: 1,
            }}
          >
            树形
          </Button>
        </Box>
      </Box>

      {/* 总时间 */}
      {totalTime > 0 && (
        <Typography sx={{ fontSize: 10, color: gs.textMuted, mb: 0.5 }}>
          总耗时: {formatDuration(totalTime)}
        </Typography>
      )}

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {subTools.map((sub, idx) => renderTreeNode(sub, 0))}
        </Box>
      )}

      {/* 树形视图 */}
      {viewMode === 'tree' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {subTools.map((sub) => renderTreeNode(sub, 0))}
        </Box>
      )}
    </Box>
  );
});

// ===================== 输出格式化组件 =====================

interface OutputFormatterProps {
  content: string;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
}

const OutputFormatter: React.FC<OutputFormatterProps> = memo(function OutputFormatter({
  content,
  isDark,
  gs,
}) {
  const [viewMode, setViewMode] = useState<'auto' | 'raw' | 'table' | 'images' | 'links'>('auto');

  // 检测内容类型
  const contentAnalysis = useMemo(() => {
    const links = extractLinks(content);
    const imageLinks = links.filter(isImageUrl);
    const tableData = tryParseTableData(content);

    return {
      links,
      imageLinks,
      tableData,
      isTable: !!tableData,
      hasImages: imageLinks.length > 0,
      hasLinks: links.length > 0,
    };
  }, [content]);

  // 自动选择最佳视图
  const autoView = useMemo(() => {
    if (contentAnalysis.isTable) return 'table';
    if (contentAnalysis.hasImages) return 'images';
    if (contentAnalysis.hasLinks && contentAnalysis.links.length > 3) return 'links';
    return 'raw';
  }, [contentAnalysis]);

  const currentView = viewMode === 'auto' ? autoView : viewMode;

  return (
    <Box>
      {/* 视图切换按钮 */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        <Button
          size="small"
          onClick={() => setViewMode('auto')}
          sx={{
            fontSize: 10,
            textTransform: 'none',
            color: viewMode === 'auto' ? gs.textPrimary : gs.textMuted,
            minWidth: 'auto',
            px: 1,
          }}
        >
          自动
        </Button>
        <Button
          size="small"
          onClick={() => setViewMode('raw')}
          sx={{
            fontSize: 10,
            textTransform: 'none',
            color: viewMode === 'raw' ? gs.textPrimary : gs.textMuted,
            minWidth: 'auto',
            px: 1,
          }}
        >
          原始
        </Button>
        {contentAnalysis.isTable && (
          <Button
            size="small"
            startIcon={<TableChartIcon />}
            onClick={() => setViewMode('table')}
            sx={{
              fontSize: 10,
              textTransform: 'none',
              color: viewMode === 'table' ? gs.textPrimary : gs.textMuted,
              minWidth: 'auto',
              px: 1,
            }}
          >
            表格
          </Button>
        )}
        {contentAnalysis.hasImages && (
          <Button
            size="small"
            startIcon={<ImageIcon />}
            onClick={() => setViewMode('images')}
            sx={{
              fontSize: 10,
              textTransform: 'none',
              color: viewMode === 'images' ? gs.textPrimary : gs.textMuted,
              minWidth: 'auto',
              px: 1,
            }}
          >
            图片 ({contentAnalysis.imageLinks.length})
          </Button>
        )}
        {contentAnalysis.hasLinks && (
          <Button
            size="small"
            startIcon={<LinkIcon />}
            onClick={() => setViewMode('links')}
            sx={{
              fontSize: 10,
              textTransform: 'none',
              color: viewMode === 'links' ? gs.textPrimary : gs.textMuted,
              minWidth: 'auto',
              px: 1,
            }}
          >
            链接 ({contentAnalysis.links.length})
          </Button>
        )}
      </Box>

      {/* 视图内容 */}
      {currentView === 'table' && contentAnalysis.tableData && (
        <TableOutput data={contentAnalysis.tableData} isDark={isDark} gs={gs} />
      )}
      {currentView === 'images' && (
        <ImageOutput urls={contentAnalysis.imageLinks} gs={gs} />
      )}
      {currentView === 'links' && (
        <LinkList urls={contentAnalysis.links} gs={gs} />
      )}
      {currentView === 'raw' && null}
    </Box>
  );
});

// ===================== 主组件 =====================

const ToolCard: React.FC<Props> = memo(function ToolCard({
  block,
  subTools,
  onRetry,
  onCancel,
  onSkip,
  onFix,
  onJumpToSubTool,
  onSummarize,
  riskLevel,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const semanticColors = getSemanticColors(isDark);

  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 计算执行状态
  const isRunning = block.status === 'pending' || block.status === 'running';
  const isFailed = block.status === 'error';
  const isDone = block.status === 'done';
  const isSkill = block.type === 'skill';

  // 计算风险等级
  const actualRiskLevel = riskLevel || getRiskLevelFromToolName(block.name);
  const riskColor = getRiskColor(actualRiskLevel);

  // 预估时间
  const estimatedTime = useMemo(() => getEstimatedTime(block.name), [block.name]);

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

  // 跳过等待处理
  const handleSkip = useCallback(() => {
    if (onSkip) {
      onSkip(block.id);
    }
  }, [onSkip, block.id]);

  // 尝试修复处理
  const handleFix = useCallback((error: string) => {
    if (onFix) {
      onFix(block.id, error);
    }
  }, [onFix, block.id]);

  // 智能摘要处理
  const handleSummarize = useCallback((content: string) => {
    if (onSummarize) {
      onSummarize(content);
    }
  }, [onSummarize]);

  // 进度百分比
  const progressPercent = calculateProgress(block.status, elapsedMs, estimatedTime);

  // 计算剩余时间
  const remainingTime = useMemo(() => {
    if (isRunning && elapsedMs > 0) {
      const remaining = estimatedTime - elapsedMs;
      if (remaining > 0) {
        return formatDuration(remaining);
      }
    }
    return null;
  }, [isRunning, elapsedMs, estimatedTime]);

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

        {/* 风险等级标签 */}
        {actualRiskLevel !== 'safe' && (
          <Chip
            label={actualRiskLevel === 'low' ? '低风险' : actualRiskLevel === 'medium' ? '中风险' : '高风险'}
            size="small"
            sx={{
              fontSize: 9,
              height: 18,
              bgcolor: `${riskColor}20`,
              color: riskColor,
              border: `1px solid ${riskColor}40`,
            }}
          />
        )}

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
                bgcolor: riskColor,
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

      {/* 执行进度条（增强版） */}
      {isRunning && (
        <Box sx={{ px: 1.25, pb: 0.5 }}>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                bgcolor: riskColor,
                borderRadius: 2,
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
                {Math.round(progressPercent)}%
              </Typography>
              {remainingTime && (
                <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
                  预计剩余 {remainingTime}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {onSkip && (
                <Button
                  size="small"
                  startIcon={<SkipNextIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSkip();
                  }}
                  sx={{
                    fontSize: 10,
                    textTransform: 'none',
                    color: gs.textMuted,
                    minWidth: 'auto',
                    px: 1,
                    py: 0.25,
                  }}
                >
                  跳过
                </Button>
              )}
              {onCancel && (
                <Button
                  size="small"
                  startIcon={<CancelIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  sx={{
                    fontSize: 10,
                    textTransform: 'none',
                    color: semanticColors.error,
                    minWidth: 'auto',
                    px: 1,
                    py: 0.25,
                  }}
                >
                  取消
                </Button>
              )}
            </Box>
          </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: gs.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {isFailed ? 'Error' : 'Result'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {/* 搜索框 */}
                  <TextField
                    size="small"
                    placeholder="搜索..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      width: 120,
                      '& .MuiInputBase-root': {
                        height: 24,
                        fontSize: 11,
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: gs.border,
                        },
                      },
                    }}
                    InputProps={{
                      startAdornment: <SearchIcon sx={{ fontSize: 12, color: gs.textMuted, mr: 0.5 }} />,
                    }}
                  />
                  {/* 行号开关 */}
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={showLineNumbers}
                        onChange={(e) => setShowLineNumbers(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    }
                    label={<Typography sx={{ fontSize: 10, color: gs.textMuted }}>行号</Typography>}
                    sx={{ ml: 0.5, mr: 0 }}
                  />
                  {/* 复制按钮 */}
                  <IconButton
                    size="small"
                    onClick={handleCopy}
                    sx={{ p: 0.25, color: gs.textMuted }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Box>
              </Box>

              {/* 输出格式化组件 */}
              <OutputFormatter content={formattedResult} isDark={isDark} gs={gs} />

              {isFailed ? (
                <ErrorDetailPanel
                  error={formattedResult}
                  isDark={isDark}
                  gs={gs}
                  semanticColors={semanticColors}
                  onFix={onFix ? handleFix : undefined}
                  onRetry={onRetry ? handleRetry : undefined}
                />
              ) : (
                <ResultPaginator
                  content={formattedResult}
                  pageSize={50}
                  isDark={isDark}
                  gs={gs}
                  onSummarize={onSummarize}
                  showLineNumbers={showLineNumbers}
                  searchKeyword={searchKeyword}
                />
              )}
            </Box>
          )}

          {/* 子工具调用链 */}
          {subTools && subTools.length > 0 && (
            <SubToolChain
              subTools={subTools}
              isDark={isDark}
              gs={gs}
              onJumpToSubTool={onJumpToSubTool}
            />
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
                  border: `2px solid ${riskColor}`,
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