// Re-exports TTS-related Zod schemas defined in zod-schema.core.ts.
// openclaw keeps these schemas inside zod-schema.core.ts; this file provides
// a dedicated entry point for consumers that only need TTS schemas.
export {
  TtsProviderSchema,
  TtsModeSchema,
  TtsAutoSchema,
  TtsConfigSchema,
} from "./zod-schema.core.js";
