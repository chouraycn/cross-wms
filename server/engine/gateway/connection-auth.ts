// Gateway 连接鉴权门面。
// 移植自 openclaw/src/gateway/connection-auth.ts
//
// 适配说明：
//  - ../config/types.openclaw.js（OpenClawConfig）在 cross-wms 中为 stub，
//    使用 Record<string, unknown> 宽松类型替代
//  - ./credentials-secret-inputs.js（resolveGatewayCredentialsWithSecretInputs）在 cross-wms 中为 stub，
//    降级为：通过 resolveGatewayAuth 解析凭据，不支持 SecretRef 异步解析
//  - ./credentials.js（resolveGatewayCredentialsFromConfig）在 cross-wms 中为 stub，
//    降级同上
//
// 降级限制：
//  - 不支持异步 SecretRef 解析（file:、env: 等前缀）
//  - 不支持 credentials precedence 配置

import { resolveGatewayAuth, type GatewayAuthConfig } from "./auth-resolve.js";

/** 已加载 config 的 gateway 客户端接受的连接鉴权选项。 */
export type GatewayConnectionAuthOptions = {
  config: Record<string, unknown>;
  authConfig?: GatewayAuthConfig | null;
  authOverride?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
};

/** 解析 gateway 连接凭据，包括配置的 SecretRef 输入。 */
export async function resolveGatewayConnectionAuth(
  params: GatewayConnectionAuthOptions,
): Promise<{ token?: string; password?: string }> {
  // 降级实现：openclaw 通过 resolveGatewayCredentialsWithSecretInputs 支持异步
  // SecretRef 解析。cross-wms 的该函数为 stub，此处通过 resolveGatewayAuth
  // 从 config + env 读取明文凭据。
  const authConfig: GatewayAuthConfig | null =
    params.authConfig ??
    ((params.config.gateway as { auth?: GatewayAuthConfig } | undefined)?.auth ?? null);
  const resolved = resolveGatewayAuth({
    authConfig,
    authOverride: params.authOverride,
    env: params.env,
  });
  return {
    ...(resolved.token ? { token: resolved.token } : {}),
    ...(resolved.password ? { password: resolved.password } : {}),
  };
}
