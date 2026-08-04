// TTS provider registry resolves configured speech providers at runtime.
import type { OpenClawConfig } from "../config/types.js";
import { getActiveRuntimePluginRegistry } from "../plugins/active-runtime-registry.js";
import {
  resolvePluginCapabilityProvider,
  resolvePluginCapabilityProviders,
} from "../plugins/capability-provider-runtime.js";
import type { SpeechProviderPlugin } from "../plugins/types.js";
import type { TTSProviderPlugin } from "./types.js";
export { normalizeSpeechProviderId } from "./provider-registry-core.js";
export { normalizeSpeechProviderId as normalizeProviderId } from "./provider-registry-core.js";
import {
  createSpeechProviderRegistry,
  type SpeechProviderRegistryResolver,
} from "./provider-registry-core.js";

/** Resolve speech providers from configured plugin capabilities. */
function resolveSpeechProviderPluginEntries(cfg?: OpenClawConfig): SpeechProviderPlugin[] {
  return resolvePluginCapabilityProviders({
    key: "speechProviders",
    cfg,
  });
}

function resolveLoadedSpeechProviderPluginEntries(): SpeechProviderPlugin[] {
  return (getActiveRuntimePluginRegistry()?.speechProviders ?? []).map((entry) => entry.provider);
}

const defaultSpeechProviderRegistryResolver: SpeechProviderRegistryResolver = {
  getProvider: (providerId, cfg) =>
    resolvePluginCapabilityProvider({
      key: "speechProviders",
      providerId,
      cfg,
    }),
  listProviders: resolveSpeechProviderPluginEntries,
};

/** Config-aware registry used by setup/status/runtime paths before plugins are loaded. */
const defaultSpeechProviderRegistry = createSpeechProviderRegistry(
  defaultSpeechProviderRegistryResolver,
);

/** Loaded-only registry for runtime paths that must not rediscover plugin manifests. */
const loadedSpeechProviderRegistry = createSpeechProviderRegistry({
  getProvider: (providerId) =>
    resolveLoadedSpeechProviderPluginEntries().find((provider) => {
      if (provider.id === providerId) {
        return true;
      }
      return provider.aliases?.includes(providerId) ?? false;
    }),
  listProviders: () => resolveLoadedSpeechProviderPluginEntries(),
});

/** List configured speech providers using manifest/capability discovery. */
export const listSpeechProviders = defaultSpeechProviderRegistry.listSpeechProviders;
/** List currently loaded speech providers from the active runtime registry. */
export const listLoadedSpeechProviders = loadedSpeechProviderRegistry.listSpeechProviders;
/** Resolve a configured speech provider by canonical ID or alias. */
export const getSpeechProvider = defaultSpeechProviderRegistry.getSpeechProvider;
/** Resolve an input provider ID or alias to the provider's canonical ID. */
export const canonicalizeSpeechProviderId =
  defaultSpeechProviderRegistry.canonicalizeSpeechProviderId;

/** Mutable provider registry for TTS runtime — supports register/has/get/list. */
export interface ProviderRegistry {
  has(id: string): boolean;
  register(plugin: TTSProviderPlugin): void;
  get(id: string): TTSProviderPlugin | undefined;
  list(): TTSProviderPlugin[];
}

/** Create a new mutable provider registry. */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, TTSProviderPlugin>();
  return {
    has(id) {
      return providers.has(id);
    },
    register(plugin) {
      if (!providers.has(plugin.id)) {
        providers.set(plugin.id, plugin);
      }
    },
    get(id) {
      return providers.get(id);
    },
    list() {
      return [...providers.values()];
    },
  };
}

/** Default mutable provider registry instance used by TTSRuntime. */
export const providerRegistry = createProviderRegistry();
