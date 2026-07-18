// 移植自 openclaw/src/infra/approval-gateway-resolver.ts（降级实现）
// 解析审批网关目标。
import type { OpenClawConfig } from "./_runtime-stubs.js";

export type ApprovalGatewayTarget = {
  url: string;
  token?: string;
  label?: string;
};

export type ApprovalGatewayResolverOptions = {
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
};

/**
 * 解析审批网关目标。
 * 降级实现：从环境变量读取，不依赖完整 OpenClawConfig。
 */
export function resolveApprovalGatewayTarget(params?: ApprovalGatewayResolverOptions): ApprovalGatewayTarget | null {
  const env = params?.env ?? process.env;
  const url = env.OPENCLAW_GATEWAY_URL;
  if (!url) return null;
  return {
    url,
    token: env.OPENCLAW_GATEWAY_TOKEN,
    label: env.OPENCLAW_GATEWAY_LABEL,
  };
}

/** 列出所有配置的审批网关目标（降级：返回单个或空） */
export function listApprovalGatewayTargets(params?: ApprovalGatewayResolverOptions): ApprovalGatewayTarget[] {
  const target = resolveApprovalGatewayTarget(params);
  return target ? [target] : [];
}

/** 解析默认审批网关目标（降级：同 resolveApprovalGatewayTarget） */
export function resolveDefaultApprovalGatewayTarget(params?: ApprovalGatewayResolverOptions): ApprovalGatewayTarget | null {
  return resolveApprovalGatewayTarget(params);
}
