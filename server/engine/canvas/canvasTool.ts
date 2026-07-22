/**
 * Canvas Agent 工具定义
 *
 * 移植自 openclaw/extensions/canvas/src/tool.ts，简化为不依赖 OpenClaw plugin-sdk
 * 的画布控制工具。支持创建和管理画布快照、从节点获取画布内容、
 * 保存为图片文件等动作。
 *
 * 设计上保留了 OpenClaw 版本的 action 枚举与参数结构，但将网关调用
 * 抽象为可注入的 listNodes / callGatewayTool 回调，便于在 cross-wms
 * 中替换为本地实现或 mock。
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AnyAgentTool,
  AgentToolResult,
  CanvasAction,
  CanvasGatewayOptions,
  CanvasNodeInfo,
  CanvasSnapshotFormat,
  CanvasSnapshotPayload,
  CanvasToolParams,
  CreateCanvasToolOptions,
} from "./types.js";
import {
  normalizeCanvasSnapshotFileExtension,
  parseCanvasSnapshotPayload,
} from "./types.js";

// ==================== 默认实现 ====================

/** 默认节点列表：无注入时返回空列表。 */
async function defaultListNodes(_opts: CanvasGatewayOptions): Promise<CanvasNodeInfo[]> {
  return [];
}

/** 默认网关调用：无注入时抛出未配置错误。 */
async function defaultCallGatewayTool(
  _command: string,
  _opts: CanvasGatewayOptions,
  _params: Record<string, unknown>,
): Promise<{ payload?: unknown }> {
  throw new Error(
    "Canvas gateway tool caller is not configured. Provide callGatewayTool in createCanvasTool options.",
  );
}

// ==================== 参数读取辅助 ====================

function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean; trim?: boolean; label?: string } = {},
): string | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null) {
    if (options.required) {
      throw new Error(`Missing required parameter: ${options.label ?? key}`);
    }
    return undefined;
  }
  const value = String(raw);
  return options.trim === false ? value : value.trim();
}

function readNumberParam(
  params: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null) return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (options.min !== undefined && num < options.min) return undefined;
  if (options.max !== undefined && num > options.max) return undefined;
  return num;
}

function readPositiveIntegerParam(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null) return undefined;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return undefined;
  return num;
}

function readGatewayCallOptions(params: Record<string, unknown>): CanvasGatewayOptions {
  return {
    gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
    gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
    timeoutMs: readPositiveIntegerParam(params, "timeoutMs"),
  };
}

// ==================== 节点解析 ====================

async function resolveNodeId(
  listNodes: CreateCanvasToolOptions["listNodes"],
  opts: CanvasGatewayOptions,
  query?: string,
  allowDefault = false,
): Promise<string> {
  const nodes = await (listNodes ?? defaultListNodes)(opts);
  if (nodes.length === 0) {
    if (allowDefault) return "";
    throw new Error("No canvas nodes available");
  }
  if (!query) {
    if (allowDefault) return nodes[0]?.id ?? "";
    throw new Error("node parameter is required when multiple nodes are available");
  }
  const trimmed = query.trim();
  const exact = nodes.find((n) => n.id === trimmed);
  if (exact) return exact.id;
  const byLabel = nodes.find(
    (n) => n.label && n.label.toLowerCase().includes(trimmed.toLowerCase()),
  );
  if (byLabel) return byLabel.id;
  if (allowDefault) return nodes[0]?.id ?? "";
  throw new Error(`No canvas node matched: ${query}`);
}

// ==================== 文件写入 ====================

async function writeBase64ToTempFile(params: {
  base64: string;
  ext: string;
  snapshotDir?: string;
}): Promise<string> {
  const dir = params.snapshotDir || path.join(process.cwd(), ".cross-wms", "canvas");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const ext = `.${normalizeCanvasSnapshotFileExtension(params.ext)}`;
  const filePath = path.join(dir, `canvas-snapshot-${randomUUID()}${ext}`);
  await fs.writeFile(filePath, Buffer.from(params.base64, "base64"));
  return filePath;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function readJsonlFromPath(
  jsonlPath: string,
  workspaceDir?: string,
): Promise<string> {
  const trimmed = jsonlPath.trim();
  if (!trimmed) return "";
  const workspaceRoot = path.resolve(workspaceDir ?? process.cwd());
  const resolved = path.resolve(workspaceRoot, trimmed);
  const [workspaceReal, resolvedReal] = await Promise.all([
    fs.realpath(workspaceRoot).catch(() => workspaceRoot),
    fs.realpath(resolved).catch(() => resolved),
  ]);
  if (!isPathInsideRoot(workspaceReal, resolvedReal)) {
    throw new Error("jsonlPath outside workspace");
  }
  return await fs.readFile(resolvedReal, "utf8");
}

// ==================== JSON 结果辅助 ====================

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    details: payload as Record<string, unknown>,
  };
}

function imageResult(params: {
  label: string;
  path: string;
  format: CanvasSnapshotFormat;
}): AgentToolResult {
  const mimeType = params.format === "jpeg" ? "image/jpeg" : "image/png";
  return {
    content: [
      { type: "text", text: `${params.label} saved to: ${params.path}` },
    ],
    details: {
      path: params.path,
      format: params.format,
      mimeType,
    },
  };
}

// ==================== 工具创建 ====================

const CanvasToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["present", "hide", "navigate", "eval", "snapshot", "a2ui_push", "a2ui_reset"],
      description: "Canvas action to perform.",
    },
    node: {
      type: "string",
      description: "Target node id or label query. Defaults to the first available node.",
    },
    url: { type: "string", description: "URL to present or navigate to." },
    target: { type: "string", description: "Alias for url." },
    x: { type: "number", description: "Canvas placement x coordinate." },
    y: { type: "number", description: "Canvas placement y coordinate." },
    width: { type: "number", description: "Canvas placement width." },
    height: { type: "number", description: "Canvas placement height." },
    javaScript: { type: "string", description: "JavaScript to evaluate in the canvas." },
    outputFormat: {
      type: "string",
      enum: ["png", "jpeg"],
      description: "Snapshot image format. Defaults to png.",
    },
    maxWidth: { type: "number", description: "Maximum snapshot width in pixels." },
    quality: {
      type: "number",
      description: "Snapshot quality (0-1) for jpeg format.",
      minimum: 0,
      maximum: 1,
    },
    jsonl: { type: "string", description: "A2UI JSONL content to push." },
    jsonlPath: { type: "string", description: "Path to a JSONL file within the workspace." },
    gatewayUrl: { type: "string", description: "Optional gateway URL override." },
    gatewayToken: { type: "string", description: "Optional gateway token override." },
    timeoutMs: { type: "number", description: "Optional gateway call timeout in milliseconds." },
  },
  required: ["action"],
};

/** 创建 Canvas Agent 工具。 */
export function createCanvasTool(options: CreateCanvasToolOptions = {}): AnyAgentTool {
  const listNodes = options.listNodes ?? defaultListNodes;
  const callGatewayTool = options.callGatewayTool ?? defaultCallGatewayTool;

  return {
    label: "Canvas",
    name: "canvas",
    description:
      "Control node canvases (present/hide/navigate/eval/snapshot/A2UI). Use snapshot to capture the rendered UI and save it as an image file.",
    parameters: CanvasToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as CanvasAction;
      const gatewayOpts = readGatewayCallOptions(params);

      const nodeId = await resolveNodeId(
        listNodes,
        gatewayOpts,
        readStringParam(params, "node", { trim: true }),
        true,
      );

      const invoke = async (command: string, invokeParams?: Record<string, unknown>) =>
        callGatewayTool("node.invoke", gatewayOpts, {
          ...(nodeId ? { nodeId } : {}),
          command,
          params: invokeParams ?? {},
          idempotencyKey: randomUUID(),
        });

      switch (action) {
        case "present": {
          const placement = {
            x: readNumberParam(params, "x"),
            y: readNumberParam(params, "y"),
            width: readNumberParam(params, "width"),
            height: readNumberParam(params, "height"),
          };
          const invokeParams: Record<string, unknown> = {};
          const presentTarget =
            readStringParam(params, "target", { trim: true }) ??
            readStringParam(params, "url", { trim: true });
          if (presentTarget) {
            invokeParams.url = presentTarget;
          }
          if (
            Number.isFinite(placement.x) ||
            Number.isFinite(placement.y) ||
            Number.isFinite(placement.width) ||
            Number.isFinite(placement.height)
          ) {
            invokeParams.placement = placement;
          }
          await invoke("canvas.present", invokeParams);
          return jsonResult({ ok: true, action: "present" });
        }
        case "hide":
          await invoke("canvas.hide", undefined);
          return jsonResult({ ok: true, action: "hide" });
        case "navigate": {
          const url =
            readStringParam(params, "url", { trim: true }) ??
            readStringParam(params, "target", {
              required: true,
              trim: true,
              label: "url",
            })!;
          await invoke("canvas.navigate", { url });
          return jsonResult({ ok: true, action: "navigate", url });
        }
        case "eval": {
          const javaScript = readStringParam(params, "javaScript", { required: true })!;
          const raw = await invoke("canvas.eval", { javaScript });
          const result = (raw as { payload?: { result?: string } })?.payload?.result;
          if (result) {
            return {
              content: [{ type: "text", text: result }],
              details: { result },
            };
          }
          return jsonResult({ ok: true, action: "eval" });
        }
        case "snapshot": {
          const formatRaw =
            typeof params.outputFormat === "string" && params.outputFormat.trim()
              ? params.outputFormat.trim().toLowerCase()
              : "png";
          const format: CanvasSnapshotFormat =
            formatRaw === "jpg" || formatRaw === "jpeg" ? "jpeg" : "png";
          const maxWidth = readPositiveIntegerParam(params, "maxWidth");
          const quality = readNumberParam(params, "quality", { min: 0, max: 1 });
          const raw = await invoke("canvas.snapshot", {
            format,
            maxWidth,
            quality,
          });
          const payload = parseCanvasSnapshotPayload(raw);
          const filePath = await writeBase64ToTempFile({
            base64: payload.base64,
            ext: payload.format === "jpeg" ? "jpg" : payload.format,
            snapshotDir: options.snapshotDir,
          });
          return imageResult({ label: "canvas:snapshot", path: filePath, format: payload.format });
        }
        case "a2ui_push": {
          const jsonl =
            typeof params.jsonl === "string" && params.jsonl.trim()
              ? params.jsonl
              : typeof params.jsonlPath === "string" && params.jsonlPath.trim()
                ? await readJsonlFromPath(params.jsonlPath, options.workspaceDir)
                : "";
          if (!jsonl.trim()) {
            throw new Error("jsonl or jsonlPath required for a2ui_push action");
          }
          await invoke("canvas.a2ui.pushJSONL", { jsonl });
          return jsonResult({ ok: true, action: "a2ui_push" });
        }
        case "a2ui_reset":
          await invoke("canvas.a2ui.reset", undefined);
          return jsonResult({ ok: true, action: "a2ui_reset" });
        default:
          throw new Error(`Unknown canvas action: ${action}`);
      }
    },
  };
}

/** 从节点获取画布快照内容并返回 base64 载荷。 */
export async function fetchCanvasSnapshotFromNode(params: {
  nodeId: string;
  format?: CanvasSnapshotFormat;
  maxWidth?: number;
  quality?: number;
  callGatewayTool: CreateCanvasToolOptions["callGatewayTool"];
  gatewayOpts?: CanvasGatewayOptions;
}): Promise<CanvasSnapshotPayload> {
  const callGatewayTool = params.callGatewayTool ?? defaultCallGatewayTool;
  const format: CanvasSnapshotFormat = params.format ?? "png";
  const raw = await callGatewayTool("node.invoke", params.gatewayOpts ?? {}, {
    nodeId: params.nodeId,
    command: "canvas.snapshot",
    params: {
      format,
      maxWidth: params.maxWidth,
      quality: params.quality,
    },
    idempotencyKey: randomUUID(),
  });
  return parseCanvasSnapshotPayload(raw);
}

/** 将快照载荷保存为图片文件。 */
export async function saveCanvasSnapshotToFile(params: {
  payload: CanvasSnapshotPayload;
  snapshotDir?: string;
  filePath?: string;
}): Promise<string> {
  const outputPath =
    params.filePath ??
    (await writeBase64ToTempFile({
      base64: params.payload.base64,
      ext: params.payload.format === "jpeg" ? "jpg" : params.payload.format,
      snapshotDir: params.snapshotDir,
    }));
  if (params.filePath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(params.payload.base64, "base64"));
  }
  return outputPath;
}
