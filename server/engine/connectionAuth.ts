/**
 * 连接认证门面 — 参考 OpenClaw gateway/connection-auth.ts
 *
 * 解析配置支持的客户端凭证，支持带或不带异步 SecretRef。
 */

import { logger } from '../logger.js';

export interface GatewayConnectionAuthOptions {
  config?: Record<string, unknown>;
  token?: string;
  password?: string;
}

export async function resolveGatewayConnectionAuth(
  params: GatewayConnectionAuthOptions,
): Promise<{ token?: string; password?: string }> {
  const authConfig = params.config?.auth as Record<string, unknown> | undefined;
  const token = params.token ?? (authConfig?.token as string | undefined);
  const password = params.password ?? (authConfig?.password as string | undefined);

  logger.debug('[ConnectionAuth] 解析网关连接凭证', {
    hasToken: !!token,
    hasPassword: !!password,
  });

  return { token, password };
}