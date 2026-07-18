/**
 * Chat 可视化模块 - Barrel 导出
 *
 * 汇总聊天画布渲染、工具调用内容呈现等功能。
 */

// 类型定义
export type {
  CanvasSurface,
  CanvasRenderType,
  CanvasPreview,
  ToolContentBlock,
  ToolCallContent,
  ToolResultContent,
  ChatVisualizationOptions,
  ChatRenderResult,
} from './types.js';

// 工具调用内容
export {
  isToolCallContentType,
  isToolResultContentType,
  isToolCallBlock,
  isToolResultBlock,
  resolveToolBlockArgs,
  resolveToolUseId,
  extractToolCall,
  extractToolResult,
  extractToolCalls,
  extractToolResults,
  formatToolCall,
  formatToolResult,
} from './tool-content.js';

// 画布渲染
export {
  extractCanvasFromText,
  extractCanvasShortcodes,
  renderCanvases,
} from './canvas-render.js';
