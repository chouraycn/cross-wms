// Gateway secret-input 路径辅助。
// 列出可能包含明文值或 SecretRef 的配置位置。
// 移植自 openclaw/src/gateway/secret-input-paths.ts。
// 依赖调整：../config/types.openclaw.js → 本地 _openclaw-stubs.ts（OpenClawConfig 占位类型）。
import type { OpenClawConfig } from "./_openclaw-stubs.js";

/** 可能含明文或 secret ref 的 Gateway 配置路径。 */
export type SupportedGatewaySecretInputPath =
  | "gateway.auth.token"
  | "gateway.auth.password"
  | "gateway.remote.token"
  | "gateway.remote.password";

/** Gateway secret-ref 凭据选择的稳定扫描顺序。 */
export const ALL_GATEWAY_SECRET_INPUT_PATHS: SupportedGatewaySecretInputPath[] = [
  "gateway.auth.token",
  "gateway.auth.password",
  "gateway.remote.token",
  "gateway.remote.password",
];

/** 将任意 error/config 路径收窄为受支持的 Gateway secret 输入之一。 */
export function isSupportedGatewaySecretInputPath(
  path: string,
): path is SupportedGatewaySecretInputPath {
  return ALL_GATEWAY_SECRET_INPUT_PATHS.includes(path as SupportedGatewaySecretInputPath);
}

/** 读取一个 Gateway secret 输入，不假设其为明文、ref 还是缺失。 */
export function readGatewaySecretInputValue(
  config: OpenClawConfig,
  path: SupportedGatewaySecretInputPath,
): unknown {
  if (path === "gateway.auth.token") {
    return config.gateway?.auth?.token;
  }
  if (path === "gateway.auth.password") {
    return config.gateway?.auth?.password;
  }
  if (path === "gateway.remote.token") {
    return config.gateway?.remote?.token;
  }
  return config.gateway?.remote?.password;
}

/** 在克隆配置上将一个 Gateway secret 输入替换为已解析的明文值。 */
export function assignResolvedGatewaySecretInput(params: {
  config: OpenClawConfig;
  path: SupportedGatewaySecretInputPath;
  value: string | undefined;
}): void {
  const { config, path, value } = params;
  if (path === "gateway.auth.token") {
    if (config.gateway?.auth) {
      config.gateway.auth.token = value;
    }
    return;
  }
  if (path === "gateway.auth.password") {
    if (config.gateway?.auth) {
      config.gateway.auth.password = value;
    }
    return;
  }
  if (path === "gateway.remote.token") {
    if (config.gateway?.remote) {
      config.gateway.remote.token = value;
    }
    return;
  }
  if (config.gateway?.remote) {
    config.gateway.remote.password = value;
  }
}

/** 区分 token 路径与 password 路径，用于 auth-mode 优先级检查。 */
export function isTokenGatewaySecretInputPath(path: SupportedGatewaySecretInputPath): boolean {
  return path === "gateway.auth.token" || path === "gateway.remote.token";
}
