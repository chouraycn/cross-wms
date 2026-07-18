// Lazy gateway RPC facade and shared Commander options for CLI subcommands.
// 移植自 openclaw/src/cli/gateway-rpc.ts。
//
// 降级策略：
//  - 原模块依赖 ../../packages/gateway-protocol/src/client-info.js 的
//    GatewayClientMode/GatewayClientName、../gateway/operator-scopes.js 的 OperatorScope、
//    ../infra/device-identity.js 的 DeviceIdentity、../shared/lazy-promise.js。
//    cross-wms 均未移植；内联降级类型与运行时。
//  - callGatewayFromCliRuntime 委托给已移植的 gateway-rpc.runtime.js（降级版本）。

import type { Command } from "commander";
import type { GatewayRpcOpts } from "./gateway-rpc.types.js";

export type { GatewayRpcOpts } from "./gateway-rpc.types.js";

// ===== 内联降级类型 =====
type GatewayClientName = string;
type GatewayClientMode = string;
type OperatorScope = string;
type DeviceIdentity = unknown;
// ===== 类型结束 =====

export function addGatewayClientOptions(cmd: Command): Command {
  return cmd
    .option("--url <url>", "Gateway WebSocket URL (defaults to gateway.remote.url when configured)")
    .option("--token <token>", "Gateway token (if required)")
    .option("--timeout <ms>", "Timeout in ms", "30000")
    .option("--expect-final", "Wait for final response (agent)", false);
}

/**
 * Call the gateway from a CLI subcommand.
 *
 * 降级实现：委托给已移植的 gateway-rpc.runtime.ts 的 callGatewayFromCliRuntime。
 */
export async function callGatewayFromCli(
  method: string,
  opts: GatewayRpcOpts,
  params?: unknown,
  extra?: {
    clientName?: GatewayClientName;
    mode?: GatewayClientMode;
    deviceIdentity?: DeviceIdentity | null;
    expectFinal?: boolean;
    progress?: boolean;
    scopes?: OperatorScope[];
  },
): Promise<unknown> {
  const runtime = await import("./gateway-rpc.runtime.js");
  return await runtime.callGatewayFromCliRuntime(method, opts, params, extra);
}
