// Leaf module extracted from builtin.ts to break builtin.ts ↔ builtin-*.ts barrel cycles (#3-#24).
// createBuiltinChannelPlugin is imported by every builtin-*.ts file, while builtin.ts re-exports
// from those same files — creating 22 mutual cycles. Moving the factory here breaks all of them.
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
} from "./types.js";
import { createChannelPlugin } from "./registry.js";
import type { ChannelPlugin } from "./plugin.js";

export interface CreateBuiltinChannelPluginParams {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: ChannelConfigAdapter;
  message?: ChannelPlugin["message"];
  status?: ChannelPlugin["status"];
}

export function createBuiltinChannelPlugin(
  params: CreateBuiltinChannelPluginParams,
): ChannelPlugin {
  return createChannelPlugin({
    id: params.id,
    meta: params.meta,
    capabilities: params.capabilities,
    config: params.config,
    message: params.message,
    status: params.status,
  });
}
