// Node HTTP proxy helpers build HTTP(S) agents from proxy settings.
// 移植自 openclaw/src/llm/utils/node-http-proxy.ts
// 降级策略：cross-wms 暂未移植 infra/net/node-proxy-agent.ts，这里提供最小化桩。
import type { Agent as HttpAgent } from "node:http";
import type { Agent as HttpsAgent } from "node:https";

/** HTTP(S) agent pair for Node fetch/client integrations that accept explicit agents. */
export interface NodeHttpProxyAgents {
  httpAgent: HttpAgent;
  httpsAgent: HttpsAgent;
}

export const UNSUPPORTED_PROXY_PROTOCOL_MESSAGE =
  "Unsupported proxy protocol. Only http: and https: are supported.";

/** Resolves the environment proxy URL that applies to a target URL. */
export function resolveHttpProxyUrlForTarget(_targetUrl: string | URL): URL | undefined {
  // Minimal stub: defer to HTTPS_PROXY / HTTP_PROXY env vars.
  const envVar = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!envVar) {
    return undefined;
  }
  try {
    return new URL(envVar);
  } catch {
    return undefined;
  }
}

/** Builds fixed HTTP and HTTPS proxy agents for a target URL, when env proxy config applies. */
export function createHttpProxyAgentsForTarget(
  _targetUrl: string | URL,
): NodeHttpProxyAgents | undefined {
  // Minimal stub: returns undefined until infra/net/node-proxy-agent.ts is ported.
  return undefined;
}
