// @ts-nocheck
// Builds the stable JSON payload for `openclaw status --json`.
// Optional deep fields are included only when their upstream probes actually ran.

import { resolveStatusUpdateChannelInfo } from "./status-all/format.js";
import {
  buildStatusGatewayJsonPayloadFromSurface,
  type StatusOverviewSurface,
} from "./status-overview-surface.ts";

/** Combines scan summary, overview surface, services, agents, diagnostics, and optional deep probes. */
export function buildStatusJsonPayload(params: {
  summary: Record<string, any>;
  surface: StatusOverviewSurface;
  osSummary: any;
  memory: any;
  memoryPlugin: any;
  agents: any;
  secretDiagnostics: string[];
  securityAudit?: any;
  health?: any;
  usage?: any;
  lastHeartbeat?: any;
  pluginCompatibility?: Array<Record<string, any>> | null | undefined;
}) {
  const channelInfo = resolveStatusUpdateChannelInfo({
    updateConfigChannel: params.surface.cfg.update?.channel ?? undefined,
    update: params.surface.update,
  });
  return {
    ...params.summary,
    os: params.osSummary,
    update: params.surface.update,
    updateChannel: channelInfo.channel,
    updateChannelSource: channelInfo.source,
    memory: params.memory,
    memoryPlugin: params.memoryPlugin,
    gateway: buildStatusGatewayJsonPayloadFromSurface({ surface: params.surface }),
    gatewayService: params.surface.gatewayService,
    nodeService: params.surface.nodeService,
    agents: params.agents,
    secretDiagnostics: params.secretDiagnostics,
    ...(params.securityAudit ? { securityAudit: params.securityAudit } : {}),
    ...(params.pluginCompatibility
      ? {
          // Keep warnings grouped with a count so consumers can test compatibility status cheaply.
          pluginCompatibility: {
            count: params.pluginCompatibility.length,
            warnings: params.pluginCompatibility,
          },
        }
      : {}),
    ...(params.health || params.usage || params.lastHeartbeat
      ? {
          // Deep/usage fields stay absent in fast mode instead of appearing as null placeholders.
          health: params.health,
          usage: params.usage,
          lastHeartbeat: params.lastHeartbeat,
        }
      : {}),
  };
}
