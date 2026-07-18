// 移植自 openclaw/src/config/gateway-control-ui-origins.ts
// 解析 gateway 访问允许的 Control UI 源。
//
// 降级说明：源文件依赖 ./paths.js 的 DEFAULT_GATEWAY_PORT 常量。cross-wms
// 的 paths.ts 未导出该常量，此处使用与 openclaw 一致的静态默认值 18789，
// 与 cli/error-format.ts 的 DEFAULT_GATEWAY_PORT_EXAMPLE 保持一致。
import type { OpenClawConfig } from './types/openclaw.js';

/** 降级说明：与 openclaw paths.ts 的 DEFAULT_GATEWAY_PORT 一致的默认端口。 */
const DEFAULT_GATEWAY_PORT = 18789;

/** 需要显式 Control UI 允许源的非 loopback gateway 绑定模式。 */
export type GatewayNonLoopbackBindMode = 'lan' | 'tailnet' | 'custom' | 'auto';

/** 将任意配置/运行时绑定值收窄为非 loopback 绑定模式。 */
export function isGatewayNonLoopbackBindMode(bind: unknown): bind is GatewayNonLoopbackBindMode {
  return bind === 'lan' || bind === 'tailnet' || bind === 'custom' || bind === 'auto';
}

/** 返回 Control UI 源配置是否已足够显式以支持非 loopback 绑定。 */
export function hasConfiguredControlUiAllowedOrigins(params: {
  allowedOrigins: unknown;
  dangerouslyAllowHostHeaderOriginFallback: unknown;
}): boolean {
  if (params.dangerouslyAllowHostHeaderOriginFallback === true) {
    return true;
  }
  return (
    Array.isArray(params.allowedOrigins) &&
    params.allowedOrigins.some((origin) => typeof origin === 'string' && origin.trim().length > 0)
  );
}

/** 解析构造默认 Control UI 源时使用的 gateway 端口。 */
export function resolveGatewayPortWithDefault(
  port: unknown,
  fallback = DEFAULT_GATEWAY_PORT,
): number {
  return typeof port === 'number' && port > 0 ? port : fallback;
}

/** 为已解析的 gateway 端口构建 loopback 加上自定义绑定的 Control UI 源。 */
export function buildDefaultControlUiAllowedOrigins(params: {
  port: number;
  bind: unknown;
  customBindHost?: string;
}): string[] {
  const origins = new Set<string>([
    `http://localhost:${params.port}`,
    `http://127.0.0.1:${params.port}`,
  ]);
  const customBindHost = params.customBindHost?.trim();
  if (params.bind === 'custom' && customBindHost) {
    origins.add(`http://${customBindHost}:${params.port}`);
  }
  return [...origins];
}

/** 在非 loopback gateway 启动校验之前植入安全的默认 Control UI 源。 */
export function ensureControlUiAllowedOriginsForNonLoopbackBind(
  config: OpenClawConfig,
  opts?: {
    defaultPort?: number;
    requireControlUiEnabled?: boolean;
    /** 已解析的运行时绑定覆盖。对应 Gateway 运行时优先级：
     *  显式 CLI/运行时绑定优先于 gateway.bind。 */
    runtimeBind?: unknown;
    /** 已解析的运行时端口覆盖。对应 Gateway 运行时优先级：
     *  显式 CLI/运行时端口优先于 gateway.port。 */
    runtimePort?: unknown;
    /** 可选的容器检测回调。当提供且 `gateway.bind` 未设置时，调用该函数
     *  判断运行时是否将默认为 `"auto"`（容器），以便主动植入源。将其作为
     *  注入回调可避免配置层对 gateway 运行时层的硬依赖。 */
    isContainerEnvironment?: () => boolean;
  },
): {
  config: OpenClawConfig;
  seededOrigins: string[] | null;
  bind: GatewayNonLoopbackBindMode | null;
} {
  const bind = opts?.runtimeBind ?? config.gateway?.bind;
  // 当绑定未设置（undefined）且位于容器内时，运行时将通过 defaultGatewayBindMode()
  // 默认为 "auto" → 0.0.0.0。必须在 resolveGatewayRuntimeConfig 运行之前植入源，
  // 否则非 loopback Control UI 源检查将在启动时硬失败。
  const effectiveBind: typeof bind =
    bind ?? (opts?.isContainerEnvironment?.() ? 'auto' : undefined);
  if (!isGatewayNonLoopbackBindMode(effectiveBind)) {
    return { config, seededOrigins: null, bind: null };
  }
  if (opts?.requireControlUiEnabled && config.gateway?.controlUi?.enabled === false) {
    return { config, seededOrigins: null, bind: effectiveBind };
  }
  if (
    hasConfiguredControlUiAllowedOrigins({
      allowedOrigins: config.gateway?.controlUi?.allowedOrigins,
      dangerouslyAllowHostHeaderOriginFallback:
        config.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback,
    })
  ) {
    return { config, seededOrigins: null, bind: effectiveBind };
  }

  const port = resolveGatewayPortWithDefault(
    opts?.runtimePort ?? config.gateway?.port,
    opts?.defaultPort,
  );
  const seededOrigins = buildDefaultControlUiAllowedOrigins({
    port,
    bind: effectiveBind,
    customBindHost: config.gateway?.customBindHost,
  });
  return {
    config: {
      ...config,
      gateway: {
        ...config.gateway,
        controlUi: {
          ...config.gateway?.controlUi,
          allowedOrigins: seededOrigins,
        },
      },
    },
    seededOrigins,
    bind: effectiveBind,
  };
}
