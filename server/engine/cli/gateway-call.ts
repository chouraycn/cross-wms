// Gateway call stub for CLI runtime commands.
// 移植自 openclaw/src/gateway/call.js，这里是降级 stub 版本。
// 实际 Gateway 客户端逻辑需要完整移植 gateway 模块后再替换。

export async function callGateway(params: {
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
  useStoredDeviceAuth?: boolean;
  requiredStoredDeviceAuthScopes?: string[];
  requireLocalBackendSharedAuth?: boolean;
}): Promise<unknown> {
  void params;
  console.error("Gateway RPC is not available in cross-wms");
  process.exit(1);
}
