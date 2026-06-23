/**
 * CDFChat Markdown 渲染组件
 *
 * 基于 react-markdown + remark-gfm + remark-math + rehype-katex
 * - 代码高亮（PrismLight + 项目现有主题）
 * - 流式时节流到 150ms，避免每 token 全量重渲染
 * - 安全 HTML 转义（react-markdown 默认不渲染原始 HTML）
 */
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
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
// @ts-expect-error — react-syntax-highlighter subpath import lacks types
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import { Box, IconButton, useTheme, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { getGrayScale } from '../../constants/theme';
import type { MarkdownRendererProps } from './types';

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

/**
 * Markdown 渲染器
 *
 * 特性：
 * - 完整 Markdown 支持（标题、列表、表格、粗体等）通过 react-markdown + remark-gfm
 * - 代码块自动语法高亮（prism-light + 常用语言）
 * - 内联代码样式
 * - 数学公式支持（KaTeX）
 * - 流式时节流到 150ms
 */
export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  isStreaming = false,
}: MarkdownRendererProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const [copied, setCopied] = useState(false);

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

  // memoize components object
  const markdownComponents = useMemo(
    () => ({
      code({ className, children, node, ...props }: React.HTMLAttributes<HTMLElement> & { node?: any }) {
        const match = /language-(\w+)/.exec(className || '');
        const codeString = String(children).replace(/\n$/, '');

        // 内联代码（无 language- 前缀，单行）
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

        return (
          <Box
            sx={{
              position: 'relative',
              my: 1,
              borderRadius: 1,
              overflow: 'hidden',
              border: `1px solid ${gs.border}`,
              '&:hover .copy-btn': { opacity: 1 },
            }}
          >
            {/* 代码块头部栏：语言标签 + 复制按钮 */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 0.5,
                bgcolor: isDark ? '#1A1A1A' : '#F3F4F6',
                borderBottom: `1px solid ${gs.border}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: gs.textMuted,
                  textTransform: 'lowercase',
                }}
              >
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
                {copied ? (
                  <CheckIcon sx={{ fontSize: 14, color: '#16A34A' }} />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: 13 }} />
                )}
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
    [gs, isDark],
  );

  // memoize ReactMarkdown element
  const markdownElement = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {renderedContent}
      </ReactMarkdown>
    ),
    [renderedContent, markdownComponents],
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
    </div>
  );
});
