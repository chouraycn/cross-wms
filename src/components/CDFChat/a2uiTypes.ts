/**
 * A2UI (Agent-to-UI) 类型定义
 *
 * Agent 通过输出特定的 JSON/Markdown 格式，动态在画布上渲染 UI 组件。
 */

// ===================== 基础组件类型 =====================

export type A2UIComponentType =
  | 'text'
  | 'heading'
  | 'list'
  | 'table'
  | 'card'
  | 'button'
  | 'input'
  | 'progress'
  | 'chart'
  | 'image'
  | 'code'
  | 'divider'
  | 'tabs'
  | 'alert';

export type A2UILayoutType = 'row' | 'column' | 'grid';

export type A2UIAlertType = 'success' | 'warning' | 'error' | 'info';

export type A2UIChartType = 'bar' | 'line';

export type A2UIListType = 'ordered' | 'unordered';

export type A2UIInputType = 'text' | 'number' | 'password' | 'email' | 'textarea';

// ===================== 事件类型 =====================

export interface A2UIEvent {
  type: string;
  componentId: string;
  payload?: Record<string, unknown>;
}

export type A2UIEventHandler = (event: A2UIEvent) => void;

// ===================== 基础组件 Props =====================

export interface A2UIComponentBase {
  id: string;
  type: A2UIComponentType;
  className?: string;
  style?: React.CSSProperties;
}

export interface A2UITextComponent extends A2UIComponentBase {
  type: 'text';
  content: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface A2UIHeadingComponent extends A2UIComponentBase {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: string;
}

export interface A2UIListComponent extends A2UIComponentBase {
  type: 'list';
  listType?: A2UIListType;
  items: string[];
}

export interface A2UITableComponent extends A2UIComponentBase {
  type: 'table';
  headers: string[];
  rows: (string | number)[][];
}

export interface A2UICardComponent extends A2UIComponentBase {
  type: 'card';
  title?: string;
  description?: string;
  children?: A2UIComponent[];
  onClick?: { action: string; payload?: Record<string, unknown> };
}

export interface A2UIButtonComponent extends A2UIComponentBase {
  type: 'button';
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick: { action: string; payload?: Record<string, unknown> };
}

export interface A2UIInputComponent extends A2UIComponentBase {
  type: 'input';
  inputType?: A2UIInputType;
  placeholder?: string;
  value?: string;
  label?: string;
  onChange?: { action: string; payload?: Record<string, unknown> };
  onSubmit?: { action: string; payload?: Record<string, unknown> };
}

export interface A2UIProgressComponent extends A2UIComponentBase {
  type: 'progress';
  value: number;
  max?: number;
  showLabel?: boolean;
  label?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export interface A2UIChartComponent extends A2UIComponentBase {
  type: 'chart';
  chartType: A2UIChartType;
  title?: string;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color?: string;
  }[];
  width?: number;
  height?: number;
}

export interface A2UIImageComponent extends A2UIComponentBase {
  type: 'image';
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  rounded?: boolean;
}

export interface A2UICodeComponent extends A2UIComponentBase {
  type: 'code';
  language?: string;
  content: string;
  showLineNumbers?: boolean;
}

export interface A2UIDividerComponent extends A2UIComponentBase {
  type: 'divider';
  orientation?: 'horizontal' | 'vertical';
}

export interface A2UITabsComponent extends A2UIComponentBase {
  type: 'tabs';
  tabs: {
    key: string;
    label: string;
    children: A2UIComponent[];
  }[];
  defaultActiveKey?: string;
}

export interface A2UIAlertComponent extends A2UIComponentBase {
  type: 'alert';
  alertType: A2UIAlertType;
  title?: string;
  message: string;
  closable?: boolean;
}

export type A2UIComponent =
  | A2UITextComponent
  | A2UIHeadingComponent
  | A2UIListComponent
  | A2UITableComponent
  | A2UICardComponent
  | A2UIButtonComponent
  | A2UIInputComponent
  | A2UIProgressComponent
  | A2UIChartComponent
  | A2UIImageComponent
  | A2UICodeComponent
  | A2UIDividerComponent
  | A2UITabsComponent
  | A2UIAlertComponent;

// ===================== 布局组件 =====================

export interface A2UILayoutBase {
  id: string;
  type: A2UILayoutType;
  className?: string;
  style?: React.CSSProperties;
  children: (A2UIComponent | A2UILayout)[];
}

export interface A2UIRowLayout extends A2UILayoutBase {
  type: 'row';
  gap?: number | string;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
}

export interface A2UIColumnLayout extends A2UILayoutBase {
  type: 'column';
  gap?: number | string;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
}

export interface A2UIGridLayout extends A2UILayoutBase {
  type: 'grid';
  columns?: number;
  gap?: number | string;
  rowGap?: number | string;
  columnGap?: number | string;
}

export type A2UILayout = A2UIRowLayout | A2UIColumnLayout | A2UIGridLayout;

// ===================== 画布状态 =====================

export type A2UICanvasStatus = 'idle' | 'loading' | 'rendering' | 'error';

export interface A2UICanvasState {
  id: string;
  title: string;
  content: A2UIComponent | A2UILayout | null;
  status: A2UICanvasStatus;
  error?: string;
  updatedAt: number;
}

// ===================== 解析器相关 =====================

export interface A2UIParseResult {
  success: boolean;
  content: A2UIComponent | A2UILayout | null;
  error?: string;
}

export interface A2UIParseOptions {
  strict?: boolean;
  validateSchema?: boolean;
}

// ===================== 组件 Props =====================

export interface A2UIRendererProps {
  a2uiContent: string;
  onEvent?: A2UIEventHandler;
  darkMode?: boolean;
}

export interface A2UICanvasProps {
  canvases: A2UICanvasState[];
  activeCanvasId: string;
  isOpen: boolean;
  darkMode?: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onCanvasChange: (canvasId: string) => void;
  onEvent?: A2UIEventHandler;
  isMaximized?: boolean;
}
