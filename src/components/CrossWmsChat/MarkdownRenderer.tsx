import React, { useState } from 'react';
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
// @ts-ignore
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { Box, IconButton, Step, StepLabel, Stepper, Typography, useTheme } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { getGrayScale } from '../../constants/theme';
import { LinkPreview } from './LinkPreview';

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
}

// ===================== 自定义结构化语法预处理 =====================

/** 将 :::card{...}...::: 替换为特定 HTML 结构，便于 react-markdown 捕获 */
function preprocessCustomDirectives(raw: string): string {
  let result = raw;

  // 1. :::card{title="..." type="..."} ... :::
  result = result.replace(
    /:::\s*card\{([^}]*)\}\s*([\s\S]*?)\s*:::/g,
    (_match, attrs: string, body: string) => {
      const titleMatch = /title\s*=\s*"([^"]*)"/.exec(attrs);
      const typeMatch = /type\s*=\s*"([^"]*)"/.exec(attrs);
      const title = titleMatch?.[1] || '';
      const type = typeMatch?.[1] || 'info';
      return `<custom-card title="${title}" type="${type}">\n${body.trim()}\n</custom-card>`;
    }
  );

  // 2. :::steps ... :::
  result = result.replace(
    /:::\s*steps\s*([\s\S]*?)\s*:::/g,
    (_match, body: string) => {
      return `<custom-steps>\n${body.trim()}\n</custom-steps>`;
    }
  );

  // 3. :::timeline ... :::
  result = result.replace(
    /:::\s*timeline\s*([\s\S]*?)\s*:::/g,
    (_match, body: string) => {
      return `<custom-timeline>\n${body.trim()}\n</custom-timeline>`;
    }
  );

  return result;
}

// ===================== 结构化子组件 =====================

interface CardProps {
  title: string;
  type: 'info' | 'warning' | 'success' | 'error';
  children: React.ReactNode;
  isDark: boolean;
}

function InfoCard({ title, type, children, isDark }: CardProps) {
  const colorMap = {
    info: { main: '#3B82F6', bg: isDark ? '#1E3A8A' : '#EFF6FF' },
    warning: { main: '#F59E0B', bg: isDark ? '#78350F' : '#FEF3C7' },
    success: { main: '#10B981', bg: isDark ? '#064E3B' : '#F0FDF4' },
    error: { main: '#EF4444', bg: isDark ? '#7F1D1D' : '#FEE2E2' },
  };
  const colors = colorMap[type] || colorMap.info;

  return (
    <Box
      sx={{
        borderRadius: 2,
        backgroundColor: isDark ? '#1A1A1A' : '#F9FAFB',
        border: '1px solid',
        borderColor: isDark ? '#2A2A2A' : '#E5E7EB',
        overflow: 'hidden',
        my: 1.5,
      }}
    >
      <Box sx={{ display: 'flex' }}>
        {/* 左侧彩色竖条 */}
        <Box sx={{ width: 4, backgroundColor: colors.main, flexShrink: 0 }} />
        <Box sx={{ p: 2, flex: 1 }}>
          {title && (
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                color: colors.main,
                mb: 0.75,
                fontSize: 14,
              }}
            >
              {title}
            </Typography>
          )}
          <Box sx={{ fontSize: 14, lineHeight: 1.7, color: 'text.primary' }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

interface StepItem {
  title: string;
  description: string;
}

function StepsRenderer({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const steps = extractSteps(children);

  if (steps.length === 0) {
    return <Box sx={{ my: 1 }}>{children}</Box>;
  }

  return (
    <Box sx={{ my: 2 }}>
      <Stepper orientation="vertical" connector={<StepsConnector />}>
        {steps.map((step, index) => (
          <Step key={index} expanded active completed>
            <StepLabel
              StepIconComponent={() => (
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: isDark ? '#3B82F6' : '#2563EB',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </Box>
              )}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, fontSize: 14, color: 'text.primary' }}
              >
                {step.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.6 }}
              >
                {step.description}
              </Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}

function StepsConnector() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        width: 2,
        backgroundColor: isDark ? '#333333' : '#E5E7EB',
        ml: '13px',
        my: 0.5,
        minHeight: 24,
      }}
    />
  );
}

/** 从 children 中提取步骤数据（期望是 <p><strong>标题</strong>: 描述</p> 的结构） */
function extractSteps(children: React.ReactNode): StepItem[] {
  const steps: StepItem[] = [];
  const nodes = React.Children.toArray(children);

  for (const node of nodes) {
    if (typeof node === 'string') {
      const lines = node.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const match = line.match(/^\d+\.\s*\*\*(.+?)\*\*\s*[\:\-]?\s*(.*)$/);
        if (match) {
          steps.push({ title: match[1].trim(), description: match[2].trim() });
        } else {
          const simple = line.match(/^\d+\.\s*(.+)$/);
          if (simple) {
            steps.push({ title: simple[1].trim(), description: '' });
          }
        }
      }
    }
  }

  return steps;
}

interface TimelineItem {
  time: string;
  title: string;
  description: string;
}

function TimelineRenderer({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const items = extractTimelineItems(children);

  if (items.length === 0) {
    return <Box sx={{ my: 1 }}>{children}</Box>;
  }

  return (
    <Box sx={{ my: 2, position: 'relative' }}>
      {items.map((item, index) => (
        <Box key={index} sx={{ display: 'flex', mb: 2 }}>
          {/* 左侧时间轴 */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 2 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: isDark ? '#3B82F6' : '#2563EB',
                border: `2px solid ${isDark ? '#1A1A1A' : '#fff'}`,
                boxShadow: `0 0 0 2px ${isDark ? '#3B82F6' : '#2563EB'}`,
                flexShrink: 0,
              }}
            />
            {index < items.length - 1 && (
              <Box
                sx={{
                  width: 2,
                  flex: 1,
                  backgroundColor: isDark ? '#333333' : '#E5E7EB',
                  mt: 0.5,
                }}
              />
            )}
          </Box>
          {/* 右侧内容 */}
          <Box sx={{ pb: 1 }}>
            {item.time && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: 12,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  fontWeight: 500,
                  mb: 0.25,
                  display: 'block',
                }}
              >
                {item.time}
              </Typography>
            )}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, fontSize: 14, color: 'text.primary' }}
            >
              {item.title}
            </Typography>
            {item.description && (
              <Typography
                variant="body2"
                sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.6 }}
              >
                {item.description}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** 从 children 中提取时间线数据 */
function extractTimelineItems(children: React.ReactNode): TimelineItem[] {
  const items: TimelineItem[] = [];
  const nodes = React.Children.toArray(children);

  for (const node of nodes) {
    if (typeof node === 'string') {
      const lines = node.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        // 格式: **时间** | **标题** | 描述
        const match = line.match(
          /^\d+\.\s*(?:\*\*(.+?)\*\*\s*\|\s*)?\*\*(.+?)\*\*(?:\s*\|\s*(.*))?$/
        );
        if (match) {
          items.push({
            time: match[1]?.trim() || '',
            title: match[2].trim(),
            description: match[3]?.trim() || '',
          });
        } else {
          // 简化格式: **标题**: 描述
          const simple = line.match(/^\d+\.\s*\*\*(.+?)\*\*\s*[\:\-]?\s*(.*)$/);
          if (simple) {
            items.push({
              time: '',
              title: simple[1].trim(),
              description: simple[2].trim(),
            });
          }
        }
      }
    }
  }

  return items;
}

// ===================== 主渲染器 =====================

/**
 * Markdown 渲染器
 *
 * 特性：
 * - 完整 Markdown 支持（标题、列表、表格、粗体等）通过 react-markdown + remark-gfm
 * - 代码块自动语法高亮（prism-light + 常用语言）
 * - 内联代码样式
 * - 响应式图片/表格
 * - 根据 MUI theme.palette.mode 动态切换代码主题（light → oneLight，dark → vscDarkPlus）
 * - 自定义结构化语法：:::card、:::steps、:::timeline
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
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

  const processedContent = preprocessCustomDirectives(content);

  return (
    <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 自定义 HTML 标签映射（类型断言绕过 react-markdown 的强类型限制）
          'custom-card'({ node, ...props }: any) {
            const title = props.title || '';
            const type = (props.type as CardProps['type']) || 'info';
            return (
              <InfoCard title={title} type={type} isDark={isDark}>
                {props.children}
              </InfoCard>
            );
          },
          'custom-steps'({ node, ...props }: any) {
            return <StepsRenderer>{props.children}</StepsRenderer>;
          },
          'custom-timeline'({ node, ...props }: any) {
            return <TimelineRenderer>{props.children}</TimelineRenderer>;
          },
          // 显式声明为 any 以兼容自定义标签
          ...( {} as any),
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
                  style={isDark ? vscDarkPlus : oneLight}
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
                    navigator.clipboard.writeText(codeString);
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
          // 链接 — 外部 URL 渲染为 LinkPreview 卡片
          a({ children, href }) {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
            const isBareLink = children && String(children) === href;

            if (isExternal && isBareLink) {
              return (
                <Box sx={{ my: 1 }}>
                  <LinkPreview url={href} />
                </Box>
              );
            }

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
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
