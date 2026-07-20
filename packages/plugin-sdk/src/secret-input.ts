// Secret input helpers normalize credential prompt definitions for plugin setup flows.
import { z } from "zod";

// TODO: 依赖模块未移植，暂用本地桩
function buildSecretInputSchema(): z.ZodType<unknown> {
  return z.unknown();
}

/**
 * Builds an optional secret-input schema for config fields that may be omitted.
 * The inner schema stays shared so sensitive-path redaction still recognizes it.
 */
export function buildOptionalSecretInputSchema() {
  return buildSecretInputSchema().optional();
}

/**
 * Builds an array schema for provider/channel config that accepts multiple secret inputs.
 * Each element uses the shared schema so plaintext and ref validation stay identical.
 */
export function buildSecretInputArraySchema() {
  return z.array(buildSecretInputSchema());
}
