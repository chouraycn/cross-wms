// Gateway model-pricing config helper.
// Resolves whether cost/pricing metadata should be available to Gateway surfaces.
// 移植自 openclaw/src/gateway/model-pricing-config.ts。
// 降级：OpenClawConfig 来自 ./_openclaw-stubs.js。

import type { OpenClawConfig } from "./_openclaw-stubs.js";

/** Returns whether gateway model pricing/cost metadata should be shown. */
export function isGatewayModelPricingEnabled(config: OpenClawConfig): boolean {
  return (config.models as { pricing?: { enabled?: boolean } } | undefined)?.pricing?.enabled !== false;
}
