// 移植自 openclaw/src/infra/exec-approval-surface.ts（降级实现）
// 解析发起通道表面的 native 审批支持。
//
// 降级策略：源文件依赖 ../channels/plugins/index.js、../config/config.js、../utils/message-channel.js，
// 这些模块未移植到 cross-wms。这里提供降级的类型与函数。
import { normalizeOptionalString } from "./string-coerce.js";
import type { OpenClawConfig } from "./_runtime-stubs.js";

export type ExecApprovalInitiatingSurfaceState =
  | { kind: "enabled"; channel: string | undefined; channelLabel: string; accountId?: string }
  | { kind: "disabled"; channel: string; channelLabel: string; accountId?: string }
  | { kind: "unsupported"; channel: string; channelLabel: string; accountId?: string };

type ApprovalKind = "exec" | "plugin";

function labelForChannel(channel?: string): string {
  if (channel === "tui") {
    return "terminal UI";
  }
  if (!channel) {
    return "this platform";
  }
  return channel[0]?.toUpperCase() + channel.slice(1);
}

export function resolveExecApprovalInitiatingSurfaceState(params: {
  channel?: string | null;
  accountId?: string | null;
  cfg?: OpenClawConfig;
}): ExecApprovalInitiatingSurfaceState {
  return resolveApprovalInitiatingSurfaceState({ ...params, approvalKind: "exec" });
}

export function resolveApprovalInitiatingSurfaceState(params: {
  channel?: string | null;
  accountId?: string | null;
  cfg?: OpenClawConfig;
  approvalKind: ApprovalKind;
}): ExecApprovalInitiatingSurfaceState {
  const channel = normalizeOptionalString(params.channel) ?? undefined;
  const channelLabel = labelForChannel(channel);
  const accountId = normalizeOptionalString(params.accountId) ?? undefined;
  if (!channel || channel === "internal" || channel === "tui") {
    return { kind: "enabled", channel, channelLabel, accountId };
  }
  // 降级实现：所有其他通道视为不支持 native 审批
  return { kind: "unsupported", channel, channelLabel, accountId };
}

export function supportsNativeExecApprovalClient(_channel?: string | null): boolean {
  return false;
}

export function listNativeExecApprovalClientLabels(_params?: {
  cfg?: OpenClawConfig;
}): string[] {
  return [];
}

export function describeNativeExecApprovalClientSetup(_params?: {
  cfg?: OpenClawConfig;
}): string | null {
  return null;
}
