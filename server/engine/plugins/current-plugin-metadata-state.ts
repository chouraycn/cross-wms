/**
 * Holds current plugin metadata snapshots for process-scoped consumers.
 * 移植自 openclaw/src/plugins/current-plugin-metadata-state.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function setCurrentPluginMetadataSnapshotState(...args: unknown[]): unknown {
  throw new Error("not implemented: setCurrentPluginMetadataSnapshotState");
}

export function clearCurrentPluginMetadataSnapshotState(...args: unknown[]): unknown {
  throw new Error("not implemented: clearCurrentPluginMetadataSnapshotState");
}

export function getCurrentPluginMetadataSnapshotState(...args: unknown[]): unknown {
  throw new Error("not implemented: getCurrentPluginMetadataSnapshotState");
}

