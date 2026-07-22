/**
 * Canvas 工具入口
 *
 * 移植自 openclaw/extensions/canvas，提供节点画布控制能力：
 *   - 支持创建和管理画布快照（snapshot）
 *   - 支持从节点获取画布内容
 *   - 支持保存为图片文件（png / jpeg）
 *   - 支持 present / hide / navigate / eval / A2UI push / A2UI reset 动作
 *
 * 网关调用通过可注入的 listNodes / callGatewayTool 回调抽象，
 * 便于在 cross-wms 中接入本地实现或测试 mock。
 */
export {
  normalizeCanvasSnapshotFileExtension,
  parseCanvasSnapshotPayload,
} from "./types.js";
export type {
  AnyAgentTool,
  AgentToolResult,
  CanvasAction,
  CanvasGatewayOptions,
  CanvasNodeInfo,
  CanvasPlacement,
  CanvasSnapshotFormat,
  CanvasSnapshotPayload,
  CanvasToolParams,
  CreateCanvasToolOptions,
} from "./types.js";

export {
  createCanvasTool,
  fetchCanvasSnapshotFromNode,
  saveCanvasSnapshotToFile,
} from "./canvasTool.js";
