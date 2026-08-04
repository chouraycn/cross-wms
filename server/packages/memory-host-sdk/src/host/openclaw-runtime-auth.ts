// Memory Host SDK module implements openclaw runtime auth behavior.
import { requireApiKey } from "../../../../engine/agents/model-auth-runtime-shared.js";
import type { resolveApiKeyForProvider as ResolveApiKeyForProvider } from "../../../../engine/agents/model-auth.js";

// Lazy auth facade so memory host helpers avoid eager model-auth module loading.

export { requireApiKey };

/** Resolve a provider API key through the core model-auth runtime. */
export const resolveApiKeyForProvider: typeof ResolveApiKeyForProvider = async (...args) => {
  const auth = await import("../../../../engine/agents/model-auth.js");
  return auth.resolveApiKeyForProvider(...args);
};
