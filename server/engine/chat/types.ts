/**
 * Chat 可视化类型定义
 *
 * 定义聊天画布渲染、工具调用内容呈现等相关类型。
 */

export type CanvasSurface = 'assistant_message' | 'user_message' | 'sidebar';

export type CanvasRenderType = 'url' | 'html' | 'image';

export type CanvasPreview = {
  kind: 'canvas';
  surface: CanvasSurface;
  render: CanvasRenderType;
  title?: string;
  preferredHeight?: number;
  url?: string;
  viewId?: string;
  className?: string;
  style?: string;
};

export type ToolContentBlock = Record<string, any> & {
  id?: any;
  tool_call_id?: any;
  toolCallId?: any;
  tool_use_id?: any;
  toolUseId?: any;
  type?: any;
  name?: any;
  args?: any;
  arguments?: any;
  input?: any;
  content?: any;
};

export type ToolCallContent = {
  id?: string;
  name?: string;
  args?: any;
  inputSchema?: Record<string, any>;
};

export type ToolResultContent = {
  toolCallId?: string;
  content: any;
  isError?: boolean;
};

export type ChatVisualizationOptions = {
  enableCanvas?: boolean;
  enableToolCards?: boolean;
  enableMarkdown?: boolean;
  maxCanvasHeight?: number;
  minCanvasHeight?: number;
};

export type ChatRenderResult = {
  text: string;
  canvases: CanvasPreview[];
  toolCalls: ToolCallContent[];
  toolResults: ToolResultContent[];
};
