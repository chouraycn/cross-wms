/**
 * 引用芯片渲染器 — 将用户消息中的 @技能名 / #关键词 渲染为 inline chip
 *
 * 受 DeepSeek Harness 的 MessageItem .refChip 启发：
 * 用户消息内出现的引用标记自动变为带背景色的胶囊芯片，提升可读性。
 */

import React from 'react';
import { Box } from '@mui/material';

/** 匹配 @技能名 或 #关键词 的正则 */
const REF_CHIP_RE = /(@[\w\u4e00-\u9fa5\-]+|#[\w\u4e00-\u9fa5\-]+)/g;

interface Segment {
  type: 'text' | 'chip';
  content: string;
}

/** 将文本拆分为普通文本段和引用芯片段 */
function parseRefChips(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  REF_CHIP_RE.lastIndex = 0;
  while ((match = REF_CHIP_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'chip', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/** 引用芯片样式：浅蓝背景胶囊 */
const chipStyle: React.CSSProperties = {
  display: 'inline-block',
  margin: '0 2px',
  padding: '1px 8px',
  borderRadius: '6px',
  backgroundColor: 'rgba(59, 130, 246, 0.12)',
  color: '#2563EB',
  fontSize: '0.85em',
  fontWeight: 500,
  lineHeight: 1.6,
  whiteSpace: 'nowrap',
  verticalAlign: 'baseline',
};

/**
 * 渲染带有引用芯片的文本内容
 * 将 @技能名 和 #关键词 自动转换为内联芯片
 */
export const RefChipRenderer: React.FC<{ content: string }> = React.memo(function RefChipRenderer({ content }) {
  const segments = parseRefChips(content);

  if (segments.length === 0) {
    return <>{content}</>;
  }

  // 如果没有芯片，直接返回原文（避免不必要的 span 包裹）
  const hasChip = segments.some(s => s.type === 'chip');
  if (!hasChip) {
    return <>{content}</>;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'chip' ? (
          <Box key={i} component="span" sx={chipStyle}>
            {seg.content}
          </Box>
        ) : (
          <React.Fragment key={i}>{seg.content}</React.Fragment>
        ),
      )}
    </>
  );
});

export default RefChipRenderer;
