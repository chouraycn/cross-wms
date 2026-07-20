// 移植自 openclaw/src/infra/outbound/thread-id.ts

import { normalizeOptionalStringifiedId } from "./string-coerce.js";

/** Normalizes channel thread/topic ids before outbound payload construction. */
export function normalizeOutboundThreadId(value?: string | number | null): string | undefined {
  return normalizeOptionalStringifiedId(value);
}
