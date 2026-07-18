/**
 * Channel install specs.
 * 移植自 openclaw/src/plugins/install-channel-specs.ts。
 * 降级策略：返回 undefined。
 */
export type ChannelInstallSpecs = {
  npmSpec?: string;
  clawhubSpec?: string;
  localPath?: string;
  defaultChoice?: "npm" | "clawhub" | "local";
};

export function resolveNpmInstallSpecsForUpdateChannel(params: {
  channelId?: string;
  config?: unknown;
}): ChannelInstallSpecs | undefined {
  void params;
  return undefined;
}

export function resolveClawHubInstallSpecsForUpdateChannel(params: {
  channelId?: string;
  config?: unknown;
}): ChannelInstallSpecs | undefined {
  void params;
  return undefined;
}
