// 移植自 openclaw/src/infra/tls/gateway.ts
// 降级：TLS cert 加载依赖简化

import type tls from "node:tls";

export type GatewayTlsRuntime = {
  enabled: boolean;
  required: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  fingerprintSha256?: string;
  tlsOptions?: tls.TlsOptions;
  error?: string;
};

/** Load or generate gateway TLS material and return server-ready TLS options. */
export async function loadGatewayTlsRuntime(
  cfg?: { enabled?: boolean; certPath?: string; keyPath?: string; caPath?: string; autoGenerate?: boolean },
  _log?: { info?: (msg: string) => void; warn?: (msg: string) => void },
): Promise<GatewayTlsRuntime> {
  if (!cfg || cfg.enabled !== true) {
    return { enabled: false, required: false };
  }
  // Simplified: no auto-generation, no cert loading in cross-wms
  return {
    enabled: false,
    required: true,
    certPath: cfg.certPath,
    keyPath: cfg.keyPath,
    caPath: cfg.caPath,
    error: "gateway tls: not available in cross-wms",
  };
}
