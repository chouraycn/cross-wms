/**
 * CDFChat 主容器组件（轻量版）
 *
 * 四层对话架构 — 第3层：前端组件主入口
 *
 * 适配新版轻量组件（无 MUI 依赖）。
 * ChatThread 已内置 useChatV2 + 输入区域，
 * CDFChatContainer 作为外层包装，提供 props 透传。
 */
import React, { memo } from 'react';
import ChatThread from './ChatThread.js';

interface CDFChatContainerProps {
  /** API 端点（默认 /api/chat/stream） */
  apiEndpoint?: string;
  /** 初始模型 */
  defaultModel?: string;
  /** 是否显示底部元数据（模型名、耗时、Token） */
  showMeta?: boolean;
  /** 空状态提示文字 */
  emptyText?: string;
  /** 输入框占位符 */
  placeholder?: string;
  /** 是否深色模式 */
  darkMode?: boolean;
}

export const CDFChatContainer: React.FC<CDFChatContainerProps> = memo(function CDFChatContainer({
  apiEndpoint = '/api/chat/stream',
  defaultModel = '',
  placeholder = '输入您的问题...',
  darkMode = false,
}) {
  return (
    <ChatThread
      apiEndpoint={apiEndpoint}
      defaultModel={defaultModel}
      placeholder={placeholder}
      darkMode={darkMode}
    />
  );
});
