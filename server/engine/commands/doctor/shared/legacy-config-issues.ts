// Doctor legacy config issue finder that combines core, channel, and plugin rules.
import { collectChannelLegacyConfigRules } from "@openclaw-src/channels/plugins/legacy-config.js";
import { findLegacyConfigIssues } from "@openclaw-src/config/legacy.js";
import type { LegacyConfigRule } from "@openclaw-src/config/legacy.shared.js";
import type { LegacyConfigIssue, OpenClawConfig } from "@openclaw-src/config/types.js";
import {
  collectRelevantDoctorPluginIds,
  collectRelevantDoctorPluginIdsForTouchedPaths,
  listPluginDoctorLegacyConfigRules,
} from "@openclaw-src/plugins/doctor-contract-registry.js";

function collectConfiguredChannelIds(raw: any): ReadonlySet<string> {
  if (!raw || typeof raw !== "object") {
    return new Set();
  }
  const channels = (raw as { channels?: any }).channels;
  if (!channels || typeof channels !== "object" || Array.isArray(channels)) {
    return new Set();
  }
  return new Set(Object.keys(channels).filter((channelId) => channelId !== "defaults"));
}

function collectPluginLegacyConfigRules(
  raw: any,
  touchedPaths?: ReadonlyArray<ReadonlyArray<string>>,
): LegacyConfigRule[] {
  const channelIds = collectConfiguredChannelIds(raw);
  const pluginIds = (
    touchedPaths
      ? collectRelevantDoctorPluginIdsForTouchedPaths({ raw, touchedPaths })
      : collectRelevantDoctorPluginIds(raw)
  ).filter((pluginId) => !channelIds.has(pluginId));
  if (pluginIds.length === 0) {
    return [];
  }
  return listPluginDoctorLegacyConfigRules({ config: raw as OpenClawConfig, pluginIds });
}

/** Find legacy config issues using core rules plus relevant channel/plugin doctor contracts. */
export function findDoctorLegacyConfigIssues(
  raw: any,
  sourceRaw?: any,
  touchedPaths?: ReadonlyArray<ReadonlyArray<string>>,
): LegacyConfigIssue[] {
  return findLegacyConfigIssues(
    raw,
    sourceRaw,
    [
      ...collectChannelLegacyConfigRules(raw, touchedPaths),
      ...collectPluginLegacyConfigRules(raw, touchedPaths),
    ],
    touchedPaths,
  );
}
