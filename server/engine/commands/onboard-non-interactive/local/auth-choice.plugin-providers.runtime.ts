/**
 * Runtime-only provider plugin helpers for non-interactive onboarding.
 *
 * Kept behind a lazy boundary so ordinary local setup can infer core auth
 * choices without loading plugin provider discovery.
 */
import { resolveProviderPluginChoice } from "@openclaw-src/plugins/provider-wizard.js";
import { resolveOwningPluginIdsForProviderRef } from "@openclaw-src/plugins/providers.js";
import { resolvePluginProviders } from "@openclaw-src/plugins/providers.runtime.js";

/** Provider discovery surface used by non-interactive auth-choice handling. */
export const authChoicePluginProvidersRuntime = {
  resolveOwningPluginIdsForProviderRef,
  resolveProviderPluginChoice,
  resolvePluginProviders,
};
