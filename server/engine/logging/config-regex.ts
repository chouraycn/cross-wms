// Minimal config-regex compiler stub for the redact module.
//
// Migrated from openclaw/src/security/config-regex.ts. The original performs schema-aware
// validation and feature-flag gating of user-supplied regex patterns; cross-wms does not carry
// that subsystem, so this stub preserves only the safe-compile contract used by redact.ts:
// return a compiled RegExp on success, or null for an invalid pattern so it is silently skipped.
import type { LoggingConfig } from "../config/types.base.js";

export type CompiledConfigRegex = { regex: RegExp };

/** Compiles a regex source string with the given flags, returning null on invalid input. */
export function compileConfigRegex(
  source: string,
  flags: string,
  _loggingConfig?: LoggingConfig,
): CompiledConfigRegex | null {
  if (typeof source !== "string" || source.length === 0) {
    return null;
  }
  try {
    return { regex: new RegExp(source, flags) };
  } catch {
    return null;
  }
}
