import React from 'react';
import { Typography, Link } from '@mui/material';

/**
 * PlainTextRenderer - 纯文本渲染器
 *
 * 替代 MarkdownRenderer，用于渲染 AI 回复的纯文本内容。
 * 支持：
 * - 按双换行分段，保留段落结构
 * - 自动识别并链接 URL
 * - 保留换行符（white-space: pre-wrap）
 */
const PlainTextRenderer = React.memo<{ content: string }>(function PlainTextRenderer({ content }) {
  // 空内容不渲染（避免占用空间覆盖加载态）
  if (!content || !content.trim()) return null;

  // 按双换行分段，保留段落结构
  const paragraphs = content.split(/\n\n/);

  return (
    <>
      {paragraphs.map((para, idx) => (
        <Typography
          key={idx}
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            mb: paragraphs.length > 1 ? 1 : 0,
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          {para.split(/(\n)/).map((part, i) => {
            // URL 自动识别
            if (/^https?:\/\//.test(part)) {
              return (
                <Link
                  key={i}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: '#1976d2', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  {part}
                </Link>
              );
            }
            return <React.Fragment key={i}>{part}</React.Fragment>;
          })}
        </Typography>
      ))}
    </>
  );
});

export default PlainTextRenderer;
