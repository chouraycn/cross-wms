/**
 * CDFChat Markdown 渲染组件
 *
 * 基于 react-markdown + remark-gfm + remark-math + rehype-katex
 * - 代码高亮（PrismLight + 项目现有主题）
 * - 流式时节流到 150ms，避免每 token 全量重渲染
 * - 安全 HTML 转义（react-markdown 默认不渲染原始 HTML）
 * - Mermaid 图表支持（动态导入，可选依赖）
 * - 增强的代码块头部栏（行号、下载、复制等）
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// @ts-expect-error — react-syntax-highlighter types not fully typed
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import graphql from 'react-syntax-highlighter/dist/esm/languages/prism/graphql';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import {
  Box,
  IconButton,
  useTheme,
  Typography,
  Tooltip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getGrayScale } from '../../constants/theme';
import { extractMediaFromText, removeMediaUrls } from '../../utils/mediaExtractor';
import { AudioPlayer } from './AudioPlayer';
import { CanvasPreview } from './CanvasPreview';
import type { MarkdownRendererProps } from './types';

// 注册常用语言
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash); // 别名
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python); // 别名
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml); // 别名
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown); // 别名
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('kotlin', kotlin);
SyntaxHighlighter.registerLanguage('swift', swift);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('c++', cpp); // 别名
SyntaxHighlighter.registerLanguage('php', php);
SyntaxHighlighter.registerLanguage('ruby', ruby);
SyntaxHighlighter.registerLanguage('rb', ruby); // 别名
SyntaxHighlighter.registerLanguage('docker', docker);
SyntaxHighlighter.registerLanguage('dockerfile', docker); // 别名
SyntaxHighlighter.registerLanguage('graphql', graphql);
SyntaxHighlighter.registerLanguage('gql', graphql); // 别名
SyntaxHighlighter.registerLanguage('diff', diff);

/**
 * 计算 token 预估值（简单估算：约 4 字符 = 1 token）
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 下载代码文件
 */
function downloadCode(code: string, filename: string): void {
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 在新窗口打开代码
 */
function openInNewWindow(code: string, language: string): void {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Code - ${language}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
              font-size: 14px;
              background: #1e1e1e;
              color: #d4d4d4;
              white-space: pre;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>${escapeHtml(code)}</body>
      </html>
    `);
    win.document.close();
  }
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Mermaid 渲染组件
 */
const MermaidRenderer = React.memo(function MermaidRenderer({
  code,
  isDark,
}: {
  code: string;
  isDark: boolean;
}) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function renderMermaid() {
      try {
        // 动态导入 mermaid（可选依赖，需 npm install mermaid）
        // @ts-expect-error — mermaid 为可选依赖，类型声明需安装 @types/mermaid 或 mermaid 自带
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
        });
        const { svg } = await mermaid.render('mermaid-' + Date.now(), code);
        if (!cancelled) {
          setSvg(svg);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Mermaid 渲染失败');
          setSvg('');
        }
      }
    }
    renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [code, isDark]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 静默失败
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        my: 1,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* 头部栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.5,
          bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'text.disabled',
            textTransform: 'lowercase',
          }}
        >
          mermaid
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={showSource ? '查看图表' : '查看源码'}>
            <IconButton
              size="small"
              onClick={() => setShowSource(!showSource)}
              sx={{ p: 0.25, color: 'text.disabled' }}
            >
              {showSource ? <VisibilityIcon sx={{ fontSize: 14 }} /> : <CodeIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={copied ? '已复制' : '复制源码'}>
            <IconButton
              size="small"
              onClick={handleCopy}
              sx={{ p: 0.25, color: copied ? 'success.main' : 'text.disabled' }}
            >
              {copied ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 内容区 */}
      <Box
        ref={containerRef}
        sx={{
          p: 2,
          bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
          overflow: 'auto',
          '& svg': { maxWidth: '100%', height: 'auto' },
        }}
      >
        {showSource ? (
          <pre
            style={{
              margin: 0,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {code}
          </pre>
        ) : error ? (
          <Box sx={{ color: 'error.main', fontSize: 13 }}>
            <Typography variant="body2" color="error">
              图表渲染失败
            </Typography>
            <Typography variant="caption" component="pre" sx={{ mt: 1, fontSize: 11 }}>
              {error}
            </Typography>
          </Box>
        ) : svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <Typography variant="body2" color="text.disabled">
            渲染中...
          </Typography>
        )}
      </Box>
    </Box>
  );
});

/**
 * 代码块头部栏组件
 */
const CodeBlockHeader = React.memo(function CodeBlockHeader({
  language,
  codeString,
  lineCount,
  tokenCount,
  showLineNumbers,
  onToggleLineNumbers,
  isDark,
  copied,
  onCopy,
}: {
  language: string;
  codeString: string;
  lineCount: number;
  tokenCount: number;
  showLineNumbers: boolean;
  onToggleLineNumbers: () => void;
  isDark: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 0.5,
        bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
        borderBottom: '1px solid',
        borderColor: 'divider',
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      {/* 左侧：语言标签 + 行数/token */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'text.disabled',
            textTransform: 'lowercase',
          }}
        >
          {language || 'text'}
        </Typography>
        <Typography
          sx={{
            fontSize: 10,
            color: 'text.disabled',
            opacity: 0.7,
          }}
        >
          {lineCount} 行 | ~{tokenCount} tokens
        </Typography>
      </Box>

      {/* 右侧：操作按钮 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {/* 行号开关 */}
        <Tooltip title={showLineNumbers ? '隐藏行号' : '显示行号'}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showLineNumbers}
                onChange={onToggleLineNumbers}
                sx={{
                  width: 28,
                  height: 16,
                  '& .MuiSwitch-switchBase': {
                    padding: 0.5,
                  },
                  '& .MuiSwitch-thumb': {
                    width: 12,
                    height: 12,
                  },
                  '& .MuiSwitch-track': {
                    height: 14,
                    borderRadius: 7,
                  },
                }}
              />
            }
            label={
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
                行号
              </Typography>
            }
            sx={{ mr: 0, '& .MuiFormControlLabel-label': { ml: 0.5 } }}
          />
        </Tooltip>

        {/* 下载按钮 */}
        <Tooltip title="下载代码">
          <IconButton
            size="small"
            onClick={() => downloadCode(codeString, `code.${language || 'txt'}`)}
            sx={{
              color: 'text.disabled',
              p: 0.25,
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            <DownloadIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        {/* 新窗口打开 */}
        <Tooltip title="在新窗口打开">
          <IconButton
            size="small"
            onClick={() => openInNewWindow(codeString, language)}
            sx={{
              color: 'text.disabled',
              p: 0.25,
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        {/* 复制按钮 */}
        <Tooltip title={copied ? '已复制' : '复制代码'}>
          <IconButton
            size="small"
            onClick={onCopy}
            sx={{
              color: copied ? 'success.main' : 'text.disabled',
              p: 0.25,
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
              transition: 'all 0.2s',
            }}
          >
            {copied ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
});

/**
 * 内联代码组件
 */
const InlineCode = React.memo(function InlineCode({
  children,
  isDark,
  gs,
}: {
  children: React.ReactNode;
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
}) {
  const [copied, setCopied] = useState(false);
  const content = String(children);

  // 根据内容类型判断颜色
  const getCodeStyle = (): { color: string; label?: string } => {
    // 文件路径（包含 / 或 \）
    if (/^[/\\]/.test(content) || /[/\\]/.test(content)) {
      return {
        color: isDark ? '#60A5FA' : '#2563EB',
        label: '文件路径',
      };
    }
    // 命令（以 $ 或 > 开头，或包含常见命令关键字）
    if (/^(\$|>|npm|yarn|pip|git|cd|ls|mkdir|rm|cat|echo)/.test(content)) {
      return {
        color: isDark ? '#FB923C' : '#EA580C',
        label: '命令',
      };
    }
    // 变量（包含下划线或驼峰命名，通常是标识符）
    if (/^[a-z_][a-z0-9_]*$/i.test(content) || /^[A-Z_][A-Z0-9_]*$/.test(content)) {
      return {
        color: isDark ? '#C084FC' : '#9333EA',
        label: '变量',
      };
    }
    // 默认样式
    return {
      color: isDark ? '#F97316' : '#D97706',
    };
  };

  const style = getCodeStyle();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默失败
    }
  };

  return (
    <Tooltip title={copied ? '已复制' : style.label ? `${style.label} - 点击复制` : '点击复制'} arrow>
      <code
        onClick={handleCopy}
        style={{
          backgroundColor: gs.bgInput,
          color: style.color,
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          border: copied ? '1px solid' : '1px solid transparent',
          borderColor: copied ? style.color : 'transparent',
          userSelect: 'text',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.85';
          e.currentTarget.style.transform = 'scale(1.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {children}
      </code>
    </Tooltip>
  );
});

/**
 * Markdown 渲染器
 *
 * 特性：
 * - 完整 Markdown 支持（标题、列表、表格、粗体等）通过 react-markdown + remark-gfm
 * - 代码块自动语法高亮（prism-light + 常用语言）
 * - Mermaid 图表渲染
 * - 内联代码样式
 * - 数学公式支持（KaTeX）
 * - 流式时节流到 150ms
 * - 增强的代码块头部栏
 */
export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  isStreaming = false,
}: MarkdownRendererProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);

  // 流式 Markdown 渲染节流 — 150ms
  const [renderedContent, setRenderedContent] = useState(content);
  const lastRenderRef = useRef(0);
  const pendingContentRef = useRef(content);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingContentRef.current = content;

    if (!isStreaming) {
      setRenderedContent(content);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastRenderRef.current;
    const THROTTLE_MS = 150;

    if (elapsed >= THROTTLE_MS) {
      lastRenderRef.current = now;
      setRenderedContent(content);
    } else if (throttleTimerRef.current === null) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        lastRenderRef.current = Date.now();
        setRenderedContent(pendingContentRef.current);
      }, THROTTLE_MS - elapsed);
    }

    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, [content, isStreaming]);

  // 代码块状态管理（行号显示）
  const [showLineNumbersMap, setShowLineNumbersMap] = useState<Map<string, boolean>>(new Map());

  const toggleLineNumbers = useCallback((codeId: string) => {
    setShowLineNumbersMap((prev) => {
      const next = new Map(prev);
      next.set(codeId, !prev.get(codeId));
      return next;
    });
  }, []);

  // 复制状态管理
  const [copiedMap, setCopiedMap] = useState<Map<string, boolean>>(new Map());

  const handleCopy = useCallback(async (codeId: string, code: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const el = document.createElement('textarea');
        el.value = code;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedMap((prev) => {
        const next = new Map(prev);
        next.set(codeId, true);
        return next;
      });
      setTimeout(() => {
        setCopiedMap((prev) => {
          const next = new Map(prev);
          next.set(codeId, false);
          return next;
        });
      }, 2000);
    } catch {
      // 静默失败
    }
  }, []);

  // 代码块 ID 计数器
  const codeBlockIdRef = useRef(0);

  // memoize components object
  const markdownComponents = useMemo(
    () => ({
      code({
        className,
        children,
        node,
        ...props
      }: React.HTMLAttributes<HTMLElement> & { node?: any }) {
        const match = /language-(\w+)/.exec(className || '');
        const codeString = String(children).replace(/\n$/, '');

        // 内联代码（无 language- 前缀，单行）
        if (!match && node?.position?.start?.line === node?.position?.end?.line) {
          return <InlineCode gs={gs} isDark={isDark}>{children}</InlineCode>;
        }

        // 代码块
        const language = match?.[1] || '';

        // Mermaid 图表
        if (language === 'mermaid') {
          return <MermaidRenderer code={codeString} isDark={isDark} />;
        }

        // 为每个代码块生成唯一 ID
        const codeId = `code-${codeBlockIdRef.current++}`;
        const showLineNumbers = showLineNumbersMap.get(codeId) ?? true;
        const copied = copiedMap.get(codeId) ?? false;
        const lineCount = codeString.split('\n').length;
        const tokenCount = estimateTokens(codeString);

        return (
          <Box
            sx={{
              position: 'relative',
              my: 1,
              borderRadius: 1,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <CodeBlockHeader
              language={language}
              codeString={codeString}
              lineCount={lineCount}
              tokenCount={tokenCount}
              showLineNumbers={showLineNumbers}
              onToggleLineNumbers={() => toggleLineNumbers(codeId)}
              isDark={isDark}
              copied={copied}
              onCopy={() => handleCopy(codeId, codeString)}
            />
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={language || 'text'}
              PreTag="div"
              showLineNumbers={showLineNumbers}
              showInlineLineNumbers={showLineNumbers}
              lineNumberStyle={{
                minWidth: '3em',
                paddingRight: '1em',
                textAlign: 'right',
                color: isDark ? '#4B5563' : '#9CA3AF',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                userSelect: 'none',
              }}
              customStyle={{
                borderRadius: 0,
                fontSize: 13,
                margin: 0,
                border: 'none',
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          </Box>
        );
      },
      table({ children }: React.TableHTMLAttributes<HTMLTableElement>) {
        return (
          <div style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: 13,
              }}
            >
              {children}
            </table>
          </div>
        );
      },
      th({ children }: React.ThHTMLAttributes<HTMLTableCellElement>) {
        return (
          <th
            style={{
              border: `1px solid ${gs.border}`,
              padding: '6px 12px',
              backgroundColor: gs.bgHover,
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            {children}
          </th>
        );
      },
      td({ children }: React.TdHTMLAttributes<HTMLTableCellElement>) {
        return (
          <td
            style={{
              border: `1px solid ${gs.border}`,
              padding: '6px 12px',
            }}
          >
            {children}
          </td>
        );
      },
      a({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: isDark ? '#60A5FA' : '#2563EB',
              textDecoration: 'underline',
            }}
          >
            {children}
          </a>
        );
      },
      img({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) {
        const fileName = alt || (src ? src.split('/').pop()?.split('?')[0] || 'image' : 'image');
        return (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              backgroundColor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
              textDecoration: 'none',
              color: gs.textPrimary,
              fontSize: 13,
              margin: '4px 0',
              maxWidth: '100%',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{'\u{1F4CE}'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName}
            </span>
          </a>
        );
      },
      blockquote({ children }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
        return (
          <blockquote
            style={{
              borderLeft: `3px solid ${gs.borderDarker}`,
              paddingLeft: 12,
              margin: '8px 0',
              color: gs.textDisabled,
            }}
          >
            {children}
          </blockquote>
        );
      },
      hr() {
        return (
          <hr
            style={{
              border: 'none',
              borderTop: `1px solid ${gs.border}`,
              margin: '12px 0',
            }}
          />
        );
      },
    }),
    [gs, isDark, showLineNumbersMap, copiedMap, toggleLineNumbers, handleCopy]
  );

  // 多模态媒体提取 — 从渲染文本中提取音频/Canvas URL
  const audioMedia = useMemo(
    () => extractMediaFromText(renderedContent).filter((m) => m.type === 'audio'),
    [renderedContent],
  );
  const canvasMedia = useMemo(
    () => extractMediaFromText(renderedContent).filter((m) => m.type === 'canvas'),
    [renderedContent],
  );

  // 从文本中移除音频/Canvas URL，避免与播放器/预览组件重复显示
  const cleanedContent = useMemo(() => {
    if (audioMedia.length === 0 && canvasMedia.length === 0) return renderedContent;
    return removeMediaUrls(renderedContent, [...audioMedia, ...canvasMedia]);
  }, [renderedContent, audioMedia, canvasMedia]);

  // memoize ReactMarkdown element
  const markdownElement = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {cleanedContent}
      </ReactMarkdown>
    ),
    [cleanedContent, markdownComponents]
  );

  const empty = !content || content.trim() === '';
  if (empty) {
    return (
      <span style={{ fontSize: 14, lineHeight: 1.6, color: gs.textDisabled }}>
        {'\u601D\u8003\u4E2D...'}
      </span>
    );
  }

  return (
    <div className="cdf-markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
      {markdownElement}
      {audioMedia.map((m, i) => (
        <AudioPlayer key={`audio-${i}-${m.url}`} src={m.url} />
      ))}
      {canvasMedia.map((m, i) => {
        const fileName = m.url.split('/').pop()?.split('?')[0] || m.url;
        return (
          <CanvasPreview key={`canvas-${i}-${m.url}`} url={m.url} title={fileName} />
        );
      })}
    </div>
  );
});