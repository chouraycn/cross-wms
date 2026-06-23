/**
 * CDFChat 导出入口
 *
 * 四层对话架构 — 第3-4层：前端组件 + 主题样式
 *
 * 用法：
 * ```tsx
 * import { ChatThread, MessageBubble, ToolCard, useChatV2 } from './components/CDFChat';
 * import './components/CDFChat/styles.css';
 * ```
 */
export { default as MessageBubble } from './MessageBubble.js';
export { default as ToolCard } from './ToolCard.js';
export { default as ChatThread } from './ChatThread.js';
export { useChatV2 } from './useChatV2.js';
