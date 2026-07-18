/**
 * Coordinates plugin metadata snapshot and process memo cache lifecycle resets.
 * 移植自 openclaw/src/plugins/plugin-metadata-lifecycle.ts。
 * 降级策略：保留 Set 注册与清除逻辑，clearCurrentPluginMetadataSnapshotState
 * 降级为 no-op，因为 current-plugin-metadata-state.ts 模块未移植。
 */
const pluginMetadataProcessMemoClears = new Set<() => void>();

/** 占位：清除 current plugin metadata snapshot state（模块未移植）。 */
function clearCurrentPluginMetadataSnapshotState(): void {
  // No-op: current-plugin-metadata-state.ts not yet ported.
}

/** Registers a process-local plugin metadata memo clear hook. */
export function registerPluginMetadataProcessMemoLifecycleClear(
  clearProcessMemo: () => void,
): void {
  pluginMetadataProcessMemoClears.add(clearProcessMemo);
}

/** Clears plugin metadata snapshots and registered process memo caches. */
export function clearPluginMetadataLifecycleCaches(): void {
  clearCurrentPluginMetadataSnapshotState();
  for (const clearProcessMemo of pluginMetadataProcessMemoClears) {
    clearProcessMemo();
  }
}
