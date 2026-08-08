// Runtime gateway RPC helpers for node host and node pairing CLI commands.
// 移植自 openclaw/src/cli/nodes-cli/rpc.runtime.ts

import { parseTimeoutMsWithFallback } from "./parse-timeout.js";
import { withProgress } from "./progress.js";
import type { NodesRpcOpts } from "./types.js";
import { callGateway } from "./gateway-call.js";

const NODE_PAIR_APPROVAL_GATEWAY_METHODS = new Set<string>([
  "node.pair.list",
  "node.pair.approve",
]);
const DEFAULT_NODES_RPC_TIMEOUT_MS = 10_000;

function resolveNodesTransportTimeoutMs(
  opts: NodesRpcOpts,
  overrideMs?: number,
): number {
  return overrideMs ?? parseTimeoutMsWithFallback(opts.timeout, DEFAULT_NODES_RPC_TIMEOUT_MS);
}

export async function callGatewayCliRuntime(
  method: string,
  opts: NodesRpcOpts,
  params?: any,
  callOpts?: {
    scopes?: string[];
    transportTimeoutMs?: number;
    useStoredDeviceAuth?: boolean;
    requiredStoredDeviceAuthScopes?: string[];
    useLocalBackendSharedAuth?: boolean;
  },
) {
  return await withProgress(
    {
      label: `Nodes ${method}`,
      indeterminate: true,
      enabled: opts.json !== true,
    },
    async () =>
      await callGateway({
        url: opts.url,
        token: opts.token,
        method,
        params,
        scopes: callOpts?.scopes,
        useStoredDeviceAuth: callOpts?.useStoredDeviceAuth,
        requiredStoredDeviceAuthScopes: callOpts?.requiredStoredDeviceAuthScopes,
        requireLocalBackendSharedAuth: callOpts?.useLocalBackendSharedAuth,
        timeoutMs: resolveNodesTransportTimeoutMs(opts, callOpts?.transportTimeoutMs),
        clientName: callOpts?.useLocalBackendSharedAuth ? "gateway-client" : "cli",
        mode: callOpts?.useLocalBackendSharedAuth ? "backend" : "cli",
      }),
  );
}

export async function callNodePairApprovalGatewayCliRuntime(
  method: "node.pair.list" | "node.pair.approve",
  opts: NodesRpcOpts,
  params: any,
  callOpts: { scopes: string[]; transportTimeoutMs?: number },
) {
  if (!NODE_PAIR_APPROVAL_GATEWAY_METHODS.has(method)) {
    throw new Error(`unsupported node pair approval gateway method: ${method}`);
  }
  return await withProgress(
    {
      label: `Nodes ${method}`,
      indeterminate: true,
      enabled: opts.json !== true,
    },
    async () =>
      await callGateway({
        url: opts.url,
        token: opts.token,
        method,
        params,
        timeoutMs: resolveNodesTransportTimeoutMs(opts, callOpts.transportTimeoutMs),
        clientName: "gateway-client",
        mode: "backend",
        scopes: callOpts.scopes,
      }),
  );
}
