/** Text-command routing decisions for surfaces that may also support native commands. */
import { normalizeOptionalLowercaseString } from "@openclaw/normalization-core/string-coerce";
import { listChannelPlugins } from "../channels/plugins/index.js";
import {
  getActivePluginChannelRegistryVersion,
  requireActivePluginChannelRegistry,
} from "../plugins/runtime.js";
import type { ShouldHandleTextCommandsParams } from "./commands-registry.types.js";

/** Cached native-command surface lookup, invalidated by active plugin-registry version. */
let cachedNativeCommandSurfaces: Set<string> | null = null;
let cachedNativeCommandSurfacesVersion = -1;
let cachedNativeCommandSurfacesRegistry: object | null = null;

// cross-wms ChannelPlugin type stores capabilities behind an index signature;
// narrow to a minimal shape here so nativeCommands access stays type-safe.
type ChannelPluginCapabilities = {
  nativeCommands?: boolean;
};

function pluginSupportsNativeCommands(plugin: {
  id: string;
  capabilities?: unknown;
}): boolean {
  const capabilities = plugin.capabilities as ChannelPluginCapabilities | undefined;
  return capabilities?.nativeCommands === true;
}

/** Returns whether a surface can receive provider-native slash commands. */
export function isNativeCommandSurface(surface?: string): boolean {
  const normalized = normalizeOptionalLowercaseString(surface);
  if (!normalized) {
    return false;
  }
  const activeRegistry = requireActivePluginChannelRegistry();
  const registryVersion = getActivePluginChannelRegistryVersion();
  if (
    !cachedNativeCommandSurfaces ||
    cachedNativeCommandSurfacesVersion !== registryVersion ||
    cachedNativeCommandSurfacesRegistry !== activeRegistry
  ) {
    cachedNativeCommandSurfaces = new Set(
      listChannelPlugins()
        .filter((plugin) => pluginSupportsNativeCommands(plugin))
        .map((plugin) => plugin.id),
    );
    cachedNativeCommandSurfacesVersion = registryVersion;
    cachedNativeCommandSurfacesRegistry = activeRegistry;
  }
  return cachedNativeCommandSurfaces.has(normalized);
}

/** Decides whether text slash commands remain active for the current surface/config pair. */
export function shouldHandleTextCommands(params: ShouldHandleTextCommandsParams): boolean {
  if (params.commandSource === "native") {
    return true;
  }
  if (params.cfg.commands?.text !== false) {
    return true;
  }
  return !isNativeCommandSurface(params.surface);
}
