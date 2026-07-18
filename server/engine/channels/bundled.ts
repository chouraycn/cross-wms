// 移植自 openclaw/src/channels/plugins/bundled.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function describeBundledChannelLoadError(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeBundledChannelLoadError");
}

export function listBundledChannelPluginIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelPluginIds");
}

export function hasBundledChannelPackageSetupFeature(..._args: unknown[]): unknown {
  throw new Error("not implemented: hasBundledChannelPackageSetupFeature");
}

export function listBundledChannelPlugins(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelPlugins");
}

export function listBundledChannelSetupPlugins(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelSetupPlugins");
}

export function listBundledChannelLegacySessionSurfaces(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelLegacySessionSurfaces");
}

export function listBundledChannelLegacyStateMigrationDetectors(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelLegacyStateMigrationDetectors");
}

export function getBundledChannelAccountInspector(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBundledChannelAccountInspector");
}

export function getBundledChannelPlugin(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBundledChannelPlugin");
}

export function getBundledChannelSecrets(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBundledChannelSecrets");
}

export function getBundledChannelSetupPlugin(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBundledChannelSetupPlugin");
}

export function getBundledChannelSetupSecrets(..._args: unknown[]): unknown {
  throw new Error("not implemented: getBundledChannelSetupSecrets");
}

export function setBundledChannelRuntime(..._args: unknown[]): unknown {
  throw new Error("not implemented: setBundledChannelRuntime");
}
