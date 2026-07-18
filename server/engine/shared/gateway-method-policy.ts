// gateway 方法策略：描述每个方法允许的传输与权限要求（纯类型模块）
/** gateway 方法的传输策略 */
export type GatewayMethodPolicy = {
  /** 允许承载此方法的传输通道（空表示无限制） */
  transports?: ReadonlyArray<"http" | "ws" | "stdio" | "internal">;
  /** 是否要求认证 */
  authRequired?: boolean;
  /** 是否需要管理员权限 */
  adminRequired?: boolean;
  /** 是否需要会话绑定 */
  sessionBound?: boolean;
  /** 是否允许跨账户调用 */
  crossAccount?: boolean;
  /** 是否记录审计日志 */
  audited?: boolean;
  /** 是否允许通过子代理调用 */
  subagentAllowed?: boolean;
};

/** 默认策略：要求认证、不允许跨账户、不允许子代理调用 */
export const DEFAULT_GATEWAY_METHOD_POLICY: GatewayMethodPolicy = {
  authRequired: true,
  crossAccount: false,
  subagentAllowed: false,
  audited: false,
};

/** 检查方法是否允许在指定传输上调用 */
export function isTransportAllowed(
  policy: GatewayMethodPolicy,
  transport: "http" | "ws" | "stdio" | "internal",
): boolean {
  if (!policy.transports || policy.transports.length === 0) {
    return true;
  }
  return policy.transports.includes(transport);
}
