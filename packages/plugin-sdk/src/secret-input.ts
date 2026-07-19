// @ts-nocheck
// Secret input helpers normalize credential prompt definitions for plugin setup flows.
import { z } from "zod";
// import {
//   hasConfiguredSecretInput,
//   isSecretRef,
//   coerceSecretRef,
//   resolveSecretInputString,
//   normalizeResolvedSecretInputString,
//   normalizeSecretInputString,
// } from "../config/types.secrets.js"; // TODO: 依赖模块未移植
// import { normalizeSecretInput } from "../utils/normalize-secret-input.js"; // TODO: 依赖模块未移植
// import { buildSecretInputSchema } from "./secret-input-schema.js"; // TODO: 依赖模块未移植

// export type {
//   SecretInput,
//   SecretInputStringResolution,
//   SecretInputStringResolutionMode,
// } from "../config/types.secrets.js"; // TODO: 依赖模块未移植
// export {
//   buildSecretInputSchema,
//   coerceSecretRef,
//   hasConfiguredSecretInput,
//   isSecretRef,
//   resolveSecretInputString,
//   normalizeResolvedSecretInputString,
//   normalizeSecretInput,
//   normalizeSecretInputString,
// }; // TODO: 依赖模块未移植

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
