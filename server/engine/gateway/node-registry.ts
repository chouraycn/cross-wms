// Gateway node 注册表。
// 跟踪已连接 node 客户端、invoke 请求、广播与 system.run 审批。
// 移植自 openclaw/src/gateway/node-registry.ts。
// 依赖调整：
//  - node:crypto randomUUID → 直接使用 Node 内建
//  - @openclaw/normalization-core/number-coercion 的 addTimerTimeoutGraceMs、resolveTimerTimeoutMs
//    → 本地内联实现（cross-wms number-coercion.ts 未导出这两个函数）；
//    isFutureDateTimestampMs、resolveExpiresAtMsFromDurationMs 来自 ../infra/number-coercion.js
//  - ../logging/diagnostic-payload.js 的 logRejectedLargePayload
//    → 本地降级实现（cross-wms logging/diagnostic/diagnostic-payload.ts 未导出该函数）
//  - ./server-constants.js 的 MAX_BUFFERED_BYTES 已存在
//  - ./server/ws-types.js 的 GatewayWsClient 为 unknown stub
//    → 本地定义结构化 GatewayWsClient 类型以支持注册表逻辑编译
import { randomUUID } from "node:crypto";
import {
  isFutureDateTimestampMs,
  resolveExpiresAtMsFromDurationMs,
  clampTimerTimeoutMs,
  MAX_TIMER_TIMEOUT_MS,
} from "../infra/number-coercion.js";
import { logger } from "../../logger.js";
import { MAX_BUFFERED_BYTES } from "./server-constants.js";

// ============================================================================
// 本地 GatewayWsClient 结构化类型
// cross-wms 的 gateway/server/ws-types.ts 将 GatewayWsClient 降级为 unknown。
// 这里按 node-registry 实际访问的字段定义本地结构化类型，使注册表逻辑可编译。
// ============================================================================

/** Node 连接握手时上报的客户端信息。 */
type GatewayWsConnect = {
  device?: { id?: string };
  client: {
    id?: string;
    mode?: string;
    displayName?: string;
    platform?: string;
    version?: string;
    deviceFamily?: string;
    modelIdentifier?: string;
  };
  caps?: string[];
  declaredCaps?: string[];
  commands?: string[];
  declaredCommands?: string[];
  permissions?: Record<string, boolean>;
  declaredPermissions?: Record<string, boolean>;
  pathEnv?: string;
  coreVersion?: string;
  uiVersion?: string;
};

/** WebSocket socket 的最小可用接口。 */
type GatewayWsSocket = {
  bufferedAmount?: number;
  readyState?: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

/** 已连接的 Gateway websocket 客户端。 */
export type GatewayWsClient = {
  connId: string;
  connect: GatewayWsConnect;
  socket: GatewayWsSocket;
};

/** 已连接 node 会话，通过 Gateway websocket 上报。 */
export type NodeSession = {
  nodeId: string;
  connId: string;
  client: GatewayWsClient;
  clientId?: string;
  clientMode?: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  declaredCaps: string[];
  caps: string[];
  declaredCommands: string[];
  commands: string[];
  declaredPermissions?: Record<string, boolean>;
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  connectedAtMs: number;
};

/** 等待 node.invoke.response 的挂起 invoke。 */
type PendingInvoke = {
  nodeId: string;
  connId: string;
  command: string;
  systemRunEvent?: PendingSystemRunEvent;
  resolve: (value: NodeInvokeResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** 等待 node 事件时记录的 system.run 元数据。 */
type PendingSystemRunEvent = {
  runId: string;
  sessionKey?: string;
  timeoutMs?: number | null;
};

/** 绑定到单个 node 连接的已授权 system.run 事件窗口。 */
type AuthorizedSystemRunEvent = PendingSystemRunEvent & {
  nodeId: string;
  connId: string;
  expiresAtMs: number | null;
};

/** node.invoke 返回的结果载荷。 */
type NodeInvokeResult = {
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
};

/** 已注册 node 的连接探测结果。 */
type NodeConnectivityResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

/** 连接探测使用的最小 websocket ping/pong 接口。 */
type PingableSocket = {
  readyState?: number;
  ping?: (data?: Buffer, mask?: boolean, cb?: (err?: Error) => void) => void;
  once?: (event: "pong" | "close" | "error", listener: (...args: unknown[]) => void) => unknown;
  off?: (event: "pong" | "close" | "error", listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (
    event: "pong" | "close" | "error",
    listener: (...args: unknown[]) => void,
  ) => unknown;
};

const SERIALIZED_EVENT_PAYLOAD = Symbol("openclaw.serializedEventPayload");
const AUTHORIZED_SYSTEM_RUN_EVENT_GRACE_MS = 5 * 60 * 1000;
const WEBSOCKET_OPEN_READY_STATE = 1;
const SLOW_CONSUMER_CLOSE_CODE = 1008;

export type SerializedEventPayload = {
  readonly json: string;
  readonly [SERIALIZED_EVENT_PAYLOAD]: true;
};

/** 序列化事件载荷一次，使扇出可复用同一 JSON 字符串。 */
export function serializeEventPayload(payload: unknown): SerializedEventPayload | null {
  if (payload === undefined) {
    return null;
  }
  const json = JSON.stringify(payload);
  return typeof json === "string" ? { json, [SERIALIZED_EVENT_PAYLOAD]: true } : null;
}

/** 收窄由 serializeEventPayload 创建的值。 */
function isSerializedEventPayload(value: unknown): value is SerializedEventPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [SERIALIZED_EVENT_PAYLOAD]?: unknown })[SERIALIZED_EVENT_PAYLOAD] === true &&
    typeof (value as { json?: unknown }).json === "string"
  );
}

/** 规范化可选的字符串型 websocket 字段。 */
function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// 本地内联实现：将超时值钳制到 Node 安全定时器范围，支持默认值与最小值。
// 替代 @openclaw/normalization-core/number-coercion 的 resolveTimerTimeoutMs。
function resolveTimerTimeoutMs(
  timeoutMs: number | undefined,
  defaultMs: number,
  minMs: number = 0,
): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
    return Math.min(Math.max(Math.floor(defaultMs), Math.max(1, minMs)), MAX_TIMER_TIMEOUT_MS);
  }
  const clamped = clampTimerTimeoutMs(timeoutMs, Math.max(1, minMs));
  return clamped ?? Math.min(Math.max(Math.floor(defaultMs), Math.max(1, minMs)), MAX_TIMER_TIMEOUT_MS);
}

// 本地内联实现：为超时值追加宽限期，钳制到安全范围。
// 替代 @openclaw/normalization-core/number-coercion 的 addTimerTimeoutGraceMs。
function addTimerTimeoutGraceMs(timeoutMs: number, graceMs: number): number {
  const base = Math.max(0, Math.floor(timeoutMs));
  const grace = Math.max(0, Math.floor(graceMs));
  return Math.min(base + grace, MAX_TIMER_TIMEOUT_MS);
}

// 本地降级实现：记录被拒绝的大载荷。
// 替代 openclaw ../logging/diagnostic-payload.js 的 logRejectedLargePayload。
function logRejectedLargePayload(params: {
  surface: string;
  bytes: number;
  limitBytes: number;
  reason: string;
}): void {
  logger.warn(
    `[Gateway] rejected large payload: surface=${params.surface} bytes=${params.bytes} ` +
      `limit=${params.limitBytes} reason=${params.reason}`,
  );
}

/** 规范化 system.run 超时值，保留 null 表示无过期。 */
function normalizeSystemRunTimeoutMs(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const timeoutMs = Math.trunc(value);
  return timeoutMs > 0 ? resolveTimerTimeoutMs(timeoutMs, 1) : null;
}

/** 从 invoke 参数提取 system.run 事件鉴权元数据。 */
function resolvePendingSystemRunEvent(params: {
  command: string;
  params?: unknown;
}): PendingSystemRunEvent | undefined {
  if (params.command !== "system.run" || !params.params || typeof params.params !== "object") {
    return undefined;
  }
  const obj = params.params as Record<string, unknown>;
  const runId = normalizeString(obj.runId);
  if (!runId) {
    return undefined;
  }
  const timeoutMs = normalizeSystemRunTimeoutMs(obj.timeoutMs);
  const sessionKey = normalizeString(obj.sessionKey);
  return {
    runId,
    ...(sessionKey ? { sessionKey } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

/** 确保 system.run 请求在发送给 node 前拥有 runId。 */
function withSystemRunEventRunId(params: { command: string; params?: unknown }): unknown {
  if (
    params.command !== "system.run" ||
    !params.params ||
    typeof params.params !== "object" ||
    Array.isArray(params.params)
  ) {
    return params.params;
  }
  const obj = params.params as Record<string, unknown>;
  if (normalizeString(obj.runId)) {
    return params.params;
  }
  return { ...obj, runId: randomUUID() };
}

/** 当前已连接 Gateway node 的注册表。 */
export class NodeRegistry {
  private nodesById = new Map<string, NodeSession>();
  private nodesByConn = new Map<string, string>();
  private pendingInvokes = new Map<string, PendingInvoke>();
  private authorizedSystemRunEvents = new Map<string, AuthorizedSystemRunEvent>();

  /** 将 websocket 客户端注册为其 node id 的当前连接。 */
  register(client: GatewayWsClient, opts: { remoteIp?: string | undefined }) {
    const connect = client.connect;
    const nodeId = connect.device?.id ?? connect.client.id ?? "";
    const caps = Array.isArray(connect.caps) ? connect.caps : [];
    const declaredCaps = Array.isArray(connect.declaredCaps)
      ? (connect.declaredCaps ?? [])
      : caps;
    const commands = Array.isArray(connect.commands) ? (connect.commands ?? []) : [];
    const declaredCommands = Array.isArray(connect.declaredCommands)
      ? (connect.declaredCommands ?? [])
      : commands;
    const permissions =
      typeof connect.permissions === "object" ? (connect.permissions ?? undefined) : undefined;
    const declaredPermissions =
      typeof connect.declaredPermissions === "object"
        ? (connect.declaredPermissions ?? undefined)
        : permissions;
    const pathEnv =
      typeof connect.pathEnv === "string" ? connect.pathEnv : undefined;
    const session: NodeSession = {
      nodeId,
      connId: client.connId,
      client,
      clientId: connect.client.id,
      clientMode: connect.client.mode,
      displayName: connect.client.displayName,
      platform: connect.client.platform,
      version: connect.client.version,
      coreVersion: connect.coreVersion,
      uiVersion: connect.uiVersion,
      deviceFamily: connect.client.deviceFamily,
      modelIdentifier: connect.client.modelIdentifier,
      remoteIp: opts.remoteIp,
      declaredCaps,
      caps,
      declaredCommands,
      commands,
      declaredPermissions,
      permissions,
      pathEnv,
      connectedAtMs: Date.now(),
    };
    this.nodesById.set(nodeId, session);
    this.nodesByConn.set(client.connId, nodeId);
    return session;
  }

  /** 注销一个连接并拒绝绑定到该连接的 invoke。 */
  unregister(connId: string): string | null {
    const nodeId = this.nodesByConn.get(connId);
    if (!nodeId) {
      return null;
    }
    this.nodesByConn.delete(connId);
    const unregistersCurrentNode = this.nodesById.get(nodeId)?.connId === connId;
    if (unregistersCurrentNode) {
      this.nodesById.delete(nodeId);
    }
    for (const [id, pending] of this.pendingInvokes.entries()) {
      if (pending.connId !== connId) {
        continue;
      }
      clearTimeout(pending.timer);
      pending.reject(new Error(`node disconnected (${pending.command})`));
      this.pendingInvokes.delete(id);
    }
    for (const [key, event] of this.authorizedSystemRunEvents) {
      if (event.connId === connId) {
        this.authorizedSystemRunEvents.delete(key);
      }
    }
    return unregistersCurrentNode ? nodeId : null;
  }

  /** 列出已连接 node 会话。 */
  listConnected(): NodeSession[] {
    return [...this.nodesById.values()];
  }

  /** 按 node id 返回已连接 node 会话。 */
  get(nodeId: string): NodeSession | undefined {
    return this.nodesById.get(nodeId);
  }

  /** 当 socket 支持 ping/pong 时用其探测 websocket 活性。 */
  async checkConnectivity(nodeId: string, timeoutMs = 2_000): Promise<NodeConnectivityResult> {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return {
        ok: false,
        error: { code: "NOT_CONNECTED", message: "node not connected" },
      };
    }
    const socket = node.client.socket as unknown as PingableSocket;
    if (socket.readyState !== WEBSOCKET_OPEN_READY_STATE) {
      return {
        ok: false,
        error: { code: "NOT_CONNECTED", message: "node socket not open" },
      };
    }
    if (typeof socket.ping !== "function" || typeof socket.once !== "function") {
      return { ok: true };
    }

    const timeout = Math.max(1, Math.trunc(timeoutMs));
    return await new Promise<NodeConnectivityResult>((resolve) => {
      let settled = false;
      const cleanup = () => {
        socket.off?.("pong", onPong);
        socket.off?.("close", onClose);
        socket.off?.("error", onError);
        socket.removeListener?.("pong", onPong);
        socket.removeListener?.("close", onClose);
        socket.removeListener?.("error", onError);
      };
      const finish = (result: NodeConnectivityResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(result);
      };
      const onPong = () => finish({ ok: true });
      const onClose = () =>
        finish({
          ok: false,
          error: { code: "NOT_CONNECTED", message: "node socket closed during connectivity probe" },
        });
      const onError = (err: unknown) =>
        finish({
          ok: false,
          error: {
            code: "UNAVAILABLE",
            message:
              err instanceof Error ? err.message : "node socket error during connectivity probe",
          },
        });
      const timer = setTimeout(
        () =>
          finish({
            ok: false,
            error: { code: "TIMEOUT", message: "node connectivity probe timed out" },
          }),
        timeout,
      );

      socket.once?.("pong", onPong);
      socket.once?.("close", onClose);
      socket.once?.("error", onError);
      try {
        socket.ping?.(undefined, false, (err?: Error) => {
          if (err) {
            finish({
              ok: false,
              error: { code: "UNAVAILABLE", message: err.message },
            });
          }
        });
      } catch (err) {
        finish({
          ok: false,
          error: {
            code: "UNAVAILABLE",
            message: err instanceof Error ? err.message : "node ping failed",
          },
        });
      }
    });
  }

  updateSurface(
    nodeId: string,
    surface: {
      caps?: readonly string[];
      commands: readonly string[];
      permissions?: Record<string, boolean> | undefined;
    },
  ): NodeSession | null {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return null;
    }

    // 运行时审批只能收窄在连接时声明的能力/命令/权限。
    const declaredCommands = new Set(node.declaredCommands);
    const nextCommands = surface.commands.filter((command) => declaredCommands.has(command));
    node.commands = nextCommands;
    node.client.connect.commands = nextCommands;

    if ("caps" in surface) {
      const declaredCaps = new Set(node.declaredCaps);
      const nextCaps = (surface.caps ?? []).filter((capability) => declaredCaps.has(capability));
      node.caps = nextCaps;
      node.client.connect.caps = nextCaps;
    }

    if ("permissions" in surface) {
      if (surface.permissions === undefined) {
        node.permissions = undefined;
        node.client.connect.permissions = undefined;
        return node;
      }
      const declared = node.declaredPermissions ?? {};
      const nextEntries: Array<[string, boolean]> = [];
      for (const [key, declaredValue] of Object.entries(declared)) {
        if (!declaredValue) {
          nextEntries.push([key, false]);
          continue;
        }
        const approvedValue = surface.permissions?.[key];
        if (approvedValue) {
          nextEntries.push([key, true]);
          continue;
        }
        if (approvedValue !== undefined) {
          nextEntries.push([key, false]);
        }
      }
      const nextPermissions = nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined;
      node.permissions = nextPermissions;
      node.client.connect.permissions = nextPermissions;
    }

    return node;
  }

  async invoke(params: {
    nodeId: string;
    command: string;
    params?: unknown;
    timeoutMs?: number;
    idempotencyKey?: string;
  }): Promise<NodeInvokeResult> {
    const node = this.nodesById.get(params.nodeId);
    if (!node) {
      return {
        ok: false,
        error: { code: "NOT_CONNECTED", message: "node not connected" },
      };
    }
    const requestId = randomUUID();
    const invokeParams = withSystemRunEventRunId({
      command: params.command,
      params: params.params,
    });
    const payload = {
      id: requestId,
      nodeId: params.nodeId,
      command: params.command,
      paramsJSON:
        "params" in params && invokeParams !== undefined ? JSON.stringify(invokeParams) : null,
      timeoutMs: params.timeoutMs,
      idempotencyKey: params.idempotencyKey,
    };
    const ok = this.sendEventToSession(node, "node.invoke.request", payload);
    if (!ok) {
      return {
        ok: false,
        error: { code: "UNAVAILABLE", message: "failed to send invoke to node" },
      };
    }
    const systemRunEvent = resolvePendingSystemRunEvent({
      command: params.command,
      params: invokeParams,
    });
    if (systemRunEvent) {
      this.rememberAuthorizedSystemRunEvent({
        nodeId: params.nodeId,
        connId: node.connId,
        ...systemRunEvent,
      });
    }
    const timeoutMs = resolveTimerTimeoutMs(params.timeoutMs, 30_000, 0);
    return await new Promise<NodeInvokeResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInvokes.delete(requestId);
        resolve({
          ok: false,
          error: { code: "TIMEOUT", message: "node invoke timed out" },
        });
      }, timeoutMs);
      this.pendingInvokes.set(requestId, {
        nodeId: params.nodeId,
        connId: node.connId,
        command: params.command,
        systemRunEvent,
        resolve,
        reject,
        timer,
      });
    });
  }

  /** 针对最近发出的 node invoke 授权一个入站 system.run 事件。 */
  authorizeSystemRunEvent(params: {
    nodeId: string;
    connId?: string;
    runId?: string;
    sessionKey: string;
    terminal: boolean;
  }): boolean {
    if (!params.connId || !params.sessionKey) {
      return false;
    }
    const connId = params.connId;
    this.pruneAuthorizedSystemRunEvents();
    let match: { key: string; event: AuthorizedSystemRunEvent } | null;
    if (params.runId) {
      match = this.matchAuthorizedSystemRunEvent({
        nodeId: params.nodeId,
        connId,
        runId: params.runId,
        sessionKey: params.sessionKey,
      });
      if (!match && this.allowsLegacyMacRunIdFallback({ nodeId: params.nodeId, connId })) {
        match = this.matchSingleAuthorizedSystemRunEvent({
          nodeId: params.nodeId,
          connId,
          sessionKey: params.sessionKey,
        });
      }
    } else {
      if (!this.allowsLegacyMacRunIdFallback({ nodeId: params.nodeId, connId })) {
        return false;
      }
      match = this.matchSingleAuthorizedSystemRunEvent({
        nodeId: params.nodeId,
        connId,
        sessionKey: params.sessionKey,
      });
    }
    if (!match) {
      return false;
    }
    if (params.terminal) {
      this.authorizedSystemRunEvents.delete(match.key);
    }
    return true;
  }

  private rememberAuthorizedSystemRunEvent(
    event: Omit<AuthorizedSystemRunEvent, "expiresAtMs">,
  ): void {
    this.pruneAuthorizedSystemRunEvents();
    const authorized: AuthorizedSystemRunEvent = {
      ...event,
      expiresAtMs: this.authorizedSystemRunEventExpiresAt(event.timeoutMs),
    };
    this.authorizedSystemRunEvents.set(this.authorizedSystemRunEventKey(authorized), authorized);
  }

  private forgetAuthorizedSystemRunEvent(
    event: Omit<AuthorizedSystemRunEvent, "expiresAtMs">,
  ): void {
    this.authorizedSystemRunEvents.delete(this.authorizedSystemRunEventKey(event));
  }

  private authorizedSystemRunEventExpiresAt(timeoutMs: number | null | undefined): number | null {
    if (typeof timeoutMs !== "number") {
      return null;
    }
    const durationMs = addTimerTimeoutGraceMs(timeoutMs, AUTHORIZED_SYSTEM_RUN_EVENT_GRACE_MS);
    return resolveExpiresAtMsFromDurationMs(durationMs) ?? 0;
  }

  private matchAuthorizedSystemRunEvent(params: {
    nodeId: string;
    connId: string;
    runId: string;
    sessionKey: string;
  }): { key: string; event: AuthorizedSystemRunEvent } | null {
    for (const [key, event] of this.authorizedSystemRunEvents) {
      if (
        event.nodeId === params.nodeId &&
        event.connId === params.connId &&
        event.runId === params.runId &&
        this.authorizedSystemRunSessionMatches(event, params.sessionKey)
      ) {
        return { key, event };
      }
    }
    return null;
  }

  private matchSingleAuthorizedSystemRunEvent(params: {
    nodeId: string;
    connId: string;
    sessionKey: string;
  }): { key: string; event: AuthorizedSystemRunEvent } | null {
    let match: { key: string; event: AuthorizedSystemRunEvent } | null = null;
    for (const [key, event] of this.authorizedSystemRunEvents) {
      if (
        event.nodeId !== params.nodeId ||
        event.connId !== params.connId ||
        !this.authorizedSystemRunSessionMatches(event, params.sessionKey)
      ) {
        continue;
      }
      if (match) {
        return null;
      }
      match = { key, event };
    }
    return match;
  }

  private authorizedSystemRunSessionMatches(
    event: AuthorizedSystemRunEvent,
    sessionKey: string,
  ): boolean {
    return !event.sessionKey || event.sessionKey === sessionKey;
  }

  private allowsLegacyMacRunIdFallback(params: { nodeId: string; connId: string }): boolean {
    const node = this.nodesById.get(params.nodeId);
    return (
      node?.connId === params.connId &&
      node.clientId === "openclaw-macos" &&
      node.platform === "darwin"
    );
  }

  private pruneAuthorizedSystemRunEvents(now = Date.now()): void {
    for (const [key, event] of this.authorizedSystemRunEvents) {
      if (
        event.expiresAtMs !== null &&
        !isFutureDateTimestampMs(event.expiresAtMs, { nowMs: now })
      ) {
        this.authorizedSystemRunEvents.delete(key);
      }
    }
  }

  private authorizedSystemRunEventKey(params: {
    nodeId: string;
    connId: string;
    runId: string;
    sessionKey?: string;
  }): string {
    return `${params.nodeId}\0${params.connId}\0${params.sessionKey ?? ""}\0${params.runId}`;
  }

  handleInvokeResult(params: {
    id: string;
    nodeId: string;
    connId: string | undefined;
    ok: boolean;
    payload?: unknown;
    payloadJSON?: string | null;
    error?: { code?: string; message?: string } | null;
  }): boolean {
    const pending = this.pendingInvokes.get(params.id);
    if (!pending) {
      return false;
    }
    if (pending.nodeId !== params.nodeId || pending.connId !== params.connId) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pendingInvokes.delete(params.id);
    if (!params.ok && pending.systemRunEvent) {
      this.forgetAuthorizedSystemRunEvent({
        nodeId: pending.nodeId,
        connId: pending.connId,
        ...pending.systemRunEvent,
      });
    }
    pending.resolve({
      ok: params.ok,
      payload: params.payload,
      payloadJSON: params.payloadJSON ?? null,
      error: params.error ?? null,
    });
    return true;
  }

  sendEvent(nodeId: string, event: string, payload?: unknown): boolean {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return false;
    }
    return this.sendEventToSession(node, event, payload);
  }

  sendEventRaw(
    nodeId: string,
    event: string,
    payloadJSON?: SerializedEventPayload | null,
  ): boolean {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return false;
    }
    return this.sendEventRawInternal(node, event, payloadJSON);
  }

  private sendEventInternal(node: NodeSession, event: string, payload: unknown): boolean {
    if (this.rejectSlowNodeSocket(node)) {
      return false;
    }
    try {
      node.client.socket.send(
        JSON.stringify({
          type: "event",
          event,
          payload,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private sendEventRawInternal(
    node: NodeSession,
    event: string,
    payloadJSON?: SerializedEventPayload | null,
  ): boolean {
    if (
      payloadJSON !== null &&
      payloadJSON !== undefined &&
      !isSerializedEventPayload(payloadJSON)
    ) {
      return false;
    }
    if (this.rejectSlowNodeSocket(node)) {
      return false;
    }
    try {
      const payloadFragment = payloadJSON ? `,"payload":${payloadJSON.json}` : "";
      node.client.socket.send(
        `{"type":"event","event":${JSON.stringify(event)}${payloadFragment}}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  private sendEventToSession(node: NodeSession, event: string, payload: unknown): boolean {
    return this.sendEventInternal(node, event, payload);
  }

  private rejectSlowNodeSocket(node: NodeSession): boolean {
    if (!((node.client.socket.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES)) {
      return false;
    }
    logRejectedLargePayload({
      surface: "gateway.ws.outbound_buffer",
      bytes: node.client.socket.bufferedAmount ?? 0,
      limitBytes: MAX_BUFFERED_BYTES,
      reason: "ws_send_buffer_close",
    });
    try {
      node.client.socket.close(SLOW_CONSUMER_CLOSE_CODE, "slow consumer");
    } catch {
      /* ignore */
    }
    return true;
  }
}
