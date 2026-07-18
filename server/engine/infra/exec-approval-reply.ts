// 移植自 openclaw/src/infra/exec-approval-reply.ts（降级实现）
// 构建 exec 审批提示与结果的回复负载。
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "./string-coerce.js";
import {
  resolveExecApprovalAllowedDecisions,
  type ExecApprovalDecision,
  type ExecAsk,
  type ExecHost,
} from "./exec-approvals.js";
import {
  describeNativeExecApprovalClientSetup,
  listNativeExecApprovalClientLabels,
  supportsNativeExecApprovalClient,
} from "./exec-approval-surface.js";
import { formatApprovalDisplayPath } from "./approval-display-paths.js";

// 降级类型：openclaw 的 ../auto-reply/types.js、../interactive/payload.js、../shared/human-list.js 未移植
type ReplyPayload = {
  text?: string;
  presentation?: unknown;
  channelData?: Record<string, unknown>;
};

type InteractiveReplyButton = {
  label: string;
  action: { type: "command"; command: string };
  value: string;
  style: "success" | "primary" | "danger" | "secondary";
};

type InteractiveReply = {
  blocks: Array<{ type: "buttons"; buttons: InteractiveReplyButton[] }>;
};

type MessagePresentationButton = {
  label: string;
  action: { type: "command"; command: string };
  value: string;
  style: "success" | "primary" | "danger" | "secondary";
};

type MessagePresentation = {
  blocks: Array<{ type: "buttons"; buttons: MessagePresentationButton[] }>;
};

export type ExecApprovalReplyDecision = ExecApprovalDecision;
export type ExecApprovalUnavailableReason =
  | "initiating-platform-disabled"
  | "initiating-platform-unsupported"
  | "no-approval-route";

export type ExecApprovalReplyMetadata = {
  approvalId: string;
  approvalSlug: string;
  approvalKind: "exec" | "plugin";
  agentId?: string;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
  sessionKey?: string;
};

export type ExecApprovalActionDescriptor = {
  decision: ExecApprovalReplyDecision;
  label: string;
  style: NonNullable<MessagePresentationButton["style"]>;
  command: string;
};

export type ExecApprovalPendingReplyParams = {
  warningText?: string;
  approvalId: string;
  approvalSlug: string;
  approvalCommandId?: string;
  ask?: string | null;
  agentId?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
  command: string;
  cwd?: string;
  host: ExecHost;
  nodeId?: string;
  sessionKey?: string | null;
  expiresAtMs?: number;
  nowMs?: number;
};

export type ExecApprovalUnavailableReplyParams = {
  warningText?: string;
  channel?: string;
  channelLabel?: string;
  accountId?: string;
  reason: ExecApprovalUnavailableReason;
  sentApproverDm?: boolean;
};

function formatHumanList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function resolveNativeExecApprovalClientList(params?: { excludeChannel?: string }): string {
  return formatHumanList(
    listNativeExecApprovalClientLabels(),
  );
}

function buildGenericNativeExecApprovalFallbackText(params?: { excludeChannel?: string }): string {
  const clients = resolveNativeExecApprovalClientList({ excludeChannel: params?.excludeChannel });
  return clients
    ? `Approve it from the Web UI or terminal UI, or enable a native chat approval client such as ${clients}.`
    : "Approve it from the Web UI or terminal UI.";
}

function resolveAllowedDecisions(params: {
  ask?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
}): readonly ExecApprovalReplyDecision[] {
  return params.allowedDecisions ?? resolveExecApprovalAllowedDecisions({ ask: params.ask as ExecAsk });
}

function buildFence(text: string, language?: string): string {
  let fence = "```";
  while (text.includes(fence)) {
    fence += "`";
  }
  const languagePrefix = language ?? "";
  return `${fence}${languagePrefix}\n${text}\n${fence}`;
}

function buildApprovalCommandFence(
  descriptors: readonly ExecApprovalActionDescriptor[],
): string | null {
  if (descriptors.length === 0) return null;
  return buildFence(descriptors.map((d) => d.command).join("\n"), "txt");
}

export function buildExecApprovalCommandText(params: {
  approvalCommandId: string;
  decision: ExecApprovalReplyDecision;
}): string {
  return `/approve ${params.approvalCommandId} ${params.decision}`;
}

export function buildExecApprovalActionDescriptors(params: {
  approvalCommandId: string;
  ask?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
}): ExecApprovalActionDescriptor[] {
  const approvalCommandId = params.approvalCommandId.trim();
  if (!approvalCommandId) return [];
  const allowedDecisions = resolveAllowedDecisions(params);
  const descriptors: ExecApprovalActionDescriptor[] = [];
  if (allowedDecisions.includes("allow-once")) {
    descriptors.push({
      decision: "allow-once",
      label: "Allow Once",
      style: "success",
      command: buildExecApprovalCommandText({ approvalCommandId, decision: "allow-once" }),
    });
  }
  if (allowedDecisions.includes("allow-always")) {
    descriptors.push({
      decision: "allow-always",
      label: "Allow Always",
      style: "primary",
      command: buildExecApprovalCommandText({ approvalCommandId, decision: "allow-always" }),
    });
  }
  if (allowedDecisions.includes("deny")) {
    descriptors.push({
      decision: "deny",
      label: "Deny",
      style: "danger",
      command: buildExecApprovalCommandText({ approvalCommandId, decision: "deny" }),
    });
  }
  return descriptors;
}

function buildApprovalInteractiveButtons(
  descriptors: readonly ExecApprovalActionDescriptor[],
): InteractiveReplyButton[] {
  return descriptors.map((d) => ({
    label: d.label,
    action: { type: "command", command: d.command },
    value: d.command,
    style: d.style,
  }));
}

function buildApprovalPresentationButtons(
  descriptors: readonly ExecApprovalActionDescriptor[],
): MessagePresentationButton[] {
  return descriptors.map((d) => ({
    label: d.label,
    action: { type: "command", command: d.command },
    value: d.command,
    style: d.style,
  }));
}

export function buildApprovalPresentationFromActionDescriptors(
  actions: readonly ExecApprovalActionDescriptor[],
): MessagePresentation | undefined {
  const buttons = buildApprovalPresentationButtons(actions);
  return buttons.length > 0 ? { blocks: [{ type: "buttons", buttons }] } : undefined;
}

export function buildApprovalPresentation(params: {
  approvalId: string;
  ask?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
}): MessagePresentation | undefined {
  return buildApprovalPresentationFromActionDescriptors(
    buildExecApprovalActionDescriptors({
      approvalCommandId: params.approvalId,
      ask: params.ask,
      allowedDecisions: params.allowedDecisions,
    }),
  );
}

export function buildExecApprovalPresentation(params: {
  approvalCommandId: string;
  ask?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
}): MessagePresentation | undefined {
  return buildApprovalPresentation({
    approvalId: params.approvalCommandId,
    ask: params.ask,
    allowedDecisions: params.allowedDecisions,
  });
}

export function buildApprovalInteractiveReplyFromActionDescriptors(
  actions: readonly ExecApprovalActionDescriptor[],
): InteractiveReply | undefined {
  const buttons = buildApprovalInteractiveButtons(actions);
  return buttons.length > 0 ? { blocks: [{ type: "buttons", buttons }] } : undefined;
}

export function buildApprovalInteractiveReply(params: {
  approvalId: string;
  ask?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
}): InteractiveReply | undefined {
  return buildApprovalInteractiveReplyFromActionDescriptors(
    buildExecApprovalActionDescriptors({
      approvalCommandId: params.approvalId,
      ask: params.ask,
      allowedDecisions: params.allowedDecisions,
    }),
  );
}

export function buildExecApprovalInteractiveReply(params: {
  approvalCommandId: string;
  ask?: string | null;
  allowedDecisions?: readonly ExecApprovalReplyDecision[];
}): InteractiveReply | undefined {
  return buildApprovalInteractiveReply({
    approvalId: params.approvalCommandId,
    ask: params.ask,
    allowedDecisions: params.allowedDecisions,
  });
}

export function getExecApprovalApproverDmNoticeText(): string {
  return "Approval required. I sent approval DMs to the approvers for this account.";
}

export function parseExecApprovalCommandText(
  raw: string,
): { approvalId: string; decision: ExecApprovalReplyDecision } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^\/?approve(?:@[^\s]+)?\s+([A-Za-z0-9][A-Za-z0-9._:-]*)\s+(allow-once|allow-always|always|deny)\b/i,
  );
  if (!match) return null;
  const rawDecision = normalizeOptionalLowercaseString(match[2]) ?? "";
  return {
    approvalId: match[1],
    decision: rawDecision === "always" ? "allow-always" : (rawDecision as ExecApprovalReplyDecision),
  };
}

export function formatExecApprovalExpiresIn(expiresAtMs: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.round((expiresAtMs - nowMs) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (hours === 0 && minutes < 5 && seconds > 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function getExecApprovalReplyMetadata(
  payload: ReplyPayload,
): ExecApprovalReplyMetadata | null {
  const channelData = payload.channelData;
  if (!channelData || typeof channelData !== "object" || Array.isArray(channelData)) return null;
  const execApproval = (channelData as Record<string, unknown>).execApproval;
  if (!execApproval || typeof execApproval !== "object" || Array.isArray(execApproval)) return null;
  const record = execApproval as Record<string, unknown>;
  const approvalId = normalizeOptionalString(record.approvalId) ?? "";
  const approvalSlug = normalizeOptionalString(record.approvalSlug) ?? "";
  if (!approvalId || !approvalSlug) return null;
  const approvalKind = record.approvalKind === "plugin" ? "plugin" : "exec";
  const allowedDecisions = Array.isArray(record.allowedDecisions)
    ? record.allowedDecisions.filter(
        (value): value is ExecApprovalReplyDecision =>
          value === "allow-once" || value === "allow-always" || value === "deny",
      )
    : undefined;
  const agentId = normalizeOptionalString(record.agentId);
  const sessionKey = normalizeOptionalString(record.sessionKey);
  return { approvalId, approvalSlug, approvalKind, agentId, allowedDecisions, sessionKey };
}

export function buildExecApprovalPendingReplyPayload(
  params: ExecApprovalPendingReplyParams,
): ReplyPayload {
  const approvalCommandId = params.approvalCommandId?.trim() || params.approvalSlug;
  const allowedDecisions = resolveAllowedDecisions(params);
  const descriptors = buildExecApprovalActionDescriptors({ approvalCommandId, allowedDecisions });
  const primaryAction = descriptors[0] ?? null;
  const secondaryActions = descriptors.slice(1);
  const lines: string[] = [];
  const warningText = params.warningText?.trim();
  if (warningText) lines.push(warningText);
  lines.push("Approval required.");
  if (primaryAction) {
    lines.push("Run:");
    lines.push(buildFence(primaryAction.command, "txt"));
  }
  lines.push("Pending command:");
  lines.push(buildFence(params.command, "sh"));
  const secondaryFence = buildApprovalCommandFence(secondaryActions);
  if (secondaryFence) {
    lines.push("Other options:");
    lines.push(secondaryFence);
  }
  if (!allowedDecisions.includes("allow-always")) {
    lines.push(
      "The effective approval policy requires approval every time, so Allow Always is unavailable.",
    );
  }
  const info: string[] = [];
  info.push(`Host: ${params.host}`);
  if (params.nodeId) info.push(`Node: ${params.nodeId}`);
  if (params.cwd) info.push(`CWD: ${formatApprovalDisplayPath(params.cwd)}`);
  if (typeof params.expiresAtMs === "number" && Number.isFinite(params.expiresAtMs)) {
    info.push(
      `Expires in: ${formatExecApprovalExpiresIn(params.expiresAtMs, params.nowMs ?? Date.now())}`,
    );
  }
  info.push(`Full id: \`${params.approvalId}\``);
  lines.push(info.join("\n"));
  return {
    text: lines.join("\n\n"),
    presentation: buildApprovalPresentation({ approvalId: params.approvalId, allowedDecisions }),
    channelData: {
      execApproval: {
        approvalId: params.approvalId,
        approvalSlug: params.approvalSlug,
        approvalKind: "exec",
        agentId: normalizeOptionalString(params.agentId),
        allowedDecisions,
        sessionKey: normalizeOptionalString(params.sessionKey),
      },
    },
  };
}

export function buildExecApprovalUnavailableReplyPayload(
  params: ExecApprovalUnavailableReplyParams,
): ReplyPayload {
  const lines: string[] = [];
  const warningText = params.warningText?.trim();
  if (warningText) lines.push(warningText);
  const fallbackText = buildGenericNativeExecApprovalFallbackText({
    excludeChannel: params.channel,
  });
  if (params.reason === "initiating-platform-disabled") {
    lines.push(
      `Approvals are disabled for ${params.channelLabel ?? params.channel ?? "this channel"}. ${fallbackText}`,
    );
  } else if (params.reason === "initiating-platform-unsupported") {
    lines.push(
      `${params.channelLabel ?? params.channel ?? "This channel"} does not support native approvals. ${fallbackText}`,
    );
  } else {
    lines.push(`No approval route is available. ${fallbackText}`);
  }
  if (params.sentApproverDm) {
    lines.push(getExecApprovalApproverDmNoticeText());
  }
  return { text: lines.join("\n\n") };
}

export function describeExecApprovalUnavailableClientSetup(params: {
  channel?: string | null;
}): string {
  return describeNativeExecApprovalClientSetup() ?? "";
}

export function isExecApprovalClientSupported(channel: string): boolean {
  return supportsNativeExecApprovalClient(channel);
}
