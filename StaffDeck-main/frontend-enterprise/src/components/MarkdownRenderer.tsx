import { renderMarkdownBlocks } from '@/pages/chat/chatHelpers';

import { cn } from '@/lib/utils';

export interface MarkdownRendererProps {
  /** Markdown 源字符串 */
  markdown: string;
  /** 附加到外层容器的 className */
  className?: string;
  /** 是否保留源码中的换行（默认 true，知识库/文档预览常用） */
  preserveLineBreaks?: boolean;
}

/**
 * 共享的 Markdown 渲染组件。
 * 底层复用 chatHelpers 的 renderMarkdownBlocks（全仓唯一的 Markdown 渲染实现），
 * 供技能/知识库等非聊天页面统一调用，避免各页面内联重复渲染逻辑。
 */
export function MarkdownRenderer({ markdown, className, preserveLineBreaks = true }: MarkdownRendererProps) {
  return <div className={cn(className)}>{renderMarkdownBlocks(markdown, preserveLineBreaks)}</div>;
}
