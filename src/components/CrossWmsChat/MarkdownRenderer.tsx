import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';

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
  const empty = !content || content.trim() === '';
  if (empty) {
    // 流式输出时 content 可能为空 — 显示占位
    return (
      <span style={{ fontSize: 14, lineHeight: 1.6, color: darkMode ? '#9CA3AF' : '#6B7280' }}>
        思考中...
      </span>
    );
  }

  return (
    <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
                    backgroundColor: darkMode ? '#374151' : '#F3F4F6',
                    color: darkMode ? '#F97316' : '#D97706',
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
              <SyntaxHighlighter
                style={oneLight}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                  borderRadius: 8,
                  fontSize: 13,
                  margin: '8px 0',
                  border: darkMode ? '1px solid #374151' : '1px solid #E5E7EB',
                }}
                {...props}
              >
                {codeString}
              </SyntaxHighlighter>
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
                  border: darkMode ? '1px solid #374151' : '1px solid #E5E7EB',
                  padding: '6px 12px',
                  backgroundColor: darkMode ? '#1F2937' : '#F9FAFB',
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
                  border: darkMode ? '1px solid #374151' : '1px solid #E5E7EB',
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
                  color: darkMode ? '#60A5FA' : '#2563EB',
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
                  borderLeft: `3px solid ${darkMode ? '#4B5563' : '#D1D5DB'}`,
                  paddingLeft: 12,
                  margin: '8px 0',
                  color: darkMode ? '#9CA3AF' : '#6B7280',
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
                  borderTop: darkMode ? '1px solid #374151' : '1px solid #E5E7EB',
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
