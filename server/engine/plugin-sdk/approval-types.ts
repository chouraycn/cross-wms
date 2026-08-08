import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ExecApprovalRequest } from "../infra/exec-approvals.js";
import type { PluginApprovalRequest } from "../infra/plugin-approvals.js";
import type { ExecApprovalSessionTarget } from "../infra/exec-approval-session-target.js";

export type ApprovalKind = "exec" | "plugin";

export type ApprovalRequest = ExecApprovalRequest | PluginApprovalRequest;

export type NativeApprovalTarget = {
  to: string;
  accountId?: string | null;
  threadId?: string | number | null;
};

export type ChannelApprovalForwardTarget = {
  channel?: string;
  source?: "session" | "origin" | "target";
  to?: string;
  accountId?: string | null;
  threadId?: string | number | null;
};

export type ChannelOutboundPayloadHint = {
  kind: string;
  approvalKind?: ApprovalKind;
  nativeRouteActive?: boolean;
};

export type ChannelActionAvailabilityState =
  | { kind: "enabled" }
  | { kind: "disabled"; reason?: string };

export type ChannelApprovalInitiatingSurfaceState =
  | { kind: "enabled" }
  | { kind: "disabled"; reason?: string };

export type ChannelApprovalNativeSurface = "origin" | "approver-dm" | "both";

export type ChannelApprovalNativeDeliveryCapabilities = {
  enabled: boolean;
  preferredSurface: ChannelApprovalNativeSurface;
  supportsOriginSurface: boolean;
  supportsApproverDmSurface: boolean;
  notifyOriginWhenDmOnly: boolean;
};

export type ChannelApprovalCapability = {
  authorizeActorAction?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    senderId?: string | null;
    action: "approve";
    approvalKind: ApprovalKind;
  }) => { authorized: true } | { authorized: false; reason: string };
  getActionAvailabilityState?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    action: "approve";
  }) => ChannelActionAvailabilityState;
  getExecInitiatingSurfaceState?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    action: "approve";
  }) => ChannelApprovalInitiatingSurfaceState;
  resolveApproveCommandBehavior?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
  }) => unknown;
  describeExecApprovalSetup?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
  }) => unknown;
  delivery?: {
    hasConfiguredDmRoute?: (params: { cfg: OpenClawConfig }) => boolean;
    shouldSuppressForwardingFallback?: (input: {
      cfg: OpenClawConfig;
      approvalKind: ApprovalKind;
      target: ChannelApprovalForwardTarget;
      request: ApprovalRequest;
    }) => boolean;
  };
  nativeRuntime?: any;
  render?: any;
  native?: {
    describeDeliveryCapabilities?: (params: {
      cfg: OpenClawConfig;
      accountId?: string | null;
      approvalKind: ApprovalKind;
      request: ApprovalRequest;
    }) => ChannelApprovalNativeDeliveryCapabilities;
    resolveOriginTarget?: (params: {
      cfg: OpenClawConfig;
      accountId?: string | null;
      approvalKind: ApprovalKind;
      request: ApprovalRequest;
    }) => NativeApprovalTarget | null | Promise<NativeApprovalTarget | null>;
    resolveApproverDmTargets?: (params: {
      cfg: OpenClawConfig;
      accountId?: string | null;
      approvalKind: ApprovalKind;
      request: ApprovalRequest;
    }) => NativeApprovalTarget[] | Promise<NativeApprovalTarget[]>;
  };
};

export type PendingApprovalView = {
  approvalId: string;
  approvalKind: ApprovalKind;
  actions: Array<{
    id: string;
    label: string;
    style?: "primary" | "secondary";
    command?: string;
    decision?: string;
  }>;
  actor?: { displayName?: string; id?: string };
  bodyMarkdown?: string;
  scopeLabel?: string;
  title?: string;
  description?: string;
  severity?: string;
  toolName?: string;
  pluginId?: string;
  expiresAt?: number | null;
  expiresAtMs?: number | null;
  allowFreeformReason?: boolean;
  warningText?: string;
  commandAnalysis?: { warningLines?: string[] };
  commandText?: string;
  cwd?: string;
  host?: string;
  nodeId?: string;
  agentId?: string;
  ask?: string;
  sessionKey?: string;
};
