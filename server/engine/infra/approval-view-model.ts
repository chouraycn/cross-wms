// 移植自 openclaw/src/infra/approval-view-model.ts（降级实现）
// 构建 pending/resolved/expired 审批 view-model。
import type { ExecApprovalRequest, ExecApprovalResolved } from "./exec-approvals.js";
import type { PluginApprovalRequest, PluginApprovalResolved } from "./plugin-approvals.js";
import type {
  ExecApprovalPendingView,
  ExecApprovalResolvedView,
  ExecApprovalExpiredView,
  PluginApprovalPendingView,
  PluginApprovalResolvedView,
  PluginApprovalExpiredView,
  PendingApprovalView,
  ResolvedApprovalView,
  ExpiredApprovalView,
  ApprovalRequest,
  ApprovalResolved,
  ApprovalMetadataView,
  ApprovalActionView,
} from "./approval-view-model.types.js";

function buildExecMetadata(params: {
  request: ExecApprovalRequest;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
}): ApprovalMetadataView[] {
  const metadata: ApprovalMetadataView[] = [];
  if (params.host) metadata.push({ label: "Host", value: params.host });
  if (params.nodeId) metadata.push({ label: "Node", value: params.nodeId });
  if (params.cwd) metadata.push({ label: "CWD", value: params.cwd });
  return metadata;
}

/**
 * 构建 pending exec 审批 view。
 * 降级实现：不调用 command-explainer，commandAnalysis 为 null。
 */
export function buildPendingApprovalView(params: {
  request: ExecApprovalRequest;
  actions: readonly ApprovalActionView[];
  commandText: string;
  commandPreview?: string | null;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
  sessionKey?: string | null;
  agentId?: string | null;
  ask?: string | null;
  warningText?: string | null;
  expiresAtMs: number;
}): ExecApprovalPendingView {
  return {
    approvalId: params.request.id,
    approvalKind: "exec",
    phase: "pending",
    title: "Approval required",
    description: params.warningText ?? null,
    metadata: buildExecMetadata({
      request: params.request,
      cwd: params.cwd,
      host: params.host,
      nodeId: params.nodeId,
    }),
    ask: params.ask ?? null,
    agentId: params.agentId ?? null,
    warningText: params.warningText ?? null,
    commandAnalysis: null,
    commandText: params.commandText,
    commandPreview: params.commandPreview ?? null,
    cwd: params.cwd ?? null,
    host: params.host ?? null,
    nodeId: params.nodeId ?? null,
    sessionKey: params.sessionKey ?? null,
    actions: [...params.actions],
    expiresAtMs: params.expiresAtMs,
  };
}

/** 构建 resolved exec 审批 view。 */
export function buildResolvedApprovalView(params: {
  request: ExecApprovalRequest;
  resolved: ExecApprovalResolved;
  commandText: string;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
}): ExecApprovalResolvedView {
  return {
    approvalId: params.request.id,
    approvalKind: "exec",
    phase: "resolved",
    title: `Approval ${params.resolved.decision}`,
    metadata: buildExecMetadata({
      request: params.request,
      cwd: params.cwd,
      host: params.host,
      nodeId: params.nodeId,
    }),
    commandText: params.commandText,
    cwd: params.cwd ?? null,
    host: params.host ?? null,
    nodeId: params.nodeId ?? null,
    decision: params.resolved.decision,
    resolvedBy: (params.resolved as { resolvedBy?: string | null }).resolvedBy ?? null,
  };
}

/** 构建 expired exec 审批 view。 */
export function buildExpiredApprovalView(params: {
  request: ExecApprovalRequest;
  commandText: string;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
}): ExecApprovalExpiredView {
  return {
    approvalId: params.request.id,
    approvalKind: "exec",
    phase: "expired",
    title: "Approval expired",
    metadata: buildExecMetadata({
      request: params.request,
      cwd: params.cwd,
      host: params.host,
      nodeId: params.nodeId,
    }),
    commandText: params.commandText,
    cwd: params.cwd ?? null,
    host: params.host ?? null,
    nodeId: params.nodeId ?? null,
  };
}

/** 构建 pending plugin 审批 view。 */
export function buildPendingPluginApprovalView(params: {
  request: PluginApprovalRequest;
  actions: readonly ApprovalActionView[];
}): PluginApprovalPendingView {
  return {
    approvalId: params.request.id,
    approvalKind: "plugin",
    phase: "pending",
    title: params.request.request.title,
    description: params.request.request.description,
    metadata: [],
    pluginId: params.request.request.pluginId ?? null,
    toolName: params.request.request.toolName ?? null,
    agentId: params.request.request.agentId ?? null,
    severity: (params.request.request.severity as "info" | "warning" | "critical") ?? "info",
    actions: [...params.actions],
    expiresAtMs: params.request.expiresAtMs,
  };
}

/** 构建 resolved plugin 审批 view。 */
export function buildResolvedPluginApprovalView(params: {
  request: PluginApprovalRequest;
  resolved: PluginApprovalResolved;
}): PluginApprovalResolvedView {
  return {
    approvalId: params.request.id,
    approvalKind: "plugin",
    phase: "resolved",
    title: params.request.request.title,
    description: params.request.request.description,
    metadata: [],
    pluginId: params.request.request.pluginId ?? null,
    toolName: params.request.request.toolName ?? null,
    agentId: params.request.request.agentId ?? null,
    severity: (params.request.request.severity as "info" | "warning" | "critical") ?? "info",
    decision: params.resolved.decision,
    resolvedBy: params.resolved.resolvedBy ?? null,
  };
}

/** 构建 expired plugin 审批 view。 */
export function buildExpiredPluginApprovalView(params: {
  request: PluginApprovalRequest;
}): PluginApprovalExpiredView {
  return {
    approvalId: params.request.id,
    approvalKind: "plugin",
    phase: "expired",
    title: params.request.request.title,
    description: params.request.request.description,
    metadata: [],
    pluginId: params.request.request.pluginId ?? null,
    toolName: params.request.request.toolName ?? null,
    agentId: params.request.request.agentId ?? null,
    severity: (params.request.request.severity as "info" | "warning" | "critical") ?? "info",
  };
}

/** 构建 pending 审批 view（exec 或 plugin）。 */
export function buildPendingView(params: {
  request: ApprovalRequest;
  actions: readonly ApprovalActionView[];
  commandText?: string;
  commandPreview?: string | null;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
  expiresAtMs?: number;
}): PendingApprovalView {
  if ("command" in params.request.request) {
    return buildPendingApprovalView({
      request: params.request as ExecApprovalRequest,
      actions: params.actions,
      commandText: params.commandText ?? (params.request as ExecApprovalRequest).request.command,
      commandPreview: params.commandPreview,
      cwd: params.cwd,
      host: params.host,
      nodeId: params.nodeId,
      expiresAtMs: params.expiresAtMs ?? params.request.expiresAtMs,
    });
  }
  return buildPendingPluginApprovalView({
    request: params.request as PluginApprovalRequest,
    actions: params.actions,
  });
}

/** 构建 resolved 审批 view（exec 或 plugin）。 */
export function buildResolvedView(params: {
  request: ApprovalRequest;
  resolved: ApprovalResolved;
  commandText?: string;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
}): ResolvedApprovalView {
  if ("command" in params.request.request) {
    return buildResolvedApprovalView({
      request: params.request as ExecApprovalRequest,
      resolved: params.resolved as ExecApprovalResolved,
      commandText: params.commandText ?? (params.request as ExecApprovalRequest).request.command,
      cwd: params.cwd,
      host: params.host,
      nodeId: params.nodeId,
    });
  }
  return buildResolvedPluginApprovalView({
    request: params.request as PluginApprovalRequest,
    resolved: params.resolved as PluginApprovalResolved,
  });
}

/** 构建 expired 审批 view（exec 或 plugin）。 */
export function buildExpiredView(params: {
  request: ApprovalRequest;
  commandText?: string;
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
}): ExpiredApprovalView {
  if ("command" in params.request.request) {
    return buildExpiredApprovalView({
      request: params.request as ExecApprovalRequest,
      commandText: params.commandText ?? (params.request as ExecApprovalRequest).request.command,
      cwd: params.cwd,
      host: params.host,
      nodeId: params.nodeId,
    });
  }
  return buildExpiredPluginApprovalView({ request: params.request as PluginApprovalRequest });
}
