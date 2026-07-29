// Re-exports secret-related Zod schemas defined in zod-schema.core.ts.
// openclaw keeps these schemas inside zod-schema.core.ts; this file provides
// a dedicated entry point for consumers that only need secret schemas.
export {
  SecretRefSchema,
  SecretInputSchema,
  SecretProviderSchema,
  SecretsConfigSchema,
} from "./zod-schema.core.js";
