// 移植自 openclaw/src/infra/approval-handler-runtime-types.ts（降级实现）
// 定义 channel-native 审批 handler 运行时类型。
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type { ChannelApprovalKind } from "./approval-types.js";
import type {
  ExpiredApprovalView,
  PendingApprovalView,
  ResolvedApprovalView,
  ApprovalRequest,
  ApprovalResolved,
} from "./approval-view-model.types.js";
import type { ExecApprovalChannelRuntimeEventKind } from "./exec-approval-channel-runtime.types.js";

export type { ChannelApprovalKind, ApprovalRequest, ApprovalResolved };
export type { PendingApprovalView, ResolvedApprovalView, ExpiredApprovalView };

/** 通道审批能力上下文 */
export type ChannelApprovalCapabilityHandlerContext = {
  cfg: OpenClawConfig;
  accountId?: string | null;
  gatewayUrl?: string;
  context?: unknown;
};

/** 更新/删除/清除/离开审批条目的指令 */
export type ChannelApprovalNativeFinalAction<TPayload> =
  | { kind: "update"; payload: TPayload }
  | { kind: "delete" }
  | { kind: "clear-actions" }
  | { kind: "leave" };

/** 可用性门控 */
export type ChannelApprovalNativeAvailabilityAdapter = {
  isConfigured: (params: ChannelApprovalCapabilityHandlerContext) => boolean;
  shouldHandle: (
    params: ChannelApprovalCapabilityHandlerContext & { request: ApprovalRequest },
  ) => boolean;
};

/** 构建 channel-native 负载的展示适配器 */
export type ChannelApprovalNativePresentationAdapter<
  TPendingPayload = unknown,
  TFinalPayload = unknown,
> = {
  buildPendingPayload: (
    params: ChannelApprovalCapabilityHandlerContext & {
      request: ApprovalRequest;
      approvalKind: ChannelApprovalKind;
      nowMs: number;
      view: PendingApprovalView;
    },
  ) => TPendingPayload | Promise<TPendingPayload>;
  buildResolvedResult: (
    params: ChannelApprovalCapabilityHandlerContext & {
      request: ApprovalRequest;
      resolved: ApprovalResolved;
      view: ResolvedApprovalView;
      entry: unknown;
    },
  ) =>
    | ChannelApprovalNativeFinalAction<TFinalPayload>
    | Promise<ChannelApprovalNativeFinalAction<TFinalPayload>>;
  buildExpiredResult: (
    params: ChannelApprovalCapabilityHandlerContext & {
      request: ApprovalRequest;
      view: ExpiredApprovalView;
      entry: unknown;
    },
  ) =>
    | ChannelApprovalNativeFinalAction<TFinalPayload>
    | Promise<ChannelApprovalNativeFinalAction<TFinalPayload>>;
};

/** 传输适配器 */
export type ChannelApprovalNativeTransportAdapter<
  TPreparedTarget = unknown,
  TPendingEntry = unknown,
  TPendingPayload = unknown,
  TFinalPayload = unknown,
  TPendingView extends PendingApprovalView = PendingApprovalView,
> = {
  prepareTarget: (
    params: ChannelApprovalCapabilityHandlerContext & {
      plannedTarget: unknown;
      request: ApprovalRequest;
      approvalKind: ChannelApprovalKind;
      view: TPendingView;
      pendingPayload: TPendingPayload;
    },
  ) => unknown | null | Promise<unknown | null>;
  deliverPending: (
    params: ChannelApprovalCapabilityHandlerContext & {
      plannedTarget: unknown;
      preparedTarget: TPreparedTarget;
      request: ApprovalRequest;
      approvalKind: ChannelApprovalKind;
      view: TPendingView;
      pendingPayload: TPendingPayload;
    },
  ) => TPendingEntry | null | Promise<TPendingEntry | null>;
  updateEntry?: (
    params: ChannelApprovalCapabilityHandlerContext & {
      entry: TPendingEntry;
      payload: TFinalPayload;
      phase: "resolved" | "expired";
    },
  ) => Promise<void>;
  deleteEntry?: (
    params: ChannelApprovalCapabilityHandlerContext & {
      entry: TPendingEntry;
      phase: "resolved" | "expired";
    },
  ) => Promise<void>;
};

/** 交互适配器 */
export type ChannelApprovalNativeInteractionAdapter = {
  parseDecisionCommand?: (
    params: ChannelApprovalCapabilityHandlerContext & { text: string },
  ) => { approvalId: string; decision: "allow-once" | "allow-always" | "deny" } | null;
  resolveInlineDecision?: (
    params: ChannelApprovalCapabilityHandlerContext & { request: ApprovalRequest },
  ) => "allow-once" | "allow-always" | "deny" | null;
};

/** 观察适配器 */
export type ChannelApprovalNativeObserveAdapter = {
  onPending?: (params: { request: ApprovalRequest; view: PendingApprovalView }) => void;
  onResolved?: (params: { request: ApprovalRequest; resolved: ApprovalResolved }) => void;
  onExpired?: (params: { request: ApprovalRequest }) => void;
};

/** channel-native 运行时适配器聚合 */
export type ChannelApprovalNativeRuntimeAdapter<
  TPreparedTarget = unknown,
  TPendingEntry = unknown,
  TPendingPayload = unknown,
  TFinalPayload = unknown,
> = {
  availability: ChannelApprovalNativeAvailabilityAdapter;
  presentation: ChannelApprovalNativePresentationAdapter<TPendingPayload, TFinalPayload>;
  transport?: ChannelApprovalNativeTransportAdapter<
    TPreparedTarget,
    TPendingEntry,
    TPendingPayload,
    TFinalPayload
  >;
  interaction?: ChannelApprovalNativeInteractionAdapter;
  observe?: ChannelApprovalNativeObserveAdapter;
};

/** channel-native 运行时规范 */
export type ChannelApprovalNativeRuntimeSpec<
  TPreparedTarget = unknown,
  TPendingEntry = unknown,
  TPendingPayload = unknown,
  TFinalPayload = unknown,
> = {
  channel: string;
  adapter: ChannelApprovalNativeRuntimeAdapter<
    TPreparedTarget,
    TPendingEntry,
    TPendingPayload,
    TFinalPayload
  >;
};

export type { ExecApprovalChannelRuntimeEventKind };
