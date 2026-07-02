import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import { Box, IconButton, useTheme, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { getGrayScale } from '../../constants/theme';

// 注册常用语言
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
// 扩展语言支持
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('diff', diff);

interface MarkdownRendererProps {
  content: string;
  /** 是否使用暗色主题（默认: false，使用浅色） */
  darkMode?: boolean;
  /** v2.8.1: 是否正在流式输出 — 流式时节流 Markdown 重新解析，避免每 token 全量重渲染 */
  isStreaming?: boolean;
}

/**
 * Markdown 渲染器
 *
 * 特性：
 * - 完整 Markdown 支持（标题、列表、表格、粗体等）通过 react-markdown + remark-gfm
 * - 代码块自动语法高亮（prism-light + 常用语言）
 * - 内联代码样式
 * - 响应式图片/表格
 */
export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, darkMode = false, isStreaming = false }: MarkdownRendererProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // v2.8.0: memoize gs to avoid recreating object every render (critical during streaming)
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const [copied, setCopied] = useState(false);

  // v2.8.1: 流式 Markdown 渲染节流
  // 流式时 content 每 rAF 帧更新，但 Markdown 解析 + 语法高亮是 O(n) 操作
  // 节流到每 150ms 重新解析一次，中间帧复用上一次的渲染结果
  // 注意：所有 hooks 必须在 early return 之前调用（Rules of Hooks）
  const [renderedContent, setRenderedContent] = useState(content);
  const lastRenderRef = useRef(0);
  const pendingContentRef = useRef(content);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingContentRef.current = content;

    // 非流式：立即更新
    if (!isStreaming) {
      setRenderedContent(content);
      return;
    }

    // 流式：节流更新
    const now = Date.now();
    const elapsed = now - lastRenderRef.current;
    const THROTTLE_MS = 150;

    if (elapsed >= THROTTLE_MS) {
      lastRenderRef.current = now;
      setRenderedContent(content);
    } else if (throttleTimerRef.current === null) {
      // 安排延迟更新 — 取最新 pendingContentRef.current
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

  // v2.8.0: memoize components object to avoid ReactMarkdown re-rendering all code blocks
  // when only content changed (not theme/copy state)
  const markdownComponents = useMemo(() => ({
    // 代码块：有语言标注 → 语法高亮；否则 → 纯文本
    code({ className, children, node, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');

      // 内联代码（无 language- 前缀，无 node.position）
      if (!match && node?.position?.start?.line === node?.position?.end?.line) {
        return (
          <code
            style={{
              backgroundColor: gs.bgInput,
              color: isDark ? '#F97316' : '#D97706',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            }}
            {...props}
          >
            {children}
          </code>
        );
      }

      // 代码块
      const language = match?.[1] || '';

      // v1.7.0: 跳过 inventory_query 代码块（由 useChat 拦截处理，不渲染）
      if (language === 'inventory_query') {
        return null;
      }

      return (
        <Box sx={{
          position: 'relative',
          my: 1,
          borderRadius: 1,
          overflow: 'hidden',
          border: `1px solid ${gs.border}`,
          '&:hover .copy-btn': { opacity: 1 },
        }}>
          {/* 代码块头部栏：语言标签 + 复制按钮 */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 0.5,
            bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
            borderBottom: `1px solid ${gs.border}`,
          }}>
            <Typography sx={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: gs.textMuted,
              textTransform: 'lowercase',
            }}>
              {language || 'text'}
            </Typography>
            <IconButton
              className="copy-btn"
              onClick={() => {
                const doCopy = async () => {
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(codeString);
                    } else {
                      const el = document.createElement('textarea');
                      el.value = codeString;
                      el.style.position = 'fixed';
                      el.style.opacity = '0';
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand('copy');
                      document.body.removeChild(el);
                    }
                  } catch {
                    // 静默失败
                  }
                };
                doCopy();
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              sx={{
                color: gs.textDisabled,
                p: 0.25,
                opacity: 0,
                transition: 'opacity 0.2s',
                '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
              }}
            >
              {copied ? <CheckIcon sx={{ fontSize: 14, color: '#16A34A' }} /> : <ContentCopyIcon sx={{ fontSize: 13 }} />}
            </IconButton>
          </Box>
          <SyntaxHighlighter
            style={isDark ? oneDark : oneLight}
            language={language || 'text'}
            PreTag="div"
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
    // 表格
    table({ children }: any) {
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
    th({ children }: any) {
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
    td({ children }: any) {
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
    // 链接
    a({ children, href }: any) {
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
    // 图片 — 统一显示为文件附件样式，不直接渲染图片
    img({ src, alt }: any) {
      const fileName = alt || (src ? src.split('/').pop()?.split('?')[0] || 'image' : 'image');
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isImageExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif'].includes(ext);
      const icon = isImageExt ? '🖼️' : '📎';
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
          <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
        </a>
      );
    },
    // 引用
    blockquote({ children }: any) {
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
    // 分隔线
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
  }), [gs, isDark]);

  // v2.8.1: memoize ReactMarkdown 元素 — 仅在 renderedContent 或 markdownComponents 变化时重建
  // 流式时 renderedContent 每 150ms 更新一次，而非每帧 → Markdown 解析频率从 60fps 降至 ~7fps
  const markdownElement = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {renderedContent}
    </ReactMarkdown>
  ), [renderedContent, markdownComponents]);

  const empty = !content || content.trim() === '';
  if (empty) {
    return null;
  }

  return (
    <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
      {markdownElement}
    </div>
  );
});