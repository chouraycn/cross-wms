import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// @ts-ignore — types package not installed, using default export
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
// @ts-ignore
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
// @ts-ignore
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
// @ts-ignore
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
// @ts-ignore
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
// @ts-ignore
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
// @ts-ignore
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
// @ts-ignore
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
// @ts-ignore
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
// @ts-ignore
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
// @ts-ignore
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
// @ts-ignore
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
// @ts-ignore
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
// @ts-ignore
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
// @ts-ignore
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
// @ts-ignore
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
// @ts-ignore
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
// @ts-ignore
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import { Box, IconButton, useTheme } from '@mui/material';
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
export function MarkdownRenderer({ content, darkMode = false }: MarkdownRendererProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [copied, setCopied] = useState(false);
  const empty = !content || content.trim() === '';
  if (empty) {
    // 流式输出时 content 可能为空 — 显示占位
    return (
      <span style={{ fontSize: 14, lineHeight: 1.6, color: gs.textDisabled }}>
        思考中...
      </span>
    );
  }

  return (
    <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 代码块：有语言标注 → 语法高亮；否则 → 纯文本
          code({ className, children, node, ...props }) {
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
              <Box sx={{ position: 'relative', '&:hover .copy-btn': { opacity: 1 } }}>
                <SyntaxHighlighter
                  style={oneLight}
                  language={language || 'text'}
                  PreTag="div"
                  customStyle={{
                    borderRadius: 8,
                    fontSize: 13,
                    margin: '8px 0',
                    border: `1px solid ${gs.border}`,
                  }}
                  {...props}
                >
                  {codeString}
                </SyntaxHighlighter>
                <IconButton
                  className="copy-btn"
                  onClick={() => {
                    // WKWebView file:// 协议下 Clipboard API 可能不可用，需容错
                    const doCopy = async () => {
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(codeString);
                        } else {
                          // 降级方案：document.execCommand
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
                        // 静默失败，不影响其他功能
                      }
                    };
                    doCopy();
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    color: gs.textDisabled,
                    p: 0.5,
                    '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
                  }}
                >
                  {copied ? <CheckIcon sx={{ fontSize: 14, color: '#16A34A' }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </Box>
            );
          },
          // 表格
          table({ children }) {
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
          th({ children }) {
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
          td({ children }) {
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
          a({ children, href }) {
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
          // 图片
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt || ''}
                style={{
                  maxWidth: '100%',
                  borderRadius: 8,
                  margin: '8px 0',
                }}
              />
            );
          },
          // 引用
          blockquote({ children }) {
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
