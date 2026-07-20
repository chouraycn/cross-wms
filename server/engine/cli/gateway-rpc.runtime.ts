// Runtime gateway RPC helper shared by CLI commands that call the Gateway.
// 移植自 openclaw/src/cli/gateway-rpc.runtime.ts。
//
// 降级策略：
//  - 原模块依赖 ../../packages/gateway-protocol/src/client-info.js 的
//    GATEWAY_CLIENT_MODES/GATEWAY_CLIENT_NAMES、../gateway/call.js 的 callGateway。
//    cross-wms 均未移植；降级为抛出 "not supported" 错误。
//  - 原模块依赖 ./parse-timeout.js（已移植）与 ./progress.js（已移植）。

import type { GatewayRpcOpts } from "./gateway-rpc.types.js";
import { parseTimeoutMsWithFallback } from "./parse-timeout.js";
import { withProgress } from "./progress.js";

type CallGatewayFromCliRuntimeExtra = {
  clientName?: string;
  mode?: string;
  deviceIdentity?: unknown;
  expectFinal?: boolean;
  progress?: boolean;
  scopes?: string[];
};

const DEFAULT_GATEWAY_RPC_TIMEOUT_MS = 30_000;

// ===== 内联 callGateway stub =====
async function callGateway(_params: {
  url?: string;
  token?: string;
  method: string;
  params?: unknown;
  deviceIdentity?: unknown;
  expectFinal?: boolean;
  scopes?: string[];
  timeoutMs: number;
  clientName?: string;
  mode?: string;
}): Promise<unknown> {
  // 降级：openclaw 的 gateway/call.js 未移植。
  console.error("Gateway RPC is not available in cross-wms");
  process.exit(1);
}
// ===== stub 结束 =====

/**
 * Call the gateway from a CLI subcommand runtime.
 *
 * 降级实现：openclaw 的 gateway/call.js 未移植。这里保留调用结构与进度提示，
 * 但 callGateway 会抛出 "not supported" 错误。
 */
export async function callGatewayFromCliRuntime(
  method: string,
  opts: GatewayRpcOpts,
  params?: unknown,
  extra?: CallGatewayFromCliRuntimeExtra,
): Promise<unknown> {
  const showProgress = extra?.progress ?? opts.json !== true;
  const timeoutMs = parseTimeoutMsWithFallback(opts.timeout, DEFAULT_GATEWAY_RPC_TIMEOUT_MS, {
    invalidType: "error",
  });
  return await withProgress(
    {
      label: `Gateway ${method}`,
      indeterminate: true,
      enabled: showProgress,
    },
    async () =>
      await callGateway({
        url: opts.url,
        token: opts.token,
        method,
        params,
        deviceIdentity: extra?.deviceIdentity,
        expectFinal: extra?.expectFinal ?? Boolean(opts.expectFinal),
        scopes: extra?.scopes,
        timeoutMs,
        clientName: extra?.clientName ?? "cli",
        mode: extra?.mode ?? "cli",
      }),
  );
}
