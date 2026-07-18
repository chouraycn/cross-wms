// 移植自 openclaw/src/infra/exec-approval-channel-runtime.types.ts
// 定义 channel-native 审批运行时契约。
//
// 降级策略：
// 1. 源文件依赖 ../config/types.openclaw.js 的 OpenClawConfig，从 ./_runtime-stubs.js 导入
// 2. 源文件依赖 ./exec-approvals.js 的 ExecApprovalRequest/ExecApprovalResolved（已降级移植）
// 3. 源文件依赖 ./plugin-approvals.js 的 PluginApprovalRequest/PluginApprovalResolved（已移植）
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type { ExecApprovalRequest, ExecApprovalResolved } from "./exec-approvals.js";
import type { PluginApprovalRequest, PluginApprovalResolved } from "./plugin-approvals.js";

type ApprovalRequestEvent = ExecApprovalRequest | PluginApprovalRequest;
type ApprovalResolvedEvent = ExecApprovalResolved | PluginApprovalResolved;

/** Approval event families a channel-native approval runtime can subscribe to. */
export type ExecApprovalChannelRuntimeEventKind = "exec" | "plugin";

/** Adapter implemented by a channel to deliver and finalize native approval prompts. */
export type ExecApprovalChannelRuntimeAdapter<
  TPending,
  TRequest extends ApprovalRequestEvent = ExecApprovalRequest,
  TResolved extends ApprovalResolvedEvent = ExecApprovalResolved,
> = {
  label: string;
  clientDisplayName: string;
  cfg: OpenClawConfig;
  gatewayUrl?: string;
  eventKinds?: readonly ExecApprovalChannelRuntimeEventKind[];
  isConfigured: () => boolean;
  shouldHandle: (request: TRequest) => boolean;
  deliverRequested: (request: TRequest) => Promise<TPending[]>;
  beforeGatewayClientStart?: () => Promise<void> | void;
  finalizeResolved: (params: {
    request: TRequest;
    resolved: TResolved;
    entries: TPending[];
  }) => Promise<void>;
  finalizeExpired?: (params: { request: TRequest; entries: TPending[] }) => Promise<void>;
  onStopped?: () => Promise<void> | void;
  nowMs?: () => number;
};

/** Runtime handle used by approval bootstrap code to manage a channel-native approval client. */
export type ExecApprovalChannelRuntime<
  TRequest extends ApprovalRequestEvent = ExecApprovalRequest,
  TResolved extends ApprovalResolvedEvent = ExecApprovalResolved,
> = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  handleRequested: (request: TRequest) => Promise<void>;
  handleResolved: (resolved: TResolved) => Promise<void>;
  handleExpired: (approvalId: string) => Promise<void>;
  request: <T = unknown>(method: string, params: Record<string, unknown>) => Promise<T>;
};
