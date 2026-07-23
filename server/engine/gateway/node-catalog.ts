// Gateway node 目录构建器。
// 合并已配对设备、已批准 node 记录与活跃 websocket 会话。
// 移植自 openclaw/src/gateway/node-catalog.ts。
// 依赖调整：
//  - @openclaw/normalization-core/string-coerce → ../infra/string-coerce.js
//  - @openclaw/normalization-core/string-normalization 的 normalizeSortedUniqueTrimmedStringList
//    → 本地内联实现（cross-wms 未移植 string-normalization）
//  - ../infra/device-pairing.js、../infra/node-pairing.js、../infra/node-pairing-surface.js
//    ../shared/node-list-types.js 均已存在于 cross-wms
//  - ./node-registry.js 的 NodeSession 类型由本地 node-registry.ts 提供
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";
import { hasEffectivePairedDeviceRole, type PairedDevice } from "../infra/device-pairing.js";
import {
  sameNodeApprovalSurfaceSet,
  sameNodePermissionSurface,
} from "../infra/node-pairing-surface.js";
import type {
  NodePairingPairedNode,
  NodePairingPendingRequest,
} from "../infra/node-pairing.js";
import type { NodeListNode } from "../shared/node-list-types.js";
import type { NodeSession } from "./node-registry.js";

type KnownNodeDevicePairingSource = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  remoteIp?: string;
  approvedAtMs?: number;
  lastSeenAtMs?: number;
  lastSeenReason?: string;
};

type KnownNodeApprovedSource = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  remoteIp?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  caps: string[];
  commands: string[];
  permissions?: Record<string, boolean>;
  approvedAtMs?: number;
  lastConnectedAtMs?: number;
  lastSeenAtMs?: number;
  lastSeenReason?: string;
};

type KnownNodePendingSource = {
  requestId: string;
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  clientId?: string;
  clientMode?: string;
  remoteIp?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  caps: string[];
  commands: string[];
  permissions?: Record<string, boolean>;
};

type KnownNodeEntry = {
  nodeId: string;
  devicePairing?: KnownNodeDevicePairingSource;
  nodePairing?: KnownNodeApprovedSource;
  pendingNodePairing?: KnownNodePendingSource;
  live?: NodeSession;
  effective: NodeListNode;
};

type KnownNodeCatalog = {
  entriesById: Map<string, KnownNodeEntry>;
};

// 本地内联实现：合并多个字符串数组，去空白、去重、排序。
// 替代 @openclaw/normalization-core/string-normalization 的 normalizeSortedUniqueTrimmedStringList。
function normalizeSortedUniqueTrimmedStringList(
  ...items: Array<readonly unknown[] | undefined>
): string[] {
  const flattened = items.flatMap((item) => (Array.isArray(item) ? item : []));
  const set = new Set<string>();
  for (const entry of flattened) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      set.add(trimmed);
    }
  }
  return [...set].sort();
}

function uniqueSortedStrings(...items: Array<readonly unknown[] | undefined>): string[] {
  return normalizeSortedUniqueTrimmedStringList(...items);
}

function buildDevicePairingSource(entry: PairedDevice): KnownNodeDevicePairingSource {
  return {
    nodeId: entry.deviceId,
    displayName: entry.displayName,
    platform: entry.platform,
    clientId: entry.clientId,
    clientMode: entry.clientMode,
    remoteIp: entry.remoteIp,
    approvedAtMs: entry.approvedAtMs,
    lastSeenAtMs: entry.lastSeenAtMs,
    lastSeenReason: entry.lastSeenReason,
  };
}

function buildApprovedNodeSource(entry: NodePairingPairedNode): KnownNodeApprovedSource {
  return {
    nodeId: entry.nodeId,
    displayName: entry.displayName,
    platform: entry.platform,
    version: entry.version,
    coreVersion: entry.coreVersion,
    uiVersion: entry.uiVersion,
    remoteIp: entry.remoteIp,
    deviceFamily: entry.deviceFamily,
    modelIdentifier: entry.modelIdentifier,
    caps: entry.caps ?? [],
    commands: entry.commands ?? [],
    permissions: entry.permissions,
    approvedAtMs: entry.approvedAtMs,
    lastConnectedAtMs: entry.lastConnectedAtMs,
    lastSeenAtMs: entry.lastSeenAtMs,
    lastSeenReason: entry.lastSeenReason,
  };
}

function buildPendingNodeSource(entry: NodePairingPendingRequest): KnownNodePendingSource {
  return {
    requestId: entry.requestId,
    nodeId: entry.nodeId,
    displayName: entry.displayName,
    platform: entry.platform,
    version: entry.version,
    coreVersion: entry.coreVersion,
    uiVersion: entry.uiVersion,
    clientId: entry.clientId,
    clientMode: entry.clientMode,
    remoteIp: entry.remoteIp,
    deviceFamily: entry.deviceFamily,
    modelIdentifier: entry.modelIdentifier,
    caps: uniqueSortedStrings(entry.caps),
    commands: uniqueSortedStrings(entry.commands),
    permissions: entry.permissions,
  };
}

function resolveCurrentPendingNodePairing(params: {
  pending?: KnownNodePendingSource;
  nodePairing?: KnownNodeApprovedSource;
  live?: NodeSession;
}): KnownNodePendingSource | undefined {
  const { pending, nodePairing, live } = params;
  if (!pending || !live) {
    return pending;
  }
  const declaredPermissions =
    !nodePairing && live.declaredPermissions === undefined
      ? pending.permissions
      : live.declaredPermissions;
  return sameNodeApprovalSurfaceSet(pending.caps, live.declaredCaps) &&
    sameNodeApprovalSurfaceSet(pending.commands, live.declaredCommands) &&
    sameNodePermissionSurface(pending.permissions, declaredPermissions)
    ? pending
    : undefined;
}

function resolveEffectiveLastSeen(params: {
  live?: NodeSession;
  devicePairing?: KnownNodeDevicePairingSource;
  nodePairing?: KnownNodeApprovedSource;
}): { lastSeenAtMs?: number; lastSeenReason?: string } {
  // 活跃连接时间是最新信号；存储的 last-seen 值仅用于填充断开连接的行，
  // 不允许陈旧的 device-pairing 数据覆盖 node。
  const candidates: Array<{ atMs: number; reason?: string }> = [
    params.live?.connectedAtMs ? { atMs: params.live.connectedAtMs, reason: "connect" } : undefined,
    params.nodePairing?.lastSeenAtMs
      ? { atMs: params.nodePairing.lastSeenAtMs, reason: params.nodePairing.lastSeenReason }
      : undefined,
    params.nodePairing?.lastConnectedAtMs
      ? { atMs: params.nodePairing.lastConnectedAtMs, reason: "connect" }
      : undefined,
    params.devicePairing?.lastSeenAtMs
      ? { atMs: params.devicePairing.lastSeenAtMs, reason: params.devicePairing.lastSeenReason }
      : undefined,
  ].filter((entry) => entry !== undefined);
  let newest: { atMs: number; reason?: string } | undefined;
  for (const candidate of candidates) {
    if (!newest || candidate.atMs > newest.atMs) {
      newest = candidate;
    }
  }
  if (!newest) {
    return {};
  }
  return {
    lastSeenAtMs: newest.atMs,
    lastSeenReason: newest.reason,
  };
}

function buildEffectiveKnownNode(entry: {
  nodeId: string;
  devicePairing?: KnownNodeDevicePairingSource;
  nodePairing?: KnownNodeApprovedSource;
  pendingNodePairing?: KnownNodePendingSource;
  live?: NodeSession;
}): NodeListNode {
  const { nodeId, devicePairing, nodePairing, pendingNodePairing, live } = entry;
  const lastSeen = resolveEffectiveLastSeen({ live, devicePairing, nodePairing });
  return {
    nodeId,
    displayName:
      live?.displayName ??
      nodePairing?.displayName ??
      devicePairing?.displayName ??
      pendingNodePairing?.displayName,
    platform:
      live?.platform ??
      nodePairing?.platform ??
      devicePairing?.platform ??
      pendingNodePairing?.platform,
    version: live?.version ?? nodePairing?.version ?? pendingNodePairing?.version,
    coreVersion: live?.coreVersion ?? nodePairing?.coreVersion ?? pendingNodePairing?.coreVersion,
    uiVersion: live?.uiVersion ?? nodePairing?.uiVersion ?? pendingNodePairing?.uiVersion,
    clientId: live?.clientId ?? devicePairing?.clientId ?? pendingNodePairing?.clientId,
    clientMode: live?.clientMode ?? devicePairing?.clientMode ?? pendingNodePairing?.clientMode,
    deviceFamily:
      live?.deviceFamily ?? nodePairing?.deviceFamily ?? pendingNodePairing?.deviceFamily,
    modelIdentifier:
      live?.modelIdentifier ?? nodePairing?.modelIdentifier ?? pendingNodePairing?.modelIdentifier,
    remoteIp:
      live?.remoteIp ??
      nodePairing?.remoteIp ??
      devicePairing?.remoteIp ??
      pendingNodePairing?.remoteIp,
    caps: live ? uniqueSortedStrings(live.caps) : uniqueSortedStrings(nodePairing?.caps),
    commands: live
      ? uniqueSortedStrings(live.commands)
      : uniqueSortedStrings(nodePairing?.commands),
    pathEnv: live?.pathEnv,
    permissions: live?.permissions ?? nodePairing?.permissions,
    approvalState: pendingNodePairing
      ? nodePairing
        ? "pending-reapproval"
        : "pending-approval"
      : nodePairing
        ? "approved"
        : "unapproved",
    pendingRequestId: pendingNodePairing?.requestId,
    pendingDeclaredCaps: pendingNodePairing?.caps,
    pendingDeclaredCommands: pendingNodePairing?.commands,
    pendingDeclaredPermissions: pendingNodePairing?.permissions,
    connectedAtMs: live?.connectedAtMs,
    lastSeenAtMs: lastSeen.lastSeenAtMs,
    lastSeenReason: lastSeen.lastSeenReason,
    approvedAtMs: nodePairing?.approvedAtMs ?? devicePairing?.approvedAtMs,
    paired: Boolean(devicePairing ?? nodePairing),
    connected: Boolean(live),
  };
}

function compareKnownNodes(left: NodeListNode, right: NodeListNode): number {
  if (left.connected !== right.connected) {
    return left.connected ? -1 : 1;
  }
  const leftName = normalizeLowercaseStringOrEmpty(left.displayName ?? left.nodeId);
  const rightName = normalizeLowercaseStringOrEmpty(right.displayName ?? right.nodeId);
  if (leftName < rightName) {
    return -1;
  }
  if (leftName > rightName) {
    return 1;
  }
  return left.nodeId.localeCompare(right.nodeId);
}

/** 从配对存储与活跃会话构建按 node id 索引的 node 目录。 */
export function createKnownNodeCatalog(params: {
  pairedDevices: readonly PairedDevice[];
  pairedNodes?: readonly NodePairingPairedNode[];
  pendingNodes?: readonly NodePairingPendingRequest[];
  connectedNodes: readonly NodeSession[];
}): KnownNodeCatalog {
  const devicePairingById = new Map(
    params.pairedDevices
      .filter((entry) => hasEffectivePairedDeviceRole(entry, "node"))
      .map((entry) => [entry.deviceId, buildDevicePairingSource(entry)]),
  );
  const nodePairingById = new Map(
    (params.pairedNodes ?? []).map((entry) => [entry.nodeId, buildApprovedNodeSource(entry)]),
  );
  const pendingNodePairingById = new Map<string, KnownNodePendingSource>();
  // listNodePairing 返回最新请求在前；保留每个 node 当前的审批动作。
  for (const entry of params.pendingNodes ?? []) {
    if (!pendingNodePairingById.has(entry.nodeId)) {
      pendingNodePairingById.set(entry.nodeId, buildPendingNodeSource(entry));
    }
  }
  const liveById = new Map(params.connectedNodes.map((entry) => [entry.nodeId, entry]));
  const nodeIds = new Set<string>([
    ...devicePairingById.keys(),
    ...nodePairingById.keys(),
    ...pendingNodePairingById.keys(),
    ...liveById.keys(),
  ]);
  const entriesById = new Map<string, KnownNodeEntry>();
  for (const nodeId of nodeIds) {
    const devicePairing = devicePairingById.get(nodeId);
    const nodePairing = nodePairingById.get(nodeId);
    const live = liveById.get(nodeId);
    const pendingNodePairing = resolveCurrentPendingNodePairing({
      pending: pendingNodePairingById.get(nodeId),
      nodePairing,
      live,
    });
    entriesById.set(nodeId, {
      nodeId,
      devicePairing,
      nodePairing,
      pendingNodePairing,
      live,
      effective: buildEffectiveKnownNode({
        nodeId,
        devicePairing,
        nodePairing,
        pendingNodePairing,
        live,
      }),
    });
  }
  return { entriesById };
}

/** 列出已知 node，已连接的在前并按确定性显示顺序排序。 */
export function listKnownNodes(catalog: KnownNodeCatalog): NodeListNode[] {
  return [...catalog.entriesById.values()]
    .map((entry) => entry.effective)
    .toSorted(compareKnownNodes);
}

/** 返回合并后的目录条目，供需要源详情的诊断使用。 */
export function getKnownNodeEntry(
  catalog: KnownNodeCatalog,
  nodeId: string,
): KnownNodeEntry | null {
  return catalog.entriesById.get(nodeId) ?? null;
}

/** 返回展示给 gateway 客户端的有效 node 行。 */
export function getKnownNode(catalog: KnownNodeCatalog, nodeId: string): NodeListNode | null {
  return getKnownNodeEntry(catalog, nodeId)?.effective ?? null;
}
