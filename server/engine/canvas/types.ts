/**
 * Canvas 工具类型定义
 *
 * 移植自 openclaw/extensions/canvas/src/tool.ts，简化为 cross-wms
 * 所需的画布快照与节点交互类型，不依赖 OpenClaw plugin-sdk。
 */

/** 画布快照格式 */
export type CanvasSnapshotFormat = "png" | "jpeg";

/** 画布动作类型，覆盖展示/隐藏/导航/求值/快照 */
export type CanvasAction =
  | "present"
  | "hide"
  | "navigate"
  | "eval"
  | "snapshot"
  | "a2ui_push"
  | "a2ui_reset";

/** 画布展示位置 */
export interface CanvasPlacement {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** 快照返回的载荷 */
export interface CanvasSnapshotPayload {
  format: CanvasSnapshotFormat;
  base64: string;
  width?: number;
  height?: number;
}

/** 节点信息 */
export interface CanvasNodeInfo {
  id: string;
  label?: string;
  status?: string;
}

/** 网关调用选项 */
export interface CanvasGatewayOptions {
  gatewayUrl?: string;
  gatewayToken?: string;
  timeoutMs?: number;
}

/** 工具参数（与 parameters schema 对应） */
export interface CanvasToolParams {
  action: CanvasAction;
  node?: string;
  /** present/navigate 用 */
  url?: string;
  target?: string;
  /** present 用 */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** eval 用 */
  javaScript?: string;
  /** snapshot 用 */
  outputFormat?: CanvasSnapshotFormat | string;
  maxWidth?: number;
  quality?: number;
  /** a2ui_push 用 */
  jsonl?: string;
  jsonlPath?: string;
  /** 网关调用 */
  gatewayUrl?: string;
  gatewayToken?: string;
  timeoutMs?: number;
}

/** 简化的 Agent 工具类型，参考 server/engine/agents/message-tool.ts 的本地 AnyAgentTool */
export type AnyAgentTool = {
  label?: string;
  name: string;
  description: string;
  parameters?: unknown;
  execute?: (
    toolCallId: string,
    args: unknown,
    signal?: AbortSignal,
  ) => Promise<AgentToolResult>;
};

export interface AgentToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  details?: Record<string, unknown>;
}

/** Canvas 工具选项 */
export interface CreateCanvasToolOptions {
  /** 工作区目录，用于解析 jsonlPath */
  workspaceDir?: string;
  /** 默认快照输出目录 */
  snapshotDir?: string;
  /** 节点列表提供者，用于按 query 解析节点 ID */
  listNodes?: (opts: CanvasGatewayOptions) => Promise<CanvasNodeInfo[]>;
  /** 网关工具调用者 */
  callGatewayTool?: (
    command: string,
    opts: CanvasGatewayOptions,
    params: Record<string, unknown>,
  ) => Promise<{ payload?: unknown }>;
}

/** 规范化快照文件扩展名 */
export function normalizeCanvasSnapshotFileExtension(ext: string): string {
  const lower = ext.toLowerCase().replace(/^\.+/, "");
  if (lower === "jpg" || lower === "jpeg") return "jpg";
  if (lower === "png") return "png";
  return "png";
}

/** 解析节点快照载荷：支持 {base64, format} 与 {payload:{base64,format}} 两种结构 */
export function parseCanvasSnapshotPayload(raw: unknown): CanvasSnapshotPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid canvas snapshot payload");
  }
  const record = raw as Record<string, unknown>;
  const nested = record.payload;
  const source =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;
  const formatRaw = String(source.format ?? "png").toLowerCase();
  const format: CanvasSnapshotFormat = formatRaw === "jpeg" || formatRaw === "jpg" ? "jpeg" : "png";
  const base64 = String(source.base64 ?? "");
  if (!base64) {
    throw new Error("Canvas snapshot payload missing base64 data");
  }
  return {
    format,
    base64,
    ...(typeof source.width === "number" ? { width: source.width } : {}),
    ...(typeof source.height === "number" ? { height: source.height } : {}),
  };
}
